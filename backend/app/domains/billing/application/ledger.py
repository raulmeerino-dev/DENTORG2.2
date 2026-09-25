"""Canonical charges, received money and allocations. No implicit invoice issuance."""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import TokenData, ensure_clinic_access
from app.domains.billing.persistence.cuenta import AplicacionPago, CargoPaciente, OperacionCheckout
from app.domains.billing.persistence.factura import (
    Cobro,
    Factura,
    FacturaLinea,
    PagoAnticipadoPaciente,
)
from app.domains.billing.schemas.cuenta import (
    AplicacionResponse,
    CargoResponse,
    CuentaResponse,
    MovimientoResponse,
)
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.clinical.persistence.tratamiento import TratamientoCatalogo
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.application.clinic_time import clinic_datetime
from app.domains.scheduling.persistence.cita import Cita
from app.domains.treatment_plans.persistence.presupuesto import PresupuestoLinea

ZERO = Decimal("0.00")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def account_patient(db: AsyncSession, patient_id: UUID, user: TokenData, *, lock=False):
    if user.rol not in {"admin", "recepcion"}:
        raise HTTPException(403, "Tu perfil no permite gestionar la cuenta del paciente.")
    stmt = (
        select(Paciente).where(Paciente.id == patient_id).execution_options(populate_existing=True)
    )
    patient = await db.scalar(stmt.with_for_update() if lock else stmt)
    if not patient:
        raise HTTPException(404, "Paciente no encontrado")
    ensure_clinic_access(user, patient.clinica_id)
    return patient


async def ensure_history_charge(db: AsyncSession, history: HistorialClinico, *, motivo_cero=None):
    """Called in the clinical transaction, once for every performed treatment."""
    if history.estado not in {"realizado", "facturado"}:
        return
    # Same account lock as checkout, including legacy clinical entry points.
    await db.scalar(select(Paciente.id).where(Paciente.id == history.paciente_id).with_for_update())
    existing = await db.scalar(
        select(CargoPaciente).where(CargoPaciente.historial_id == history.id)
    )
    if existing:
        return existing
    if history.presupuesto_linea_id:
        planned = await db.scalar(
            select(CargoPaciente).where(
                CargoPaciente.presupuesto_linea_id == history.presupuesto_linea_id,
                CargoPaciente.historial_id.is_(None),
                CargoPaciente.estado == "activo",
            )
        )
        if planned:
            if history.importe is not None and money(history.importe) != planned.base:
                raise HTTPException(
                    409, "El importe realizado difiere del cargo ya documentado del presupuesto."
                )
            planned.historial_id, planned.cita_id, planned.doctor_id = (
                history.id,
                history.cita_id,
                history.doctor_id,
            )
            planned.tratamiento_id, planned.pieza_dental, planned.caras = (
                history.tratamiento_id,
                history.pieza_dental,
                history.caras,
            )
            history.importe = planned.base
            if planned.factura_id:
                history.factura_id = planned.factura_id
                history.estado = "facturado"
                if planned.factura_linea_id:
                    (await db.get(FacturaLinea, planned.factura_linea_id)).historial_id = history.id
            return planned
    # Pre-migration billed acts are represented by their immutable invoice snapshot.
    if history.factura_id or await db.scalar(
        select(FacturaLinea.id).where(FacturaLinea.historial_id == history.id).limit(1)
    ):
        return None
    patient = await db.get(Paciente, history.paciente_id)
    treatment = await db.get(TratamientoCatalogo, history.tratamiento_id)
    line = (
        await db.get(PresupuestoLinea, history.presupuesto_linea_id)
        if history.presupuesto_linea_id
        else None
    )
    if not treatment:
        return None  # A clinical note is not a billable treatment.
    base = money(history.importe if history.importe is not None else treatment.precio)
    if base < 0:
        raise HTTPException(422, "El importe realizado no puede ser negativo.")
    history.importe = base
    vat = treatment.iva_porcentaje
    values = dict(
        paciente_id=history.paciente_id,
        clinica_id=patient.clinica_id,
        historial_id=history.id,
        cita_id=history.cita_id,
        doctor_id=history.doctor_id,
        tratamiento_id=history.tratamiento_id,
        presupuesto_linea_id=history.presupuesto_linea_id,
        concepto=treatment.nombre,
        fecha=history.fecha,
        pieza_dental=history.pieza_dental,
        caras=history.caras,
        base=base,
        iva_porcentaje=vat,
        descuento_porcentaje=line.descuento_porcentaje if line else ZERO,
        importe=base + money(base * vat / 100),
        estado="activo",
        origen="tratamiento",
        motivo_cero=(
            motivo_cero or history.observaciones or "Importe cero registrado por el profesional"
        )[:500]
        if base == 0
        else None,
    )
    await db.execute(
        insert(CargoPaciente)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["historial_id"])
    )
    return await db.scalar(select(CargoPaciente).where(CargoPaciente.historial_id == history.id))


