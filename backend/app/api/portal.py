from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.citas import _get_cita_or_404, _registrar_cambio_cita, _snapshot_cita, _to_response
from app.api.consentimientos import ConsentimientoFirmar, ConsentimientoResponse, firmar_consentimiento
from app.api.documentos import _doc_to_dict
from app.api.pacientes import _build_response
from app.core.permissions import CurrentUser, ROLE_PACIENTE, ensure_clinic_access
from app.database import get_db
from app.models.cita import Cita, CitaTelefonear, HistorialFaltas
from app.models.consentimiento import Consentimiento
from app.models.documento import DocumentoPaciente
from app.models.paciente import Paciente
from app.schemas.cita import CitaCancelar, CitaResponse
from app.schemas.paciente import PacienteResponse
from app.services.audit import write_audit_log

router = APIRouter()


class PortalMeResponse(BaseModel):
    paciente: PacienteResponse
    resumen: dict[str, int]


async def _get_portal_paciente(
    db: AsyncSession,
    current_user: CurrentUser,
    paciente_id: UUID | None,
) -> Paciente:
    if paciente_id is None:
        detail = (
            "Usuario paciente sin vinculo directo a una ficha. "
            "Seleccione paciente_id hasta activar el portal con invitacion segura."
        )
        if current_user.rol != ROLE_PACIENTE:
            detail = "Seleccione un paciente para previsualizar el portal."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente or paciente.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    return paciente


async def _ensure_cita_de_paciente(db: AsyncSession, cita_id: UUID, paciente: Paciente, current_user: CurrentUser) -> Cita:
    cita = await _get_cita_or_404(db, cita_id)
    ensure_clinic_access(current_user, cita.clinica_id)
    if cita.paciente_id != paciente.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cita no encontrada")
    return cita


@router.get("/me", response_model=PortalMeResponse)
async def portal_me(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> PortalMeResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    now = datetime.now(timezone.utc)
    citas_count = await db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente.id,
            Cita.fecha_hora >= now,
            Cita.estado.notin_(("anulada", "falta")),
        )
    )
    documentos_count = await db.scalar(
        select(func.count(DocumentoPaciente.id)).where(DocumentoPaciente.paciente_id == paciente.id)
    )
    consentimientos_count = await db.scalar(
        select(func.count(Consentimiento.id)).where(
            Consentimiento.paciente_id == paciente.id,
            Consentimiento.estado == "pendiente_firma",
            Consentimiento.revocado.is_(False),
        )
    )
    return PortalMeResponse(
        paciente=await _build_response(db, paciente, include_health=False),
        resumen={
            "proximas_citas": int(citas_count or 0),
            "documentos": int(documentos_count or 0),
            "consentimientos_pendientes": int(consentimientos_count or 0),
        },
    )


@router.get("/citas", response_model=list[CitaResponse])
async def portal_citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[CitaResponse]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(Cita.paciente_id == paciente.id, Cita.fecha_hora >= datetime.now(timezone.utc))
        .order_by(Cita.fecha_hora)
    )
    return [await _to_response(db, cita) for cita in result.scalars().all()]


@router.post("/citas/{cita_id}/confirmar", response_model=CitaResponse)
async def portal_confirmar_cita(
    cita_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> CitaResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    cita = await _ensure_cita_de_paciente(db, cita_id, paciente, current_user)
    old = _snapshot_cita(cita)
    cita.estado = "confirmada"
    cita.confirmado_at = cita.confirmado_at or datetime.now(timezone.utc)
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="portal_confirmar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo="Confirmada desde portal paciente",
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.post("/citas/{cita_id}/cancelar", response_model=CitaResponse)
async def portal_cancelar_cita(
    cita_id: UUID,
    data: CitaCancelar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> CitaResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    cita = await _ensure_cita_de_paciente(db, cita_id, paciente, current_user)
    old = _snapshot_cita(cita)
    cita.estado = "anulada"
    cita.motivo_cancelacion = data.motivo_cancelacion
    cita.observaciones = f"{cita.observaciones or ''}\nPortal paciente: {data.motivo_cancelacion}".strip()
    tipo_falta = "anulacion_paciente" if data.tipo != "no_vino" else "falta"
    db.add(HistorialFaltas(
        paciente_id=cita.paciente_id,
        cita_id=cita.id,
        tipo=tipo_falta,
        fecha=datetime.now(timezone.utc),
        notas=data.motivo_cancelacion,
    ))
    if data.crear_telefonear or data.tipo == "reprogramada":
        db.add(CitaTelefonear(
            cita_original_id=cita.id,
            paciente_id=cita.paciente_id,
            doctor_id=cita.doctor_id,
            motivo="Reprogramar solicitud desde portal",
            notas=data.motivo_cancelacion,
            proximo_intento_at=data.proximo_intento_at,
        ))
    await _registrar_cambio_cita(
        db,
        cita=cita,
        current_user=current_user,
        accion="portal_cancelar",
        old_values=old,
        new_values=_snapshot_cita(cita),
        motivo=data.motivo_cancelacion,
        request=request,
    )
    await db.commit()
    return await _to_response(db, await _get_cita_or_404(db, cita_id))


@router.get("/documentos")
async def portal_documentos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[dict]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    result = await db.execute(
        select(DocumentoPaciente)
        .where(DocumentoPaciente.paciente_id == paciente.id)
        .order_by(DocumentoPaciente.created_at.desc())
    )
    documentos = result.scalars().all()
    await write_audit_log(
        db,
        user=current_user,
        action="PORTAL_DOCUMENTOS_LISTAR",
        entity_type="documentos_paciente",
        entity_id=paciente.id,
        clinica_id=paciente.clinica_id,
    )
    await db.commit()
    return [_doc_to_dict(doc) for doc in documentos]


@router.get("/consentimientos", response_model=list[ConsentimientoResponse])
async def portal_consentimientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> list[ConsentimientoResponse]:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    result = await db.execute(
        select(Consentimiento)
        .where(Consentimiento.paciente_id == paciente.id)
        .order_by(Consentimiento.created_at.desc())
    )
    return [ConsentimientoResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/consentimientos/{consentimiento_id}/firmar", response_model=ConsentimientoResponse)
async def portal_firmar_consentimiento(
    consentimiento_id: UUID,
    data: ConsentimientoFirmar,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(default=None),
) -> ConsentimientoResponse:
    paciente = await _get_portal_paciente(db, current_user, paciente_id)
    consentimiento = await db.get(Consentimiento, consentimiento_id)
    if not consentimiento or consentimiento.paciente_id != paciente.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consentimiento no encontrado")
    return await firmar_consentimiento(consentimiento_id, data, db, current_user, request)
