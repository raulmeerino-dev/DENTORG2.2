"""
Router de recetas clinicas autonomas.

- Sólo doctores (RequireDoctor) pueden crear/firmar.
- Todo cambio se audita.
- Respeta clinica_id en todas las consultas/mutaciones.
- Schemas con campos explicitos: NO se aceptan payloads arbitrarios.
"""
from datetime import date, datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.crypto import descifrar_paciente
from app.core.permissions import (
    CurrentUser,
    RequireDoctor,
    ensure_clinic_access,
    resolve_clinic_id,
)
from app.database import get_db
from app.models.doctor import Doctor
from app.models.paciente import Paciente
from app.models.receta import RecetaClinica
from app.schemas.receta import (
    RecetaCreate,
    RecetaFirmaUpdate,
    RecetaResponse,
)
from app.services.audit import write_audit_log
from app.services.pdf_service import (
    generar_receta_clinica_pdf,
    pdf_response_headers,
)

router = APIRouter()


async def _get_paciente(db: AsyncSession, paciente_id: UUID) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


async def _get_doctor(db: AsyncSession, doctor_id: UUID) -> Doctor:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor no encontrado")
    return doctor


async def _get_receta_or_404(db: AsyncSession, receta_id: UUID) -> RecetaClinica:
    receta = await db.scalar(
        select(RecetaClinica)
        .options(selectinload(RecetaClinica.doctor))
        .where(RecetaClinica.id == receta_id, RecetaClinica.activo.is_(True))
    )
    if not receta:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    return receta


def _to_response(receta: RecetaClinica) -> RecetaResponse:
    return RecetaResponse.model_validate(receta)


# ─── LISTAR ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[RecetaResponse])
async def listar_recetas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[RecetaResponse]:
    """Lista recetas; filtro obligatorio por paciente_id si no eres admin global."""
    if paciente_id is None and current_user.clinica_id is None and current_user.rol != "admin":
        raise HTTPException(status_code=400, detail="paciente_id es obligatorio")

    stmt = (
        select(RecetaClinica)
        .options(selectinload(RecetaClinica.doctor))
        .where(RecetaClinica.activo.is_(True))
        .order_by(RecetaClinica.fecha_prescripcion.desc(), RecetaClinica.created_at.desc())
        .limit(limit)
    )
    if paciente_id is not None:
        paciente = await _get_paciente(db, paciente_id)
        ensure_clinic_access(current_user, paciente.clinica_id)
        stmt = stmt.where(RecetaClinica.paciente_id == paciente_id)
    elif current_user.clinica_id is not None:
        stmt = stmt.where(RecetaClinica.clinica_id == current_user.clinica_id)

    result = await db.execute(stmt)
    return [_to_response(r) for r in result.scalars().all()]


# ─── DETALLE ─────────────────────────────────────────────────────────────────

@router.get("/{receta_id}", response_model=RecetaResponse)
async def obtener_receta(
    receta_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id)
    ensure_clinic_access(current_user, receta.clinica_id)
    return _to_response(receta)


# ─── CREAR ───────────────────────────────────────────────────────────────────

@router.post(
    "/pacientes/{paciente_id}",
    response_model=RecetaResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireDoctor],
)
async def crear_receta(
    paciente_id: UUID,
    data: RecetaCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    paciente = await _get_paciente(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    doctor = await _get_doctor(db, data.doctor_id)
    if doctor.clinica_id is not None and paciente.clinica_id is not None and doctor.clinica_id != paciente.clinica_id:
        raise HTTPException(status_code=400, detail="Doctor de otra clinica")
    if doctor.clinica_id is not None:
        ensure_clinic_access(current_user, doctor.clinica_id)

    clinica_id = resolve_clinic_id(current_user, paciente.clinica_id)
    fecha_prescripcion = data.fecha_prescripcion or date.today()

    receta = RecetaClinica(
        paciente_id=paciente.id,
        doctor_id=doctor.id,
        clinica_id=clinica_id,
        medicamento=data.medicamento,
        principio_activo=data.principio_activo,
        forma_farmaceutica=data.forma_farmaceutica,
        via_administracion=data.via_administracion,
        unidades=data.unidades,
        duracion=data.duracion,
        posologia=data.posologia,
        pauta=data.pauta,
        diagnostico=data.diagnostico,
        instrucciones_paciente=data.instrucciones_paciente,
        instrucciones_farmacia=data.instrucciones_farmacia,
        fecha_prescripcion=fecha_prescripcion,
        fecha_dispensacion=data.fecha_dispensacion,
        firma_data_url=data.firma_data_url,
    )
    db.add(receta)
    await db.flush()

    await write_audit_log(
        db,
        user=current_user,
        action="receta_creada",
        entity_type="recetas_clinicas",
        entity_id=receta.id,
        new_values={
            "paciente_id": str(paciente.id),
            "doctor_id": str(doctor.id),
            "medicamento": receta.medicamento[:120],
            "fecha_prescripcion": fecha_prescripcion.isoformat(),
            "firmada": bool(receta.firma_data_url),
        },
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id)
    return _to_response(receta_completa)


# ─── FIRMAR ──────────────────────────────────────────────────────────────────

@router.post(
    "/{receta_id}/firma",
    response_model=RecetaResponse,
    dependencies=[RequireDoctor],
)
async def firmar_receta(
    receta_id: UUID,
    data: RecetaFirmaUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> RecetaResponse:
    receta = await _get_receta_or_404(db, receta_id)
    ensure_clinic_access(current_user, receta.clinica_id)
    receta.firma_data_url = data.firma_data_url
    await write_audit_log(
        db,
        user=current_user,
        action="receta_firmada",
        entity_type="recetas_clinicas",
        entity_id=receta.id,
        clinica_id=receta.clinica_id,
        request=request,
    )
    await db.commit()
    receta_completa = await _get_receta_or_404(db, receta.id)
    return _to_response(receta_completa)


# ─── PDF ─────────────────────────────────────────────────────────────────────

@router.get("/{receta_id}/pdf")
async def pdf_receta(
    receta_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    receta = await _get_receta_or_404(db, receta_id)
    ensure_clinic_access(current_user, receta.clinica_id)
    paciente = await _get_paciente(db, receta.paciente_id)
    descifrados = await descifrar_paciente(db, paciente)
    pdf_bytes = generar_receta_clinica_pdf(
        paciente_nombre=f"{paciente.apellidos}, {paciente.nombre}",
        paciente_dni=descifrados.get("dni_nie"),
        paciente_fecha_nacimiento=paciente.fecha_nacimiento,
        doctor_nombre=receta.doctor.nombre if receta.doctor else "Doctor",
        fecha_prescripcion=receta.fecha_prescripcion,
        fecha_dispensacion=receta.fecha_dispensacion,
        medicamento=receta.medicamento,
        principio_activo=receta.principio_activo,
        forma_farmaceutica=receta.forma_farmaceutica,
        via_administracion=receta.via_administracion,
        unidades=receta.unidades,
        duracion=receta.duracion,
        posologia=receta.posologia,
        pauta=receta.pauta,
        diagnostico=receta.diagnostico,
        instrucciones_paciente=receta.instrucciones_paciente,
        instrucciones_farmacia=receta.instrucciones_farmacia,
        firma_data_url=receta.firma_data_url,
        receta_id=str(receta.id),
    )
    if receta.pdf_generado_at is None:
        receta.pdf_generado_at = datetime.now(timezone.utc)
        await db.commit()
    filename = f"receta_{receta.fecha_prescripcion.strftime('%Y%m%d')}_{str(receta.id)[:8]}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf", headers=pdf_response_headers(filename))
