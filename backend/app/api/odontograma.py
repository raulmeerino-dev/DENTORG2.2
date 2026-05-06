from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, can_view_health_data, ensure_clinic_access, resolve_clinic_id
from app.database import get_db
from app.models.odontograma import Odontograma, OdontogramaEvento, OdontogramaPieza, OdontogramaSuperficie
from app.models.paciente import Paciente
from app.models.presupuesto import Presupuesto, PresupuestoLinea
from app.models.tratamiento import TratamientoCatalogo
from app.schemas.odontograma import (
    OdontogramaEventoResponse,
    OdontogramaPiezaResponse,
    OdontogramaPiezaUpdate,
    OdontogramaResponse,
    OdontogramaSuperficieResponse,
    OdontogramaSuperficieUpdate,
    PlanTratamientoCreate,
    PlanTratamientoResponse,
    SuperficieDental,
)
from app.services.audit import write_audit_log

router = APIRouter()

ADULT_TEETH = (
    18, 17, 16, 15, 14, 13, 12, 11,
    21, 22, 23, 24, 25, 26, 27, 28,
    48, 47, 46, 45, 44, 43, 42, 41,
    31, 32, 33, 34, 35, 36, 37, 38,
)
SURFACES = ("oclusal_incisal", "mesial", "distal", "vestibular", "lingual_palatina", "raiz")
SURFACE_ALIASES = {"lingual_palatal": "lingual_palatina"}
MODIFY_ROLES = {"admin", "doctor", "auxiliar"}


def _ensure_clinical_access(user: CurrentUser) -> None:
    if not can_view_health_data(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para acceder a datos clinicos.",
        )


def _ensure_modify_access(user: CurrentUser) -> None:
    if user.rol not in MODIFY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permisos para modificar odontogramas.",
        )


async def _get_patient(db: AsyncSession, paciente_id: UUID, user: CurrentUser) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente or not paciente.activo:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(user, paciente.clinica_id)
    return paciente


async def _load_odontograma(db: AsyncSession, odontograma_id: UUID, user: CurrentUser) -> Odontograma:
    result = await db.execute(
        select(Odontograma)
        .options(
            selectinload(Odontograma.piezas).selectinload(OdontogramaPieza.superficies),
        )
        .where(Odontograma.id == odontograma_id)
    )
    odontograma = result.scalar_one_or_none()
    if not odontograma:
        raise HTTPException(status_code=404, detail="Odontograma no encontrado")
    ensure_clinic_access(user, odontograma.clinica_id)
    return odontograma


