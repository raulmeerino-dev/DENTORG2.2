from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, ensure_clinic_access, scope_select_by_clinic
from app.core.security import verify_password
from app.database import get_db
from app.models.fichaje import FichajeTrabajador, Trabajador
from app.models.usuario import Usuario
from app.schemas.fichaje import (
    FichajeCreate,
    FichajeRegistroResponse,
    FichajeResponse,
    TrabajadorFichajeResponse,
)
from app.services.audit import write_audit_log

router = APIRouter()

STAFF_ROLES = {"admin", "doctor", "recepcion", "auxiliar"}


@dataclass(frozen=True)
class WorkerIdentity:
    id: UUID
    nombre: str
    origen: str
    clinica_id: UUID | None
    codigo: str | None
    rol: str | None
    pin_hash: str | None


def _ensure_staff_session(current_user: CurrentUser) -> None:
    if current_user.rol not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fichaje disponible solo para personal.")


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client and request.client.host else None


def _user_agent(request: Request) -> str | None:
    user_agent = request.headers.get("User-Agent")
    return user_agent[:500] if user_agent else None


def _device_label(request: Request) -> str | None:
    explicit = request.headers.get("X-Device-Name") or request.headers.get("X-Client-Device")
    if explicit and explicit.strip():
        return explicit.strip()[:120]
    return _client_ip(request)


def _worker_response(worker: WorkerIdentity) -> TrabajadorFichajeResponse:
    return TrabajadorFichajeResponse(
        id=worker.id,
        nombre=worker.nombre,
        origen=worker.origen,  # type: ignore[arg-type]
        codigo=worker.codigo,
        rol=worker.rol,
        clinica_id=worker.clinica_id,
        pin_configurado=bool(worker.pin_hash),
    )


async def _configured_workers(db: AsyncSession, current_user: CurrentUser) -> list[WorkerIdentity]:
    stmt = select(Trabajador).where(Trabajador.activo == True).order_by(Trabajador.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Trabajador, current_user)
    result = await db.execute(stmt)
    return [
        WorkerIdentity(
            id=worker.id,
            nombre=worker.nombre,
            origen="trabajador",
            clinica_id=worker.clinica_id,
            codigo=worker.codigo,
            rol=worker.rol,
            pin_hash=worker.pin_hash,
        )
        for worker in result.scalars().all()
    ]


async def _staff_user_workers(
    db: AsyncSession,
    current_user: CurrentUser,
    excluded_user_ids: set[UUID] | None = None,
) -> list[WorkerIdentity]:
    stmt = (
        select(Usuario)
        .where(Usuario.activo == True, Usuario.rol.in_(STAFF_ROLES))  # noqa: E712
        .order_by(Usuario.nombre)
    )
    stmt = scope_select_by_clinic(stmt, Usuario, current_user)
    result = await db.execute(stmt)
    excluded = excluded_user_ids or set()
    return [
        WorkerIdentity(
            id=usuario.id,
            nombre=usuario.nombre,
            origen="usuario",
            clinica_id=usuario.clinica_id,
            codigo=usuario.username,
            rol=usuario.rol,
            pin_hash=usuario.password_hash,
        )
        for usuario in result.scalars().all()
        if usuario.id not in excluded
    ]


async def _resolve_worker(db: AsyncSession, current_user: CurrentUser, worker_id: UUID) -> WorkerIdentity:
    trabajador = await db.get(Trabajador, worker_id)
    if trabajador:
        if not trabajador.activo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trabajador no encontrado")
        ensure_clinic_access(current_user, trabajador.clinica_id)
        return WorkerIdentity(
            id=trabajador.id,
            nombre=trabajador.nombre,
            origen="trabajador",
            clinica_id=trabajador.clinica_id,
            codigo=trabajador.codigo,
            rol=trabajador.rol,
            pin_hash=trabajador.pin_hash,
        )

    usuario = await db.get(Usuario, worker_id)
    if usuario and usuario.activo and usuario.rol in STAFF_ROLES:
        ensure_clinic_access(current_user, usuario.clinica_id)
        return WorkerIdentity(
            id=usuario.id,
            nombre=usuario.nombre,
            origen="usuario",
            clinica_id=usuario.clinica_id,
            codigo=usuario.username,
            rol=usuario.rol,
            pin_hash=usuario.password_hash,
        )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trabajador no encontrado")


