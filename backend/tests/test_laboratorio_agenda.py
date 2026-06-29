from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.cita import Cita
from app.models.doctor import Doctor
from app.models.laboratorio import Laboratorio
from app.models.paciente import Paciente
from app.models.usuario import Usuario


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"lab-agenda-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin Laboratorio",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def seed_agenda_lab_case(db_session: AsyncSession):
    paciente = Paciente(nombre="Juan", apellidos="Perez")
    otro_paciente = Paciente(nombre="Ana", apellidos="Otra")
    doctor = Doctor(nombre="Dra. Lab", color_agenda="#0f8ea0", activo=True)
    laboratorio = Laboratorio(nombre="Lab Dental X", contacto="Laura")
    db_session.add_all([paciente, otro_paciente, doctor, laboratorio])
    await db_session.flush()
    cita = Cita(
        paciente_id=paciente.id,
        doctor_id=doctor.id,
        fecha_hora=datetime(2026, 6, 29, 12, 30, tzinfo=timezone.utc),
        duracion_min=30,
        estado="programada",
        motivo="Prueba corona",
    )
    otra_cita = Cita(
        paciente_id=otro_paciente.id,
        doctor_id=doctor.id,
        fecha_hora=datetime(2026, 6, 29, 13, 0, tzinfo=timezone.utc),
        duracion_min=30,
        estado="programada",
        motivo="Revision",
    )
    db_session.add_all([cita, otra_cita])
    await db_session.commit()
    return paciente, doctor, laboratorio, cita, otra_cita


@pytest.mark.asyncio
async def test_crear_trabajo_laboratorio_asociado_aparece_en_agenda(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await auth_headers(client, db_session)
    paciente, doctor, laboratorio, cita, _ = await seed_agenda_lab_case(db_session)

    created = await client.post(
        "/api/laboratorio/trabajos",
        headers=headers,
        json={
            "paciente_id": str(paciente.id),
            "doctor_id": str(doctor.id),
            "laboratorio_id": str(laboratorio.id),
            "cita_id": str(cita.id),
            "descripcion": "Corona zirconio 16",
            "tipo_trabajo": "crown",
            "estado": "sent_to_lab",
            "fecha_salida": "2026-06-20",
            "fecha_entrega_prevista": "2026-06-28",
        },
    )
    assert created.status_code == 201
    trabajo = created.json()
    assert trabajo["cita_id"] == str(cita.id)

    agenda = await client.get(
        "/api/citas",
        headers=headers,
        params={
            "fecha_desde": "2026-06-29T00:00:00+00:00",
            "fecha_hasta": "2026-06-29T23:59:59+00:00",
        },
    )
    assert agenda.status_code == 200
    cita_agenda = next(item for item in agenda.json() if item["id"] == str(cita.id))
    assert cita_agenda["laboratorio"][0]["descripcion"] == "Corona zirconio 16"
    assert cita_agenda["laboratorio"][0]["laboratorio"]["nombre"] == "Lab Dental X"

    resumen = await client.get(
        "/api/laboratorio/agenda/resumen",
        headers=headers,
        params={"fecha": "2026-06-29"},
    )
    assert resumen.status_code == 200
    assert resumen.json()["total"] == 1
    assert resumen.json()["retrasados"] == 1


@pytest.mark.asyncio
async def test_laboratorio_valida_paciente_cita_y_transiciones(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await auth_headers(client, db_session)
    paciente, doctor, laboratorio, cita, otra_cita = await seed_agenda_lab_case(db_session)

    invalid = await client.post(
        "/api/laboratorio/trabajos",
        headers=headers,
        json={
            "paciente_id": str(paciente.id),
            "doctor_id": str(doctor.id),
            "laboratorio_id": str(laboratorio.id),
            "cita_id": str(otra_cita.id),
            "descripcion": "Ferula descarga",
        },
    )
    assert invalid.status_code == 409

    created = await client.post(
        "/api/laboratorio/trabajos",
        headers=headers,
        json={
            "paciente_id": str(paciente.id),
            "doctor_id": str(doctor.id),
            "laboratorio_id": str(laboratorio.id),
            "descripcion": "Ferula descarga",
            "estado": "pending_to_send",
        },
    )
    assert created.status_code == 201
    trabajo_id = UUID(created.json()["id"])

    asociar = await client.patch(
        f"/api/laboratorio/trabajos/{trabajo_id}/asociar-cita",
        headers=headers,
        json={"cita_id": str(cita.id)},
    )
    assert asociar.status_code == 200
    assert asociar.json()["cita_id"] == str(cita.id)

    revisar_sin_recibir = await client.post(
        f"/api/laboratorio/trabajos/{trabajo_id}/revisar",
        headers=headers,
        json={"fecha": "2026-06-29"},
    )
    assert revisar_sin_recibir.status_code == 409

    recibido = await client.post(
        f"/api/laboratorio/trabajos/{trabajo_id}/recibir",
        headers=headers,
        json={"fecha": "2026-06-29", "ubicacion_clinica": "Recepcion"},
    )
    assert recibido.status_code == 200
    assert recibido.json()["estado"] == "received_in_clinic"
    assert recibido.json()["ubicacion_clinica"] == "Recepcion"

    revisado = await client.post(
        f"/api/laboratorio/trabajos/{trabajo_id}/revisar",
        headers=headers,
        json={"fecha": "2026-06-29"},
    )
    assert revisado.status_code == 200
    assert revisado.json()["estado"] == "checked_in_clinic"
    assert revisado.json()["fecha_revision"] == "2026-06-29"

    entregado = await client.post(
        f"/api/laboratorio/trabajos/{trabajo_id}/entregar",
        headers=headers,
        json={"fecha": "2026-06-29"},
    )
    assert entregado.status_code == 200
    assert entregado.json()["estado"] == "delivered_or_placed"
    assert entregado.json()["colocado"] is True