async def _active_odontograma(db: AsyncSession, paciente_id: UUID) -> Odontograma | None:
    result = await db.execute(
        select(Odontograma)
        .options(selectinload(Odontograma.piezas).selectinload(OdontogramaPieza.superficies))
        .where(Odontograma.paciente_id == paciente_id, Odontograma.activo == True)  # noqa: E712
        .order_by(Odontograma.version.desc(), Odontograma.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _create_odontograma(
    db: AsyncSession,
    *,
    paciente: Paciente,
    user: CurrentUser,
    request: Request | None = None,
) -> Odontograma:
    max_version = await db.scalar(select(func.max(Odontograma.version)).where(Odontograma.paciente_id == paciente.id))
    odontograma = Odontograma(
        paciente_id=paciente.id,
        clinica_id=resolve_clinic_id(user, paciente.clinica_id),
        version=(max_version or 0) + 1,
        activo=True,
    )
    db.add(odontograma)
    await db.flush()
    await _add_event(
        db,
        odontograma=odontograma,
        user=user,
        action="crear_odontograma",
        new_values={"version": odontograma.version},
    )
    await write_audit_log(
        db,
        user=user,
        action="ODONTOGRAMA_CREATE",
        entity_type="odontogramas",
        entity_id=odontograma.id,
        new_values={"paciente_id": str(paciente.id), "version": odontograma.version},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    return odontograma


async def _add_event(
    db: AsyncSession,
    *,
    odontograma: Odontograma,
    user: CurrentUser,
    action: str,
    pieza_fdi: int | None = None,
    superficie: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> OdontogramaEvento:
    event = OdontogramaEvento(
        odontograma_id=odontograma.id,
        pieza_fdi=pieza_fdi,
        superficie=superficie,
        accion=action,
        old_values=old_values,
        new_values=new_values,
        usuario_id=user.user_id,
    )
    db.add(event)
    await db.flush()
    return event


async def _get_or_create_piece(db: AsyncSession, odontograma: Odontograma, pieza_fdi: int) -> OdontogramaPieza:
    for piece in odontograma.piezas:
        if piece.pieza_fdi == pieza_fdi:
            return piece
    result = await db.execute(
        select(OdontogramaPieza).where(
            OdontogramaPieza.odontograma_id == odontograma.id,
            OdontogramaPieza.pieza_fdi == pieza_fdi,
        )
    )
    piece = result.scalar_one_or_none()
    if piece:
        return piece
    piece = OdontogramaPieza(odontograma_id=odontograma.id, pieza_fdi=pieza_fdi)
    db.add(piece)
    await db.flush()
    return piece


def _surface_code(superficie: str | None) -> str | None:
    return {
        "mesial": "M",
        "distal": "D",
        "vestibular": "V",
        "lingual_palatal": "L",
        "lingual_palatina": "L",
        "oclusal_incisal": "O",
        "raiz": "R",
    }.get(superficie or "")


def _normalize_superficie(superficie: str) -> str:
    normalized = SURFACE_ALIASES.get(superficie, superficie)
    if normalized not in SURFACES:
        raise HTTPException(status_code=422, detail="Superficie dental no valida")
    return normalized


def _validate_adult_tooth(pieza_fdi: int) -> None:
    if pieza_fdi not in ADULT_TEETH:
        raise HTTPException(status_code=422, detail="Pieza FDI adulta no valida")


@router.get("/pacientes/{paciente_id}/odontograma", response_model=OdontogramaResponse)
async def obtener_odontograma_paciente(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    _ensure_clinical_access(current_user)
    paciente = await _get_patient(db, paciente_id, current_user)
    odontograma = await _active_odontograma(db, paciente.id)
    if not odontograma:
        odontograma = await _create_odontograma(db, paciente=paciente, user=current_user, request=request)
        await db.commit()
        return OdontogramaResponse.model_validate(await _load_odontograma(db, odontograma.id, current_user))
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_VIEW",
        entity_type="odontogramas",
        entity_id=odontograma.id,
        new_values={"paciente_id": str(paciente.id)},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    return OdontogramaResponse.model_validate(odontograma)


@router.post("/pacientes/{paciente_id}/odontograma", response_model=OdontogramaResponse, status_code=201)
async def crear_odontograma_paciente(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    _ensure_clinical_access(current_user)
    _ensure_modify_access(current_user)
    paciente = await _get_patient(db, paciente_id, current_user)
    existing = await _active_odontograma(db, paciente.id)
    if existing:
        return OdontogramaResponse.model_validate(existing)
    odontograma = await _create_odontograma(db, paciente=paciente, user=current_user, request=request)
    await db.commit()
    return OdontogramaResponse.model_validate(await _load_odontograma(db, odontograma.id, current_user))


@router.patch("/odontograma/{odontograma_id}/pieza/{pieza_fdi}", response_model=OdontogramaPiezaResponse)
@router.patch("/odontogramas/{odontograma_id}/piezas/{pieza_fdi}", response_model=OdontogramaPiezaResponse)
async def actualizar_pieza(
    odontograma_id: UUID,
    pieza_fdi: int,
    data: OdontogramaPiezaUpdate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaPiezaResponse:
    _ensure_clinical_access(current_user)
    _ensure_modify_access(current_user)
    _validate_adult_tooth(pieza_fdi)
    odontograma = await _load_odontograma(db, odontograma_id, current_user)
    piece = await _get_or_create_piece(db, odontograma, pieza_fdi)
    old = {"estado_general": piece.estado_general, "notas": piece.notas}
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(piece, field, value)
    await _add_event(
        db,
        odontograma=odontograma,
        user=current_user,
        action="actualizar_pieza",
        pieza_fdi=pieza_fdi,
        old_values=old,
        new_values=changes,
    )
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_UPDATE_PIEZA",
        entity_type="odontograma_piezas",
        entity_id=piece.id,
        old_values=old,
        new_values=changes,
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    result = await db.execute(
        select(OdontogramaPieza)
        .options(selectinload(OdontogramaPieza.superficies))
        .where(OdontogramaPieza.id == piece.id)
    )
    return OdontogramaPiezaResponse.model_validate(result.scalar_one())


@router.patch(
    "/odontograma/{odontograma_id}/pieza/{pieza_fdi}/superficie/{superficie}",
    response_model=OdontogramaSuperficieResponse,
)
@router.patch(
    "/odontogramas/{odontograma_id}/piezas/{pieza_fdi}/superficies/{superficie}",
    response_model=OdontogramaSuperficieResponse,
)
async def actualizar_superficie(
    odontograma_id: UUID,
    pieza_fdi: int,
    superficie: SuperficieDental,
    data: OdontogramaSuperficieUpdate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaSuperficieResponse:
    _ensure_clinical_access(current_user)
    _ensure_modify_access(current_user)
    _validate_adult_tooth(pieza_fdi)
    superficie_normalizada = _normalize_superficie(superficie)
    odontograma = await _load_odontograma(db, odontograma_id, current_user)
    piece = await _get_or_create_piece(db, odontograma, pieza_fdi)

    result = await db.execute(
        select(OdontogramaSuperficie).where(
            OdontogramaSuperficie.pieza_id == piece.id,
            OdontogramaSuperficie.superficie == superficie_normalizada,
        )
    )
    surface = result.scalar_one_or_none()
    if not surface:
        surface = OdontogramaSuperficie(pieza_id=piece.id, superficie=superficie_normalizada)
        db.add(surface)
        await db.flush()
    old = {
        "condicion": surface.condicion,
        "tratamiento_planificado_id": str(surface.tratamiento_planificado_id) if surface.tratamiento_planificado_id else None,
        "tratamiento_realizado_id": str(surface.tratamiento_realizado_id) if surface.tratamiento_realizado_id else None,
        "color_estado": surface.color_estado,
        "notas": surface.notas,
    }
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(surface, field, value)
    if data.tratamiento_planificado_id:
        tratamiento = await db.get(TratamientoCatalogo, data.tratamiento_planificado_id)
        if not tratamiento or not tratamiento.activo:
            raise HTTPException(status_code=404, detail="Tratamiento planificado no encontrado")

    await _add_event(
        db,
        odontograma=odontograma,
        user=current_user,
        action="actualizar_superficie",
        pieza_fdi=pieza_fdi,
        superficie=superficie_normalizada,
        old_values=old,
        new_values={k: str(v) if isinstance(v, UUID) else v for k, v in changes.items()},
    )
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_UPDATE_SUPERFICIE",
        entity_type="odontograma_superficies",
        entity_id=surface.id,
        old_values=old,
        new_values={k: str(v) if isinstance(v, UUID) else v for k, v in changes.items()},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(surface)
    return OdontogramaSuperficieResponse.model_validate(surface)


@router.post("/odontograma/{odontograma_id}/plan-tratamiento", response_model=PlanTratamientoResponse, status_code=201)
@router.post("/odontogramas/{odontograma_id}/generar-presupuesto", response_model=PlanTratamientoResponse, status_code=201)
async def crear_presupuesto_desde_plan(
    odontograma_id: UUID,
    data: PlanTratamientoCreate,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> PlanTratamientoResponse:
    _ensure_clinical_access(current_user)
    _ensure_modify_access(current_user)
    odontograma = await _load_odontograma(db, odontograma_id, current_user)
    if not odontograma.activo:
        raise HTTPException(status_code=409, detail="Solo se puede presupuestar el odontograma activo")

    items = data.items
    if items is None:
        items = []
        for piece in odontograma.piezas:
            for surface in piece.superficies:
                if surface.tratamiento_planificado_id:
                    tratamiento = await db.get(TratamientoCatalogo, surface.tratamiento_planificado_id)
                    if tratamiento:
                        items.append(type("PlanItem", (), {
                            "pieza_fdi": piece.pieza_fdi,
                            "superficie": surface.superficie,
                            "tratamiento_id": surface.tratamiento_planificado_id,
                            "precio_unitario": Decimal(tratamiento.precio),
                        })())
    if not items:
        raise HTTPException(status_code=400, detail="No hay tratamientos planificados para presupuestar")

    max_num = await db.scalar(select(func.max(Presupuesto.numero)))
    presupuesto = Presupuesto(
        paciente_id=odontograma.paciente_id,
        doctor_id=data.doctor_id,
        fecha=date.today(),
        pie_pagina=data.pie_pagina,
        numero=(max_num or 0) + 1,
    )
    db.add(presupuesto)
    await db.flush()
    for item in items:
        db.add(PresupuestoLinea(
            presupuesto_id=presupuesto.id,
            tratamiento_id=item.tratamiento_id,
            pieza_dental=item.pieza_fdi,
            caras=_surface_code(item.superficie),
            precio_unitario=item.precio_unitario,
            descuento_porcentaje=Decimal("0"),
        ))
    await _add_event(
        db,
        odontograma=odontograma,
        user=current_user,
        action="crear_presupuesto_desde_plan",
        new_values={"presupuesto_id": str(presupuesto.id), "lineas": len(items)},
    )
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_PLAN_TO_PRESUPUESTO",
        entity_type="presupuestos",
        entity_id=presupuesto.id,
        new_values={"odontograma_id": str(odontograma.id), "lineas": len(items)},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    return PlanTratamientoResponse(presupuesto_id=presupuesto.id, lineas_creadas=len(items))


@router.get("/odontograma/{odontograma_id}/historial", response_model=list[OdontogramaEventoResponse])
@router.get("/odontogramas/{odontograma_id}/historial", response_model=list[OdontogramaEventoResponse])
async def historial_odontograma(
    odontograma_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[OdontogramaEventoResponse]:
    _ensure_clinical_access(current_user)
    await _load_odontograma(db, odontograma_id, current_user)
    result = await db.execute(
        select(OdontogramaEvento)
        .where(OdontogramaEvento.odontograma_id == odontograma_id)
        .order_by(OdontogramaEvento.created_at.desc())
    )
    return [OdontogramaEventoResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/odontograma/{odontograma_id}/duplicar-version", response_model=OdontogramaResponse, status_code=201)
async def duplicar_version_odontograma(
    odontograma_id: UUID,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> OdontogramaResponse:
    _ensure_clinical_access(current_user)
    _ensure_modify_access(current_user)
    original = await _load_odontograma(db, odontograma_id, current_user)
    original.activo = False
    paciente = await _get_patient(db, original.paciente_id, current_user)
    nuevo = await _create_odontograma(db, paciente=paciente, user=current_user, request=request)
    for piece in original.piezas:
        new_piece = OdontogramaPieza(
            odontograma_id=nuevo.id,
            pieza_fdi=piece.pieza_fdi,
            estado_general=piece.estado_general,
            notas=piece.notas,
        )
        db.add(new_piece)
        await db.flush()
        for surface in piece.superficies:
            db.add(OdontogramaSuperficie(
                pieza_id=new_piece.id,
                superficie=surface.superficie,
                condicion=surface.condicion,
                tratamiento_planificado_id=surface.tratamiento_planificado_id,
                tratamiento_realizado_id=surface.tratamiento_realizado_id,
                color_estado=surface.color_estado,
                notas=surface.notas,
            ))
    await _add_event(
        db,
        odontograma=nuevo,
        user=current_user,
        action="duplicar_version",
        new_values={"origen": str(original.id), "version": nuevo.version},
    )
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_DUPLICATE_VERSION",
        entity_type="odontogramas",
        entity_id=nuevo.id,
        old_values={"origen": str(original.id)},
        new_values={"version": nuevo.version},
        clinica_id=nuevo.clinica_id,
        request=request,
    )
    await db.commit()
    return OdontogramaResponse.model_validate(await _load_odontograma(db, nuevo.id, current_user))
