"""Real PostgreSQL coverage of the reception -> clinical -> reception handoff."""

import asyncio
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from sqlalchemy import func, select
from starlette.requests import Request

from app.core.permissions import TokenData
from app.core.security import create_access_token
from app.domains.clinical.persistence.sesion_clinica import SesionClinicaItem
from app.domains.communications.persistence.notificacion import DoctorNotification
from app.domains.communications.persistence.whatsapp import WhatsAppComunicacion
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.application.agenda_service import (
    buscar_huecos_libres,
    esta_dentro_disponibilidad,
)
from app.domains.scheduling.application.citas import crear_cita
from app.domains.scheduling.application.jornada import transition_visit
from app.domains.scheduling.domain.visit_states import operational_state
from app.domains.scheduling.persistence.cita import Cita, CitaCambio
from app.domains.scheduling.persistence.gabinete import Gabinete
from app.domains.scheduling.persistence.horario import HorarioDoctor
from app.domains.scheduling.schemas.cita import CitaCreate
from tests.conftest import TestSessionLocal


def headers_for(user: Usuario) -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_access_token(
            {
                "sub": str(user.id),
                "username": user.username,
                "rol": user.rol,
                "clinica_id": str(user.clinica_id),
            }
        )
    }


@pytest_asyncio.fixture
async def jornada_data(db_session):
    clinic = Clinica(nombre=f"Jornada {uuid4().hex[:8]}")
    other_clinic = Clinica(nombre=f"Otra {uuid4().hex[:8]}")
    room = Gabinete(nombre="Gabinete jornada")
    db_session.add_all([clinic, other_clinic, room])
    await db_session.flush()
    doctor = Doctor(nombre="Profesional Jornada", clinica_id=clinic.id)
    patient = Paciente(nombre="Luz", apellidos="Jornada", clinica_id=clinic.id)
    db_session.add_all([doctor, patient])
    await db_session.flush()
    users = {}
    for role in ("recepcion", "doctor", "auxiliar", "admin"):
        users[role] = Usuario(
            username=f"jornada-{role}-{uuid4().hex[:8]}",
            password_hash="unused",
            nombre=role,
            rol=role,
            clinica_id=clinic.id,
            doctor_id=doctor.id if role == "doctor" else None,
        )
        db_session.add(users[role])
    outsider = Usuario(
        username=f"fuera-{uuid4().hex[:8]}",
        password_hash="unused",
        nombre="Fuera",
        rol="doctor",
        clinica_id=other_clinic.id,
    )
    db_session.add(outsider)
    appointment = Cita(
        paciente_id=patient.id,
        doctor_id=doctor.id,
        clinica_id=clinic.id,
        gabinete_id=room.id,
        fecha_hora=datetime.now(timezone.utc) + timedelta(minutes=10),
        duracion_min=30,
    )
    db_session.add(appointment)
    await db_session.commit()
    return appointment, patient, users, outsider


