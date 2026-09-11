"""
Router de tratamientos — Fase 4.
- Catálogo: familias + tratamientos (CRUD, admin)
- Historial clínico: registro de tratamientos por paciente
"""
from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import CurrentUser, RequireAdmin, ensure_clinic_access
from app.database import get_db
from app.models.cita import Cita
from app.models.doctor import Doctor
from app.models.factura import Factura
from app.models.gabinete import Gabinete
from app.models.historial import HistorialClinico, NotaDental
from app.models.odontograma import (
    Odontograma,
    OdontogramaEvento,
    OdontogramaPieza,
    OdontogramaSuperficie,
)
from app.models.paciente import Paciente
from app.models.presupuesto import PresupuestoLinea, TrabajoPendiente
from app.models.sesion_clinica import SesionClinicaItem
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.models.usuario import Usuario
from app.schemas.tratamiento import (
    FamiliaCreate,
    FamiliaResponse,
    FamiliaUpdate,
    HistorialCreate,
    HistorialResponse,
    HistorialUpdate,
    NotaDentalCreate,
    NotaDentalResponse,
    SesionClinicaItemCreate,
    SesionClinicaItemResponse,
    SesionClinicaItemUpdate,
    SesionTratamientoRealizadoCreate,
    TratamientoCreate,
    TratamientoResponse,
    TratamientoUpdate,
)
from app.services.audit import write_audit_log

router = APIRouter()

CARAS_TO_SURFACES = {
    "O": "oclusal_incisal",
    "I": "oclusal_incisal",
    "M": "mesial",
    "D": "distal",
    "V": "vestibular",
    "B": "vestibular",
    "L": "lingual_palatina",
    "P": "lingual_palatina",
    "R": "raiz",
}


def _normalize_caras(caras: str | None) -> str | None:
    if not caras:
        return None
    return "".join(dict.fromkeys(caras.upper().strip()))


def _surfaces_from_caras(caras: str | None) -> list[str]:
    normalized = _normalize_caras(caras)
    if not normalized:
        return ["oclusal_incisal"]
    surfaces: list[str] = []
    for char in normalized:
        surface = CARAS_TO_SURFACES.get(char)
        if surface and surface not in surfaces:
            surfaces.append(surface)
    return surfaces or ["oclusal_incisal"]


async def _current_user_doctor_id(db: AsyncSession, current_user: CurrentUser) -> UUID | None:
    usuario = await db.get(Usuario, current_user.user_id)
    return usuario.doctor_id if usuario else None