@dataclass
class Ledger:
    charges: list
    payments: list
    advances: list
    allocations: list

    def active_source(self, allocation):
        source = next(
            (
                p
                for p in (self.payments if allocation.cobro_id else self.advances)
                if p.id == (allocation.cobro_id or allocation.anticipo_id)
            ),
            None,
        )
        return source is not None and source.anulado_at is None

    def applied(self, charge_id):
        return sum(
            (
                a.importe
                for a in self.allocations
                if a.cargo_id == charge_id and self.active_source(a)
            ),
            ZERO,
        )

    def used(self, source_id):
        active_ids = {c.id for c in self.charges if c.estado == "activo"}
        return sum(
            (
                a.importe
                for a in self.allocations
                if (a.cobro_id or a.anticipo_id) == source_id and a.cargo_id in active_ids
            ),
            ZERO,
        )

    def remaining(self, charge):
        return (
            max(ZERO, (charge.importe or ZERO) - self.applied(charge.id))
            if charge.estado == "activo"
            else ZERO
        )

    @property
    def pending(self):
        return sum((self.remaining(c) for c in self.charges), ZERO)

    @property
    def credit(self):
        return sum(
            (
                max(ZERO, p.importe - self.used(p.id))
                for p in [*self.payments, *self.advances]
                if not p.anulado_at
            ),
            ZERO,
        )

    @property
    def balance(self):
        return self.pending - self.credit

    @property
    def version(self):
        snapshot = [(str(c.id), str(c.importe), c.estado, str(c.factura_id)) for c in self.charges]
        snapshot += [
            (str(p.id), str(p.importe), str(p.anulado_at)) for p in [*self.payments, *self.advances]
        ]
        snapshot += [(str(a.id), str(a.importe), str(a.cargo_id)) for a in self.allocations]
        return hashlib.sha256(json.dumps(sorted(snapshot)).encode()).hexdigest()


