from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select

from app.core.security import verify_access_token

bearer_scheme = HTTPBearer()

ROLE_ADMIN = "admin"
ROLE_DOCTOR = "doctor"
ROLE_RECEPCION = "recepcion"
ROLE_AUXILIAR = "auxiliar"
ROLE_PACIENTE = "paciente"

CLINICAL_DATA_ROLES = {ROLE_ADMIN, ROLE_DOCTOR, ROLE_AUXILIAR}
BILLING_ROLES = {ROLE_ADMIN, ROLE_RECEPCION}
STAFF_ROLES = (ROLE_ADMIN, ROLE_DOCTOR, ROLE_RECEPCION, ROLE_AUXILIAR)


class TokenData:
    def __init__(
        self,
        user_id: UUID,
        username: str,
        rol: str,
        clinica_id: UUID | None = None,
        paciente_id: UUID | None = None,
    ):
        self.user_id = user_id
        self.username = username
        self.rol = rol
        self.clinica_id = clinica_id
        self.paciente_id = paciente_id


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
    paciente_id = payload.get("paciente_id")
    return TokenData(
        user_id=UUID(user_id),
        username=username,
        rol=rol,
        clinica_id=UUID(clinica_id) if clinica_id else None,
        paciente_id=UUID(paciente_id) if paciente_id else None,
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


async def require_admin(current_user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
    return await require_roles(ROLE_ADMIN)(current_user)


async def require_doctor_or_admin(current_user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
    return await require_roles(ROLE_ADMIN, ROLE_DOCTOR)(current_user)


async def require_recepcion_or_above(current_user: Annotated[TokenData, Depends(get_current_user)]) -> TokenData:
    return await require_roles(ROLE_ADMIN, ROLE_DOCTOR, ROLE_RECEPCION, ROLE_AUXILIAR)(current_user)


def can_view_health_data(current_user: TokenData) -> bool:
    return current_user.rol in CLINICAL_DATA_ROLES


def can_modify_billing(current_user: TokenData) -> bool:
    return current_user.rol in BILLING_ROLES


def ensure_can_modify_billing(current_user: TokenData) -> None:
    if not can_modify_billing(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. No puede modificar facturación.",
        )


def ensure_clinic_access(current_user: TokenData, clinica_id: UUID | None) -> None:
    """
    Control de aislamiento multi-clínica.

    Los admin pueden operar de forma transversal. Para usuarios con clínica activa,
    los registros legacy sin clinica_id se permiten, pero cualquier clinica_id distinto
    queda bloqueado.
    """
    if current_user.rol == ROLE_ADMIN or clinica_id is None:
        return
    if current_user.clinica_id is None or clinica_id != current_user.clinica_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene acceso a datos de otra clínica.",
        )


def resolve_clinic_id(current_user: TokenData, requested: UUID | None = None) -> UUID | None:
    if current_user.rol != ROLE_ADMIN:
        if current_user.clinica_id is None:
            if requested is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="El usuario no tiene una clínica asignada.",
                )
            return None
        if requested is not None and requested != current_user.clinica_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puede asignar registros a otra clínica.",
            )
        return current_user.clinica_id
    return requested or current_user.clinica_id


def clinic_column_condition(clinica_column, current_user: TokenData):
    if current_user.rol == ROLE_ADMIN:
        return None
    if current_user.clinica_id is None:
        return clinica_column.is_(None)
    return (clinica_column == current_user.clinica_id) | (clinica_column.is_(None))


def clinic_scope_condition(model: type, current_user: TokenData):
    clinica_column = getattr(model, "clinica_id", None)
    if clinica_column is None:
        return None
    return clinic_column_condition(clinica_column, current_user)


def scope_select_by_clinic(stmt: Select, model: type, current_user: TokenData) -> Select:
    condition = clinic_scope_condition(model, current_user)
    if condition is None:
        return stmt
    return stmt.where(condition)


async def require_clinic_access(
    clinica_id: UUID | None,
    current_user: Annotated[TokenData, Depends(get_current_user)],
) -> TokenData:
    ensure_clinic_access(current_user, clinica_id)
    return current_user


# Dependencias de rol preconfiguradas
RequireAdmin = Depends(require_roles("admin"))
RequireDoctor = Depends(require_roles("admin", "doctor"))
RequireRecepcion = Depends(require_roles("admin", "doctor", "recepcion", "auxiliar"))
RequireStaff = Depends(require_roles(*STAFF_ROLES))
RequireBilling = Depends(require_roles("admin", "recepcion"))

CurrentUser = Annotated[TokenData, Depends(get_current_user)]
