"""Invoice documents describe charges; issuing them never duplicates patient debt."""

from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.domains.billing.application.ledger import (
    ZERO,
    account_patient,
    allocate,
    load_ledger,
    money,
    sync_invoice_states,
)
from app.domains.billing.persistence.cuenta import AplicacionPago, CargoPaciente
from app.domains.billing.persistence.factura import (
    Cobro,
    Factura,
    FacturaLinea,
    FormaPago,
    PagoAnticipadoPaciente,
)
from app.domains.billing.schemas.factura import CobroResponse, FacturaResponse
from app.domains.clinical.persistence.historial import HistorialClinico


async def link_invoice_charges(db, invoice, *, cargo_ids=None, user=None):
    lines = list(
        (await db.scalars(select(FacturaLinea).where(FacturaLinea.factura_id == invoice.id))).all()
    )
    requested = list(
        (await db.scalars(select(CargoPaciente).where(CargoPaciente.id.in_(cargo_ids or [])))).all()
    )
    by_history = {c.historial_id: c for c in requested if c.historial_id}
    if cargo_ids and (
        len(requested) != len(set(cargo_ids))
        or any(c.paciente_id != invoice.paciente_id or c.factura_id for c in requested)
    ):
        raise HTTPException(
            409, "Los cargos han cambiado o ya tienen factura. Actualiza la cuenta."
        )
    for line in lines:
        history = await db.get(HistorialClinico, line.historial_id) if line.historial_id else None
        if line.historial_id and (not history or history.paciente_id != invoice.paciente_id):
            raise HTTPException(422, "El tratamiento no pertenece al paciente de la factura.")
        charge = by_history.get(line.historial_id)
        if not charge and line.historial_id:
            charge = await db.scalar(
                select(CargoPaciente).where(CargoPaciente.historial_id == line.historial_id)
            )
        if not charge:
            charge = await db.scalar(
                select(CargoPaciente).where(CargoPaciente.factura_linea_id == line.id)
            )
        if charge:
            if charge.factura_id and charge.factura_id != invoice.id:
                raise HTTPException(409, "Este cargo ya está documentado en otra factura.")
            if (
                charge.importe != line.subtotal
                and user
                and cargo_ids is None
                and not charge.factura_id
            ):
                ledger = await load_ledger(db, invoice.paciente_id)
                if ledger.applied(charge.id) == 0 and charge.importe is not None:
                    from app.core.audit_log import write_audit_log

                    old_base, old_total = charge.base, charge.importe
                    charge.base = money(line.precio_unitario * line.cantidad)
                    charge.importe = line.subtotal
                    charge.iva_porcentaje = line.iva_porcentaje
                    history.importe = charge.base
                    if charge.base == 0:
                        charge.motivo_cero = "Bonificación aplicada al documentar el tratamiento"
                    await write_audit_log(
                        db,
                        user=user,
                        action="CARGO_AJUSTE_FACTURACION",
                        entity_type="cargos_paciente",
                        entity_id=charge.id,
                        clinica_id=charge.clinica_id,
                        old_values={"base": str(old_base), "importe": str(old_total)},
                        new_values={
                            "base": str(charge.base),
                            "importe": str(charge.importe),
                            "factura_id": str(invoice.id),
                        },
                    )
            if charge.estado != "activo" or charge.importe != line.subtotal:
                raise HTTPException(
                    409, "El importe de la factura debe coincidir con el cargo realizado."
                )
            charge.factura_id, charge.factura_linea_id = invoice.id, line.id
        else:
            if history and (
                history.factura_id
                or await db.scalar(
                    select(FacturaLinea.id)
                    .where(
                        FacturaLinea.historial_id == history.id,
                        FacturaLinea.factura_id != invoice.id,
                    )
                    .limit(1)
                )
            ):
                raise HTTPException(409, "El tratamiento ya tiene una factura relacionada.")
            charge = CargoPaciente(
                paciente_id=invoice.paciente_id,
                clinica_id=invoice.clinica_id,
                historial_id=line.historial_id,
                factura_id=invoice.id,
                factura_linea_id=line.id,
                concepto=line.concepto,
                fecha=history.fecha if history else invoice.fecha,
                base=money(line.precio_unitario * line.cantidad),
                iva_porcentaje=line.iva_porcentaje,
                descuento_porcentaje=ZERO,
                importe=line.subtotal,
                estado="activo",
                origen="tratamiento" if history else "servicio",
                doctor_id=history.doctor_id if history else None,
                cita_id=history.cita_id if history else None,
                tratamiento_id=history.tratamiento_id if history else None,
                pieza_dental=history.pieza_dental if history else None,
                caras=history.caras if history else None,
                motivo_cero="Servicio sin coste documentado" if line.subtotal == 0 else None,
            )
            db.add(charge)
        if history:
            history.factura_id = invoice.id
            history.estado = "facturado"
    if not lines and invoice.total:
        db.add(
            CargoPaciente(
                paciente_id=invoice.paciente_id,
                clinica_id=invoice.clinica_id,
                factura_id=invoice.id,
                factura_legacy_id=invoice.id,
                concepto=f"Factura {invoice.serie}-{invoice.numero}",
                fecha=invoice.fecha,
                base=invoice.subtotal,
                iva_porcentaje=ZERO,
                descuento_porcentaje=ZERO,
                importe=invoice.total,
                estado="activo",
                origen="factura_historica",
            )
        )
    await sync_invoice_states(db, await load_ledger(db, invoice.paciente_id))


