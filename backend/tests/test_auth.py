"""Tests del sistema de autenticación."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.throttling import clear_login_failures
from app.models.usuario import Usuario


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
    """GET /auth/me sin token devuelve 403."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    """Health check responde 200."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
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
