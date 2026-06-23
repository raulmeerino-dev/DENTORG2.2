from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.doctor import Doctor
from app.models.horario import HorarioDoctor
from app.models.usuario import Usuario


async def auth_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    rol: str = "admin",
    doctor_id=None,
) -> dict[str, str]:
    username = f"{rol}-notifs-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("usuario1234"),
        nombre=f"Usuario {rol}",
        rol=rol,
        doctor_id=doctor_id,
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "usuario1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def next_monday_at(hour: int, minute: int = 0) -> datetime:
    value = datetime.now(timezone.utc)
    while value.weekday() != 0:
        value += timedelta(days=1)
    return value.replace(hour=hour, minute=minute, second=0, microsecond=0)


@pytest.mark.asyncio
async def test_notifica_solo_al_doctor_asignado_cuando_paciente_llega(
    client: AsyncClient,
    db_session: AsyncSession,
):
    admin_headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Sala Espera", color_agenda="#2563eb", activo=True)
    other_doctor = Doctor(nombre="Dr. Sin Aviso", color_agenda="#16a34a", activo=True)
    db_session.add_all([doctor, other_doctor])
    await db_session.flush()
    db_session.add(HorarioDoctor(
        doctor_id=doctor.id,
        dia_semana=0,
        tipo_dia="laborable",
        bloques=[{"inicio": "09:00", "fin": "13:00"}],
        intervalo_min=10,
    ))
    await db_session.commit()

    doctor_headers = await auth_headers(client, db_session, rol="doctor", doctor_id=doctor.id)
    other_doctor_headers = await auth_headers(client, db_session, rol="doctor", doctor_id=other_doctor.id)

    paciente_response = await client.post(
        "/api/pacientes",
        headers=admin_headers,
        json={"nombre": "Lucia", "apellidos": "Paciente", "telefono": "600000001"},
    )
    assert paciente_response.status_code == 201
    paciente_id = paciente_response.json()["id"]
    fecha = next_monday_at(9)

    cita_response = await client.post(
        "/api/citas",
        headers=admin_headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha_hora": fecha.isoformat(),
            "duracion_min": 30,
            "motivo": "Revision",
        },
    )
    assert cita_response.status_code == 201
    cita = cita_response.json()

    llegada = await client.patch(
        f"/api/citas/{cita['id']}",
        headers=admin_headers,
        json={"estado": "en_clinica"},
    )
    assert llegada.status_code == 200

    propias = await client.get("/api/notificaciones/mias", headers=doctor_headers, params={"unread_only": True})
    assert propias.status_code == 200
    assert len(propias.json()) == 1
    notification = propias.json()[0]
    assert notification["appointment_id"] == cita["id"]
    assert notification["patient_id"] == paciente_id
    assert notification["read"] is False
    assert notification["message"] == "El paciente Lucia Paciente ya está en sala de espera."
    assert notification["appointment_time"].startswith(fecha.isoformat().replace("+00:00", "Z")[:16])

    ajenas = await client.get("/api/notificaciones/mias", headers=other_doctor_headers, params={"unread_only": True})
    assert ajenas.status_code == 200
    assert ajenas.json() == []

    duplicada = await client.patch(
        f"/api/citas/{cita['id']}",
        headers=admin_headers,
        json={"estado": "en_clinica", "observaciones": "En tratamiento"},
    )
    assert duplicada.status_code == 200
    propias_todas = await client.get("/api/notificaciones/mias", headers=doctor_headers)
    assert len(propias_todas.json()) == 1

    forbidden = await client.post(f"/api/notificaciones/{notification['id']}/leer", headers=other_doctor_headers)
    assert forbidden.status_code == 404

    read = await client.post(f"/api/notificaciones/{notification['id']}/leer", headers=doctor_headers)
    assert read.status_code == 200
    assert read.json()["read"] is True
    assert read.json()["read_at"] is not None

    unread_after = await client.get("/api/notificaciones/mias", headers=doctor_headers, params={"unread_only": True})
    assert unread_after.status_code == 200
    assert unread_after.json() == []
