"""PostgreSQL integration: independent sessions, durable events, real HTTP commands."""
import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.persistence.operation_receipt import OperationReceipt
from app.core.persistence.realtime import RealtimeEvent
from app.core.realtime import hub, visible_to
from app.core.security import create_access_token
from app.database import AsyncSessionLocal
from app.domains.billing.persistence.factura import Cobro
from app.domains.clinical.persistence.historial import NotaDental
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.main import app
from tests.test_patient_checkout import setup

pytestmark = pytest.mark.asyncio


def auth(user, key=None):
    return {"Authorization": "Bearer " + create_access_token({
        "sub": str(user.user_id), "username": user.username, "rol": user.rol,
        "clinica_id": str(user.clinica_id) if user.clinica_id else None,
    }), **({"Idempotency-Key": key} if key else {})}


async def test_retry_receipt_and_business_write_commit_together(db_session):
    user, patient, *_ = await setup(db_session, visit=False)
    key = str(uuid4())
    body = {"nombre": "Idempotente", "apellidos": uuid4().hex}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first, second = await asyncio.gather(*[
            client.post('/api/pacientes', json=body, headers=auth(user, key)) for _ in range(2)
        ])
        assert first.status_code == second.status_code == 201, (first.text, second.text)
        assert first.json() == second.json()
        assert any(r.headers.get("Idempotency-Replayed") == "true" for r in (first, second))
        reordered = await client.post('/api/pacientes', json=dict(reversed(list(body.items()))), headers=auth(user, key))
        assert reordered.status_code == 201 and reordered.json() == first.json()
        changed = await client.post('/api/pacientes', json={**body, "nombre": "Otro"}, headers=auth(user, key))
        assert changed.status_code == 409
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(Paciente).where(Paciente.apellidos == body["apellidos"])) == 1
        assert await db.get(OperationReceipt, (user.user_id, key)) is not None


async def test_same_patient_phone_and_note_coexist_then_stale_phone_conflicts(db_session):
    user, patient, *_ = await setup(db_session, visit=False)
    headers = auth(user)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        original = (await client.get(f'/api/pacientes/{patient.id}', headers=headers)).json()
        phone, note = await asyncio.gather(
            client.patch(f'/api/pacientes/{patient.id}', json={"telefono": "600111222", "revision": original['revision']}, headers=auth(user, str(uuid4()))),
            client.post('/api/tratamientos/notas-dentales', json={"paciente_id": str(patient.id), "pieza_dental": 16, "texto": "Nota simultánea"}, headers=auth(user, str(uuid4()))),
        )
        assert phone.status_code == 200 and note.status_code == 201, (phone.text, note.text)
        stale = await client.patch(f'/api/pacientes/{patient.id}', json={"telefono": "600999999", "revision": original['revision']}, headers=auth(user, str(uuid4())))
        assert stale.status_code == 409
        missing = await client.patch(f'/api/pacientes/{patient.id}', json={"telefono": "600999999"}, headers=auth(user, str(uuid4())))
        assert missing.status_code == 428
        current = (await client.get(f'/api/pacientes/{patient.id}', headers=headers)).json()
        assert current['telefono'] == '600111222'
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(NotaDental).where(NotaDental.paciente_id == patient.id)) == 1


async def test_two_bookings_one_slot_and_explicit_emergency(db_session):
    user, patient, _, _, _, _, doctor = await setup(db_session, visit=False)
    body = {"paciente_id": str(patient.id), "doctor_id": str(doctor.id), "fecha_hora": (datetime.now(UTC) + timedelta(days=5)).isoformat(), "duracion_min": 30, "forzar_fuera_horario": True}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        results = await asyncio.gather(*[client.post('/api/citas', json=body, headers=auth(user, str(uuid4()))) for _ in range(2)])
        assert sorted(r.status_code for r in results) == [201, 409], [r.text for r in results]
        emergency = await client.post('/api/citas', json={**body, "es_urgencia": True, "motivo_solape": "Urgencia explícita de prueba"}, headers=auth(user, str(uuid4())))
        assert emergency.status_code == 201 and emergency.json()['solape_urgencia']