def _invoice_projection(invoice, charges, allocations, cash, advances):
    response = FacturaResponse.model_validate(invoice)
    ids = {c.id for c in charges if c.factura_id == invoice.id}
    if not ids:
        return response
    payments = []
    for advance, sources in [(False, cash), (True, advances)]:
        for source in sources:
            allocated = sum(
                (
                    a.importe
                    for a in allocations
                    if a.cargo_id in ids and (a.anticipo_id if advance else a.cobro_id) == source.id
                ),
                Decimal("0"),
            )
            if allocated:
                payments.append(
                    CobroResponse(
                        id=source.id,
                        factura_id=invoice.id,
                        fecha=source.fecha,
                        importe=allocated,
                        forma_pago_id=source.forma_pago_id,
                        forma_pago=source.forma_pago,
                        usuario_id=source.usuario_id,
                        notas=source.notas,
                        anulado_at=source.anulado_at,
                        anulado_por_id=source.anulado_por_id,
                        motivo_anulacion=source.motivo_anulacion,
                        origen="anticipo" if advance else "cobro",
                    )
                )
    return response.model_copy(update={"cobros": payments})


async def invoice_responses(db, invoices):
    """Batch document projections, avoiding a whole account query per invoice."""
    invoice_ids = [i.id for i in invoices]
    charges = (
        await db.scalars(select(CargoPaciente).where(CargoPaciente.factura_id.in_(invoice_ids)))
    ).all()
    allocations = (
        await db.scalars(
            select(AplicacionPago).where(AplicacionPago.cargo_id.in_([c.id for c in charges]))
        )
    ).all()
    cash = (
        await db.scalars(
            select(Cobro)
            .where(Cobro.id.in_({a.cobro_id for a in allocations if a.cobro_id}))
            .options(selectinload(Cobro.forma_pago))
        )
    ).all()
    advances = (
        await db.scalars(
            select(PagoAnticipadoPaciente)
            .where(
                PagoAnticipadoPaciente.id.in_({a.anticipo_id for a in allocations if a.anticipo_id})
            )
            .options(selectinload(PagoAnticipadoPaciente.forma_pago))
        )
    ).all()
    charge_map = {c.id: c for c in charges}
    cash_map, advance_map = {p.id: p for p in cash}, {p.id: p for p in advances}
    by_invoice_charges, by_invoice_allocations = {}, {}
    for charge in charges:
        by_invoice_charges.setdefault(charge.factura_id, []).append(charge)
    for allocation in allocations:
        by_invoice_allocations.setdefault(charge_map[allocation.cargo_id].factura_id, []).append(
            allocation
        )
    results = []
    for invoice in invoices:
        apps = by_invoice_allocations.get(invoice.id, [])
        received = [cash_map[id_] for id_ in {a.cobro_id for a in apps if a.cobro_id}]
        prepaid = [advance_map[id_] for id_ in {a.anticipo_id for a in apps if a.anticipo_id}]
        results.append(
            _invoice_projection(
                invoice, by_invoice_charges.get(invoice.id, []), apps, received, prepaid
            )
        )
    return results