async def _active_odontograma_for_patient(db: AsyncSession, paciente_id: UUID) -> Odontograma | None:
    result = await db.execute(
        select(Odontograma)
        .options(selectinload(Odontograma.piezas).selectinload(OdontogramaPieza.superficies))
        .where(Odontograma.paciente_id == paciente_id, Odontograma.activo == True)  # noqa: E712
        .order_by(Odontograma.version.desc(), Odontograma.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_or_create_odontograma_surface(
    db: AsyncSession,
    odontograma: Odontograma,
    pieza_fdi: int,
    superficie: str,
) -> OdontogramaSuperficie:
    piece = next((item for item in odontograma.piezas if item.pieza_fdi == pieza_fdi), None)
    if not piece:
        piece = OdontogramaPieza(
            odontograma_id=odontograma.id,
            pieza_fdi=pieza_fdi,
            superficies=[],
        )
        db.add(piece)
        await db.flush()
        odontograma.piezas.append(piece)
    surface = next((item for item in piece.superficies if item.superficie == superficie), None)
    if surface:
        return surface
    surface = OdontogramaSuperficie(pieza_id=piece.id, superficie=superficie)
    db.add(surface)
    await db.flush()
    piece.superficies.append(surface)
    return surface


async def _mark_session_historial_on_odontograma(
    db: AsyncSession,
    *,
    historial: HistorialClinico,
    presupuesto_linea_id: UUID | None,
    current_user: CurrentUser,
) -> None:
    if not historial.pieza_dental:
        return
    odontograma = await _active_odontograma_for_patient(db, historial.paciente_id)
    if not odontograma:
        return
    for surface_name in _surfaces_from_caras(historial.caras):
        surface = await _get_or_create_odontograma_surface(db, odontograma, historial.pieza_dental, surface_name)
        old_values = {
            "condicion": surface.condicion,
            "tratamiento_realizado_id": str(surface.tratamiento_realizado_id) if surface.tratamiento_realizado_id else None,
            "presupuesto_linea_id": str(surface.presupuesto_linea_id) if surface.presupuesto_linea_id else None,
        }
        surface.condicion = "tratamiento_realizado"
        surface.tratamiento_realizado_id = historial.id
        if presupuesto_linea_id:
            surface.presupuesto_linea_id = presupuesto_linea_id
        db.add(OdontogramaEvento(
            odontograma_id=odontograma.id,
            pieza_fdi=historial.pieza_dental,
            superficie=surface_name,
            accion="marcar_tratamiento_realizado_sesion",
            old_values=old_values,
            new_values={
                "historial_id": str(historial.id),
                "presupuesto_linea_id": str(presupuesto_linea_id) if presupuesto_linea_id else None,
                "condicion": surface.condicion,
            },
            usuario_id=current_user.user_id,
        ))


# ─── FAMILIAS ────────────────────────────────────────────────────────────────

@router.get("/familias", response_model=list[FamiliaResponse])
async def listar_familias(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[FamiliaResponse]:
    result = await db.execute(
        select(FamiliaTratamiento)
        .where(FamiliaTratamiento.activo == True)  # noqa: E712
        .order_by(FamiliaTratamiento.orden, FamiliaTratamiento.nombre)
    )
    return [FamiliaResponse.model_validate(f) for f in result.scalars().all()]


@router.post("/familias", response_model=FamiliaResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_familia(
    data: FamiliaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FamiliaResponse:
    familia = FamiliaTratamiento(**data.model_dump())
    db.add(familia)
    await db.commit()
    await db.refresh(familia)
    return FamiliaResponse.model_validate(familia)


@router.patch("/familias/{familia_id}", response_model=FamiliaResponse, dependencies=[RequireAdmin])
async def actualizar_familia(
    familia_id: UUID,
    data: FamiliaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FamiliaResponse:
    result = await db.execute(select(FamiliaTratamiento).where(FamiliaTratamiento.id == familia_id))
    familia = result.scalar_one_or_none()
    if not familia:
        raise HTTPException(status_code=404, detail="Familia no encontrada")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(familia, f, v)
    await db.commit()
    await db.refresh(familia)
    return FamiliaResponse.model_validate(familia)


# ─── CATÁLOGO ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TratamientoResponse])
async def listar_tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    familia_id: UUID | None = Query(None),
    solo_activos: bool = Query(True),
    q: str | None = Query(None),
) -> list[TratamientoResponse]:
    stmt = (
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .order_by(TratamientoCatalogo.nombre)
    )
    if solo_activos:
        stmt = stmt.where(TratamientoCatalogo.activo == True)  # noqa: E712
    if familia_id:
        stmt = stmt.where(TratamientoCatalogo.familia_id == familia_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                TratamientoCatalogo.nombre.ilike(like),
                TratamientoCatalogo.codigo.ilike(like),
            )
        )
    result = await db.execute(stmt)
    return [TratamientoResponse.model_validate(t) for t in result.scalars().all()]


@router.post("", response_model=TratamientoResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_tratamiento(
    data: TratamientoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    tratamiento = TratamientoCatalogo(**data.model_dump())
    db.add(tratamiento)
    await db.commit()
    await db.refresh(tratamiento)
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento.id)
    )
    return TratamientoResponse.model_validate(result.scalar_one())


@router.patch("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def actualizar_tratamiento(
    tratamiento_id: UUID,
    data: TratamientoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    for f, v in data.model_dump(exclude_none=True).items():
        setattr(t, f, v)
    await db.commit()
    await db.refresh(t)
    result2 = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    return TratamientoResponse.model_validate(result2.scalar_one())


@router.delete("/{tratamiento_id}", response_model=TratamientoResponse, dependencies=[RequireAdmin])
async def desactivar_tratamiento(
    tratamiento_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TratamientoResponse:
    result = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    tratamiento = result.scalar_one_or_none()
    if not tratamiento:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    tratamiento.activo = False
    await db.commit()
    await db.refresh(tratamiento)
    result2 = await db.execute(
        select(TratamientoCatalogo)
        .options(selectinload(TratamientoCatalogo.familia))
        .where(TratamientoCatalogo.id == tratamiento_id)
    )
    return TratamientoResponse.model_validate(result2.scalar_one())


# ─── HISTORIAL CLÍNICO ────────────────────────────────────────────────────────

CLINICAL_HISTORY_WRITE_ROLES = {"admin", "doctor", "auxiliar"}


def _ensure_clinical_history_write_role(current_user: CurrentUser) -> None:
    if current_user.rol not in CLINICAL_HISTORY_WRITE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="No puede modificar el historial clinico.",
        )


async def _get_history_patient_or_404(db: AsyncSession, paciente_id: UUID) -> Paciente:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


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


def _ensure_same_clinic(
    paciente: Paciente,
    related_clinic_id: UUID | None,
    *,
    resource_name: str,
) -> None:
    """Impide enlazar recursos de dos clinicas nominales diferentes.

    Los recursos legacy sin clinica permanecen compatibles hasta que P0-003
    asigne su propietario de forma segura.
    """
    if (
        paciente.clinica_id is not None
        and related_clinic_id is not None
        and paciente.clinica_id != related_clinic_id
    ):
        raise HTTPException(
            status_code=409,
            detail=f"{resource_name} pertenece a otra clinica.",
        )


async def _validate_history_links(
    db: AsyncSession,
    *,
    paciente: Paciente,
    current_user: CurrentUser,
    tratamiento_id: UUID | None = None,
    doctor_id: UUID | None = None,
    gabinete_id: UUID | None = None,
    factura_id: UUID | None = None,
    presupuesto_linea_id: UUID | None = None,
    cita_id: UUID | None = None,
) -> None:
    if tratamiento_id is not None and not await db.get(TratamientoCatalogo, tratamiento_id):
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    if doctor_id is not None:
        doctor = await db.get(Doctor, doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor no encontrado")
        ensure_clinic_access(current_user, doctor.clinica_id)
        _ensure_same_clinic(paciente, doctor.clinica_id, resource_name="El doctor")

    if gabinete_id is not None and not await db.get(Gabinete, gabinete_id):
        raise HTTPException(status_code=404, detail="Gabinete no encontrado")

    if factura_id is not None:
        factura = await db.get(Factura, factura_id)
        if not factura or factura.paciente_id != paciente.id:
            raise HTTPException(status_code=404, detail="Factura no encontrada para el paciente")
        ensure_clinic_access(current_user, factura.clinica_id)
        _ensure_same_clinic(paciente, factura.clinica_id, resource_name="La factura")

    if presupuesto_linea_id is not None:
        result = await db.execute(
            select(PresupuestoLinea)
            .options(selectinload(PresupuestoLinea.presupuesto))
            .where(PresupuestoLinea.id == presupuesto_linea_id)
        )
        linea = result.scalar_one_or_none()
        if not linea or not linea.presupuesto or linea.presupuesto.paciente_id != paciente.id:
            raise HTTPException(
                status_code=404,
                detail="Linea de presupuesto no encontrada para el paciente",
            )
        ensure_clinic_access(current_user, linea.presupuesto.clinica_id)
        _ensure_same_clinic(
            paciente,
            linea.presupuesto.clinica_id,
            resource_name="El presupuesto",
        )
        if tratamiento_id is not None and linea.tratamiento_id != tratamiento_id:
            raise HTTPException(
                status_code=409,
                detail="La linea de presupuesto no corresponde al tratamiento indicado.",
            )

    if cita_id is not None:
        cita = await db.get(Cita, cita_id)
        if not cita or cita.paciente_id != paciente.id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        _ensure_same_clinic(paciente, cita.clinica_id, resource_name="La cita")

@router.get("/historial/{paciente_id}", response_model=list[HistorialResponse])
async def historial_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    pieza: int | None = Query(None, description="Filtrar por pieza FDI"),
) -> list[HistorialResponse]:
    paciente = await _get_history_patient_or_404(db, paciente_id)
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


@router.post("/historial", response_model=HistorialResponse, status_code=201)
async def registrar_tratamiento(
    data: HistorialCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> HistorialResponse:
    _ensure_clinical_history_write_role(current_user)
    paciente = await _get_history_patient_or_404(db, data.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await _validate_history_links(
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


@router.get("/notas-dentales/{paciente_id}", response_model=list[NotaDentalResponse])
async def notas_dentales_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    pieza: int | None = Query(None, description="Filtrar por pieza FDI"),
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
    result = await db.execute(stmt)
    return [NotaDentalResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/notas-dentales", response_model=NotaDentalResponse, status_code=201)
async def crear_nota_dental(
    data: NotaDentalCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
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
            raise HTTPException(status_code=404, detail="Entrada de historial no encontrada para el paciente")
        doctor_id = doctor_id or historial.doctor_id

    doctor_id = doctor_id or await _current_user_doctor_id(db, current_user)
    texto = data.texto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="La nota no puede estar vacia")
    nota = NotaDental(
        paciente_id=data.paciente_id,
        doctor_id=doctor_id,
        cita_id=data.cita_id,
        historial_id=data.historial_id,
        pieza_dental=data.pieza_dental,
        caras=_normalize_caras(data.caras),
        texto=texto,
        fecha=data.fecha or date_type.today(),
        origen="manual",
    )
    db.add(nota)
    await db.commit()
    result = await db.execute(
        select(NotaDental)
        .options(selectinload(NotaDental.doctor))
        .where(NotaDental.id == nota.id)
    )
    return NotaDentalResponse.model_validate(result.scalar_one())


# ─── Sesión clínica activa ────────────────────────────────────────────────────


SESION_CLINICA_LOAD_OPTIONS = (
    selectinload(SesionClinicaItem.tratamiento),
    selectinload(SesionClinicaItem.doctor),
)


async def _get_sesion_item_or_404(
    db: AsyncSession,
    paciente_id: UUID,
    item_id: UUID,
) -> SesionClinicaItem:
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item_id, SesionClinicaItem.paciente_id == paciente_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item de sesion no encontrado")
    return item


def _ensure_sesion_role(current_user: CurrentUser) -> None:
    if current_user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(status_code=403, detail="No puede operar sobre la sesion clinica.")


@router.get(
    "/pacientes/{paciente_id}/sesion-items",
    response_model=list[SesionClinicaItemResponse],
)
async def listar_sesion_items(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    incluir_realizados: bool = Query(
        False,
        description="Si es false, devuelve solo los items con estado != 'realizado'.",
    ),
) -> list[SesionClinicaItemResponse]:
    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    stmt = (
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.paciente_id == paciente_id)
        .order_by(SesionClinicaItem.orden, SesionClinicaItem.created_at)
    )
    if not incluir_realizados:
        stmt = stmt.where(SesionClinicaItem.estado != "realizado")
    result = await db.execute(stmt)
    return [SesionClinicaItemResponse.model_validate(item) for item in result.scalars().all()]


@router.post(
    "/pacientes/{paciente_id}/sesion-items",
    response_model=SesionClinicaItemResponse,
    status_code=201,
)
async def crear_sesion_item(
    paciente_id: UUID,
    data: SesionClinicaItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SesionClinicaItemResponse:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    if data.tratamiento_id:
        tratamiento = await db.get(TratamientoCatalogo, data.tratamiento_id)
        if not tratamiento:
            raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    if data.presupuesto_linea_id:
        linea = await db.get(PresupuestoLinea, data.presupuesto_linea_id)
        if not linea:
            raise HTTPException(status_code=404, detail="Linea de presupuesto no encontrada")

    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != paciente_id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)

    doctor_id = data.doctor_id or await _current_user_doctor_id(db, current_user)

    item = SesionClinicaItem(
        paciente_id=paciente_id,
        clinica_id=paciente.clinica_id,
        doctor_id=doctor_id,
        tratamiento_id=data.tratamiento_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        cita_id=data.cita_id,
        titulo=data.titulo,
        pieza_dental=data.pieza_dental,
        caras=_normalize_caras(data.caras),
        observaciones=data.observaciones,
        estado=data.estado,
        origen=data.origen,
        orden=data.orden,
    )
    db.add(item)
    await db.commit()
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item.id)
    )
    return SesionClinicaItemResponse.model_validate(result.scalar_one())


@router.patch(
    "/pacientes/{paciente_id}/sesion-items/{item_id}",
    response_model=SesionClinicaItemResponse,
)
async def actualizar_sesion_item(
    paciente_id: UUID,
    item_id: UUID,
    data: SesionClinicaItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SesionClinicaItemResponse:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    item = await _get_sesion_item_or_404(db, paciente_id, item_id)
    if item.estado == "realizado":
        raise HTTPException(
            status_code=409,
            detail="No se puede editar un item de sesion ya finalizado",
        )

    cambios = data.model_dump(exclude_unset=True)
    if "caras" in cambios:
        cambios["caras"] = _normalize_caras(cambios["caras"])
    if cambios.get("estado") == "realizado":
        # No permitimos saltar a 'realizado' desde el PATCH: el cierre real
        # debe pasar por POST /historial/sesion-realizada para crear historial.
        raise HTTPException(
            status_code=400,
            detail="Use POST /tratamientos/historial/sesion-realizada para finalizar como realizado",
        )

    for field, value in cambios.items():
        setattr(item, field, value)
    await db.commit()
    result = await db.execute(
        select(SesionClinicaItem)
        .options(*SESION_CLINICA_LOAD_OPTIONS)
        .where(SesionClinicaItem.id == item_id)
    )
    return SesionClinicaItemResponse.model_validate(result.scalar_one())


@router.delete(
    "/pacientes/{paciente_id}/sesion-items/{item_id}",
    status_code=204,
)
async def eliminar_sesion_item(
    paciente_id: UUID,
    item_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    _ensure_sesion_role(current_user)

    paciente = await db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    item = await _get_sesion_item_or_404(db, paciente_id, item_id)
    if item.estado == "realizado":
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un item de sesion ya finalizado",
        )
    await db.delete(item)
    await db.commit()


@router.post("/historial/sesion-realizada", response_model=HistorialResponse, status_code=201)
async def finalizar_tratamiento_sesion(
    data: SesionTratamientoRealizadoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> HistorialResponse:
    if current_user.rol not in {"admin", "doctor", "auxiliar"}:
        raise HTTPException(status_code=403, detail="No puede finalizar tratamientos clinicos.")

    paciente = await db.get(Paciente, data.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    ensure_clinic_access(current_user, paciente.clinica_id)

    tratamiento = await db.get(TratamientoCatalogo, data.tratamiento_id)
    if not tratamiento:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")

    cita: Cita | None = None
    doctor_id = data.doctor_id
    gabinete_id = data.gabinete_id
    if data.cita_id:
        cita = await db.get(Cita, data.cita_id)
        if not cita or cita.paciente_id != data.paciente_id:
            raise HTTPException(status_code=404, detail="Cita no encontrada para el paciente")
        ensure_clinic_access(current_user, cita.clinica_id)
        doctor_id = doctor_id or cita.doctor_id
        gabinete_id = gabinete_id if gabinete_id is not None else cita.gabinete_id

    linea: PresupuestoLinea | None = None
    trabajo: TrabajoPendiente | None = None
    historial: HistorialClinico | None = None
    if data.presupuesto_linea_id:
        linea_result = await db.execute(
            select(PresupuestoLinea)
            .options(
                selectinload(PresupuestoLinea.presupuesto),
                selectinload(PresupuestoLinea.tratamiento),
            )
            .where(PresupuestoLinea.id == data.presupuesto_linea_id)
        )
        linea = linea_result.scalar_one_or_none()
        if not linea or not linea.presupuesto or linea.presupuesto.paciente_id != data.paciente_id:
            raise HTTPException(status_code=404, detail="Linea de presupuesto no encontrada para el paciente")
        ensure_clinic_access(current_user, linea.presupuesto.clinica_id)
        doctor_id = doctor_id or linea.presupuesto.doctor_id

        trabajo_result = await db.execute(
            select(TrabajoPendiente).where(TrabajoPendiente.presupuesto_linea_id == linea.id)
        )
        trabajo = trabajo_result.scalar_one_or_none()
        if not trabajo:
            trabajo = TrabajoPendiente(
                paciente_id=data.paciente_id,
                presupuesto_linea_id=linea.id,
                tratamiento_id=linea.tratamiento_id,
                pieza_dental=data.pieza_dental if data.pieza_dental is not None else linea.pieza_dental,
                caras=_normalize_caras(data.caras) if data.caras is not None else linea.caras,
            )
            db.add(trabajo)
            linea.pasado_trabajo_pendiente = True
            await db.flush()
        elif trabajo.historial_id:
            historial = await db.get(HistorialClinico, trabajo.historial_id)

        if historial is None:
            existing_result = await db.execute(
                select(HistorialClinico)
                .where(HistorialClinico.presupuesto_linea_id == linea.id)
                .order_by(HistorialClinico.created_at.desc())
                .limit(1)
            )
            historial = existing_result.scalar_one_or_none()

    doctor_id = doctor_id or await _current_user_doctor_id(db, current_user)
    if not doctor_id:
        raise HTTPException(status_code=400, detail="No se pudo determinar el doctor del tratamiento")

    pieza_dental = data.pieza_dental if data.pieza_dental is not None else (linea.pieza_dental if linea else None)
    caras = _normalize_caras(data.caras) if data.caras is not None else (linea.caras if linea else None)
    procedimiento = data.procedimiento or (linea.tratamiento.nombre if linea and linea.tratamiento else tratamiento.nombre)
    importe = data.importe if data.importe is not None else (linea.precio_unitario if linea else tratamiento.precio)
    fecha = data.fecha or date_type.today()
    origen = data.origen or ("presupuesto_linea" if linea else "cita" if cita else "manual")

    if historial:
        historial.tratamiento_id = data.tratamiento_id
        historial.doctor_id = doctor_id
        historial.gabinete_id = gabinete_id
        historial.pieza_dental = pieza_dental
        historial.caras = caras
        historial.fecha = fecha
        historial.procedimiento = procedimiento
        historial.observaciones = data.observaciones
        historial.estado = "realizado"
        historial.importe = importe
        historial.origen = origen
        historial.presupuesto_linea_id = data.presupuesto_linea_id
        historial.cita_id = data.cita_id
    else:
        historial = HistorialClinico(
            paciente_id=data.paciente_id,
            tratamiento_id=data.tratamiento_id,
            doctor_id=doctor_id,
            gabinete_id=gabinete_id,
            pieza_dental=pieza_dental,
            caras=caras,
            fecha=fecha,
            diagnostico="Tratamiento realizado en sesion clinica",
            procedimiento=procedimiento,
            observaciones=data.observaciones,
            estado="realizado",
            importe=importe,
            origen=origen,
            presupuesto_linea_id=data.presupuesto_linea_id,
            cita_id=data.cita_id,
        )
        db.add(historial)
        await db.flush()

    if trabajo:
        trabajo.realizado = True
        trabajo.historial_id = historial.id
        trabajo.pieza_dental = pieza_dental
        trabajo.caras = caras

    sesion_item: SesionClinicaItem | None = None
    if data.sesion_item_id:
        sesion_item = await db.get(SesionClinicaItem, data.sesion_item_id)
        if not sesion_item or sesion_item.paciente_id != data.paciente_id:
            raise HTTPException(
                status_code=404,
                detail="Item de sesion no encontrado para el paciente",
            )
    if sesion_item:
        sesion_item.estado = "realizado"
        sesion_item.historial_id = historial.id
        sesion_item.tratamiento_id = data.tratamiento_id
        sesion_item.doctor_id = doctor_id
        sesion_item.pieza_dental = pieza_dental
        sesion_item.caras = caras
        if data.observaciones is not None:
            sesion_item.observaciones = data.observaciones

    await _mark_session_historial_on_odontograma(
        db,
        historial=historial,
        presupuesto_linea_id=data.presupuesto_linea_id,
        current_user=current_user,
    )
    await db.commit()
    result = await db.execute(
        select(HistorialClinico)
        .options(
            selectinload(HistorialClinico.tratamiento),
            selectinload(HistorialClinico.doctor),
        )
        .where(HistorialClinico.id == historial.id)
    )
    return HistorialResponse.model_validate(result.scalar_one())


@router.patch("/historial/{entrada_id}", response_model=HistorialResponse)
async def actualizar_entrada_historial(
    entrada_id: UUID,
    data: HistorialUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    request: Request,
) -> HistorialResponse:
    _ensure_clinical_history_write_role(current_user)
    historial = await _get_history_entry_or_404(db, entrada_id)
    paciente = await _get_history_patient_or_404(db, historial.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await _validate_history_links(
        db,
        paciente=paciente,
        current_user=current_user,
        factura_id=data.factura_id,
        presupuesto_linea_id=data.presupuesto_linea_id,
        cita_id=data.cita_id,
    )
    changes = data.model_dump(exclude_none=True)
    old_values = {
        field: getattr(historial, field)
        for field in changes
    }
    for field, value in changes.items():
        setattr(historial, field, value)
    await write_audit_log(
        db,
        user=current_user,
        action="HISTORIAL_CLINICO_EDITAR",
        entity_type="historial_clinico",
        entity_id=historial.id,
        old_values={key: str(value) if value is not None else None for key, value in old_values.items()},
        new_values=data.model_dump(mode="json", exclude_none=True),
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    return HistorialResponse.model_validate(await _get_history_entry_or_404(db, entrada_id))


@router.delete("/historial/{entrada_id}", status_code=204, dependencies=[RequireAdmin])
async def eliminar_entrada_historial(
    entrada_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    """Elimina una entrada de historial (solo admin, por error de registro)."""
    result = await db.execute(select(HistorialClinico).where(HistorialClinico.id == entrada_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    paciente = await _get_history_patient_or_404(db, h.paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    await db.delete(h)
    await db.commit()
