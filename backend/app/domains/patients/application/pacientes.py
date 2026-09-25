"""Application use cases: tenant checks, orchestration and existing transactions."""
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit_log import write_audit_log
from app.core.crypto import cifrar_campos_paciente, cifrar_json, descifrar_json, descifrar_paciente
from app.core.permissions import (
    ROLE_PACIENTE,
    TokenData,
    can_view_health_data,
    ensure_can_modify_billing,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.domains.billing.persistence.factura import Factura, FormaPago, PagoAnticipadoPaciente
from app.domains.billing.schemas.factura import (
    PagoAnticipadoCreate,
    PagoAnticipadoResponse,
    PagoAnticipadoUpdate,
    SaldoPacienteResponse,
)
from app.domains.patients.persistence.paciente import Paciente
from app.domains.patients.persistence.referencia import Referencia
from app.domains.patients.schemas.paciente import (
    AsignarReferenciasRequest,
    PacienteCreate,
    PacienteResponse,
    PacienteResumen,
    PacienteUpdate,
    ReferenciaCreate,
    ReferenciaResponse,
)
from app.domains.scheduling.application.citas import _to_response as cita_to_response
from app.domains.scheduling.persistence.cita import Cita
from app.domains.scheduling.schemas.cita import CitaResponse


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
    from app.domains.clinical.persistence.historial import HistorialClinico

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


def _puede_ver_datos_salud(current_user: TokenData) -> bool:
    return can_view_health_data(current_user)


async def _leer_datos_salud(db: AsyncSession, paciente: Paciente) -> dict:
    datos = await descifrar_json(db, paciente.datos_salud_cifrado)
    if datos is not None:
        return datos
    legacy = paciente.datos_salud if isinstance(paciente.datos_salud, dict) else None
    return legacy or {}


async def listar_pacientes(db: AsyncSession, current_user: TokenData, q: str | None, solo_activos: bool, limit: int, offset: int) -> list[PacienteResumen]:
    """
    Búsqueda de pacientes.
    - Sin `q`: devuelve la lista ordenada por apellidos (paginada).
    - Con `q`: filtra por nombre, apellidos o código (ILIKE).
    """
    if current_user.rol == ROLE_PACIENTE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Use el portal paciente para consultar sus datos.")

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

    # Resumen interno para busqueda rapida en recepcion/agenda.
    resumenes = []
    for p in pacientes:
        descifrados = await descifrar_paciente(db, p)
        resumenes.append(
            PacienteResumen(
                id=p.id,
                codigo=p.codigo,
                num_historial=p.num_historial,
                nombre=p.nombre,
                apellidos=p.apellidos,
                fecha_nacimiento=p.fecha_nacimiento,
                dni_nie=descifrados["dni_nie"],
                telefono=descifrados["telefono"],
                telefono2=descifrados["telefono2"],
                email=descifrados["email"],
                activo=p.activo,
            )
        )
    return resumenes


async def crear_paciente(data: PacienteCreate, db: AsyncSession, current_user: TokenData) -> PacienteResponse:
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


async def obtener_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> PacienteResponse:
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
    current_user: TokenData,
    doctor_id: UUID | None,
    clinica_id: UUID | None,
) -> None:
    if doctor_id is None:
        return
    from app.domains.identity.persistence.doctor import Doctor

    doctor = await db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor habitual no encontrado")
    if doctor.clinica_id is not None and clinica_id is not None and doctor.clinica_id != clinica_id:
        raise HTTPException(status_code=400, detail="Doctor habitual de otra clínica")
    if doctor.clinica_id is not None:
        ensure_clinic_access(current_user, doctor.clinica_id)


async def actualizar_paciente(paciente_id: UUID, data: PacienteUpdate, request: Request, db: AsyncSession, current_user: TokenData) -> PacienteResponse:
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


async def desactivar_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> None:
    """Soft delete: activo = False. Nunca elimina datos clínicos."""
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
    p.activo = False
    await db.commit()


class DatosSaludUpdate(PacienteUpdate):
    pass


async def get_salud(paciente_id: UUID, db: AsyncSession, _: TokenData, __) -> dict:
    """Devuelve los datos de salud del paciente."""
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(_, p.clinica_id)
    return await _leer_datos_salud(db, p)