async def invoice_response(db, invoice):
    return (await invoice_responses(db, [invoice]))[0]


async def receive_invoice_payment(db, invoice_id, data, user):
    from datetime import datetime, timezone

    from app.domains.billing.application.facturas import _get_factura_or_404
    from app.domains.billing.application.verifactu_service import registrar_evento_sif

    invoice = await db.get(Factura, invoice_id)
    if not invoice:
        raise HTTPException(404, "Factura no encontrada")
    patient = await account_patient(db, invoice.paciente_id, user, lock=True)
    invoice = await _get_factura_or_404(db, invoice_id)
    if data.request_id:
        old = await db.scalar(select(Cobro).where(Cobro.request_id == data.request_id))
        if old:
            if (
                old.factura_id != invoice_id
                or old.importe != data.importe
                or old.forma_pago_id != data.forma_pago_id
            ):
                raise HTTPException(409, "La petición ya corresponde a otro cobro.")
            return await invoice_response(db, invoice)
    if invoice.estado == "anulada":
        raise HTTPException(409, "No se puede cobrar una factura anulada")
    method = await db.get(FormaPago, data.forma_pago_id)
    if not method or not method.activo:
        raise HTTPException(422, "Selecciona una forma de pago activa.")
    ledger = await load_ledger(db, patient.id)
    charge_ids = {c.id for c in ledger.charges if c.factura_id == invoice.id}
    if not charge_ids:
        await link_invoice_charges(db, invoice)
        ledger = await load_ledger(db, patient.id)
        charge_ids = {c.id for c in ledger.charges if c.factura_id == invoice.id}
        for old in ledger.payments:
            if old.factura_id == invoice.id and not old.anulado_at:
                await allocate(
                    db,
                    ledger,
                    old,
                    max(ZERO, old.importe - ledger.used(old.id)),
                    charge_ids=charge_ids,
                )
    pending = sum((ledger.remaining(c) for c in ledger.charges if c.id in charge_ids), ZERO)
    if data.importe > pending:
        raise HTTPException(409, "El cobro supera el importe pendiente de la factura")
    payment = Cobro(
        paciente_id=patient.id,
        clinica_id=patient.clinica_id,
        factura_id=invoice.id,
        request_id=data.request_id,
        fecha=datetime.now(timezone.utc),
        importe=data.importe,
        forma_pago_id=data.forma_pago_id,
        usuario_id=user.user_id,
        notas=data.notas,
    )
    db.add(payment)
    await db.flush()
    ledger.payments.append(payment)
    await allocate(db, ledger, payment, data.importe, charge_ids=charge_ids)
    await sync_invoice_states(db, ledger)
    await registrar_evento_sif(
        db,
        tipo_evento="COBRO_ALTA",
        factura_id=invoice.id,
        usuario_id=user.user_id,
        detalles={
            "cobro_id": str(payment.id),
            "importe": str(payment.importe),
            "forma_pago_id": str(payment.forma_pago_id),
        },
    )
    await db.commit()
    return await invoice_response(db, await _get_factura_or_404(db, invoice_id))


async def sync_draft_invoice_charge(db, invoice):
    """Legacy unsigned documents keep their editable total and immutable payment trace."""
    ledger = await load_ledger(db, invoice.paciente_id)
    charges = [c for c in ledger.charges if c.factura_id == invoice.id]
    if any(ledger.applied(c.id) for c in charges):
        raise HTTPException(
            409, "La factura tiene pagos aplicados; no se puede modificar su importe."
        )
    legacy = next((c for c in charges if c.factura_legacy_id == invoice.id), None)
    if legacy:
        legacy.base, legacy.importe = invoice.subtotal, invoice.total
    else:
        await link_invoice_charges(db, invoice)
