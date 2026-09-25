"""Atomic reception checkout: charges -> payment, optional document afterwards."""

import hashlib
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import write_audit_log
from app.core.permissions import ensure_clinic_access, scope_select_by_clinic
from app.domains.billing.application.ledger import (
    ZERO,
    account_patient,
    allocate,
    load_ledger,
    read_account,
    sync_invoice_states,
)
from app.domains.billing.persistence.cuenta import OperacionCheckout
from app.domains.billing.persistence.factura import Cobro, FormaPago
from app.domains.billing.schemas.cuenta import CheckoutRequest, CheckoutResponse
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.application.citas import _registrar_cambio_cita, _snapshot_cita
from app.domains.scheduling.persistence.cita import Cita


async def checkout(
    db: AsyncSession, patient_id: UUID, data: CheckoutRequest, user, request: Request | None
):
    # Same order as clinical completion: appointment before patient. The patient
    # serializes all economic writers, including legacy invoice/advance endpoints.
    visit = None
    if data.cita_id:
        visit = await db.scalar(
            select(Cita)
            .where(Cita.id == data.cita_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if not visit or visit.paciente_id != patient_id:
            raise HTTPException(404, "Visita no encontrada para el paciente")
    patient = await account_patient(db, patient_id, user, lock=True)
    if visit:
        ensure_clinic_access(user, visit.clinica_id)
    fingerprint = hashlib.sha256(data.model_dump_json().encode()).hexdigest()
    previous = await db.get(OperacionCheckout, data.request_id)
    if previous:
        ensure_clinic_access(user, previous.clinica_id)
        if previous.paciente_id != patient_id or previous.fingerprint != fingerprint:
            raise HTTPException(409, "Esta petición ya se utilizó para otra operación.")
        return CheckoutResponse.model_validate(previous.resultado)
    if data.resolver_salida and (
        not visit or not visit.finalizada_at or visit.estado != "atendida"
    ):
        raise HTTPException(409, "La sesión clínica debe finalizar antes de resolver la salida.")
    if data.resolver_salida and visit.salida_resuelta_at:
        raise HTTPException(409, "Otra persona ya resolvió esta salida. Revisa la cuenta actual.")
    ledger = await load_ledger(db, patient_id, user)
    if data.version != ledger.version:
        raise HTTPException(
            409,
            "La cuenta ha cambiado. Actualiza el saldo antes de confirmar; no se ha registrado ningún pago.",
        )
    if data.importe > 0:
        method = await db.get(FormaPago, data.forma_pago_id) if data.forma_pago_id else None
        if not method or not method.activo:
            raise HTTPException(422, "Selecciona una forma de pago activa.")
    credit = min(ledger.pending, ledger.credit) if data.usar_saldo_favor else ZERO
    if data.importe > ledger.pending - credit:
        raise HTTPException(
            409, "El cobro supera el pendiente actual después de aplicar el saldo a favor."
        )
    if data.importe == 0 and credit == 0 and not data.resolver_salida:
        raise HTTPException(422, "Indica un importe o selecciona una salida pendiente.")
    applied_credit = ZERO
    if credit:
        for advance, sources in [(False, ledger.payments), (True, ledger.advances)]:
            for source in sources:
                if source.anulado_at:
                    continue
                available = max(ZERO, source.importe - ledger.used(source.id))
                applied_credit += await allocate(db, ledger, source, available, advance=advance)
    payment = None
    if data.importe:
        payment = Cobro(
            paciente_id=patient_id,
            clinica_id=patient.clinica_id,
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
        await allocate(db, ledger, payment, data.importe)
    if data.resolver_salida:
        old = _snapshot_cita(visit)
        visit.salida_resuelta_at = datetime.now(timezone.utc)
        await _registrar_cambio_cita(
            db,
            cita=visit,
            current_user=user,
            accion="resolver_salida",
            old_values=old,
            new_values=_snapshot_cita(visit),
            motivo=data.notas
            or ("Saldo pendiente conservado" if ledger.balance > 0 else "Cuenta revisada"),
            request=request,
        )
    await sync_invoice_states(db, ledger)
    result = CheckoutResponse(
        operacion_id=data.request_id,
        cobro_id=payment.id if payment else None,
        importe_recibido=data.importe,
        saldo_aplicado=applied_credit,
        saldo_pendiente=ledger.balance,
        salida_resuelta=bool(data.resolver_salida),
    )
    db.add(
        OperacionCheckout(
            id=data.request_id,
            paciente_id=patient_id,
            clinica_id=patient.clinica_id,
            usuario_id=user.user_id,
            fingerprint=fingerprint,
            resultado=result.model_dump(mode="json"),
            motivo=data.notas,
        )
    )
    await write_audit_log(
        db,
        user=user,
        action="CHECKOUT_CONFIRMADO",
        entity_type="operaciones_checkout",
        entity_id=data.request_id,
        clinica_id=patient.clinica_id,
        new_values=result.model_dump(mode="json"),
        request=request,
    )
    await db.commit()
    return result


async def checkout_queue(db, user):
    # Deliberately billing-only; never expose balances through clinical visit responses.
    if user.rol not in {"admin", "recepcion"}:
        raise HTTPException(403, "Solo recepción o administración puede gestionar salidas.")
    query = select(Cita).join(Paciente, Paciente.id == Cita.paciente_id).where(
        Cita.finalizada_at.is_not(None),
        Cita.salida_resuelta_at.is_(None),
        Cita.estado == "atendida",
    )
    query = scope_select_by_clinic(scope_select_by_clinic(query, Cita, user), Paciente, user)
    visits = (await db.scalars(query.order_by(Cita.finalizada_at).limit(100))).all()
    return [await read_account(db, v.paciente_id, user, v.id) for v in visits]


async def invoice_charges(db, patient_id, data, user):
    from app.domains.billing.application.facturas import crear_factura, obtener_factura
    from app.domains.billing.persistence.cuenta import CargoPaciente
    from app.domains.billing.schemas.factura import FacturaCreate, FacturaLineaCreate
    from app.domains.scheduling.application.clinic_time import clinic_datetime

    patient = await account_patient(db, patient_id, user, lock=True)
    fingerprint = hashlib.sha256(("factura:" + data.model_dump_json()).encode()).hexdigest()
    previous = await db.get(OperacionCheckout, data.request_id)
    if previous:
        ensure_clinic_access(user, previous.clinica_id)
        if previous.paciente_id != patient_id or previous.fingerprint != fingerprint:
            raise HTTPException(409, "Esta petición ya se utilizó para otra operación.")
        return await obtener_factura(UUID(previous.resultado["factura_id"]), db, user)
    charges = list(
        (await db.scalars(select(CargoPaciente).where(CargoPaciente.id.in_(data.cargo_ids)))).all()
    )
    if len(charges) != len(set(data.cargo_ids)) or any(
        c.paciente_id != patient_id for c in charges
    ):
        raise HTTPException(404, "Cargos no encontrados para el paciente")
    for charge in charges:
        ensure_clinic_access(user, charge.clinica_id)
    if any(c.factura_id or c.estado != "activo" or c.importe is None for c in charges):
        raise HTTPException(409, "Hay cargos ya facturados, anulados o pendientes de valorar.")
    invoice = await crear_factura(
        FacturaCreate(
            paciente_id=patient_id,
            serie=data.serie,
            fecha=clinic_datetime(datetime.now(timezone.utc)).date(),
            lineas=[
                FacturaLineaCreate(
                    historial_id=c.historial_id,
                    concepto=c.concepto[:200],
                    cantidad=1,
                    precio_unitario=c.base,
                    iva_porcentaje=c.iva_porcentaje,
                )
                for c in charges
            ],
        ),
        db,
        user,
        commit=False,
        cargo_ids=data.cargo_ids,
    )
    db.add(
        OperacionCheckout(
            id=data.request_id,
            paciente_id=patient_id,
            clinica_id=patient.clinica_id,
            usuario_id=user.user_id,
            fingerprint=fingerprint,
            resultado={"factura_id": str(invoice.id)},
        )
    )
    await db.commit()
    return invoice


async def value_charge(db, patient_id, charge_id, data, user, request):
    from app.domains.billing.application.ledger import money
    from app.domains.billing.persistence.cuenta import CargoPaciente
    from app.domains.clinical.persistence.historial import HistorialClinico

    patient = await account_patient(db, patient_id, user, lock=True)
    charge = await db.get(CargoPaciente, charge_id)
    if not charge or charge.paciente_id != patient_id:
        raise HTTPException(404, "Cargo no encontrado")
    ensure_clinic_access(user, charge.clinica_id)
    if charge.importe is not None or charge.factura_id or charge.estado != "activo":
        raise HTTPException(409, "Este cargo ya tiene valoración. No se puede sobrescribir.")
    charge.base = data.base
    charge.importe = data.base + money(data.base * charge.iva_porcentaje / 100)
    charge.motivo_cero = data.motivo if data.base == 0 else None
    history = await db.get(HistorialClinico, charge.historial_id) if charge.historial_id else None
    if history:
        history.importe = data.base
    await write_audit_log(
        db,
        user=user,
        action="CARGO_VALORADO",
        entity_type="cargos_paciente",
        entity_id=charge.id,
        clinica_id=patient.clinica_id,
        new_values={"base": str(data.base), "importe": str(charge.importe), "motivo": data.motivo},
        request=request,
    )
    await db.commit()
    return await read_account(db, patient_id, user)


async def cancel_payment(db, patient_id, payment_id, data, user, request):
    from app.domains.billing.application.ledger import load_ledger, sync_invoice_states
    from app.domains.billing.application.verifactu_service import registrar_evento_sif

    if user.rol != "admin":
        raise HTTPException(403, "Solo administración puede anular un cobro.")
    patient = await account_patient(db, patient_id, user, lock=True)
    ledger = await load_ledger(db, patient_id, user)
    payment = next((p for p in ledger.payments if p.id == payment_id), None)
    if not payment:
        raise HTTPException(404, "Cobro no encontrado para este paciente")
    if payment.anulado_at:
        return
    payment.anulado_at = datetime.now(timezone.utc)
    payment.anulado_por_id = user.user_id
    payment.motivo_anulacion = data.motivo
    await sync_invoice_states(db, ledger)
    invoice_ids = {
        c.factura_id
        for c in ledger.charges
        if c.factura_id
        and any(a.cargo_id == c.id and a.cobro_id == payment.id for a in ledger.allocations)
    }
    if payment.factura_id:
        invoice_ids.add(payment.factura_id)
    for invoice_id in invoice_ids:
        await registrar_evento_sif(
            db,
            tipo_evento="COBRO_ANULACION",
            factura_id=invoice_id,
            usuario_id=user.user_id,
            detalles={
                "cobro_id": str(payment.id),
                "importe": str(payment.importe),
                "motivo": data.motivo,
            },
        )
    await write_audit_log(
        db,
        user=user,
        action="COBRO_ANULADO",
        entity_type="cobros",
        entity_id=payment.id,
        clinica_id=patient.clinica_id,
        new_values={"motivo": data.motivo, "importe": str(payment.importe)},
        request=request,
    )
    await db.commit()
