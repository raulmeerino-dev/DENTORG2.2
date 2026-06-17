from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    CurrentUser,
    can_view_health_data,
    ensure_clinic_access,
    resolve_clinic_id,
)
from app.database import get_db
from app.models.documento import DocumentoPaciente
from app.models.historial import HistorialClinico
from app.models.odontograma import (
    Odontograma,
    OdontogramaEvento,
    OdontogramaPieza,
    OdontogramaSuperficie,
)
from app.models.paciente import Paciente
from app.models.presupuesto import Presupuesto, PresupuestoLinea, TrabajoPendiente
from app.models.tratamiento import TratamientoCatalogo
from app.schemas.odontograma import (
    OdontogramaContextMode,
    OdontogramaContextResponse,
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
CARAS_TO_SURFACES = {
    "O": "oclusal_incisal",
    "I": "oclusal_incisal",
    "M": "mesial",
    "D": "distal",
    "V": "vestibular",
    "L": "lingual_palatina",
    "P": "lingual_palatina",
    "R": "raiz",
}


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


async def _get_or_create_surface(
    db: AsyncSession,
    *,
    piece: OdontogramaPieza,
    superficie: str,
) -> OdontogramaSuperficie:
    for surface in piece.superficies:
        if surface.superficie == superficie:
            return surface
    result = await db.execute(
        select(OdontogramaSuperficie).where(
            OdontogramaSuperficie.pieza_id == piece.id,
            OdontogramaSuperficie.superficie == superficie,
        )
    )
    surface = result.scalar_one_or_none()
    if surface:
        return surface
    surface = OdontogramaSuperficie(pieza_id=piece.id, superficie=superficie)
    db.add(surface)
    await db.flush()
    return surface


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


def _surfaces_from_caras(caras: str | None) -> list[str]:
    if not caras:
        return ["oclusal_incisal"]
    surfaces: list[str] = []
    for char in caras.upper():
        surface = CARAS_TO_SURFACES.get(char)
        if surface and surface not in surfaces:
            surfaces.append(surface)
    return surfaces or ["oclusal_incisal"]


def _ensure_tooth_entry(teeth: dict, pieza_fdi: int) -> dict:
    key = str(pieza_fdi)
    if key not in teeth:
        teeth[key] = {
            "base": {"estado_general": "sano", "movilidad": None, "pronostico": None, "notas": None},
            "surfaces": {},
        }
    return teeth[key]


def _ensure_surface_entry(tooth: dict, surface: str) -> dict:
    if surface not in tooth["surfaces"]:
        tooth["surfaces"][surface] = {
            "diagnostico": None,
            "context_state": None,
            "tratamiento_id": None,
            "presupuesto_linea_id": None,
            "historial_id": None,
            "factura_id": None,
            "label": None,
            "amount": None,
            "doctor": None,
            "fecha": None,
            "documentos": [],
        }
    return tooth["surfaces"][surface]


def _build_base_teeth(odontograma: Odontograma) -> dict:
    teeth: dict = {}
    for piece in odontograma.piezas:
        tooth = _ensure_tooth_entry(teeth, piece.pieza_fdi)
        tooth["base"] = {
            "estado_general": piece.estado_general,
            "movilidad": piece.movilidad,
            "pronostico": piece.pronostico,
            "notas": piece.notas,
        }
        for surface in piece.superficies:
            target = _ensure_surface_entry(tooth, surface.superficie)
            target["diagnostico"] = surface.condicion
            target["tratamiento_id"] = (
                str(surface.tratamiento_planificado_id or surface.tratamiento_realizado_id)
                if surface.tratamiento_planificado_id or surface.tratamiento_realizado_id
                else None
            )
            target["presupuesto_linea_id"] = str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None
            target["label"] = surface.notas
    return teeth


def _apply_context_tooth(
    teeth: dict,
    *,
    pieza_fdi: int | None,
    caras: str | None,
    context_state: str,
    label: str | None = None,
    amount: Decimal | float | str | None = None,
    tratamiento_id: UUID | None = None,
    presupuesto_linea_id: UUID | None = None,
    historial_id: UUID | None = None,
    factura_id: UUID | None = None,
    doctor: str | None = None,
    fecha: date | None = None,
) -> None:
    if not pieza_fdi:
        return
    tooth = _ensure_tooth_entry(teeth, pieza_fdi)
    for surface in _surfaces_from_caras(caras):
        target = _ensure_surface_entry(tooth, surface)
        target.update({
            "context_state": context_state,
            "label": label,
            "amount": str(amount) if amount is not None else None,
            "tratamiento_id": str(tratamiento_id) if tratamiento_id else None,
            "presupuesto_linea_id": str(presupuesto_linea_id) if presupuesto_linea_id else None,
            "historial_id": str(historial_id) if historial_id else None,
            "factura_id": str(factura_id) if factura_id else None,
            "doctor": doctor,
            "fecha": fecha.isoformat() if fecha else None,
        })


def _append_document_context(
    teeth: dict,
    *,
    pieza_fdi: int | None,
    caras: str | None,
    documento: DocumentoPaciente,
    label: str | None = None,
) -> None:
    if not pieza_fdi:
        return
    tooth = _ensure_tooth_entry(teeth, pieza_fdi)
    for surface in _surfaces_from_caras(caras):
        target = _ensure_surface_entry(tooth, surface)
        target["context_state"] = "documento_asociado"
        target["label"] = label or documento.descripcion or documento.nombre_original
        target["fecha"] = (
            documento.fecha_documento.isoformat()
            if documento.fecha_documento
            else documento.created_at.isoformat()
            if documento.created_at
            else None
        )
        target["documentos"].append({
            "id": str(documento.id),
            "nombre": documento.nombre_original,
            "categoria": documento.categoria,
            "descripcion": documento.descripcion,
            "historial_id": str(documento.historial_id) if documento.historial_id else None,
            "tratamiento_id": str(documento.tratamiento_id) if documento.tratamiento_id else None,
        })


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


@router.get("/pacientes/{paciente_id}/odontograma/contexto", response_model=OdontogramaContextResponse)
async def obtener_odontograma_contexto(
    paciente_id: UUID,
    request: Request,
    current_user: CurrentUser,
    mode: OdontogramaContextMode = Query("lectura"),
    context_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> OdontogramaContextResponse:
    _ensure_clinical_access(current_user)
    paciente = await _get_patient(db, paciente_id, current_user)
    odontograma = await _active_odontograma(db, paciente.id)
    if not odontograma:
        odontograma = await _create_odontograma(db, paciente=paciente, user=current_user, request=request)
        await db.commit()
        odontograma = await _load_odontograma(db, odontograma.id, current_user)

    teeth = _build_base_teeth(odontograma)

    if mode == "presupuesto" and context_id:
        result = await db.execute(
            select(Presupuesto)
            .options(selectinload(Presupuesto.lineas).selectinload(PresupuestoLinea.tratamiento))
            .where(Presupuesto.id == context_id, Presupuesto.paciente_id == paciente.id)
        )
        presupuesto = result.scalar_one_or_none()
        if not presupuesto:
            raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
        ensure_clinic_access(current_user, presupuesto.clinica_id)
        for linea in presupuesto.lineas:
            _apply_context_tooth(
                teeth,
                pieza_fdi=linea.pieza_dental,
                caras=linea.caras,
                context_state="incluido_presupuesto" if linea.aceptado else "propuesto_presupuesto",
                label=linea.tratamiento.nombre if linea.tratamiento else "Tratamiento propuesto",
                amount=linea.precio_unitario,
                tratamiento_id=linea.tratamiento_id,
                presupuesto_linea_id=linea.id,
            )

    elif mode == "pendiente":
        result = await db.execute(
            select(TrabajoPendiente)
            .options(selectinload(TrabajoPendiente.tratamiento))
            .where(
                TrabajoPendiente.paciente_id == paciente.id,
                TrabajoPendiente.realizado == False,  # noqa: E712
            )
        )
        for item in result.scalars().all():
            _apply_context_tooth(
                teeth,
                pieza_fdi=item.pieza_dental,
                caras=item.caras,
                context_state="tratamiento_pendiente",
                label=item.tratamiento.nombre if item.tratamiento else "Trabajo pendiente",
                tratamiento_id=item.tratamiento_id,
                presupuesto_linea_id=item.presupuesto_linea_id,
            )

    elif mode == "realizado":
        result = await db.execute(
            select(HistorialClinico)
            .options(selectinload(HistorialClinico.tratamiento), selectinload(HistorialClinico.doctor))
            .where(HistorialClinico.paciente_id == paciente.id, HistorialClinico.estado == "realizado")
            .order_by(HistorialClinico.fecha.desc())
        )
        for item in result.scalars().all():
            _apply_context_tooth(
                teeth,
                pieza_fdi=item.pieza_dental,
                caras=item.caras,
                context_state="tratamiento_realizado",
                label=item.tratamiento.nombre if item.tratamiento else item.procedimiento,
                amount=item.importe,
                tratamiento_id=item.tratamiento_id,
                historial_id=item.id,
                factura_id=item.factura_id,
                doctor=item.doctor.nombre if item.doctor else None,
                fecha=item.fecha,
            )

    elif mode == "historial":
        result = await db.execute(
            select(OdontogramaEvento)
            .where(OdontogramaEvento.odontograma_id == odontograma.id)
            .order_by(OdontogramaEvento.created_at.desc())
            .limit(200)
        )
        for event in result.scalars().all():
            if event.pieza_fdi:
                tooth = _ensure_tooth_entry(teeth, event.pieza_fdi)
                surface = event.superficie or "oclusal_incisal"
                target = _ensure_surface_entry(tooth, surface)
                target["context_state"] = "evento_historial"
                target["label"] = event.accion
                target["fecha"] = event.created_at.isoformat()

    elif mode == "documentos":
        result = await db.execute(
            select(DocumentoPaciente)
            .options(selectinload(DocumentoPaciente.historial), selectinload(DocumentoPaciente.tratamiento))
            .where(DocumentoPaciente.paciente_id == paciente.id)
            .order_by(DocumentoPaciente.created_at.desc())
        )
        documentos = result.scalars().all()
        for documento in documentos:
            if documento.historial and documento.historial.pieza_dental:
                _append_document_context(
                    teeth,
                    pieza_fdi=documento.historial.pieza_dental,
                    caras=documento.historial.caras,
                    documento=documento,
                    label=documento.tratamiento.nombre if documento.tratamiento else documento.nombre_original,
                )
                continue
            if not documento.tratamiento_id:
                continue
            for piece in odontograma.piezas:
                for surface in piece.superficies:
                    if documento.tratamiento_id in {
                        surface.tratamiento_planificado_id,
                        surface.tratamiento_realizado_id,
                    }:
                        _append_document_context(
                            teeth,
                            pieza_fdi=piece.pieza_fdi,
                            caras=_surface_code(surface.superficie),
                            documento=documento,
                            label=documento.tratamiento.nombre if documento.tratamiento else documento.nombre_original,
                        )

    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_CONTEXT_VIEW",
        entity_type="odontogramas",
        entity_id=odontograma.id,
        new_values={"paciente_id": str(paciente.id), "mode": mode, "context_id": str(context_id) if context_id else None},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    return OdontogramaContextResponse(
        mode=mode,
        odontograma_id=odontograma.id,
        paciente_id=paciente.id,
        denticion=odontograma.denticion,
        teeth=teeth,
    )


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
    old = {
        "estado_general": piece.estado_general,
        "movilidad": piece.movilidad,
        "pronostico": piece.pronostico,
        "notas": piece.notas,
    }
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
        "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
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
    if items:
        unique_items = []
        seen: set[tuple[int | None, str | None, UUID]] = set()
        for item in items:
            key = (item.pieza_fdi, _normalize_superficie(item.superficie) if item.superficie else None, item.tratamiento_id)
            if key in seen:
                continue
            seen.add(key)
            unique_items.append(item)
        items = unique_items

    if not items:
        raise HTTPException(status_code=400, detail="No hay tratamientos planificados para presupuestar")

    max_num = await db.scalar(select(func.max(Presupuesto.numero)))
    presupuesto = Presupuesto(
        paciente_id=odontograma.paciente_id,
        clinica_id=odontograma.clinica_id,
        doctor_id=data.doctor_id,
        fecha=date.today(),
        pie_pagina=data.pie_pagina,
        numero=(max_num or 0) + 1,
    )
    db.add(presupuesto)
    await db.flush()
    lineas_creadas = 0
    for item in items:
        normalized_surface = _normalize_superficie(item.superficie) if item.superficie else None
        if item.pieza_fdi and normalized_surface:
            piece = await _get_or_create_piece(db, odontograma, item.pieza_fdi)
            existing_surface_result = await db.execute(
                select(OdontogramaSuperficie).where(
                    OdontogramaSuperficie.pieza_id == piece.id,
                    OdontogramaSuperficie.superficie == normalized_surface,
                )
            )
            existing_surface = existing_surface_result.scalar_one_or_none()
            if existing_surface and existing_surface.presupuesto_linea_id:
                continue
        linea = PresupuestoLinea(
            presupuesto_id=presupuesto.id,
            tratamiento_id=item.tratamiento_id,
            pieza_dental=item.pieza_fdi,
            caras=_surface_code(item.superficie),
            precio_unitario=item.precio_unitario,
            descuento_porcentaje=Decimal("0"),
        )
        db.add(linea)
        await db.flush()
        lineas_creadas += 1
        if item.pieza_fdi and item.superficie:
            piece = await _get_or_create_piece(db, odontograma, item.pieza_fdi)
            surface = await _get_or_create_surface(db, piece=piece, superficie=normalized_surface)
            old_values = {
                "condicion": surface.condicion,
                "tratamiento_planificado_id": (
                    str(surface.tratamiento_planificado_id) if surface.tratamiento_planificado_id else None
                ),
                "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
            }
            surface.condicion = "tratamiento_presupuestado"
            surface.presupuesto_linea_id = linea.id
            surface.tratamiento_planificado_id = item.tratamiento_id
            await _add_event(
                db,
                odontograma=odontograma,
                user=current_user,
                action="vincular_linea_presupuesto",
                pieza_fdi=item.pieza_fdi,
                superficie=normalized_surface,
                old_values=old_values,
                new_values={
                    "tratamiento_id": str(item.tratamiento_id),
                    "presupuesto_linea_id": str(linea.id),
                    "condicion": surface.condicion,
                },
            )
    if lineas_creadas == 0:
        raise HTTPException(status_code=409, detail="Las superficies seleccionadas ya tienen presupuesto vinculado")
    await _add_event(
        db,
        odontograma=odontograma,
        user=current_user,
        action="crear_presupuesto_desde_plan",
        new_values={"presupuesto_id": str(presupuesto.id), "lineas": lineas_creadas},
    )
    await write_audit_log(
        db,
        user=current_user,
        action="ODONTOGRAMA_PLAN_TO_PRESUPUESTO",
        entity_type="presupuestos",
        entity_id=presupuesto.id,
        new_values={"odontograma_id": str(odontograma.id), "lineas": lineas_creadas},
        clinica_id=odontograma.clinica_id,
        request=request,
    )
    await db.commit()
    return PlanTratamientoResponse(presupuesto_id=presupuesto.id, lineas_creadas=lineas_creadas)


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
            movilidad=piece.movilidad,
            pronostico=piece.pronostico,
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
                presupuesto_linea_id=surface.presupuesto_linea_id,
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
