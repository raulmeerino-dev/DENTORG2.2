"""Shared SQL economic projections for account, reports and reception."""

from sqlalchemy import func, select

from app.domains.billing.persistence.cuenta import AplicacionPago, CargoPaciente
from app.domains.billing.persistence.factura import Cobro, Factura, PagoAnticipadoPaciente
from app.domains.patients.persistence.paciente import Paciente


def account_totals(user=None):
    def scope(column):
        return (
            []
            if user is None or user.rol == "admin"
            else [(column == user.clinica_id) | column.is_(None)]
        )

    charges = (
        select(func.coalesce(func.sum(CargoPaciente.importe), 0))
        .where(
            CargoPaciente.paciente_id == Paciente.id,
            CargoPaciente.estado == "activo",
            *scope(CargoPaciente.clinica_id),
        )
        .correlate(Paciente)
        .scalar_subquery()
    )
    paid = (
        select(func.coalesce(func.sum(Cobro.importe), 0))
        .outerjoin(Factura, Factura.id == Cobro.factura_id)
        .where(
            func.coalesce(Cobro.paciente_id, Factura.paciente_id) == Paciente.id,
            Cobro.anulado_at.is_(None),
            *scope(func.coalesce(Cobro.clinica_id, Factura.clinica_id)),
        )
        .correlate(Paciente)
        .scalar_subquery()
    )
    advances = (
        select(func.coalesce(func.sum(PagoAnticipadoPaciente.importe), 0))
        .where(
            PagoAnticipadoPaciente.paciente_id == Paciente.id,
            PagoAnticipadoPaciente.anulado_at.is_(None),
            *scope(PagoAnticipadoPaciente.clinica_id),
        )
        .correlate(Paciente)
        .scalar_subquery()
    )
    return charges, paid + advances


def invoice_paid():
    allocated = select(func.coalesce(func.sum(AplicacionPago.importe), 0)).join(
        CargoPaciente, CargoPaciente.id == AplicacionPago.cargo_id
    )
    allocated = allocated.outerjoin(Cobro, Cobro.id == AplicacionPago.cobro_id).outerjoin(
        PagoAnticipadoPaciente, PagoAnticipadoPaciente.id == AplicacionPago.anticipo_id
    )
    return (
        allocated.where(
            CargoPaciente.factura_id == Factura.id,
            ((Cobro.id.is_not(None)) & Cobro.anulado_at.is_(None))
            | (
                (PagoAnticipadoPaciente.id.is_not(None))
                & PagoAnticipadoPaciente.anulado_at.is_(None)
            ),
        )
        .correlate(Factura)
        .scalar_subquery()
    )
