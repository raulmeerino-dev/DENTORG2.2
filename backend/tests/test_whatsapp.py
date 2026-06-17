from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.cita import Cita, CitaTelefonear
from app.models.doctor import Doctor
from app.models.horario import HorarioDoctor
from app.models.paciente import Paciente
from app.models.usuario import Usuario
from app.models.whatsapp import WhatsAppComunicacion


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"whatsapp-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin WhatsApp",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def create_patient_cita(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    phone: str,
    estado: str = "reminder_sent",
    fecha_hora: datetime | None = None,
) -> Cita:
    headers = await auth_headers(client, db_session)
    created = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Paciente", "apellidos": f"WhatsApp {phone}", "telefono": phone},
    )
    assert created.status_code == 201
    doctor = Doctor(nombre=f"Dr. WhatsApp {phone}", color_agenda="#0f89b8", activo=True)
    db_session.add(doctor)
    await db_session.flush()
    cita = Cita(
        paciente_id=UUID(created.json()["id"]),
        doctor_id=doctor.id,
        fecha_hora=fecha_hora or datetime.now(timezone.utc) + timedelta(days=2),
        duracion_min=30,
        estado=estado,
        motivo="Revision WhatsApp",
        recordatorio_enviado=True,
        recordatorio_canal="whatsapp",
        recordatorio_estado="enviado",
        recordatorio_at=datetime.now(timezone.utc),
    )
    db_session.add(cita)
    await db_session.commit()
    return cita


def next_weekday(hour: int = 9) -> datetime:
    fecha = datetime.now(timezone.utc) + timedelta(days=1)
    while fecha.weekday() != 0:
        fecha += timedelta(days=1)
    return fecha.replace(hour=hour, minute=0, second=0, microsecond=0)


@pytest.mark.asyncio
async def test_whatsapp_webhook_confirma_cita(client: AsyncClient, db_session: AsyncSession):
    cita = await create_patient_cita(client, db_session, phone="600111111")

    response = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "whatsapp:+34600111111", "message_body": "confirmo"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["appointment_id"] == str(cita.id)
    assert payload["interpreted_intent"] == "affirmative"
    assert payload["applied_status"] == "confirmed"
    assert payload["processed"] is True
    await db_session.refresh(cita)
    assert cita.estado == "confirmed"
    assert cita.confirmado_at is not None
    communication = await db_session.scalar(
        select(WhatsAppComunicacion).where(WhatsAppComunicacion.appointment_id == cita.id)
    )
    assert communication is not None
    assert communication.direction == "inbound"
    assert communication.message_body == "confirmo"


@pytest.mark.asyncio
async def test_whatsapp_webhook_solicita_reprogramar(client: AsyncClient, db_session: AsyncSession):
    cita = await create_patient_cita(client, db_session, phone="600222222")

    response = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "+34600222222", "message_body": "No puedo, necesito cambiar"},
    )

    assert response.status_code == 200
    assert response.json()["applied_status"] == "reschedule_requested"
    await db_session.refresh(cita)
    assert cita.estado == "reschedule_requested"
    assert cita.recordatorio_estado == "solicita_cambio"
    telefonear = await db_session.scalar(select(CitaTelefonear).where(CitaTelefonear.cita_original_id == cita.id))
    assert telefonear is not None


@pytest.mark.asyncio
async def test_whatsapp_webhook_ambiguo_queda_revision_manual(client: AsyncClient, db_session: AsyncSession):
    cita = await create_patient_cita(client, db_session, phone="600333333")

    response = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "600333333", "message_body": "Ya os digo algo"},
    )

    assert response.status_code == 200
    assert response.json()["applied_status"] == "pending_manual_review"
    assert response.json()["processed"] is False
    await db_session.refresh(cita)
    assert cita.estado == "pending_manual_review"


@pytest.mark.asyncio
async def test_whatsapp_bandeja_lista_y_accion_manual(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    cita = await create_patient_cita(client, db_session, phone="600444444")
    webhook = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "600444444", "message_body": "No puedo"},
    )
    communication_id = webhook.json()["communication_id"]

    inbox = await client.get("/api/whatsapp/comunicaciones?direction=inbound", headers=headers)
    assert inbox.status_code == 200
    assert any(item["id"] == communication_id for item in inbox.json())

    action = await client.post(
        f"/api/whatsapp/comunicaciones/{communication_id}/accion",
        headers=headers,
        json={"action": "confirm", "note": "Confirmado telefonicamente"},
    )

    assert action.status_code == 200
    assert action.json()["processed"] is True
    await db_session.refresh(cita)
    assert cita.estado == "confirmed"

    result = await db_session.execute(select(WhatsAppComunicacion).where(WhatsAppComunicacion.id == UUID(communication_id)))
    communication = result.scalar_one()
    assert communication.patient_id == cita.paciente_id
    assert communication.appointment_id == cita.id