async def test_simultaneous_edits_from_same_revision_have_one_winner(db_session):
    user, patient, *_ = await setup(db_session, visit=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        original = (await client.get(f'/api/pacientes/{patient.id}', headers=auth(user))).json()
        results = await asyncio.gather(*[
            client.patch(f'/api/pacientes/{patient.id}', json={"telefono": phone, "revision": original['revision']}, headers=auth(user, str(uuid4())))
            for phone in (f"699{uuid4().int % 1_000_000:06d}", f"699{uuid4().int % 1_000_000:06d}")
        ])
        assert sorted(r.status_code for r in results) == [200, 409], [r.text for r in results]


async def test_critical_command_requires_retry_identity(db_session):
    user, patient, *_ = await setup(db_session, visit=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post('/api/citas', headers=auth(user), json={})
        assert response.status_code == 428


async def test_double_payment_and_lost_response_retry(db_session):
    user, patient, method, *_ = await setup(db_session, visit=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        account = (await client.get(f'/api/cuentas/{patient.id}', headers=auth(user))).json()
        body = {"request_id": str(uuid4()), "version": account['version'], "importe": 150, "forma_pago_id": str(method.id)}
        headers = auth(user, str(uuid4()))
        responses = await asyncio.gather(*[client.post(f'/api/cuentas/{patient.id}/checkout', json=body, headers=headers) for _ in range(2)])
        assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
        retry = await client.post(f'/api/cuentas/{patient.id}/checkout', json=body, headers=headers)
        assert retry.json() == responses[0].json() == responses[1].json()
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(Cobro).where(Cobro.paciente_id == patient.id)) == 1


async def test_outbox_rollbacks_and_late_commits_do_not_skip_events(db_session):
    user, patient, *_ = await setup(db_session, visit=False)
    async with AsyncSessionLocal() as first, AsyncSessionLocal() as second:
        slow = Paciente(nombre="Slow commit", apellidos=uuid4().hex, clinica_id=patient.clinica_id)
        first.add(slow)
        await first.flush()
        fast = Paciente(nombre="Fast commit", apellidos=uuid4().hex, clinica_id=patient.clinica_id)
        second.add(fast)
        await second.commit()
        await hub.dispatch()
        async with AsyncSessionLocal() as read:
            high = await read.scalar(select(func.max(RealtimeEvent.sequence)))
        await first.commit()
        await hub.dispatch()
        async with AsyncSessionLocal() as read:
            late = await read.scalar(select(RealtimeEvent).where(RealtimeEvent.entity_id == slow.id))
            assert late.sequence > high
        aborted = Paciente(nombre="Rollback", apellidos=uuid4().hex)
        first.add(aborted)
        await first.flush()
        aborted_id = aborted.id
        await first.rollback()
        async with AsyncSessionLocal() as read:
            assert await read.scalar(select(func.count()).select_from(RealtimeEvent).where(RealtimeEvent.entity_id == aborted_id)) == 0


async def test_event_authorization_clinic_role_and_recipient(db_session):
    clinic_a, clinic_b, doctor = uuid4(), uuid4(), uuid4()
    event = RealtimeEvent(entity_id=uuid4(), event_type="patient.updated", entity_type="pacientes", audience="staff", clinica_id=clinic_a)
    reception = Usuario(id=uuid4(), username="test", rol="recepcion", clinica_id=clinic_b)
    assert not visible_to(event, reception)
    reception.clinica_id = clinic_a
    assert visible_to(event, reception)
    event.audience = "clinical"
    assert not visible_to(event, reception)
    reception.rol = "doctor"
    assert visible_to(event, reception)
    event.audience = "billing"
    assert not visible_to(event, reception)
    event.audience = "doctor"
    event.doctor_id = doctor
    assert not visible_to(event, reception)
    reception.doctor_id = doctor
    assert visible_to(event, reception)
