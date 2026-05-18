"""
Router de pacientes — Fase 3.
CRUD completo + búsqueda global + gestión de referencias/tags.

Cifrado RGPD: DNI, teléfonos y email se cifran con pgcrypto antes de guardar
y se descifran al leer. La clave nunca sale del servidor.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.citas import _to_response as cita_to_response
from app.core.crypto import cifrar_campos_paciente, cifrar_json, descifrar_json, descifrar_paciente
from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    RequireDoctor,
    can_view_health_data,
    ensure_can_modify_billing,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.cita import Cita
from app.models.factura import Factura, FormaPago, PagoAnticipadoPaciente
from app.models.paciente import Paciente
from app.models.referencia import Referencia
from app.schemas.cita import CitaResponse
from app.schemas.factura import (
    PagoAnticipadoCreate,
    PagoAnticipadoResponse,
    PagoAnticipadoUpdate,
    SaldoPacienteResponse,
)
from app.schemas.paciente import (
    AsignarReferenciasRequest,
    PacienteCreate,
    PacienteResponse,
    PacienteResumen,
    PacienteUpdate,
    ReferenciaCreate,
    ReferenciaResponse,
)
from app.services.audit import write_audit_log

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


async def _fechas_visita_paciente(db: AsyncSession, paciente_id: UUID) -> tuple[date | None, date | None]:
    """Calcula primera y última visita desde el historial clínico del paciente."""
    from app.models.historial import HistorialClinico

    result = await db.execute(
        select(
            func.min(HistorialClinico.fecha),
            func.max(HistorialClinico.fecha),
        ).where(HistorialClinico.paciente_id == paciente_id)
    )
    primera, ultima = result.one()
    return primera, ultima


async def _build_response(db: AsyncSession, p: Paciente, include_health: bool) -> PacienteResponse:
    """Construye PacienteResponse descifrando campos sensibles."""
    descifrados = await descifrar_paciente(db, p)
    primera_visita, ultima_visita = await _fechas_visita_paciente(db, p.id)
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
        "sexo": p.sexo,
        "profesion": p.profesion,
        "pais": p.pais,
        "doctor_habitual_id": p.doctor_habitual_id,
        "num_poliza": p.num_poliza,
        "pagador_distinto": p.pagador_distinto,
        "pagador_nombre": p.pagador_nombre,
        "pagador_dni": p.pagador_dni,
        "pagador_direccion": p.pagador_direccion,
        "fecha_primera_visita": primera_visita,
        "fecha_ultima_visita": ultima_visita,
        **descifrados,
    }
    if not include_health:
        data["datos_salud"] = None
    return PacienteResponse.model_validate(data)


def _puede_ver_datos_salud(current_user: CurrentUser) -> bool:
    return can_view_health_data(current_user)


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

    stmt = scope_select_by_clinic(stmt, Paciente, current_user)

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
    campos_planos["clinica_id"] = resolve_clinic_id(current_user, campos_planos.get("clinica_id"))
    await _ensure_doctor_habitual_valido(
        db, current_user, campos_planos.get("doctor_habitual_id"), campos_planos.get("clinica_id")
    )
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
    ensure_clinic_access(current_user, p.clinica_id)
    return await _build_response(db, p, include_health=_puede_ver_datos_salud(current_user))


_CAMPOS_AUDITABLES = (
    "nombre",
    "apellidos",
    "fecha_nacimiento",
    "direccion",
    "codigo_postal",
    "ciudad",
    "provincia",
    "entidad_id",
    "entidad_alt_id",
    "no_correo",
    "observaciones",
    "activo",
    "sexo",
    "profesion",
    "pais",
    "doctor_habitual_id",
    "num_poliza",
    "pagador_distinto",
    "pagador_nombre",
    "pagador_dni",
    "pagador_direccion",
)


def _snapshot_paciente(p: Paciente) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for campo in _CAMPOS_AUDITABLES:
        valor = getattr(p, campo, None)
        if isinstance(valor, UUID):
            snapshot[campo] = str(valor)
        elif isinstance(valor, date):
            snapshot[campo] = valor.isoformat()
        else:
            snapshot[campo] = valor
    return snapshot


async def _ensure_doctor_habitual_valido(
    db: AsyncSession,
    current_user: CurrentUser,
    doctor_id: UUID | None,
    clinica_id: UUID | None,
) -> None:
    if doctor_id is None:
        return
    from app.models.doctor import Doctor

    doctor = await db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor habitual no encontrado")
    if doctor.clinica_id is not None and clinica_id is not None and doctor.clinica_id != clinica_id:
        raise HTTPException(status_code=400, detail="Doctor habitual de otra clínica")
    if doctor.clinica_id is not None:
        ensure_clinic_access(current_user, doctor.clinica_id)


@router.patch("/{paciente_id}", response_model=PacienteResponse)
async def actualizar_paciente(
    paciente_id: UUID,
    data: PacienteUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PacienteResponse:
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
    old_snapshot = _snapshot_paciente(p)

    campos = data.model_dump(exclude_unset=True)

    if "doctor_habitual_id" in campos:
        await _ensure_doctor_habitual_valido(
            db, current_user, campos.get("doctor_habitual_id"), p.clinica_id
        )

    # Separar campos sensibles de planos
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
        if campo == "clinica_id":
            valor = resolve_clinic_id(current_user, valor)
        setattr(p, campo, valor)

    new_snapshot = _snapshot_paciente(p)
    diff_old = {k: old_snapshot[k] for k in _CAMPOS_AUDITABLES if old_snapshot[k] != new_snapshot[k]}
    diff_new = {k: new_snapshot[k] for k in _CAMPOS_AUDITABLES if old_snapshot[k] != new_snapshot[k]}
    campos_sensibles_modificados = sorted(sensibles.keys()) if sensibles else []
    if diff_old or diff_new or campos_sensibles_modificados or "datos_salud" in data.model_fields_set:
        await write_audit_log(
            db,
            user=current_user,
            action="paciente_actualizado",
            entity_type="pacientes",
            entity_id=p.id,
            old_values=diff_old or None,
            new_values={
                **diff_new,
                **({"campos_sensibles": campos_sensibles_modificados} if campos_sensibles_modificados else {}),
                **({"datos_salud_modificado": True} if "datos_salud" in data.model_fields_set else {}),
            } or None,
            clinica_id=p.clinica_id,
            request=request,
        )

    await db.commit()
    p2 = await _get_paciente_or_404(db, paciente_id)
    return await _build_response(db, p2, include_health=_puede_ver_datos_salud(current_user))


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def desactivar_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    """Soft delete: activo = False. Nunca elimina datos clínicos."""
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
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
    ensure_clinic_access(_, p.clinica_id)
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
    ensure_clinic_access(_, p.clinica_id)
    existing = await _leer_datos_salud(db, p)
    existing.update(data)
    p.datos_salud_cifrado = await cifrar_json(db, existing)
    p.datos_salud = None
    await db.commit()
    return existing


@router.get("/{paciente_id}/citas", response_model=list[CitaResponse])
async def proximas_citas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[CitaResponse]:
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(Cita.paciente_id == paciente_id, Cita.fecha_hora >= datetime.now(timezone.utc))
        .order_by(Cita.fecha_hora)
    )
    return [await cita_to_response(db, cita) for cita in result.scalars().all()]


@router.get("/{paciente_id}/saldo", response_model=SaldoPacienteResponse)
async def saldo_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> SaldoPacienteResponse:
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(Factura)
        .options(selectinload(Factura.cobros))
        .where(Factura.paciente_id == paciente_id, Factura.estado != "anulada")
    )
    facturas = result.scalars().all()
    anticipos_result = await db.execute(
        select(PagoAnticipadoPaciente).where(
            PagoAnticipadoPaciente.paciente_id == paciente_id,
            PagoAnticipadoPaciente.anulado_at.is_(None),
        )
    )
    anticipos = anticipos_result.scalars().all()
    total_facturado = sum((factura.total for factura in facturas), Decimal("0.00"))
    total_cobrado = sum(
        (cobro.importe for factura in facturas for cobro in factura.cobros if cobro.anulado_at is None),
        Decimal("0.00"),
    ) + sum((anticipo.importe for anticipo in anticipos), Decimal("0.00"))
    pendiente = total_facturado - total_cobrado
    facturas_pendientes = sum(1 for factura in facturas if factura.total > sum(
        (cobro.importe for cobro in factura.cobros if cobro.anulado_at is None),
        Decimal("0.00"),
    ))
    return SaldoPacienteResponse(
        paciente_id=paciente_id,
        total_facturado=total_facturado,
        total_cobrado=total_cobrado,
        pendiente=pendiente,
        facturas_pendientes=facturas_pendientes,
    )


# ─── HISTORIAL DE FALTAS (para alerta en nueva cita) ─────────────────────────

@router.get("/{paciente_id}/pagos-anticipados", response_model=list[PagoAnticipadoResponse])
async def listar_pagos_anticipados(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PagoAnticipadoResponse]:
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(PagoAnticipadoPaciente)
        .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        .where(PagoAnticipadoPaciente.paciente_id == paciente_id)
        .order_by(PagoAnticipadoPaciente.fecha)
    )
    return [PagoAnticipadoResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/{paciente_id}/pagos-anticipados", response_model=PagoAnticipadoResponse, status_code=201)
async def crear_pago_anticipado(
    paciente_id: UUID,
    data: PagoAnticipadoCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PagoAnticipadoResponse:
    ensure_can_modify_billing(current_user)
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    forma_pago = await db.get(FormaPago, data.forma_pago_id)
    if not forma_pago:
        raise HTTPException(status_code=404, detail="Forma de pago no encontrada")

    pago = PagoAnticipadoPaciente(
        paciente_id=paciente_id,
        clinica_id=paciente.clinica_id,
        fecha=datetime.now(timezone.utc),
        importe=data.importe,
        forma_pago_id=data.forma_pago_id,
        usuario_id=current_user.user_id,
        concepto=data.concepto,
        notas=data.notas,
    )
    db.add(pago)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="pago_anticipado_creado",
        entity_type="pagos_anticipados_paciente",
        entity_id=pago.id,
        new_values={
            "paciente_id": str(paciente_id),
            "importe": str(data.importe),
            "forma_pago_id": str(data.forma_pago_id),
            "concepto": data.concepto,
        },
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    result = await db.execute(
        select(PagoAnticipadoPaciente)
        .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        .where(PagoAnticipadoPaciente.id == pago.id)
    )
    return PagoAnticipadoResponse.model_validate(result.scalar_one())


@router.patch("/{paciente_id}/pagos-anticipados/{pago_id}", response_model=PagoAnticipadoResponse)
async def actualizar_pago_anticipado(
    paciente_id: UUID,
    pago_id: UUID,
    data: PagoAnticipadoUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> PagoAnticipadoResponse:
    ensure_can_modify_billing(current_user)
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(PagoAnticipadoPaciente)
        .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        .where(PagoAnticipadoPaciente.id == pago_id, PagoAnticipadoPaciente.paciente_id == paciente_id)
    )
    pago = result.scalar_one_or_none()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago anticipado no encontrado")
    if pago.anulado_at is not None:
        raise HTTPException(status_code=400, detail="No se puede editar un pago anulado")

    old_values = {
        "importe": str(pago.importe),
        "forma_pago_id": str(pago.forma_pago_id),
        "concepto": pago.concepto,
        "notas": pago.notas,
    }
    cambios = data.model_dump(exclude_unset=True)
    if "forma_pago_id" in cambios:
        forma_pago = await db.get(FormaPago, cambios["forma_pago_id"])
        if not forma_pago:
            raise HTTPException(status_code=404, detail="Forma de pago no encontrada")
    for campo, valor in cambios.items():
        setattr(pago, campo, valor)
    await write_audit_log(
        db,
        user=current_user,
        action="pago_anticipado_editado",
        entity_type="pagos_anticipados_paciente",
        entity_id=pago.id,
        old_values=old_values,
        new_values={k: str(v) if k in {"importe", "forma_pago_id"} else v for k, v in cambios.items()},
        clinica_id=paciente.clinica_id,
        request=request,
    )
    await db.commit()
    result = await db.execute(
        select(PagoAnticipadoPaciente)
        .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        .where(PagoAnticipadoPaciente.id == pago.id)
    )
    return PagoAnticipadoResponse.model_validate(result.scalar_one())


@router.get("/{paciente_id}/faltas", response_model=list[dict])
async def historial_faltas_paciente(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[dict]:
    """Devuelve faltas y anulaciones del paciente para mostrar alerta al dar cita."""
    from app.models.cita import HistorialFaltas
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
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
    current_user: CurrentUser,
) -> list[ReferenciaResponse]:
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
    return [ReferenciaResponse.model_validate(r) for r in p.referencias]


@router.put("/{paciente_id}/referencias", response_model=list[ReferenciaResponse])
async def asignar_referencias(
    paciente_id: UUID,
    data: AsignarReferenciasRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ReferenciaResponse]:
    """Reemplaza el conjunto completo de referencias del paciente."""
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
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
