"""
Router de autenticacion con sesiones revocables.
"""
import base64
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import CurrentUser
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_totp_secret,
    verify_totp,
    verify_password,
    verify_refresh_token,
)
from app.core.throttling import clear_login_failures, ensure_login_allowed, register_login_failure
from app.database import get_db
from app.models.auth_session import AuthSession
from app.models.usuario import Usuario
from app.schemas.auth import AuthSessionResponse, LoginRequest, RefreshRequest, TokenResponse, UsuarioMe
from app.schemas.extras import TwoFactorEnableResponse

router = APIRouter()
settings = get_settings()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "desconocida"


def _user_agent(request: Request) -> str | None:
    value = request.headers.get("User-Agent")
    if not value:
        return None
    return value[:255]


def _refresh_expiration(now: datetime | None = None) -> datetime:
    current = now or datetime.now(UTC)
    return current + timedelta(days=settings.refresh_token_expire_days)


async def _create_auth_session(
    db: AsyncSession,
    *,
    user_id: UUID,
    request: Request,
) -> AuthSession:
    now = datetime.now(UTC)
    session = AuthSession(
        usuario_id=user_id,
        refresh_nonce=uuid4().hex,
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
        created_at=now,
        last_used_at=now,
        expires_at=_refresh_expiration(now),
    )
    db.add(session)
    await db.flush()
    return session


def _build_token_data(usuario: Usuario, session: AuthSession) -> dict[str, str]:
    return {
        "sub": str(usuario.id),
        "username": usuario.username,
        "rol": usuario.rol,
        "sid": str(session.id),
        "rnonce": session.refresh_nonce,
    }


async def _revoke_session(db: AsyncSession, session: AuthSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        await db.flush()


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Fija el refresh token como cookie HttpOnly rotada por el backend."""
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/api/auth",
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Autenticar con username y contrasena."""
    throttle_key = ensure_login_allowed(request, credentials.username)
    result = await db.execute(
        select(Usuario).where(Usuario.username == credentials.username, Usuario.activo == True)  # noqa: E712
    )
    usuario = result.scalar_one_or_none()

    if not usuario or not verify_password(credentials.password, usuario.password_hash):
        register_login_failure(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contrasena incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if usuario.two_factor_secret and not verify_totp(usuario.two_factor_secret, credentials.otp or ""):
        register_login_failure(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Codigo 2FA requerido o incorrecto",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_login_failures(throttle_key)
    usuario.ultimo_acceso = datetime.now(UTC)
    auth_session = await _create_auth_session(db, user_id=usuario.id, request=request)
    await db.commit()

    token_data = _build_token_data(usuario, auth_session)
    refresh_token = create_refresh_token(token_data)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=create_access_token(token_data),
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: RefreshRequest | None = None,
) -> TokenResponse:
    """Renovar access_token usando la cookie HttpOnly de refresh."""
    refresh_token_value = body.refresh_token if body else None
    if not refresh_token_value:
        refresh_token_value = request.cookies.get(settings.refresh_cookie_name)

    if not refresh_token_value:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion no disponible o expirada",
        )

    payload = verify_refresh_token(refresh_token_value)
    if not payload:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido o expirado",
        )

    session_id = payload.get("sid")
    refresh_nonce = payload.get("rnonce")
    if not session_id or not refresh_nonce:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido o incompleto",
        )
    try:
        session_uuid = UUID(session_id)
        user_uuid = UUID(payload["sub"])
    except (ValueError, TypeError):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion invalida",
        )

    auth_session = await db.get(AuthSession, session_uuid)
    if not auth_session or auth_session.usuario_id != user_uuid:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion no encontrada",
        )
    if auth_session.revoked_at is not None or auth_session.expires_at <= datetime.now(UTC):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion revocada o expirada",
        )
    if auth_session.refresh_nonce != refresh_nonce:
        await _revoke_session(db, auth_session)
        await db.commit()
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion invalidada por rotacion o posible reutilizacion",
        )
    request_user_agent = _user_agent(request)
    if auth_session.user_agent and request_user_agent and auth_session.user_agent != request_user_agent:
        await _revoke_session(db, auth_session)
        await db.commit()
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion invalidada por cambio de agente",
        )

    result = await db.execute(
        select(Usuario).where(Usuario.id == payload["sub"], Usuario.activo == True)  # noqa: E712
    )
    usuario = result.scalar_one_or_none()
    if not usuario:
        await _revoke_session(db, auth_session)
        await db.commit()
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o desactivado",
        )

    auth_session.refresh_nonce = uuid4().hex
    auth_session.last_used_at = datetime.now(UTC)
    auth_session.ip_address = _client_ip(request)
    auth_session.user_agent = request_user_agent
    auth_session.expires_at = _refresh_expiration(auth_session.last_used_at)

    token_data = _build_token_data(usuario, auth_session)
    refresh_token_rotated = create_refresh_token(token_data)
    set_refresh_cookie(response, refresh_token_rotated)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(token_data),
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    refresh_token_value = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token_value:
        payload = verify_refresh_token(refresh_token_value)
        session_id = payload.get("sid") if payload else None
        if session_id:
            auth_session = await db.get(AuthSession, UUID(session_id))
            if auth_session:
                await _revoke_session(db, auth_session)
                await db.commit()
    clear_refresh_cookie(response)


@router.get("/me", response_model=UsuarioMe)
async def get_me(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UsuarioMe:
    """Devuelve datos del usuario autenticado."""
    result = await db.execute(select(Usuario).where(Usuario.id == current_user.user_id))
    usuario = result.scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    data = UsuarioMe.model_validate(usuario)
    data.two_factor_enabled = bool(usuario.two_factor_secret)
    return data


@router.post("/2fa-enable", response_model=TwoFactorEnableResponse)
async def enable_2fa(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TwoFactorEnableResponse:
    usuario = await db.get(Usuario, current_user.user_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    secret = usuario.two_factor_secret or generate_totp_secret()
    usuario.two_factor_secret = secret
    issuer = "DentOrg2"
    otpauth = f"otpauth://totp/{issuer}:{usuario.username}?secret={secret}&issuer={issuer}&digits=6&period=30"
    try:
        import qrcode
        image = qrcode.make(otpauth)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        qr_data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        qr_data_url = ""
    await db.commit()
    return TwoFactorEnableResponse(secret=secret, otpauthUrl=otpauth, qrDataUrl=qr_data_url)


@router.get("/sessions", response_model=list[AuthSessionResponse])
async def list_sessions(
    request: Request,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AuthSessionResponse]:
    current_sid: UUID | None = None
    refresh_token_value = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token_value:
        payload = verify_refresh_token(refresh_token_value)
        sid = payload.get("sid") if payload else None
        if sid:
            try:
                current_sid = UUID(sid)
            except (ValueError, TypeError):
                current_sid = None

    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.usuario_id == current_user.user_id)
        .order_by(AuthSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        AuthSessionResponse(
            id=session.id,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            created_at=session.created_at,
            last_used_at=session.last_used_at,
            expires_at=session.expires_at,
            revoked_at=session.revoked_at,
            current=session.id == current_sid,
        )
        for session in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    session = await db.get(AuthSession, session_id)
    if not session or session.usuario_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesion no encontrada")
    await _revoke_session(db, session)
    await db.commit()
