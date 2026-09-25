"""Clinical history and dental notes, with patient access checks and audit."""

from datetime import date as date_type
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit_log import write_audit_log
from app.core.permissions import TokenData, ensure_clinic_access
from app.domains.clinical.application.patient_context import (
    current_user_doctor_id,
    get_history_patient_or_404,
    validate_history_links,
)
from app.domains.clinical.domain.dental_surfaces import normalize_caras
from app.domains.clinical.persistence.historial import HistorialClinico, NotaDental
from app.domains.clinical.schemas.tratamiento import (
    HistorialCreate,
    HistorialResponse,
    HistorialUpdate,
    NotaDentalCreate,
    NotaDentalResponse,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita

CLINICAL_HISTORY_WRITE_ROLES = {"admin", "doctor", "auxiliar"}


def _ensure_clinical_history_write_role(current_user: TokenData) -> None:
    if current_user.rol not in CLINICAL_HISTORY_WRITE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="No puede modificar el historial clinico.",
        )


async def _get_history_entry_or_404(db: AsyncSession, entrada_id: UUID) -> HistorialClinico:
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == entrada_id)
    )
    historial = result.scalar_one_or_none()
    if not historial:
        raise HTTPException(status_code=404, detail="Entrada de historial no encontrada")
    return historial


async def historial_paciente(
    paciente_id: UUID, db: AsyncSession, current_user: TokenData, pieza: int | None
) -> list[HistorialResponse]:
    paciente = await get_history_patient_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    stmt = (
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.paciente_id == paciente_id)
        .order_by(HistorialClinico.fecha.desc())
    )
    if pieza:
        stmt = stmt.where(HistorialClinico.pieza_dental == pieza)
    result = await db.execute(stmt)
    return [HistorialResponse.model_validate(h) for h in result.scalars().all()]


async def registrar_tratamiento(
    data: HistorialCreate, db: AsyncSession, current_user: TokenData, request: Request
) -> HistorialResponse:
    _ensure_clinical_history_write_role(current_user)
    paciente = await get_history_patient_or_404(db, data.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await validate_history_links(
        db,
        paciente=paciente,
        current_user=current_user,
        tratamiento_id=data.tratamiento_id,
        doctor_id=data.doctor_id,
        gabinete_id=data.gabinete_id,
        factura_id=data.factura_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        cita_id=data.cita_id,
    )
    entrada = HistorialClinico(**data.model_dump())
    db.add(entrada)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="HISTORIAL_CLINICO_CREAR",
        entity_type="historial_clinico",
        entity_id=entrada.id,
        new_values=data.model_dump(mode="json"),
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(entrada)
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == entrada.id)
    )
    return HistorialResponse.model_validate(result.scalar_one())


async def notas_dentales_paciente(
    paciente_id: UUID, db: AsyncSession, current_user: TokenData, pieza: int | None,
    *, limit: int | None = None,
) -> list[NotaDentalResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)
    stmt = (
        select(NotaDental)
        .options(selectinload(NotaDental.doctor))
        .where(NotaDental.paciente_id == paciente_id)
        .order_by(NotaDental.fecha.desc(), NotaDental.created_at.desc())
    )
    if pieza:
        stmt = stmt.where(NotaDental.pieza_dental == pieza)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [NotaDentalResponse.model_validate(item) for item in result.scalars().all()]


async def crear_nota_dental(
    data: NotaDentalCreate, db: AsyncSession, current_user: TokenData
) -> NotaDentalResponse:
    if current_user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(status_code=403, detail="No puede crear notas clinicas.")

    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    doctor_id = data.doctor_id
    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != data.paciente_id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        doctor_id = doctor_id or cita.doctor_id

    if data.historial_id:
        historial = await db.get(HistorialClinico, data.historial_id)
        if not historial or historial.paciente_id != data.paciente_id:
            raise HTTPException(
                status_code=404, detail="Entrada de historial no encontrada para el paciente"
            )
        doctor_id = doctor_id or historial.doctor_id

    doctor_id = doctor_id or await current_user_doctor_id(db, current_user)
    texto = data.texto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="La nota no puede estar vacia")
    nota = NotaDental(
        paciente_id=data.paciente_id,
        doctor_id=doctor_id,
        cita_id=data.cita_id,
        historial_id=data.historial_id,
        pieza_dental=data.pieza_dental,
        caras=normalize_caras(data.caras),
        texto=texto,
        fecha=data.fecha or date_type.today(),
        origen="manual",
    )
    db.add(nota)
    await db.commit()
    result = await db.execute(
        select(NotaDental).options(selectinload(NotaDental.doctor)).where(NotaDental.id == nota.id)
    )
    return NotaDentalResponse.model_validate(result.scalar_one())


async def actualizar_entrada_historial(
    entrada_id: UUID,
    data: HistorialUpdate,
    db: AsyncSession,
    current_user: TokenData,
    request: Request,
) -> HistorialResponse:
    _ensure_clinical_history_write_role(current_user)
    historial = await _get_history_entry_or_404(db, entrada_id)
    paciente = await get_history_patient_or_404(db, historial.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await validate_history_links(
        db,
        paciente=paciente,
        current_user=current_user,
        factura_id=data.factura_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        cita_id=data.cita_id,
    )
    changes = data.model_dump(exclude_none=True)
    old_values = {field: getattr(historial, field) for field in changes}
    for field, value in changes.items():
        setattr(historial, field, value)
    await write_audit_log(
        db,
        user=current_user,
        action="HISTORIAL_CLINICO_EDITAR",
        entity_type="historial_clinico",
        entity_id=historial.id,
        old_values={
            key: str(value) if value is not None else None for key, value in old_values.items()
        },
        new_values=data.model_dump(mode="json", exclude_none=True),
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    return HistorialResponse.model_validate(await _get_history_entry_or_404(db, entrada_id))


async def eliminar_entrada_historial(
    entrada_id: UUID, db: AsyncSession, current_user: TokenData
) -> None:
    """Elimina una entrada de historial (solo admin, por error de registro)."""
    result = await db.execute(select(HistorialClinico).where(HistorialClinico.id == entrada_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    paciente = await get_history_patient_or_404(db, h.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await db.delete(h)
    await db.commit()
