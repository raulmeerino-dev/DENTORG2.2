"""
Router de pacientes — Fase 3.
CRUD completo + búsqueda global + gestión de referencias/tags.

Cifrado RGPD: DNI, teléfonos y email se cifran con pgcrypto antes de guardar
y se descifran al leer. La clave nunca sale del servidor.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from app.core.crypto import cifrar_campos_paciente, cifrar_json, descifrar_json, descifrar_paciente
from app.core.permissions import CurrentUser, RequireAdmin, RequireDoctor
from app.database import get_db
from app.models.paciente import Paciente
from app.models.cita import Cita
from app.schemas.cita import CitaResponse
from app.api.citas import _to_response as cita_to_response
from app.models.referencia import Referencia
from app.schemas.paciente import (
    AsignarReferenciasRequest,
    PacienteCreate,
    PacienteResumen,
    PacienteResponse,
    PacienteUpdate,
    ReferenciaCreate,
    ReferenciaResponse,
)

router = APIRouter()

# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_paciente_or_404(db: AsyncSession, paciente_id: UUID) -> Paciente:
    result = await db.execute(
        select(Paciente)
        .options(selectinload(Paciente.referencias))
        .where(Paciente.id == paciente_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return p


async def _build_response(db: AsyncSession, p: Paciente, include_health: bool) -> PacienteResponse:
    """Construye PacienteResponse descifrando campos sensibles."""
    descifrados = await descifrar_paciente(db, p)
    data = {
        "id": p.id,
        "clinica_id": p.clinica_id,
        "codigo": p.codigo,
        "num_historial": p.num_historial,
        "nombre": p.nombre,
        "apellidos": p.apellidos,
        "fecha_nacimiento": p.fecha_nacimiento,
        "direccion": p.direccion,
        "codigo_postal": p.codigo_postal,
        "ciudad": p.ciudad,
        "provincia": p.provincia,
        "entidad_id": p.entidad_id,
        "entidad_alt_id": p.entidad_alt_id,
        "no_correo": p.no_correo,
        "foto_path": p.foto_path,
        "observaciones": p.observaciones,
        "datos_salud": descifrados["datos_salud"] if include_health else None,
        "activo": p.activo,
        "referencias": p.referencias if hasattr(p, "referencias") else [],
        **descifrados,
    }
    if not include_health:
        data["datos_salud"] = None
    return PacienteResponse.model_validate(data)


def _puede_ver_datos_salud(current_user: CurrentUser) -> bool:
    return current_user.rol in {"admin", "doctor"}


async def _leer_datos_salud(db: AsyncSession, paciente: Paciente) -> dict:
    datos = await descifrar_json(db, paciente.datos_salud_cifrado)
    if datos is not None:
        return datos
    legacy = paciente.datos_salud if isinstance(paciente.datos_salud, dict) else None
    return legacy or {}


# ─── BÚSQUEDA ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PacienteResumen])
async def listar_pacientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    q: str | None = Query(None, description="Texto libre: nombre, apellidos o código"),
    solo_activos: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PacienteResumen]:
    """
    Búsqueda de pacientes.
    - Sin `q`: devuelve la lista ordenada por apellidos (paginada).
    - Con `q`: filtra por nombre, apellidos o código (ILIKE).
    """
    stmt = select(Paciente).order_by(Paciente.apellidos, Paciente.nombre)

    if current_user.clinica_id and current_user.rol != "admin":
        stmt = stmt.where(or_(Paciente.clinica_id == current_user.clinica_id, Paciente.clinica_id.is_(None)))

    if solo_activos:
        stmt = stmt.where(Paciente.activo == True)  # noqa: E712

    if q:
        term = f"%{q}%"
        stmt = stmt.where(
            or_(
                Paciente.nombre.ilike(term),
                Paciente.apellidos.ilike(term),
                Paciente.codigo.ilike(term),
            )
        )

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    pacientes = result.scalars().all()

    # PacienteResumen no incluye campos cifrados (solo teléfono para llamadas rápidas)
    # Para evitar N+1, solo desciframos teléfono principal
    resumenes = []
    for p in pacientes:
        from app.core.crypto import descifrar_bytes
        tel = await descifrar_bytes(db, p.telefono)
        resumenes.append(
            PacienteResumen(
                id=p.id,
                num_historial=p.num_historial,
                nombre=p.nombre,
                apellidos=p.apellidos,
                fecha_nacimiento=p.fecha_nacimiento,
                telefono=tel,
                activo=p.activo,
            )
        )
    return resumenes


@router.post("", response_model=PacienteResponse, status_code=status.HTTP_201_CREATED)
async def crear_paciente(
    data: PacienteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    # Cifrar campos sensibles
    cifrados = await cifrar_campos_paciente(
        db,
        {
            "dni_nie": data.dni_nie,
            "telefono": data.telefono,
            "telefono2": data.telefono2,
            "email": data.email,
        },
    )

    campos_planos = data.model_dump(exclude={"dni_nie", "telefono", "telefono2", "email", "datos_salud"})
    if campos_planos.get("clinica_id") is None and current_user.clinica_id:
        campos_planos["clinica_id"] = current_user.clinica_id
    paciente = Paciente(**campos_planos, **cifrados)
    paciente.datos_salud_cifrado = await cifrar_json(db, data.datos_salud)
    paciente.datos_salud = None
    db.add(paciente)
    await db.commit()
    await db.refresh(paciente)

    # Reload con relaciones
    p = await _get_paciente_or_404(db, paciente.id)
    return await _build_response(db, p, include_health=_puede_ver_datos_salud(current_user))


@router.get("/{paciente_id}", response_model=PacienteResponse)
async def obtener_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    p = await _get_paciente_or_404(db, paciente_id)
    return await _build_response(db, p, include_health=_puede_ver_datos_salud(current_user))


@router.patch("/{paciente_id}", response_model=PacienteResponse)
async def actualizar_paciente(
    paciente_id: UUID,
    data: PacienteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    p = await _get_paciente_or_404(db, paciente_id)

    # Separar campos sensibles de planos
    campos = data.model_dump(exclude_none=True)
    sensibles = {}
    for campo in ("dni_nie", "telefono", "telefono2", "email"):
        if campo in campos:
            sensibles[campo] = campos.pop(campo)

    # Cifrar los sensibles que se van a actualizar
    if sensibles:
        cifrados = await cifrar_campos_paciente(db, sensibles)
        for campo, valor in cifrados.items():
            setattr(p, campo, valor)

    if "datos_salud" in campos:
        p.datos_salud_cifrado = await cifrar_json(db, campos.pop("datos_salud"))
        p.datos_salud = None

    for campo, valor in campos.items():
        setattr(p, campo, valor)

    await db.commit()
    p2 = await _get_paciente_or_404(db, paciente_id)
    return await _build_response(db, p2, include_health=_puede_ver_datos_salud(current_user))


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def desactivar_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Soft delete: activo = False. Nunca elimina datos clínicos."""
    p = await _get_paciente_or_404(db, paciente_id)
    p.activo = False
    await db.commit()