@pytest.mark.asyncio
async def test_full_daily_handoff_is_audited_and_retry_safe(client, db_session, jornada_data):
    appointment, _, users, _ = jornada_data
    base = f"/api/citas/{appointment.id}"
    reception = headers_for(users["recepcion"])
    doctor = headers_for(users["doctor"])
    arrival = await client.post(base + "/llegada", headers=reception)
    assert arrival.status_code == 200, arrival.text
    assert arrival.json()["estado_operativo"] == "en_sala"
    assert arrival.json()["gabinete_nombre"] == "Gabinete jornada"
    assert arrival.json()["llegada_at"]
    future_visits = await client.get(f"/api/pacientes/{appointment.paciente_id}/citas", headers=reception)
    assert future_visits.status_code == 200, future_visits.text
    assert next(row for row in future_visits.json() if row["id"] == str(appointment.id))["gabinete_nombre"] == "Gabinete jornada"
    repeated = await client.post(base + "/llegada", headers=reception)
    assert repeated.json()["llegada_at"] == arrival.json()["llegada_at"]
    # Opening the patient/appointment never starts clinical attention.
    read = await client.get(base, headers=doctor)
    assert read.json()["estado_operativo"] == "en_sala"
    assert read.json()["atencion_iniciada_at"] is None
    started = await client.post(base + "/iniciar-atencion", headers=doctor)
    assert started.status_code == 200, started.text
    assert started.json()["estado_operativo"] == "en_atencion"
    assert started.json()["atencion_iniciada_at"]
    finished = await client.post(base + "/finalizar-visita", headers=doctor)
    assert finished.status_code == 200, finished.text
    assert finished.json()["estado_operativo"] == "finalizada"
    assert finished.json()["pendiente_salida"] is True
    retry_finish = await client.post(base + "/finalizar-visita", headers=doctor)
    assert retry_finish.json()["finalizada_at"] == finished.json()["finalizada_at"]
    pending = await client.get("/api/citas", params={"pendiente_salida": True}, headers=reception)
    assert str(appointment.id) in {row["id"] for row in pending.json()}
    resolved = await client.post(
        base + "/resolver-salida",
        headers=reception,
        json={"observaciones": "Próxima cita acordada; pago pendiente autorizado."},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["pendiente_salida"] is False
    assert resolved.json()["salida_resuelta_at"]
    retry_exit = await client.post(base + "/resolver-salida", headers=reception)
    assert retry_exit.json()["salida_resuelta_at"] == resolved.json()["salida_resuelta_at"]
    events = (
        await db_session.scalars(
            select(CitaCambio)
            .where(CitaCambio.cita_id == appointment.id)
            .order_by(CitaCambio.created_at)
        )
    ).all()
    assert [event.accion for event in events] == [
        "llegada",
        "iniciar_atencion",
        "finalizar_visita",
        "resolver_salida",
    ]
    assert events[-1].motivo == "Próxima cita acordada; pago pendiente autorizado."
    count = await db_session.scalar(
        select(func.count())
        .select_from(DoctorNotification)
        .where(DoctorNotification.appointment_id == appointment.id)
    )
    assert count == 1


@pytest.mark.asyncio
async def test_visit_permissions_and_invalid_transitions(client, jornada_data):
    appointment, _, users, outsider = jornada_data
    base = f"/api/citas/{appointment.id}"
    reception, doctor = headers_for(users["recepcion"]), headers_for(users["doctor"])
    assert (await client.post(base + "/iniciar-atencion", headers=doctor)).status_code == 409
    assert (await client.post(base + "/llegada", headers=headers_for(outsider))).status_code == 403
    assert (await client.post(base + "/llegada", headers=reception)).status_code == 200
    for suffix in ("iniciar-atencion", "finalizar-visita"):
        assert (await client.post(base + "/" + suffix, headers=reception)).status_code == 403
    # Compatibility APIs cannot bypass the permissions either.
    assert (
        await client.patch(base + "/estado", headers=reception, json={"estado": "en_atencion"})
    ).status_code == 403
    assert (await client.post(base + "/iniciar-atencion", headers=doctor)).status_code == 200
    assert (
        await client.patch(base, headers=reception, json={"estado": "programada"})
    ).status_code == 409
    assert (await client.post(base + "/finalizar-visita", headers=doctor)).status_code == 200
    assert (await client.post(base + "/resolver-salida", headers=doctor)).status_code == 403
    isolated = await client.get(
        "/api/citas", params={"pendiente_salida": True}, headers=headers_for(outsider)
    )
    assert isolated.status_code == 200
    assert str(appointment.id) not in {row["id"] for row in isolated.json()}


@pytest.mark.asyncio
@pytest.mark.parametrize("linked", [True, False])
async def test_finish_does_not_silently_complete_unfinished_treatments(
    client, db_session, jornada_data, linked
):
    appointment, patient, users, _ = jornada_data
    base = f"/api/citas/{appointment.id}"
    doctor = headers_for(users["doctor"])
    await client.post(base + "/llegada", headers=headers_for(users["recepcion"]))
    await client.post(base + "/iniciar-atencion", headers=doctor)
    item = SesionClinicaItem(
        paciente_id=patient.id,
        clinica_id=patient.clinica_id,
        cita_id=appointment.id if linked else None,
        titulo="Tratamiento sin finalizar",
        estado="en_curso",
    )
    db_session.add(item)
    await db_session.commit()
    response = await client.post(base + "/finalizar-visita", headers=doctor)
    assert response.status_code == 409
    await db_session.refresh(item)
    assert item.estado == "en_curso"
    item.estado = "pospuesto"
    await db_session.commit()
    assert (await client.post(base + "/finalizar-visita", headers=doctor)).status_code == 200


@pytest.mark.asyncio
async def test_concurrent_arrivals_notify_once(db_session, jornada_data):
    appointment, _, users, _ = jornada_data
    user = users["recepcion"]
    token = TokenData(user.id, user.username, user.rol, user.clinica_id)
    appointment_id = appointment.id

    async def arrive():
        async with TestSessionLocal() as session:
            request = Request(
                {"type": "http", "method": "POST", "path": "/api/citas", "headers": []}
            )
            return await transition_visit(
                session, appointment_id, token, request, target="en_clinica", action="llegada"
            )

    first, second = await asyncio.gather(arrive(), arrive())
    assert first.llegada_at == second.llegada_at
    notifications = await db_session.scalar(
        select(func.count())
        .select_from(DoctorNotification)
        .where(DoctorNotification.appointment_id == appointment_id)
    )
    changes = await db_session.scalar(
        select(func.count()).select_from(CitaCambio).where(CitaCambio.cita_id == appointment_id)
    )
    assert notifications == changes == 1


@pytest.mark.asyncio
async def test_urgent_overlap_is_visible_and_audited(client, db_session, jornada_data):
    appointment, patient, users, _ = jornada_data
    headers = headers_for(users["recepcion"])
    payload = {
        "paciente_id": str(patient.id),
        "doctor_id": str(appointment.doctor_id),
        "gabinete_id": str(appointment.gabinete_id),
        "fecha_hora": appointment.fecha_hora.isoformat(),
        "duracion_min": 30,
    }
    blocked = await client.post("/api/citas", headers=headers, json=payload)
    assert blocked.status_code == 409
    urgent = await client.post(
        "/api/citas",
        headers=headers,
        json={
            **payload,
            "es_urgencia": True,
            "motivo_solape": "Dolor agudo; recepción avisa al doctor.",
            "estado": "confirmada",
        },
    )
    assert urgent.status_code == 201, urgent.text
    assert urgent.json()["solape_urgencia"] is True
    assert urgent.json()["confirmado_at"]
    event = await db_session.scalar(
        select(CitaCambio).where(CitaCambio.cita_id == UUID(urgent.json()["id"]))
    )
    assert event.motivo == "Dolor agudo; recepción avisa al doctor."
    assert event.datos["despues"]["solapes"] == {"doctor": True, "gabinete": True}
    # The urgent appointment remains a real occupied resource when booking again.
    again = await client.post("/api/citas", headers=headers, json=payload)
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_provisional_patient_and_waiting_config(client, jornada_data):
    _, _, users, _ = jornada_data
    reception = headers_for(users["recepcion"])
    response = await client.post(
        "/api/citas/paciente-provisional",
        headers=reception,
        json={"nombre": "  Marta  ", "telefono": "600000321"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["nombre"] == "Marta"
    assert response.json()["apellidos"] == ""
    assert response.json()["telefono"] == "600000321"
    assert response.json()["clinica_id"] == str(users["recepcion"].clinica_id)
    config = await client.get("/api/citas/jornada/config", headers=reception)
    assert config.status_code == 200
    assert config.json()["espera_critica_min"] > config.json()["espera_aviso_min"] > 0
    assert config.json()["duracion_habitual_min"] == 30


@pytest.mark.asyncio
async def test_concurrent_bookings_reserve_real_resources(db_session, jornada_data):
    appointment, patient, users, _ = jornada_data
    user = users["admin"]
    token = TokenData(user.id, user.username, user.rol, user.clinica_id)
    data = CitaCreate(
        paciente_id=patient.id,
        doctor_id=appointment.doctor_id,
        fecha_hora=appointment.fecha_hora + timedelta(hours=3),
        duracion_min=15,
        forzar_fuera_horario=True,
    )

    async def book():
        async with TestSessionLocal() as session:
            request = Request({"type": "http", "method": "POST", "path": "/api/citas", "headers": []})
            try:
                await crear_cita(data, request, session, token)
            except HTTPException as exc:
                await session.rollback()
                return exc.status_code
            return 201

    assert sorted(await asyncio.gather(book(), book())) == [201, 409]


@pytest.mark.asyncio
async def test_stale_whatsapp_cannot_change_clinical_visit(client, db_session, jornada_data):
    appointment, patient, users, _ = jornada_data
    communication = WhatsAppComunicacion(
        clinica_id=patient.clinica_id,
        patient_id=patient.id,
        appointment_id=appointment.id,
        direction="inbound",
        message_body="Cambiar cita",
    )
    db_session.add(communication)
    await db_session.commit()
    reception = headers_for(users["recepcion"])
    doctor = headers_for(users["doctor"])
    base = f"/api/citas/{appointment.id}"
    await client.post(base + "/llegada", headers=reception)
    await client.post(base + "/iniciar-atencion", headers=doctor)
    communication_base = f"/api/whatsapp/comunicaciones/{communication.id}"
    for action in ("confirm", "cancel", "mark_pending", "manual_review"):
        response = await client.post(communication_base + "/accion", headers=reception, json={"action": action})
        assert response.status_code == 409, response.text
    response = await client.post(
        communication_base + "/reprogramar", headers=reception,
        json={"fecha_hora": (appointment.fecha_hora + timedelta(days=1)).isoformat()},
    )
    assert response.status_code == 409
    assert (await client.get(base, headers=reception)).json()["estado_operativo"] == "en_atencion"


@pytest.mark.asyncio
async def test_closed_visit_cannot_receive_new_in_progress_items(client, jornada_data):
    appointment, patient, users, _ = jornada_data
    doctor = headers_for(users["doctor"])
    base = f"/api/citas/{appointment.id}"
    await client.post(base + "/llegada", headers=doctor)
    await client.post(base + "/iniciar-atencion", headers=doctor)
    await client.post(base + "/finalizar-visita", headers=doctor)
    response = await client.post(
        f"/api/tratamientos/pacientes/{patient.id}/sesion-items", headers=doctor,
        json={"cita_id": str(appointment.id), "titulo": "Trabajo tardío", "estado": "en_curso"},
    )
    assert response.status_code == 409, response.text


@pytest.mark.asyncio
async def test_habitual_duration_and_room_aware_available_slots(client, db_session, jornada_data):
    appointment, _, users, _ = jornada_data
    admin = headers_for(users["admin"])
    family = await client.post("/api/tratamientos/familias", headers=admin, json={"nombre": "Duraciones Jornada"})
    treatment = await client.post("/api/tratamientos", headers=admin, json={
        "familia_id": family.json()["id"], "nombre": "Revisión breve", "duracion_habitual_min": 15,
    })
    assert treatment.status_code == 201, treatment.text
    assert treatment.json()["duracion_habitual_min"] == 15
    treatment_url = f"/api/tratamientos/{treatment.json()['id']}"
    assert (await client.patch(treatment_url, headers=admin, json={"duracion_habitual_min": 7})).status_code == 422
    assert (await client.patch(treatment_url, headers=admin, json={"duracion_habitual_min": None})).json()["duracion_habitual_min"] is None

    other_doctor = Doctor(nombre="Otro profesional", clinica_id=appointment.clinica_id)
    db_session.add(other_doctor)
    await db_session.flush()
    day = appointment.fecha_hora.replace(hour=0, minute=0, second=0, microsecond=0)
    appointment.fecha_hora = day + timedelta(hours=9)
    db_session.add(HorarioDoctor(doctor_id=other_doctor.id, dia_semana=day.weekday(), tipo_dia="laborable", bloques=[{"inicio": "00:00", "fin": "23:59"}], intervalo_min=5))
    await db_session.commit()
    params = {"doctor_id": str(other_doctor.id), "duracion_min": 15, "desde": appointment.fecha_hora.isoformat(), "hasta": day.isoformat(), "max_resultados": 1}
    free = await client.get("/api/citas/buscar-hueco", headers=admin, params=params)
    assert free.status_code == 200, free.text
    assert free.json()
    blocked = await client.get("/api/citas/buscar-hueco", headers=admin, params={**params, "gabinete_id": str(appointment.gabinete_id)})
    assert blocked.status_code == 200, blocked.text
    assert datetime.fromisoformat(blocked.json()[0]["fecha_hora_inicio"]) >= appointment.fecha_hora + timedelta(minutes=30)


def test_messaging_flags_keep_confirmed_human_state():
    for state in ("reminder_sent", "reschedule_requested", "pending_manual_review"):
        assert operational_state(state, confirmed=True) == "confirmada"
    assert operational_state("en_atencion", confirmed=True) == "en_atencion"


@pytest.mark.asyncio
async def test_lifecycle_migration_rollback_preserves_visit_data(db_session, jornada_data):
    appointment, _, _, _ = jornada_data
    now = datetime.now(timezone.utc)
    appointment.estado = "en_atencion"
    appointment.llegada_at = now - timedelta(minutes=15)
    appointment.atencion_iniciada_at = now
    appointment.solape_urgencia = True
    await db_session.commit()
    original_arrival = appointment.llegada_at
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0046_jornada_lifecycle.py"
    spec = importlib.util.spec_from_file_location("jornada_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    # Roll back the verification itself after testing both directions; this
    # leaves other integration fixtures and the declared Alembic head intact.
    async with db_session.begin_nested() as checkpoint:
        connection = await db_session.connection()

        def roundtrip(sync_connection):
            with Operations.context(MigrationContext.configure(sync_connection)):
                migration.downgrade()
                migration.upgrade()

        await connection.run_sync(roundtrip)
        await db_session.refresh(appointment)
        assert appointment.estado == "en_clinica"  # compatible with the previous app
        assert appointment.llegada_at == original_arrival
        assert appointment.atencion_iniciada_at == now
        assert appointment.solape_urgencia is True
        event = await db_session.scalar(select(CitaCambio).where(CitaCambio.cita_id == appointment.id, CitaCambio.accion == "jornada_rollback"))
        assert event.datos["antes"]["estado"] == "en_atencion"
        assert event.datos["antes"]["atencion_iniciada_at"]
        await checkpoint.rollback()


@pytest.mark.asyncio
@pytest.mark.parametrize("date,utc_hour", [("2030-01-07", 8), ("2030-07-01", 7)])
async def test_clinic_hours_use_local_time_in_winter_and_summer(db_session, jornada_data, date, utc_hour):
    appointment, _, _, _ = jornada_data
    day = datetime.fromisoformat(date).replace(tzinfo=ZoneInfo("Europe/Madrid"))
    db_session.add(HorarioDoctor(doctor_id=appointment.doctor_id, dia_semana=day.weekday(), tipo_dia="laborable", bloques=[{"inicio": "09:00", "fin": "10:00"}], intervalo_min=15))
    await db_session.commit()
    start = day.replace(hour=9).astimezone(timezone.utc)
    assert start.hour == utc_hour
    assert await esta_dentro_disponibilidad(db_session, appointment.doctor_id, start, 15)
    assert not await esta_dentro_disponibilidad(db_session, appointment.doctor_id, start - timedelta(minutes=15), 15)
    slots = await buscar_huecos_libres(db_session, appointment.doctor_id, 15, day.astimezone(timezone.utc), day.replace(hour=23).astimezone(timezone.utc))
    assert len(slots) == 4
    assert slots[0].fecha_hora_inicio == start
    assert slots[0].fecha_hora_inicio.astimezone(ZoneInfo("Europe/Madrid")).hour == 9
