"""Reportes operativos, dashboard y BI de clinica."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.permissions import (
    CurrentUser,
    RequireBilling,
    clinic_scope_condition,
    scope_select_by_clinic,
)
from app.database import get_db
from app.domains.billing.persistence.factura import Cobro, Factura
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.identity.persistence.doctor import Doctor
from app.domains.patients.persistence.paciente import Paciente
from app.domains.reporting.schemas.ingresos import IngresosResponse
from app.domains.scheduling.persistence.cita import Cita, HistorialFaltas
from app.domains.treatment_plans.persistence.presupuesto import Presupuesto

router = APIRouter(dependencies=[RequireBilling])


def _periodo(fecha_desde: date | None, fecha_hasta: date | None) -> tuple[date, date]:
    hoy = datetime.now(ZoneInfo(get_settings().clinic_timezone)).date()
    return fecha_desde or date(hoy.year, hoy.month, 1), fecha_hasta or hoy


def _clinic_date(column):
    return cast(func.timezone(get_settings().clinic_timezone, column), Date)


def _clinic_condition(model: type, current_user: CurrentUser):
    return clinic_scope_condition(model, current_user)


def _apply_clinic(stmt, model: type, current_user: CurrentUser):
    return scope_select_by_clinic(stmt, model, current_user)


async def _facturacion_resumen(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> dict:
    facturas_stmt = select(
        func.count(Factura.id),
        func.coalesce(func.sum(Factura.total), Decimal("0")),
    ).where(Factura.fecha >= fecha_desde, Factura.fecha <= fecha_hasta, Factura.estado != "anulada")
    facturas_stmt = _apply_clinic(facturas_stmt, Factura, current_user)
    num_facturas, total_facturado = (await db.execute(facturas_stmt)).one()

    cobros_stmt = (
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0")))
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(
            _clinic_date(Cobro.fecha) >= fecha_desde,
            _clinic_date(Cobro.fecha) <= fecha_hasta,
            Cobro.anulado_at.is_(None),
            Factura.estado != "anulada",
        )
    )
    clinic_filter = _clinic_condition(Factura, current_user)
    if clinic_filter is not None:
        cobros_stmt = cobros_stmt.where(clinic_filter)
    total_cobrado = (await db.execute(cobros_stmt)).scalar_one()

    pendientes_stmt = select(func.coalesce(func.sum(Factura.total), Decimal("0"))).where(Factura.estado != "anulada")
    pendientes_stmt = _apply_clinic(pendientes_stmt, Factura, current_user)
    total_facturas_vivas = (await db.execute(pendientes_stmt)).scalar_one()

    cobros_vivos_stmt = (
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0")))
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(Cobro.anulado_at.is_(None), Factura.estado != "anulada")
    )
    if clinic_filter is not None:
        cobros_vivos_stmt = cobros_vivos_stmt.where(clinic_filter)
    total_cobros_vivos = (await db.execute(cobros_vivos_stmt)).scalar_one()

    pendiente_global = total_facturas_vivas - total_cobros_vivos
    ticket_medio = total_facturado / num_facturas if num_facturas else Decimal("0")
    return {
        "num_facturas": int(num_facturas or 0),
        "total_facturado": float(total_facturado or 0),
        "total_cobrado": float(total_cobrado or 0),
        "pendiente": float(pendiente_global or 0),
        "ticket_medio": float(ticket_medio or 0),
    }


async def _citas_resumen(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> dict:
    stmt = (
        select(Cita.estado, func.count(Cita.id))
        .where(_clinic_date(Cita.fecha_hora) >= fecha_desde, _clinic_date(Cita.fecha_hora) <= fecha_hasta)
        .group_by(Cita.estado)
    )
    stmt = _apply_clinic(stmt, Cita, current_user)
    por_estado = {estado: int(total) for estado, total in (await db.execute(stmt)).all()}
    total = sum(por_estado.values())
    atendidas = por_estado.get("atendida", 0)
    faltas = por_estado.get("falta", 0)
    anuladas = por_estado.get("anulada", 0)
    return {
        "total": total,
        "por_estado": por_estado,
        "asistencia": atendidas,
        "faltas": faltas,
        "anuladas": anuladas,
        "no_show_rate": round((faltas / total) * 100, 2) if total else 0,
    }


async def _pacientes_nuevos(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> int:
    stmt = select(func.count(Paciente.id)).where(
        _clinic_date(Paciente.created_at) >= fecha_desde,
        _clinic_date(Paciente.created_at) <= fecha_hasta,
        Paciente.activo == True,  # noqa: E712
    )
    stmt = _apply_clinic(stmt, Paciente, current_user)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _tratamientos_total(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> int:
    stmt = (
        select(func.count(HistorialClinico.id))
        .join(Paciente, Paciente.id == HistorialClinico.paciente_id)
        .where(HistorialClinico.fecha >= fecha_desde, HistorialClinico.fecha <= fecha_hasta)
    )
    clinic_filter = _clinic_condition(Paciente, current_user)
    if clinic_filter is not None:
        stmt = stmt.where(clinic_filter)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _presupuestos_resumen(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> dict:
    stmt = (
        select(Presupuesto.estado, func.count(Presupuesto.id))
        .where(Presupuesto.fecha >= fecha_desde, Presupuesto.fecha <= fecha_hasta)
        .group_by(Presupuesto.estado)
    )
    stmt = _apply_clinic(stmt, Presupuesto, current_user)
    por_estado = {estado: int(total) for estado, total in (await db.execute(stmt)).all()}
    total = sum(por_estado.values())
    aceptados = por_estado.get("aceptado", 0) + por_estado.get("parcial", 0)
    rechazados = por_estado.get("rechazado", 0)
    return {
        "total": total,
        "por_estado": por_estado,
        "aceptacion_rate": round((aceptados / total) * 100, 2) if total else 0,
        "rechazo_rate": round((rechazados / total) * 100, 2) if total else 0,
    }


async def _top_tratamientos(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
    limit: int = 10,
) -> list[dict]:
    stmt = (
        select(
            TratamientoCatalogo.nombre,
            func.count(HistorialClinico.id).label("cantidad"),
            func.coalesce(func.sum(HistorialClinico.importe), Decimal("0")).label("importe"),
        )
        .join(TratamientoCatalogo, TratamientoCatalogo.id == HistorialClinico.tratamiento_id)
        .join(Paciente, Paciente.id == HistorialClinico.paciente_id)
        .where(HistorialClinico.fecha >= fecha_desde, HistorialClinico.fecha <= fecha_hasta)
        .group_by(TratamientoCatalogo.nombre)
        .order_by(func.count(HistorialClinico.id).desc())
        .limit(limit)
    )
    clinic_filter = _clinic_condition(Paciente, current_user)
    if clinic_filter is not None:
        stmt = stmt.where(clinic_filter)
    rows = await db.execute(stmt)
    return [{"tratamiento": r.nombre, "cantidad": int(r.cantidad), "importe": float(r.importe or 0)} for r in rows]


async def _citas_doctores(
    db: AsyncSession,
    current_user: CurrentUser,
    fecha_desde: date,
    fecha_hasta: date,
) -> list[dict]:
    attended = case((Cita.estado == "atendida", 1), else_=0)
    no_show = case((Cita.estado == "falta", 1), else_=0)
    duration = func.coalesce(func.sum(Cita.duracion_min), 0)
    stmt = (
        select(
            Doctor.id,
            Doctor.nombre,
            Doctor.color_agenda,
            func.count(Cita.id).label("total"),
            func.coalesce(func.sum(attended), 0).label("atendidas"),
            func.coalesce(func.sum(no_show), 0).label("faltas"),
            duration.label("minutos"),
        )
        .join(Doctor, Doctor.id == Cita.doctor_id)
        .where(_clinic_date(Cita.fecha_hora) >= fecha_desde, _clinic_date(Cita.fecha_hora) <= fecha_hasta)
        .group_by(Doctor.id, Doctor.nombre, Doctor.color_agenda)
        .order_by(func.count(Cita.id).desc())
    )
    clinic_filter = _clinic_condition(Cita, current_user)
    if clinic_filter is not None:
        stmt = stmt.where(clinic_filter)
    rows = await db.execute(stmt)
    dias = max((fecha_hasta - fecha_desde).days + 1, 1)
    minutos_teoricos = dias * 8 * 60
    return [
        {
            "doctor_id": str(r.id),
            "doctor": r.nombre,
            "color": r.color_agenda,
            "total": int(r.total or 0),
            "atendidas": int(r.atendidas or 0),
            "faltas": int(r.faltas or 0),
            "ocupacion_pct": round((int(r.minutos or 0) / minutos_teoricos) * 100, 2) if minutos_teoricos else 0,
        }
        for r in rows
    ]


async def _pacientes_deuda(db: AsyncSession, current_user: CurrentUser, limit: int = 8) -> list[dict]:
    facturado_total = (
        select(func.coalesce(func.sum(Factura.total), Decimal("0")))
        .where(Factura.paciente_id == Paciente.id, Factura.estado != "anulada")
        .correlate(Paciente)
        .scalar_subquery()
    )
    cobrado_total = (
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0")))
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(Factura.paciente_id == Paciente.id, Factura.estado != "anulada", Cobro.anulado_at.is_(None))
        .correlate(Paciente)
        .scalar_subquery()
    )
    saldo = func.coalesce(facturado_total - cobrado_total, Decimal("0"))
    stmt = (
        select(Paciente.id, Paciente.num_historial, Paciente.nombre, Paciente.apellidos, saldo.label("saldo_pendiente"))
        .where(Paciente.activo == True, saldo > 0)  # noqa: E712
        .order_by(saldo.desc())
        .limit(limit)
    )
    stmt = _apply_clinic(stmt, Paciente, current_user)
    rows = await db.execute(stmt)
    return [
        {
            "id": str(r.id),
            "num_historial": r.num_historial,
            "nombre": r.nombre,
            "apellidos": r.apellidos,
            "saldo_pendiente": float(r.saldo_pendiente or 0),
        }
        for r in rows
    ]


async def _facturacion_mensual(db: AsyncSession, current_user: CurrentUser, anno: int) -> list[dict]:
    facturas_stmt = (
        select(
            func.extract("month", Factura.fecha).label("mes"),
            func.coalesce(func.sum(Factura.total), Decimal("0")).label("facturado"),
            func.count(Factura.id).label("num_facturas"),
        )
        .where(func.extract("year", Factura.fecha) == anno, Factura.estado != "anulada")
        .group_by(func.extract("month", Factura.fecha))
    )
    facturas_stmt = _apply_clinic(facturas_stmt, Factura, current_user)
    facturas = {int(r.mes): {"facturado": float(r.facturado or 0), "num_facturas": int(r.num_facturas or 0)} for r in await db.execute(facturas_stmt)}

    cobro_mes = func.extract("month", _clinic_date(Cobro.fecha))
    cobros_stmt = (
        select(
            cobro_mes.label("mes"),
            func.coalesce(func.sum(Cobro.importe), Decimal("0")).label("cobrado"),
        )
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(func.extract("year", _clinic_date(Cobro.fecha)) == anno, Cobro.anulado_at.is_(None), Factura.estado != "anulada")
        .group_by(cobro_mes)
    )
    clinic_filter = _clinic_condition(Factura, current_user)
    if clinic_filter is not None:
        cobros_stmt = cobros_stmt.where(clinic_filter)
    cobros = {int(r.mes): float(r.cobrado or 0) for r in await db.execute(cobros_stmt)}

    return [
        {
            "mes": mes,
            "facturado": facturas.get(mes, {}).get("facturado", 0),
            "cobrado": cobros.get(mes, 0),
            "num_facturas": facturas.get(mes, {}).get("num_facturas", 0),
        }
        for mes in range(1, 13)
    ]


@router.get("/ingresos", response_model=IngresosResponse)
async def ingresos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    desde: date = Query(...),
    hasta: date = Query(...),
) -> IngresosResponse:
    stmt = select(
        func.coalesce(func.sum(Factura.total), Decimal("0")),
        func.coalesce(func.sum(Factura.total).filter(Factura.tipo == "paciente"), Decimal("0")),
        func.coalesce(func.sum(Factura.total).filter(Factura.tipo != "paciente"), Decimal("0")),
    ).where(Factura.fecha >= desde, Factura.fecha <= hasta, Factura.estado != "anulada")
    stmt = _apply_clinic(stmt, Factura, current_user)
    total, pac, seg = (await db.execute(stmt)).one()
    return IngresosResponse(total=float(total), pac=float(pac), seg=float(seg))


@router.get("/kpis")
async def kpis_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
) -> dict:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return {
        "citas": await _citas_resumen(db, current_user, fecha_desde, fecha_hasta),
        "pacientes_nuevos": await _pacientes_nuevos(db, current_user, fecha_desde, fecha_hasta),
        "facturacion": await _facturacion_resumen(db, current_user, fecha_desde, fecha_hasta),
        "tratamientos_realizados": await _tratamientos_total(db, current_user, fecha_desde, fecha_hasta),
        "presupuestos": await _presupuestos_resumen(db, current_user, fecha_desde, fecha_hasta),
    }


@router.get("/dashboard")
async def dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    doctor_id: str | None = Query(default=None),
) -> dict:
    del doctor_id  # Preparado para filtros por doctor en la siguiente iteracion de UI.
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    kpis = await kpis_dashboard(db, current_user, fecha_desde, fecha_hasta)
    doctores = await _citas_doctores(db, current_user, fecha_desde, fecha_hasta)
    tratamientos = await _top_tratamientos(db, current_user, fecha_desde, fecha_hasta, limit=8)
    pacientes_deuda = await _pacientes_deuda(db, current_user, limit=8)
    ingresos_mensuales = await _facturacion_mensual(db, current_user, fecha_hasta.year)
    citas = kpis["citas"]
    facturacion = kpis["facturacion"]
    presupuestos = kpis["presupuestos"]
    return {
        "periodo": {"desde": fecha_desde.isoformat(), "hasta": fecha_hasta.isoformat()},
        "kpis": kpis,
        "series": {"ingresos_mensuales": ingresos_mensuales},
        "doctores": doctores,
        "tratamientos": tratamientos,
        "pacientes_deuda": pacientes_deuda,
        "alertas": {
            "citas_sin_confirmar": (
                citas["por_estado"].get("programada", 0)
                + citas["por_estado"].get("pending_confirmation", 0)
                + citas["por_estado"].get("reminder_sent", 0)
                + citas["por_estado"].get("pending_manual_review", 0)
            ),
            "pacientes_en_clinica": citas["por_estado"].get("en_clinica", 0),
            "faltas_periodo": citas["faltas"],
            "deuda_pendiente": facturacion["pendiente"],
            "presupuestos_pendientes": presupuestos["por_estado"].get("borrador", 0) + presupuestos["por_estado"].get("presentado", 0),
        },
    }


@router.get("/facturacion-mensual")
async def facturacion_mensual(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    anno: int | None = Query(default=None),
) -> list[dict]:
    return await _facturacion_mensual(db, current_user, anno or date.today().year)


@router.get("/top-tratamientos")
async def top_tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    limit: int = Query(10, ge=1, le=50),
) -> list[dict]:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return await _top_tratamientos(db, current_user, fecha_desde, fecha_hasta, limit=limit)


@router.get("/tratamientos")
async def tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
    limit: int = Query(10, ge=1, le=50),
) -> list[dict]:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return await _top_tratamientos(db, current_user, fecha_desde, fecha_hasta, limit=limit)


@router.get("/citas-por-doctor")
async def citas_por_doctor(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
) -> list[dict]:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return await _citas_doctores(db, current_user, fecha_desde, fecha_hasta)


@router.get("/doctores")
async def doctores(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
) -> list[dict]:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return await _citas_doctores(db, current_user, fecha_desde, fecha_hasta)


@router.get("/citas")
async def citas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
) -> dict:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    return await _citas_resumen(db, current_user, fecha_desde, fecha_hasta)


@router.get("/pacientes")
async def listado_pacientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    solo_activos: bool = Query(True),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    citas_count = (
        select(func.count(Cita.id))
        .where(Cita.paciente_id == Paciente.id)
        .correlate(Paciente)
        .scalar_subquery()
    )
    facturado_total = (
        select(func.coalesce(func.sum(Factura.total), Decimal("0")))
        .where(Factura.paciente_id == Paciente.id, Factura.estado != "anulada")
        .correlate(Paciente)
        .scalar_subquery()
    )
    cobrado_total = (
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0")))
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(Factura.paciente_id == Paciente.id, Factura.estado != "anulada", Cobro.anulado_at.is_(None))
        .correlate(Paciente)
        .scalar_subquery()
    )

    stmt = (
        select(
            Paciente.id,
            Paciente.num_historial,
            Paciente.nombre,
            Paciente.apellidos,
            Paciente.fecha_nacimiento,
            Paciente.activo,
            citas_count.label("total_citas"),
            func.coalesce(facturado_total - cobrado_total, Decimal("0")).label("saldo_pendiente"),
        )
        .order_by(Paciente.apellidos, Paciente.nombre)
        .limit(limit)
        .offset(offset)
    )
    stmt = _apply_clinic(stmt, Paciente, current_user)
    if solo_activos:
        stmt = stmt.where(Paciente.activo == True)  # noqa: E712

    rows = await db.execute(stmt)
    return [
        {
            "id": str(r.id),
            "num_historial": r.num_historial,
            "nombre": r.nombre,
            "apellidos": r.apellidos,
            "fecha_nacimiento": r.fecha_nacimiento.isoformat() if r.fecha_nacimiento else None,
            "activo": r.activo,
            "total_citas": int(r.total_citas or 0),
            "saldo_pendiente": float(r.saldo_pendiente or 0),
        }
        for r in rows
    ]


@router.get("/faltas")
async def listado_faltas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    fecha_desde: date | None = Query(default=None),
    fecha_hasta: date | None = Query(default=None),
) -> list[dict]:
    fecha_desde, fecha_hasta = _periodo(fecha_desde, fecha_hasta)
    stmt = (
        select(
            HistorialFaltas.tipo,
            HistorialFaltas.fecha,
            Paciente.id,
            Paciente.nombre,
            Paciente.apellidos,
            Paciente.num_historial,
        )
        .join(Paciente, Paciente.id == HistorialFaltas.paciente_id)
        .where(_clinic_date(HistorialFaltas.fecha) >= fecha_desde, _clinic_date(HistorialFaltas.fecha) <= fecha_hasta)
        .order_by(HistorialFaltas.fecha.desc())
    )
    clinic_filter = _clinic_condition(Paciente, current_user)
    if clinic_filter is not None:
        stmt = stmt.where(clinic_filter)
    rows = await db.execute(stmt)
    return [
        {
            "tipo": r.tipo,
            "fecha": r.fecha.isoformat(),
            "paciente_id": str(r.id),
            "paciente": f"{r.apellidos}, {r.nombre}",
            "num_historial": r.num_historial,
        }
        for r in rows
    ]