def _verify_worker_pin(worker: WorkerIdentity, pin: str) -> None:
    normalized = pin.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Introduce el PIN del trabajador.")
    if not worker.pin_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El trabajador no tiene PIN configurado.")
    if not verify_password(normalized, worker.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto.")


async def _latest_fichaje(
    db: AsyncSession,
    current_user: CurrentUser,
    trabajador_id: UUID,
) -> FichajeTrabajador | None:
    stmt = (
        select(FichajeTrabajador)
        .where(FichajeTrabajador.trabajador_id == trabajador_id)
        .order_by(desc(FichajeTrabajador.hora_exacta))
        .limit(1)
    )
    stmt = scope_select_by_clinic(stmt, FichajeTrabajador, current_user)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/trabajadores", response_model=list[TrabajadorFichajeResponse])
async def listar_trabajadores_fichaje(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[TrabajadorFichajeResponse]:
    _ensure_staff_session(current_user)
    configured = await _configured_workers(db, current_user)
    linked_users = {worker.id for worker in configured if worker.origen == "usuario"}
    staff_users = await _staff_user_workers(db, current_user, linked_users)
    return [_worker_response(worker) for worker in [*configured, *staff_users]]


@router.get("/ultimo/{trabajador_id}", response_model=FichajeResponse | None)
async def obtener_ultimo_fichaje(
    trabajador_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FichajeResponse | None:
    _ensure_staff_session(current_user)
    await _resolve_worker(db, current_user, trabajador_id)
    latest = await _latest_fichaje(db, current_user, trabajador_id)
    return FichajeResponse.model_validate(latest) if latest else None


@router.get("", response_model=list[FichajeResponse])
async def listar_fichajes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    trabajador_id: UUID | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    tipo: str | None = Query(None, pattern="^(entrada|salida)$"),
    limit: int = Query(100, ge=1, le=500),
) -> list[FichajeResponse]:
    _ensure_staff_session(current_user)
    stmt = select(FichajeTrabajador).order_by(desc(FichajeTrabajador.hora_exacta)).limit(limit)
    stmt = scope_select_by_clinic(stmt, FichajeTrabajador, current_user)
    if trabajador_id:
        stmt = stmt.where(FichajeTrabajador.trabajador_id == trabajador_id)
    if desde:
        stmt = stmt.where(FichajeTrabajador.fecha >= desde)
    if hasta:
        stmt = stmt.where(FichajeTrabajador.fecha <= hasta)
    if tipo:
        stmt = stmt.where(FichajeTrabajador.tipo == tipo)
    result = await db.execute(stmt)
    return [FichajeResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=FichajeRegistroResponse, status_code=status.HTTP_201_CREATED)
async def registrar_fichaje(
    data: FichajeCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FichajeRegistroResponse:
    _ensure_staff_session(current_user)
    worker = await _resolve_worker(db, current_user, data.trabajador_id)
    _verify_worker_pin(worker, data.pin)

    now = datetime.now(UTC)
    fichaje = FichajeTrabajador(
        trabajador_id=worker.id,
        trabajador_origen=worker.origen,
        trabajador_nombre=worker.nombre,
        clinica_id=worker.clinica_id or current_user.clinica_id,
        fecha=now.date(),
        hora_exacta=now,
        tipo=data.tipo,
        equipo=_device_label(request),
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
        registrado_por_usuario_id=current_user.user_id,
    )
    db.add(fichaje)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="fichaje.registrar",
        entity_type="fichaje_trabajador",
        entity_id=fichaje.id,
        new_values={
            "trabajador_id": str(worker.id),
            "trabajador_nombre": worker.nombre,
            "tipo": data.tipo,
            "hora_exacta": now.isoformat(),
            "equipo": fichaje.equipo,
        },
        clinica_id=fichaje.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(fichaje)
    response = FichajeResponse.model_validate(fichaje)
    return FichajeRegistroResponse(fichaje=response, ultimo_fichaje=response)