async def load_ledger(db: AsyncSession, patient_id: UUID, user=None) -> Ledger:
    await db.flush()
    charges = list(
        (
            await db.scalars(
                select(CargoPaciente)
                .where(CargoPaciente.paciente_id == patient_id)
                .order_by(CargoPaciente.fecha, CargoPaciente.created_at, CargoPaciente.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    payments = list(
        (
            await db.scalars(
                select(Cobro)
                .outerjoin(Factura, Factura.id == Cobro.factura_id)
                .where(
                    (Cobro.paciente_id == patient_id)
                    | ((Cobro.paciente_id.is_(None)) & (Factura.paciente_id == patient_id))
                )
                .options(selectinload(Cobro.forma_pago))
                .order_by(Cobro.fecha, Cobro.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    advances = list(
        (
            await db.scalars(
                select(PagoAnticipadoPaciente)
                .where(PagoAnticipadoPaciente.paciente_id == patient_id)
                .options(selectinload(PagoAnticipadoPaciente.forma_pago))
                .order_by(PagoAnticipadoPaciente.fecha, PagoAnticipadoPaciente.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    allocations = list(
        (
            await db.scalars(
                select(AplicacionPago)
                .join(CargoPaciente, CargoPaciente.id == AplicacionPago.cargo_id)
                .where(CargoPaciente.paciente_id == patient_id)
            )
        ).all()
    )
    if user is not None and user.rol != "admin":
        charges = [c for c in charges if c.clinica_id in {None, user.clinica_id}]
        payments = [p for p in payments if p.clinica_id in {None, user.clinica_id}]
        advances = [p for p in advances if p.clinica_id in {None, user.clinica_id}]
        charge_ids = {c.id for c in charges}
        allocations = [a for a in allocations if a.cargo_id in charge_ids]
    return Ledger(charges, payments, advances, allocations)


async def read_account(
    db: AsyncSession, patient_id: UUID, user: TokenData, cita_id: UUID | None = None
):
    patient = await account_patient(db, patient_id, user)
    if not cita_id:
        exits = (
            await db.scalars(
                select(Cita)
                .where(
                    Cita.paciente_id == patient_id,
                    Cita.estado == "atendida",
                    Cita.finalizada_at.is_not(None),
                    Cita.salida_resuelta_at.is_(None),
                )
                .limit(2)
            )
        ).all()
        if len(exits) == 1:
            cita_id = exits[0].id
    visit = await db.get(Cita, cita_id) if cita_id else None
    if cita_id and (not visit or visit.paciente_id != patient_id):
        raise HTTPException(404, "Visita no encontrada para el paciente")
    if visit:
        ensure_clinic_access(user, visit.clinica_id)
    ledger = await load_ledger(db, patient_id, user)
    today = clinic_datetime(datetime.now(timezone.utc)).date()
    active = [c for c in ledger.charges if c.estado == "activo"]
    current = (
        [c for c in active if c.cita_id == cita_id]
        if cita_id
        else [c for c in active if c.fecha == today]
    )
    current_pending = sum((ledger.remaining(c) for c in current), ZERO)
    sources = [*ledger.payments, *ledger.advances]
    operators = dict(
        (
            await db.execute(
                select(Usuario.id, Usuario.nombre).where(
                    Usuario.id.in_({p.usuario_id for p in sources})
                )
            )
        ).all()
    )
    operations = (
        await db.scalars(
            select(OperacionCheckout).where(
                OperacionCheckout.paciente_id == patient_id,
                OperacionCheckout.id.in_({p.request_id for p in ledger.payments if p.request_id}),
            )
        )
    ).all()
    balances = {
        str(op.resultado.get("cobro_id")): op.resultado.get("saldo_pendiente")
        for op in operations
        # A global/admin receipt may include other clinics for a shared legacy patient.
        if user.rol == "admin" or (op.clinica_id is not None and op.clinica_id == user.clinica_id)
    }
    active_ids = {c.id for c in active}
    applications = {}
    for allocation in ledger.allocations:
        if allocation.cargo_id in active_ids:
            applications.setdefault(allocation.cobro_id or allocation.anticipo_id, []).append(
                AplicacionResponse(cargo_id=allocation.cargo_id, importe=allocation.importe)
            )
    movements = [
        MovimientoResponse(
            id=p.id,
            tipo=kind,
            fecha=p.fecha,
            importe=p.importe,
            forma_pago=p.forma_pago.nombre,
            aplicado=ZERO if p.anulado_at else ledger.used(p.id),
            anulado=bool(p.anulado_at),
            factura_id=getattr(p, "factura_id", None),
            concepto=getattr(p, "concepto", None),
            notas=p.notas,
            motivo_anulacion=p.motivo_anulacion,
            registrado_por=operators.get(p.usuario_id),
            aplicaciones=applications.get(p.id, []),
            saldo_tras_operacion=balances.get(str(p.id)),
        )
        for kind, sources in [("cobro", ledger.payments), ("anticipo", ledger.advances)]
        for p in sources
    ]
    return CuentaResponse(
        paciente_id=patient_id,
        paciente_nombre=f"{patient.nombre} {patient.apellidos}".strip(),
        version=ledger.version,
        cargos=[
            CargoResponse.model_validate(c).model_copy(
                update={"cobrado": ledger.applied(c.id), "pendiente": ledger.remaining(c)}
            )
            for c in active
        ],
        movimientos=sorted(movements, key=lambda p: p.fecha, reverse=True),
        total_cargos=sum((c.importe or ZERO for c in active), ZERO),
        total_cobrado=sum(
            (p.importe for p in [*ledger.payments, *ledger.advances] if not p.anulado_at), ZERO
        ),
        pendiente_cargos=ledger.pending,
        saldo_favor=ledger.credit,
        saldo=ledger.balance,
        realizado_hoy=sum((c.importe or ZERO for c in current), ZERO),
        saldo_anterior=ledger.pending - current_pending,
        sin_valorar=sum(c.importe is None for c in active),
        cita_id=cita_id,
        doctor_id=visit.doctor_id if visit else None,
        gabinete_id=visit.gabinete_id if visit else None,
        pendiente_salida=bool(visit and visit.finalizada_at and not visit.salida_resuelta_at),
    )


async def allocate(db, ledger: Ledger, source, amount: Decimal, *, advance=False, charge_ids=None):
    remaining = amount
    for charge in ledger.charges:
        if charge_ids is not None and charge.id not in charge_ids:
            continue
        applied = min(remaining, ledger.remaining(charge))
        if applied <= 0:
            continue
        existing = next(
            (
                a
                for a in ledger.allocations
                if a.cargo_id == charge.id
                and (a.anticipo_id if advance else a.cobro_id) == source.id
            ),
            None,
        )
        if existing:
            existing.importe += applied
        else:
            allocation = AplicacionPago(
                cargo_id=charge.id,
                importe=applied,
                cobro_id=None if advance else source.id,
                anticipo_id=source.id if advance else None,
            )
            db.add(allocation)
            ledger.allocations.append(allocation)
        remaining -= applied
        if remaining <= 0:
            break
    await db.flush()
    return amount - remaining


async def sync_invoice_states(db, ledger: Ledger):
    invoice_ids = {c.factura_id for c in ledger.charges if c.factura_id}
    for invoice in (await db.scalars(select(Factura).where(Factura.id.in_(invoice_ids)))).all():
        if invoice.estado in {"anulada", "borrador"}:
            continue
        paid = sum(
            (ledger.applied(c.id) for c in ledger.charges if c.factura_id == invoice.id), ZERO
        )
        invoice.estado = "pagada" if paid >= invoice.total else "parcial" if paid > 0 else "emitida"
