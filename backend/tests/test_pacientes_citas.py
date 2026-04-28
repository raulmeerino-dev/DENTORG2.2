from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.doctor import Doctor
from app.models.horario import HorarioDoctor
from app.models.usuario import Usuario


async def auth_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    username = f"crud-admin-{uuid4().hex[:8]}"
    usuario = Usuario(
        username=username,
        password_hash=hash_password("admin1234"),
        nombre="Admin CRUD",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()
    response = await client.post("/api/auth/login", json={"username": username, "password": "admin1234"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_crud_paciente(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    created = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Ana", "apellidos": "Dental", "telefono": "600000000"},
    )
    assert created.status_code == 201
    paciente = created.json()
    assert paciente["nombre"] == "Ana"

    updated = await client.patch(
        f"/api/pacientes/{paciente['id']}",
        headers=headers,
        json={"telefono": "611111111", "observaciones": "Completar datos"},
    )
    assert updated.status_code == 200
    assert updated.json()["observaciones"] == "Completar datos"

    listed = await client.get("/api/pacientes?q=Ana", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == paciente["id"] for item in listed.json())


@pytest.mark.asyncio
async def test_crud_cita(client: AsyncClient, db_session: AsyncSession):
    headers = await auth_headers(client, db_session)
    doctor = Doctor(nombre="Dra. Agenda", color_agenda="#2563eb", activo=True)
    db_session.add(doctor)
    await db_session.flush()
    db_session.add(HorarioDoctor(
        doctor_id=doctor.id,
        dia_semana=0,
        tipo_dia="laborable",
        bloques=[{"inicio": "09:00", "fin": "13:00"}],
        intervalo_min=10,
    ))
    await db_session.commit()

    paciente_res = await client.post(
        "/api/pacientes",
        headers=headers,
        json={"nombre": "Luis", "apellidos": "Cita", "telefono": "600000001"},
    )
    assert paciente_res.status_code == 201
    paciente_id = paciente_res.json()["id"]

    next_monday = datetime.now(timezone.utc)
    while next_monday.weekday() != 0:
        next_monday += timedelta(days=1)
    fecha = next_monday.replace(hour=9, minute=0, second=0, microsecond=0)

    created = await client.post(
        "/api/citas",
        headers=headers,
        json={
            "paciente_id": paciente_id,
            "doctor_id": str(doctor.id),
            "fecha_hora": fecha.isoformat(),
            "duracion_min": 30,
            "motivo": "Revision",
        },
    )
    assert created.status_code == 201
    cita = created.json()

    patched = await client.patch(f"/api/citas/{cita['id']}", headers=headers, json={"estado": "anulada"})
    assert patched.status_code == 200
    assert patched.json()["estado"] == "anulada"
