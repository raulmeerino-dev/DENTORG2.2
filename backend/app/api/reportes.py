"""
Router de reportes y listados — Fase 7.
KPIs, listados filtrables y estadísticas para el panel de control.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, cast, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser
from app.database import get_db
from app.models.cita import Cita, HistorialFaltas
from app.models.factura import Cobro, Factura
from app.models.historial import HistorialClinico
from app.models.paciente import Paciente
from app.models.presupuesto import Presupuesto
from app.models.tratamiento import TratamientoCatalogo

router = APIRouter()


# ─── KPIs del dashboard ───────────────────────────────────────────────────────

@router.get("/kpis")
async def kpis_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    fecha_desde: date = Query(default=None),
    fecha_hasta: date = Query(default=None),
) -> dict:
    """
    Devuelve los KPIs principales para el dashboard:
    - Citas totales / por estado
    - Pacientes nuevos
    - Facturación total / cobrada / pendiente
    - Tratamientos realizados
    - Presupuestos creados / aceptados
    """
    hoy = date.today()
    if fecha_desde is None:
        fecha_desde = date(hoy.year, hoy.month, 1)  # primer día del mes actual
    if fecha_hasta is None:
        fecha_hasta = hoy

    rango = and_(
        cast(Cita.fecha_hora, Date) >= fecha_desde,
        cast(Cita.fecha_hora, Date) <= fecha_hasta,
    )

    # Citas por estado
    citas_result = await db.execute(
        select(Cita.estado, func.count(Cita.id))
        .where(rango)
        .group_by(Cita.estado)
    )
    citas_por_estado = dict(citas_result.all())
    total_citas = sum(citas_por_estado.values())

    # Pacientes nuevos en el rango
    nuevos_result = await db.execute(
        select(func.count(Paciente.id)).where(
            and_(
                cast(Paciente.created_at, Date) >= fecha_desde,
                cast(Paciente.created_at, Date) <= fecha_hasta,
                Paciente.activo == True,  # noqa: E712
            )
        )
    )
    pacientes_nuevos = nuevos_result.scalar_one()

    # Facturación
    facturas_result = await db.execute(
        select(
            func.count(Factura.id),
            func.coalesce(func.sum(Factura.total), Decimal("0")),
        ).where(
            and_(
                Factura.fecha >= fecha_desde,
                Factura.fecha <= fecha_hasta,
                Factura.estado != "anulada",
            )
        )
    )
    num_facturas, total_facturado = facturas_result.one()

    cobros_result = await db.execute(
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0"))).where(
            and_(
                cast(Cobro.fecha, Date) >= fecha_desde,
                cast(Cobro.fecha, Date) <= fecha_hasta,
            )
        )
    )
    total_cobrado = cobros_result.scalar_one()

    # Tratamientos realizados
    tratamientos_result = await db.execute(
        select(func.count(HistorialClinico.id)).where(
            and_(
                HistorialClinico.fecha >= fecha_desde,
                HistorialClinico.fecha <= fecha_hasta,
            )
        )
    )
    total_tratamientos = tratamientos_result.scalar_one()

    # Presupuestos
    presup_result = await db.execute(
        select(Presupuesto.estado, func.count(Presupuesto.id))
        .where(
            and_(
                Presupuesto.fecha >= fecha_desde,
                Presupuesto.fecha <= fecha_hasta,
            )
        )
        .group_by(Presupuesto.estado)
    )
    presup_por_estado = dict(presup_result.all())

    return {
        "citas": {
            "total": total_citas,
            "por_estado": citas_por_estado,
            "asistencia": citas_por_estado.get("atendida", 0),
            "faltas": citas_por_estado.get("falta", 0),
        },
        "pacientes_nuevos": pacientes_nuevos,
        "facturacion": {
            "num_facturas": num_facturas,
            "total_facturado": float(total_facturado),
            "total_cobrado": float(total_cobrado),
            "pendiente": float(total_facturado - total_cobrado),
        },
        "tratamientos_realizados": total_tratamientos,
        "presupuestos": {
            "total": sum(presup_por_estado.values()),
            "por_estado": presup_por_estado,
        },
    }


# ─── Evolución mensual de facturación ────────────────────────────────────────

@router.get("/facturacion-mensual")
async def facturacion_mensual(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    anno: int = Query(default=None),
) -> list[dict]:
    """Facturación y cobros por mes para un año dado."""
    if anno is None:
        anno = date.today().year
    rows = await db.execute(
        select(
            func.extract("month", Factura.fecha).label("mes"),
            func.coalesce(func.sum(Factura.total), Decimal("0")).label("facturado"),
            func.count(Factura.id).label("num_facturas"),
        )
        .where(
            and_(
                func.extract("year", Factura.fecha) == anno,
                Factura.estado != "anulada",
            )
        )
        .group_by(func.extract("month", Factura.fecha))
        .order_by(func.extract("month", Factura.fecha))
    )
    return [
        {"mes": int(r.mes), "facturado": float(r.facturado), "num_facturas": r.num_facturas}
        for r in rows
    ]


# ─── Top tratamientos ─────────────────────────────────────────────────────────

@router.get("/top-tratamientos")
async def top_tratamientos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    fecha_desde: date = Query(default=None),
    fecha_hasta: date = Query(default=None),
    limit: int = Query(10, ge=1, le=50),
) -> list[dict]:
    """Los tratamientos más realizados en el rango de fechas."""
    hoy = date.today()
    if fecha_desde is None:
        fecha_desde = date(hoy.year, 1, 1)
    if fecha_hasta is None:
        fecha_hasta = hoy
    rows = await db.execute(
        select(
            TratamientoCatalogo.nombre,
            func.count(HistorialClinico.id).label("cantidad"),
        )
        .join(TratamientoCatalogo, TratamientoCatalogo.id == HistorialClinico.tratamiento_id)
        .where(
            and_(
                HistorialClinico.fecha >= fecha_desde,
                HistorialClinico.fecha <= fecha_hasta,
            )
        )
        .group_by(TratamientoCatalogo.nombre)
        .order_by(func.count(HistorialClinico.id).desc())
        .limit(limit)
    )
    return [{"tratamiento": r.nombre, "cantidad": r.cantidad} for r in rows]


# ─── Citas por doctor ─────────────────────────────────────────────────────────

@router.get("/citas-por-doctor")
async def citas_por_doctor(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    fecha_desde: date = Query(default=None),
    fecha_hasta: date = Query(default=None),
) -> list[dict]:
    """Resumen de citas por doctor en el rango de fechas."""
    hoy = date.today()
    if fecha_desde is None:
        fecha_desde = date(hoy.year, hoy.month, 1)
    if fecha_hasta is None:
        fecha_hasta = hoy
    from app.models.doctor import Doctor
    rows = await db.execute(
        select(
            Doctor.id,
            Doctor.nombre,
            Doctor.color_agenda,
            func.count(Cita.id).label("total"),
            func.sum(
                func.cast(Cita.estado == "atendida", func.Integer)
            ).label("atendidas"),
            func.sum(
                func.cast(Cita.estado == "falta", func.Integer)
            ).label("faltas"),
        )
        .join(Doctor, Doctor.id == Cita.doctor_id)
        .where(
            and_(
                cast(Cita.fecha_hora, Date) >= fecha_desde,
                cast(Cita.fecha_hora, Date) <= fecha_hasta,
            )
        )
        .group_by(Doctor.id, Doctor.nombre, Doctor.color_agenda)
        .order_by(func.count(Cita.id).desc())
    )
    return [
        {
            "doctor_id": str(r.id) if hasattr(r, "id") else None,
            "doctor": r.nombre,
            "color": r.color_agenda,
            "total": r.total,
            "atendidas": int(r.atendidas or 0),
            "faltas": int(r.faltas or 0),
        }
        for r in rows
    ]


# ─── Listado de pacientes con estadísticas ────────────────────────────────────

@router.get("/pacientes")
async def listado_pacientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    solo_activos: bool = Query(True),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """Listado de pacientes con conteo de citas y facturas pendientes."""
    citas_count = (
        select(func.count(Cita.id))
        .where(Cita.paciente_id == Paciente.id)
        .correlate(Paciente)
        .scalar_subquery()
    )
    facturado_total = (
        select(func.coalesce(func.sum(Factura.total), Decimal("0")))
        .where(
            and_(
                Factura.paciente_id == Paciente.id,
                Factura.estado != "anulada",
            )
        )
        .correlate(Paciente)
        .scalar_subquery()
    )
    cobrado_total = (
        select(func.coalesce(func.sum(Cobro.importe), Decimal("0")))
        .join(Factura, Factura.id == Cobro.factura_id)
        .where(
            and_(
                Factura.paciente_id == Paciente.id,
                Factura.estado != "anulada",
            )
        )
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
            "total_citas": r.total_citas,
            "saldo_pendiente": float(r.saldo_pendiente or 0),
        }
        for r in rows
    ]


# ─── Faltas / inasistencias por período ───────────────────────────────────────

@router.get("/faltas")
async def listado_faltas(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
    fecha_desde: date = Query(default=None),
    fecha_hasta: date = Query(default=None),
) -> list[dict]:
    """Listado de faltas y anulaciones del período."""
    hoy = date.today()
    if fecha_desde is None:
        fecha_desde = date(hoy.year, hoy.month, 1)
    if fecha_hasta is None:
        fecha_hasta = hoy
    rows = await db.execute(
        select(
            HistorialFaltas.tipo,
            HistorialFaltas.fecha,
            Paciente.id,
            Paciente.nombre,
            Paciente.apellidos,
            Paciente.num_historial,
        )
        .join(Paciente, Paciente.id == HistorialFaltas.paciente_id)
        .where(
            and_(
                cast(HistorialFaltas.fecha, Date) >= fecha_desde,
                cast(HistorialFaltas.fecha, Date) <= fecha_hasta,
            )
        )
        .order_by(HistorialFaltas.fecha.desc())
    )
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