@pytest.mark.asyncio
async def test_whatsapp_accion_marca_pendiente_y_listado_paciente(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    cita = await create_patient_cita(client, db_session, phone="600555555")
    webhook = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "600555555", "message_body": "Lo miro y aviso"},
    )
    assert webhook.status_code == 200
    communication_id = webhook.json()["communication_id"]

    by_patient = await client.get(
        "/api/whatsapp/comunicaciones",
        headers=headers,
        params={"patient_id": str(cita.paciente_id), "direction": "inbound"},
    )
    assert by_patient.status_code == 200
    assert any(item["id"] == communication_id for item in by_patient.json())

    pending = await client.post(
        f"/api/whatsapp/comunicaciones/{communication_id}/accion",
        headers=headers,
        json={"action": "mark_pending", "note": "Paciente pide buscar otra hora"},
    )
    assert pending.status_code == 200
    await db_session.refresh(cita)
    assert cita.estado == "reschedule_requested"
    assert pending.json()["processed"] is True


@pytest.mark.asyncio
async def test_whatsapp_webhook_duplicado_no_duplica_comunicacion(client: AsyncClient, db_session: AsyncSession):
    cita = await create_patient_cita(client, db_session, phone="600666666")
    payload = {
        "from_phone": "600666666",
        "message_body": "ok",
        "message_id": "wamid.test-duplicado-1",
    }

    first = await client.post("/api/whatsapp/webhook", json=payload)
    second = await client.post("/api/whatsapp/webhook", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["communication_id"] == first.json()["communication_id"]
    result = await db_session.execute(
        select(WhatsAppComunicacion).where(WhatsAppComunicacion.provider_message_id == "wamid.test-duplicado-1")
    )
    assert len(result.scalars().all()) == 1
    await db_session.refresh(cita)
    assert cita.estado == "confirmed"


@pytest.mark.asyncio
async def test_whatsapp_reprograma_manual_y_evita_solape(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    fecha = next_weekday(9)
    cita = await create_patient_cita(client, db_session, phone="600777777", fecha_hora=fecha)
    db_session.add(HorarioDoctor(
        doctor_id=cita.doctor_id,
        dia_semana=fecha.weekday(),
        tipo_dia="laborable",
        bloques=[{"inicio": "09:00", "fin": "13:00"}],
        intervalo_min=10,
    ))
    ocupado = Paciente(nombre="Paciente", apellidos="Ocupado")
    db_session.add(ocupado)
    await db_session.flush()
    db_session.add(Cita(
        paciente_id=ocupado.id,
        doctor_id=cita.doctor_id,
        fecha_hora=fecha.replace(hour=10),
        duracion_min=30,
        estado="programada",
        motivo="Hueco ocupado",
    ))
    await db_session.commit()

    webhook = await client.post(
        "/api/whatsapp/webhook",
        json={"from_phone": "600777777", "message_body": "No puedo, cambiar", "message_id": "wamid.repro-1"},
    )
    assert webhook.status_code == 200
    communication_id = webhook.json()["communication_id"]

    conflict = await client.post(
        f"/api/whatsapp/comunicaciones/{communication_id}/reprogramar",
        headers=headers,
        json={"fecha_hora": fecha.replace(hour=10).isoformat(), "duracion_min": 30},
    )
    assert conflict.status_code == 409

    moved = await client.post(
        f"/api/whatsapp/comunicaciones/{communication_id}/reprogramar",
        headers=headers,
        json={"fecha_hora": fecha.replace(hour=11).isoformat(), "duracion_min": 30},
    )
    assert moved.status_code == 200
    assert moved.json()["processed"] is True
    assert moved.json()["appointment"]["estado"] == "rescheduled"
    await db_session.refresh(cita)
    assert cita.estado == "rescheduled"
    assert cita.fecha_hora.hour == 11
    telefonear = await db_session.scalar(select(CitaTelefonear).where(CitaTelefonear.cita_original_id == cita.id))
    assert telefonear is not None
    assert telefonear.reubicada is True
