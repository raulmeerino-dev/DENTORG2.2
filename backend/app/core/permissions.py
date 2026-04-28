from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import verify_access_token
from app.database import AsyncSession, get_db

bearer_scheme = HTTPBearer()


class TokenData:
    def __init__(self, user_id: UUID, username: str, rol: str, clinica_id: UUID | None = None):
        self.user_id = user_id
        self.username = username
        self.rol = rol
        self.clinica_id = clinica_id


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> TokenData:
    """Dependencia base: extrae y valida el JWT del header Authorization."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = verify_access_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    username = payload.get("username")
    rol = payload.get("rol")

    if not all([user_id, username, rol]):
        raise credentials_exception

    clinica_id = payload.get("clinica_id")
    return TokenData(
        user_id=UUID(user_id),
        username=username,
        rol=rol,
        clinica_id=UUID(clinica_id) if clinica_id else None,
    )


def require_roles(*roles: str):
    """
    Decorador de dependencia para restringir acceso por rol.

    Uso:
        @router.get("/ruta", dependencies=[Depends(require_roles("admin", "doctor"))])
    """
    async def _check_roles(
        current_user: Annotated[TokenData, Depends(get_current_user)],
    ) -> TokenData:
        if current_user.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere rol: {', '.join(roles)}",
            )
        return current_user

    return _check_roles


# Dependencias de rol preconfiguradas
RequireAdmin = Depends(require_roles("admin"))
RequireDoctor = Depends(require_roles("admin", "doctor"))
RequireRecepcion = Depends(require_roles("admin", "doctor", "recepcion"))

CurrentUser = Annotated[TokenData, Depends(get_current_user)]
