"""Tests del sistema de autenticación."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import hash_password
from app.core.throttling import clear_login_failures
from app.domains.identity.persistence.usuario import Usuario


@pytest.mark.asyncio
async def test_login_exitoso(client: AsyncClient, db_session: AsyncSession):
    """Login con credenciales válidas devuelve tokens JWT."""
    # Crear usuario de test
    usuario = Usuario(
        username="testuser",
        password_hash=hash_password("contraseña123"),
        nombre="Usuario Test",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()

    response = await client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "contraseña123",
    })

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

    refreshed = await client.post("/api/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"] != data["access_token"]


@pytest.mark.asyncio
async def test_login_contraseña_incorrecta(client: AsyncClient, db_session: AsyncSession):
    """Login con contraseña incorrecta devuelve 401."""
    usuario = Usuario(
        username="testuser2",
        password_hash=hash_password("correcta"),
        nombre="Test2",
        rol="recepcion",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()

    response = await client.post("/api/auth/login", json={
        "username": "testuser2",
        "password": "incorrecta",
    })

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_sin_token(client: AsyncClient):
    """GET /auth/me sin token devuelve 401."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_get_me_includes_configured_clinic_timezone(client, db_session, monkeypatch):
    usuario = Usuario(username="timezone-user", password_hash=hash_password("timezone123"), nombre="Timezone", rol="doctor")
    db_session.add(usuario)
    await db_session.commit()
    login = await client.post("/api/auth/login", json={"username": "timezone-user", "password": "timezone123"})
    monkeypatch.setattr(get_settings(), "clinic_timezone", "Atlantic/Canary")
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert response.status_code == 200
    assert response.json()["clinic_timezone"] == "Atlantic/Canary"


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """Health check responde 200."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["service"] == "DentCore backend"
    assert data["timestamp"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_login_bloquea_fuerza_bruta(client: AsyncClient, db_session: AsyncSession):
    """Bloquea demasiados intentos fallidos consecutivos."""
    usuario = Usuario(
        username="ratelimit-user",
        password_hash=hash_password("correcta123"),
        nombre="Rate Limit",
        rol="admin",
        activo=True,
    )
    db_session.add(usuario)
    await db_session.commit()

    headers = {"X-Forwarded-For": "203.0.113.10"}
    for _ in range(5):
        response = await client.post(
            "/api/auth/login",
            json={"username": "ratelimit-user", "password": "incorrecta"},
            headers=headers,
        )
        assert response.status_code == 401

    blocked = await client.post(
        "/api/auth/login",
        json={"username": "ratelimit-user", "password": "incorrecta"},
        headers=headers,
    )
    assert blocked.status_code == 429

    clear_login_failures("login:203.0.113.10:ratelimit-user")
