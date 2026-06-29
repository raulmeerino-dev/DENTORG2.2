import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.usuario import Usuario


async def _login(client: AsyncClient, username: str, password: str) -> str:
    response = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_fichaje_usa_trabajador_distinto_al_usuario_logado(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recepcion = Usuario(
        username="recep-fichaje",
        password_hash=hash_password("recep1234"),
        nombre="Recepcion",
        rol="recepcion",
        activo=True,
    )
    doctor = Usuario(
        username="doctor-fichaje",
        password_hash=hash_password("4455"),
        nombre="Dra. Ana Vega",
        rol="doctor",
        activo=True,
    )
    db_session.add_all([recepcion, doctor])
    await db_session.commit()

    token = await _login(client, "recep-fichaje", "recep1234")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Name": "Recepcion 1",
        "User-Agent": "DentCore-Test",
    }

    trabajadores = await client.get("/api/fichajes/trabajadores", headers=headers)
    assert trabajadores.status_code == 200
    doctor_item = next(item for item in trabajadores.json() if item["nombre"] == "Dra. Ana Vega")

    response = await client.post(
        "/api/fichajes",
        json={"trabajador_id": doctor_item["id"], "pin": "4455", "tipo": "entrada"},
        headers=headers,
    )

    assert response.status_code == 201
    fichaje = response.json()["fichaje"]
    assert fichaje["trabajador_id"] == doctor_item["id"]
    assert fichaje["trabajador_nombre"] == "Dra. Ana Vega"
    assert fichaje["tipo"] == "entrada"
    assert fichaje["equipo"] == "Recepcion 1"
    assert fichaje["registrado_por_usuario_id"] == str(recepcion.id)

    latest = await client.get(f"/api/fichajes/ultimo/{doctor_item['id']}", headers=headers)
    assert latest.status_code == 200
    assert latest.json()["id"] == fichaje["id"]


@pytest.mark.asyncio
async def test_fichaje_rechaza_pin_incorrecto(
    client: AsyncClient,
    db_session: AsyncSession,
):
    admin = Usuario(
        username="admin-fichaje",
        password_hash=hash_password("admin1234"),
        nombre="Admin",
        rol="admin",
        activo=True,
    )
    worker = Usuario(
        username="aux-fichaje",
        password_hash=hash_password("1234"),
        nombre="Auxiliar",
        rol="auxiliar",
        activo=True,
    )
    db_session.add_all([admin, worker])
    await db_session.commit()

    token = await _login(client, "admin-fichaje", "admin1234")
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/fichajes",
        json={"trabajador_id": str(worker.id), "pin": "9999", "tipo": "salida"},
        headers=headers,
    )

    assert response.status_code == 401