# ─── DATOS DE SALUD ──────────────────────────────────────────────────────────

class DatosSaludUpdate(PacienteUpdate):
    pass


@router.get("/{paciente_id}/salud")
async def get_salud(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    __=RequireDoctor,
) -> dict:
    """Devuelve los datos de salud del paciente."""
    p = await _get_paciente_or_404(db, paciente_id)
    return await _leer_datos_salud(db, p)


@router.patch("/{paciente_id}/salud")
async def actualizar_salud(
    paciente_id: UUID,
    data: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    __=RequireDoctor,
) -> dict:
    """Actualiza los datos de salud del paciente (merge con los existentes)."""
    p = await _get_paciente_or_404(db, paciente_id)
    existing = await _leer_datos_salud(db, p)
    existing.update(data)
    p.datos_salud_cifrado = await cifrar_json(db, existing)
    p.datos_salud = None
    await db.commit()


@router.get("/{paciente_id}/citas", response_model=list[CitaResponse])
async def proximas_citas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[CitaResponse]:
    await _get_paciente_or_404(db, paciente_id)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(Cita.paciente_id == paciente_id, Cita.fecha_hora >= datetime.now(timezone.utc))
        .order_by(Cita.fecha_hora)
    )
    return [await cita_to_response(db, cita) for cita in result.scalars().all()]
    return existing


# ─── HISTORIAL DE FALTAS (para alerta en nueva cita) ─────────────────────────

@router.get("/{paciente_id}/faltas", response_model=list[dict])
async def historial_faltas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[dict]:
    """Devuelve faltas y anulaciones del paciente para mostrar alerta al dar cita."""
    from app.models.cita import HistorialFaltas
    result = await db.execute(
        select(HistorialFaltas)
        .where(HistorialFaltas.paciente_id == paciente_id)
        .order_by(HistorialFaltas.fecha.desc())
    )
    faltas = result.scalars().all()
    return [
        {"id": str(f.id), "tipo": f.tipo, "fecha": f.fecha.isoformat(), "cita_id": str(f.cita_id)}
        for f in faltas
    ]


# ─── REFERENCIAS (tags) ───────────────────────────────────────────────────────

@router.get("/{paciente_id}/referencias", response_model=list[ReferenciaResponse])
async def listar_referencias_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ReferenciaResponse]:
    p = await _get_paciente_or_404(db, paciente_id)
    return [ReferenciaResponse.model_validate(r) for r in p.referencias]


@router.put("/{paciente_id}/referencias", response_model=list[ReferenciaResponse])
async def asignar_referencias(
    paciente_id: UUID,
    data: AsignarReferenciasRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ReferenciaResponse]:
    """Reemplaza el conjunto completo de referencias del paciente."""
    p = await _get_paciente_or_404(db, paciente_id)
    refs_result = await db.execute(
        select(Referencia).where(Referencia.id.in_(data.referencia_ids))
    )
    nuevas_refs = refs_result.scalars().all()
    p.referencias = list(nuevas_refs)
    await db.commit()
    await db.refresh(p)
    return [ReferenciaResponse.model_validate(r) for r in p.referencias]


# ─── CATÁLOGO DE REFERENCIAS ─────────────────────────────────────────────────

@router.get("/referencias/catalogo", response_model=list[ReferenciaResponse])
async def listar_catalogo_referencias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ReferenciaResponse]:
    result = await db.execute(select(Referencia).order_by(Referencia.nombre))
    return [ReferenciaResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/referencias/catalogo", response_model=ReferenciaResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_referencia(
    data: ReferenciaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReferenciaResponse:
    ref = Referencia(**data.model_dump())
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return ReferenciaResponse.model_validate(ref)