async def actualizar_salud(paciente_id: UUID, data: dict, db: AsyncSession, _: TokenData, __) -> dict:
    """Actualiza los datos de salud del paciente (merge con los existentes)."""
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(_, p.clinica_id)
    existing = await _leer_datos_salud(db, p)
    existing.update(data)
    p.datos_salud_cifrado = await cifrar_json(db, existing)
    p.datos_salud = None
    await db.commit()
    return existing


async def proximas_citas_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> list[CitaResponse]:
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor), selectinload(Cita.gabinete))
        .where(Cita.paciente_id == paciente_id, Cita.fecha_hora >= datetime.now(timezone.utc))
        .order_by(Cita.fecha_hora)
    )
    return [await cita_to_response(db, cita) for cita in result.scalars().all()]


async def saldo_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> SaldoPacienteResponse:
    from app.domains.billing.application.ledger import read_account
    from app.domains.billing.persistence.account_queries import invoice_paid
    account = await read_account(db, paciente_id, current_user)
    scope = [] if current_user.rol == "admin" else [(Factura.clinica_id == current_user.clinica_id) | Factura.clinica_id.is_(None)]
    total = await db.scalar(select(func.coalesce(func.sum(Factura.total), 0)).where(Factura.paciente_id == paciente_id, Factura.estado != "anulada", *scope))
    pending = await db.scalar(select(func.count()).select_from(Factura).where(Factura.paciente_id == paciente_id, Factura.estado != "anulada", Factura.total > invoice_paid(), *scope))
    return SaldoPacienteResponse(paciente_id=paciente_id, total_facturado=total,
        total_cargos=account.total_cargos, total_cobrado=account.total_cobrado, pendiente=account.saldo,
        saldo_favor=account.saldo_favor, sin_valorar=account.sin_valorar, facturas_pendientes=pending)


async def listar_pagos_anticipados(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> list[PagoAnticipadoResponse]:
    paciente = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, paciente.clinica_id)
    result = await db.execute(
        select(PagoAnticipadoPaciente)
        .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        .where(PagoAnticipadoPaciente.paciente_id == paciente_id)
        .order_by(PagoAnticipadoPaciente.fecha)
    )
    return [PagoAnticipadoResponse.model_validate(item) for item in result.scalars().all()]


async def crear_pago_anticipado(paciente_id: UUID, data: PagoAnticipadoCreate, request: Request, db: AsyncSession, current_user: TokenData) -> PagoAnticipadoResponse:
    ensure_can_modify_billing(current_user)
    from app.domains.billing.application.ledger import account_patient
    paciente = await account_patient(db, paciente_id, current_user, lock=True)
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


async def actualizar_pago_anticipado(paciente_id: UUID, pago_id: UUID, data: PagoAnticipadoUpdate, request: Request, db: AsyncSession, current_user: TokenData) -> PagoAnticipadoResponse:
    ensure_can_modify_billing(current_user)
    from app.domains.billing.application.ledger import account_patient
    paciente = await account_patient(db, paciente_id, current_user, lock=True)
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
    from app.domains.billing.persistence.cuenta import AplicacionPago
    if {"importe", "forma_pago_id"} & data.model_fields_set and await db.scalar(select(AplicacionPago.id).where(AplicacionPago.anticipo_id == pago.id).limit(1)):
        raise HTTPException(409, "El anticipo ya se aplicó a cargos. No puede modificarse su importe ni forma de pago.")
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


async def historial_faltas_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> list[dict]:
    """Devuelve faltas y anulaciones del paciente para mostrar alerta al dar cita."""
    from app.domains.scheduling.persistence.cita import HistorialFaltas
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


async def listar_referencias_paciente(paciente_id: UUID, db: AsyncSession, current_user: TokenData) -> list[ReferenciaResponse]:
    p = await _get_paciente_or_404(db, paciente_id)
    ensure_clinic_access(current_user, p.clinica_id)
    return [ReferenciaResponse.model_validate(r) for r in p.referencias]


async def asignar_referencias(paciente_id: UUID, data: AsignarReferenciasRequest, db: AsyncSession, current_user: TokenData) -> list[ReferenciaResponse]:
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


async def listar_catalogo_referencias(db: AsyncSession, _: TokenData) -> list[ReferenciaResponse]:
    result = await db.execute(select(Referencia).order_by(Referencia.nombre))
    return [ReferenciaResponse.model_validate(r) for r in result.scalars().all()]


async def crear_referencia(data: ReferenciaCreate, db: AsyncSession) -> ReferenciaResponse:
    ref = Referencia(**data.model_dump())
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return ReferenciaResponse.model_validate(ref)
