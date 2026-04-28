from uuid import UUID

from pydantic import BaseModel, Field
from datetime import datetime


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int  # segundos


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UsuarioMe(BaseModel):
    """Datos del usuario autenticado devueltos por /auth/me."""
    id: UUID
    username: str
    nombre: str
    rol: str
    doctor_id: UUID | None = None

    model_config = {"from_attributes": True}


class AuthSessionResponse(BaseModel):
    id: UUID
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    current: bool = False

    model_config = {"from_attributes": True}
