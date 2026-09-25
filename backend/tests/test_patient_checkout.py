"""Real PostgreSQL: treatment charges, checkout, fiscal links and concurrency."""

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.permissions import TokenData
from app.domains.billing.application.checkout import checkout, invoice_charges
from app.domains.billing.application.ledger import read_account
from app.domains.billing.persistence.cuenta import CargoPaciente
from app.domains.billing.persistence.factura import (
    Cobro,
    Factura,
    FormaPago,
    PagoAnticipadoPaciente,
)
from app.domains.billing.schemas.cuenta import CheckoutRequest, FacturarCargosRequest
from app.domains.clinical.application.sesiones import finalizar_tratamiento_sesion
from app.domains.clinical.schemas.tratamiento import SesionTratamientoRealizadoCreate
from app.domains.scheduling.persistence.cita import Cita
from tests.conftest import TestSessionLocal
from tests.test_copilot import fixture

pytestmark = pytest.mark.asyncio


async def setup(db, amount="300", visit=True):
    user, patient, doctor, treatment = await fixture(db)
    method = FormaPago(nombre=f"Tarjeta {uuid4().hex[:6]}", activo=True)
    db.add(method)
    appointment = (
        Cita(
            paciente_id=patient.id,
            clinica_id=patient.clinica_id,
            doctor_id=doctor.id,
            fecha_hora=datetime.now(timezone.utc),
            duracion_min=30,
            estado="en_atencion",
        )
        if visit
        else None
    )
    if appointment:
        db.add(appointment)
    await db.commit()
    history = await finalizar_tratamiento_sesion(
        SesionTratamientoRealizadoCreate(
            paciente_id=patient.id,
            doctor_id=doctor.id,
            tratamiento_id=treatment.id,
            cita_id=appointment.id if appointment else None,
            importe=Decimal(amount),
            pieza_dental=36,
            caras="O",
            observaciones="Cortesía autorizada" if amount == "0" else None,
        ),
        db,
        user,
    )
    if appointment:
        appointment.estado = "atendida"
        appointment.finalizada_at = datetime.now(timezone.utc)
        await db.commit()
    return user, patient, method, appointment, history, treatment, doctor


@pytest.mark.parametrize("amount,remaining", [("300", "0"), ("100", "200"), ("0", "300")])
async def test_performed_charge_checkout_without_invoice(db_session, amount, remaining):
    user, patient, method, visit, history, *_ = await setup(db_session)
    account = await read_account(db_session, patient.id, user, visit.id)
    assert account.total_cargos == 300 and account.realizado_hoy == 300
    assert account.cargos[0].historial_id == history.id
    assert (
        await db_session.scalar(
            select(func.count(Factura.id)).where(Factura.paciente_id == patient.id)
        )
        == 0
    )
    data = CheckoutRequest(
        request_id=uuid4(),
        version=account.version,
        importe=amount,
        forma_pago_id=method.id if amount != "0" else None,
        cita_id=visit.id,
        resolver_salida=True,
    )
    receipt = await checkout(db_session, patient.id, data, user, None)
    assert receipt.saldo_pendiente == Decimal(remaining) and receipt.salida_resuelta
    assert (await checkout(db_session, patient.id, data, user, None)) == receipt
    assert await db_session.scalar(
        select(func.count(Cobro.id)).where(Cobro.paciente_id == patient.id)
    ) == (amount != "0")
    account = await read_account(db_session, patient.id, user, visit.id)
    assert not account.pendiente_salida and account.saldo == Decimal(remaining)
    # Document issuance afterwards preserves the debt and links the existing payment.
    invoice_request = FacturarCargosRequest(request_id=uuid4(), cargo_ids=[account.cargos[0].id])
    invoice = await invoice_charges(db_session, patient.id, invoice_request, user)
    assert invoice.total == 300 and invoice.total_cobrado == Decimal(amount)
    assert invoice.pendiente == Decimal(remaining)
    assert (await invoice_charges(db_session, patient.id, invoice_request, user)).id == invoice.id
    assert (await read_account(db_session, patient.id, user)).saldo == Decimal(remaining)


async def test_previous_debt_and_advance_apply_once_then_later_payment(db_session):
    user, patient, method, visit, history, treatment, doctor = await setup(db_session, "140")
    await finalizar_tratamiento_sesion(
        SesionTratamientoRealizadoCreate(
            paciente_id=patient.id,
            doctor_id=doctor.id,
            tratamiento_id=treatment.id,
            importe=Decimal("50"),
            fecha=date.today() - timedelta(days=3),
        ),
        db_session,
        user,
    )
    db_session.add(
        PagoAnticipadoPaciente(
            paciente_id=patient.id,
            clinica_id=patient.clinica_id,
            fecha=datetime.now(timezone.utc),
            importe=40,
            forma_pago_id=method.id,
            usuario_id=user.user_id,
            concepto="A cuenta",
        )
    )
    await db_session.commit()
    account = await read_account(db_session, patient.id, user, visit.id)
    assert (
        account.realizado_hoy == 140 and account.saldo_anterior == 50 and account.saldo_favor == 40
    )
    result = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(),
            version=account.version,
            importe=100,
            forma_pago_id=method.id,
            usar_saldo_favor=True,
            cita_id=visit.id,
            resolver_salida=True,
        ),
        user,
        None,
    )
    assert result.saldo_aplicado == 40 and result.saldo_pendiente == 50
    account = await read_account(db_session, patient.id, user)
    later = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=50, forma_pago_id=method.id
        ),
        user,
        None,
    )
    assert later.saldo_pendiente == 0 and later.saldo_aplicado == 0


async def test_zero_charge_keeps_clinical_act_and_exit_without_payment(db_session):
    user, patient, method, visit, history, *_ = await setup(db_session, "0")
    account = await read_account(db_session, patient.id, user, visit.id)
    assert account.saldo == 0 and len(account.cargos) == 1
    assert account.cargos[0].motivo_cero == "Cortesía autorizada"
    result = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, cita_id=visit.id, resolver_salida=True
        ),
        user,
        None,
    )
    assert result.cobro_id is None and result.salida_resuelta


@pytest.mark.parametrize("same_request", [True, False])
async def test_two_cashiers_and_double_click_cannot_duplicate_a_payment(db_session, same_request):
    user, patient, method, *_ = await setup(db_session, visit=False)
    account = await read_account(db_session, patient.id, user)
    first = CheckoutRequest(
        request_id=uuid4(), version=account.version, importe=100, forma_pago_id=method.id
    )
    second = first if same_request else first.model_copy(update={"request_id": uuid4()})

    async def receive(data):
        async with TestSessionLocal() as db:
            try:
                return await checkout(db, patient.id, data, user, None)
            except HTTPException as error:
                await db.rollback()
                return error.status_code

    results = await asyncio.gather(receive(first), receive(second))
    if same_request:
        assert results[0] == results[1]
    else:
        assert 409 in results
    patient_id = patient.id
    await db_session.rollback()
    assert (
        await db_session.scalar(select(func.count(Cobro.id)).where(Cobro.paciente_id == patient_id))
        == 1
    )


async def test_account_enforces_roles_and_clinic(db_session):
    user, patient, *_ = await setup(db_session)
    for role, clinic in [
        ("doctor", user.clinica_id),
        ("auxiliar", user.clinica_id),
        ("recepcion", uuid4()),
    ]:
        with pytest.raises(HTTPException) as error:
            await read_account(
                db_session, patient.id, TokenData(user.user_id, user.username, role, clinic)
            )
        assert error.value.status_code == 403
    assert (
        await db_session.scalar(
            select(func.count(CargoPaciente.id)).where(CargoPaciente.paciente_id == patient.id)
        )
        == 1
    )


async def test_migration_preserves_legacy_payments_overpayment_and_is_repeatable(db_session):
    from tests.billing_fixtures import backfill_account_ledger

    user, patient, method, _, *_ = await setup(db_session, "80", visit=False)
    invoice = Factura(
        paciente_id=patient.id,
        clinica_id=patient.clinica_id,
        serie="MIG",
        numero=1,
        fecha=date.today(),
        subtotal=100,
        iva_total=0,
        total=100,
        estado="pagada",
    )
    db_session.add(invoice)
    await db_session.flush()
    db_session.add(
        Cobro(
            factura_id=invoice.id,
            importe=130,
            fecha=datetime.now(timezone.utc),
            forma_pago_id=method.id,
            usuario_id=user.user_id,
        )
    )
    await db_session.flush()
    await backfill_account_ledger(db_session)
    account = await read_account(db_session, patient.id, user)
    assert account.total_cargos == 180 and account.total_cobrado == 130
    assert account.saldo == 50 and account.saldo_favor == 30
    await backfill_account_ledger(db_session)
    repeated = await read_account(db_session, patient.id, user)
    assert repeated.saldo == 50 and len(repeated.cargos) == 2
    result = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(),
            version=repeated.version,
            importe=50,
            forma_pago_id=method.id,
            usar_saldo_favor=True,
        ),
        user,
        None,
    )
    assert result.saldo_aplicado == 30 and result.saldo_pendiente == 0


async def test_cancel_payment_restores_debt_and_cancel_document_keeps_clinical_charge(db_session):
    from app.domains.billing.application.checkout import cancel_payment
    from app.domains.billing.application.facturas import anular_factura_post
    from app.domains.billing.schemas.factura import CobroAnulacionCreate

    user, patient, method, _, history, *_ = await setup(db_session, "80", visit=False)
    account = await read_account(db_session, patient.id, user)
    paid = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=80, forma_pago_id=method.id
        ),
        user,
        None,
    )
    invoice = await invoice_charges(
        db_session,
        patient.id,
        FacturarCargosRequest(request_id=uuid4(), cargo_ids=[account.cargos[0].id]),
        user,
    )
    await cancel_payment(
        db_session,
        patient.id,
        paid.cobro_id,
        CobroAnulacionCreate(motivo="Error de registro"),
        user,
        None,
    )
    assert (await read_account(db_session, patient.id, user)).saldo == 80
    await anular_factura_post(invoice.id, db_session, user)
    account = await read_account(db_session, patient.id, user)
    assert (
        account.saldo == 80
        and account.cargos[0].historial_id == history.id
        and account.cargos[0].factura_id is None
    )
    later = await invoice_charges(
        db_session,
        patient.id,
        FacturarCargosRequest(request_id=uuid4(), cargo_ids=[account.cargos[0].id]),
        user,
    )
    assert (
        later.id != invoice.id
        and (await read_account(db_session, patient.id, user)).total_cargos == 80
    )


async def test_charge_reports_and_account_do_not_leak_foreign_clinic_money(db_session):
    from app.domains.billing.persistence.account_queries import account_totals
    from app.domains.identity.persistence.clinica import Clinica
    from app.domains.patients.persistence.paciente import Paciente

    user, patient, method, *_ = await setup(db_session, "80", visit=False)
    foreign = Clinica(nombre="Otra clínica checkout")
    db_session.add(foreign)
    await db_session.flush()
    db_session.add(
        CargoPaciente(
            paciente_id=patient.id,
            clinica_id=foreign.id,
            concepto="Cargo privado",
            fecha=date.today(),
            base=999,
            importe=999,
        )
    )
    db_session.add(
        Cobro(
            paciente_id=patient.id,
            clinica_id=foreign.id,
            importe=50,
            fecha=datetime.now(timezone.utc),
            forma_pago_id=method.id,
            usuario_id=user.user_id,
        )
    )
    await db_session.commit()
    reception = TokenData(user.user_id, user.username, "recepcion", patient.clinica_id)
    account = await read_account(db_session, patient.id, reception)
    assert account.saldo == 80 and len(account.cargos) == 1 and not account.movimientos
    charges, paid = account_totals(reception)
    assert (
        await db_session.scalar(
            select(charges - paid).select_from(Paciente).where(Paciente.id == patient.id)
        )
        == 80
    )


@pytest.mark.parametrize("payment", ["72", "20"])
async def test_budget_discount_and_snapshot_survive_catalog_price_changes(db_session, payment):
    from app.domains.treatment_plans.persistence.presupuesto import Presupuesto, PresupuestoLinea

    user, patient, doctor, treatment = await fixture(db_session)
    method = FormaPago(nombre=f"Pago {uuid4().hex[:6]}", activo=True)
    plan = Presupuesto(
        numero=100000000 + uuid4().int % 100000000,
        paciente_id=patient.id,
        doctor_id=doctor.id,
        clinica_id=patient.clinica_id,
        fecha=date.today(),
        estado="aceptado",
    )
    db_session.add_all([method, plan])
    await db_session.flush()
    line = PresupuestoLinea(
        presupuesto_id=plan.id,
        tratamiento_id=treatment.id,
        precio_unitario=80,
        descuento_porcentaje=10,
        pieza_dental=36,
        caras="O",
        aceptado=True,
    )
    db_session.add(line)
    await db_session.commit()
    result = await finalizar_tratamiento_sesion(
        SesionTratamientoRealizadoCreate(
            paciente_id=patient.id,
            doctor_id=doctor.id,
            tratamiento_id=treatment.id,
            presupuesto_linea_id=line.id,
            pieza_dental=36,
            caras="O",
        ),
        db_session,
        user,
    )
    treatment.precio = 999
    await db_session.commit()
    account = await read_account(db_session, patient.id, user)
    assert result.importe == 72 and account.saldo == 72
    charge = await db_session.get(CargoPaciente, account.cargos[0].id)
    assert charge.descuento_porcentaje == 10 and charge.base == 72
    receipt = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=payment, forma_pago_id=method.id
        ),
        user,
        None,
    )
    assert receipt.saldo_pendiente == 72 - Decimal(payment)


async def test_checkout_payment_visible_in_reports_before_invoice(db_session):
    from app.domains.reporting.api.reportes import _facturacion_resumen
    from app.domains.reporting.application.registros import consultar_registros
    from app.domains.reporting.schemas.registros import RegistroFilters

    user, patient, method, *_ = await setup(db_session, "180", visit=False)
    account = await read_account(db_session, patient.id, user)
    await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=60, forma_pago_id=method.id
        ),
        user,
        None,
    )
    balances = await consultar_registros(
        db_session, user, "saldos", RegistroFilters(paciente_id=patient.id)
    )
    assert balances.rows[0].cells["saldo"] == 120
    payments = await consultar_registros(
        db_session, user, "cobros", RegistroFilters(paciente_id=patient.id)
    )
    assert payments.total == 1 and payments.rows[0].cells["importe"] == 60
    report = await _facturacion_resumen(db_session, user, date.today(), date.today())
    assert report["total_cobrado"] >= 60


async def test_plan_invoice_reuses_paid_charge_and_prebilled_plan_never_duplicates(db_session):
    from app.domains.billing.application.plan_invoicing import convertir_presupuesto_a_factura
    from app.domains.treatment_plans.persistence.presupuesto import Presupuesto, PresupuestoLinea
    from app.domains.treatment_plans.schemas.presupuesto import PresupuestoConvertirFacturaCreate

    user, patient, doctor, treatment = await fixture(db_session)
    plan = Presupuesto(
        numero=300000000 + uuid4().int % 100000000,
        paciente_id=patient.id,
        doctor_id=doctor.id,
        clinica_id=patient.clinica_id,
        fecha=date.today(),
        estado="aceptado",
    )
    db_session.add(plan)
    await db_session.flush()
    line = PresupuestoLinea(
        presupuesto_id=plan.id, tratamiento_id=treatment.id, precio_unitario=80, aceptado=True
    )
    db_session.add(line)
    await db_session.commit()
    invoice = await convertir_presupuesto_a_factura(
        plan.id, PresupuestoConvertirFacturaCreate(fecha=date.today()), db_session, user
    )
    assert invoice.total == 80
    history = await finalizar_tratamiento_sesion(
        SesionTratamientoRealizadoCreate(
            paciente_id=patient.id,
            doctor_id=doctor.id,
            tratamiento_id=treatment.id,
            presupuesto_linea_id=line.id,
        ),
        db_session,
        user,
    )
    account = await read_account(db_session, patient.id, user)
    assert len(account.cargos) == 1 and account.total_cargos == 80
    assert (
        account.cargos[0].historial_id == history.id and account.cargos[0].factura_id == invoice.id
    )


async def test_invoice_discount_adjusts_only_unpaid_charge_with_trace(db_session):
    from app.domains.billing.application.facturas import crear_factura
    from app.domains.billing.schemas.factura import FacturaCreate, FacturaLineaCreate

    user, patient, method, _, history, *_ = await setup(db_session, "80", visit=False)
    invoice = await crear_factura(
        FacturaCreate(
            paciente_id=patient.id,
            fecha=date.today(),
            lineas=[
                FacturaLineaCreate(
                    historial_id=history.id, concepto="Bonificación autorizada", precio_unitario=60
                )
            ],
        ),
        db_session,
        user,
    )
    assert invoice.total == 60 and (await read_account(db_session, patient.id, user)).saldo == 60
    # Once money is applied, another document cannot silently change the charge.
    account = await read_account(db_session, patient.id, user)
    await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=20, forma_pago_id=method.id
        ),
        user,
        None,
    )
    with pytest.raises(HTTPException) as error:
        await crear_factura(
            FacturaCreate(
                paciente_id=patient.id,
                fecha=date.today(),
                lineas=[
                    FacturaLineaCreate(
                        historial_id=history.id, concepto="Duplicado", precio_unitario=10
                    )
                ],
            ),
            db_session,
            user,
        )
    assert error.value.status_code == 409
    patient_id = patient.id
    await db_session.rollback()
    assert (await read_account(db_session, patient_id, user)).saldo == 40


async def test_receipt_without_invoice_has_patient_and_is_clinic_scoped(db_session):
    from io import BytesIO

    from pypdf import PdfReader

    from app.domains.billing.api.pdf import pdf_recibo_cobro
    from app.domains.billing.application.fiscal_document_service import read_archived_pdf
    from app.domains.billing.persistence.factura import DocumentoFiscal

    user, patient, method, _, *_ = await setup(db_session, "80", visit=False)
    account = await read_account(db_session, patient.id, user)
    receipt = await checkout(
        db_session,
        patient.id,
        CheckoutRequest(
            request_id=uuid4(), version=account.version, importe=30, forma_pago_id=method.id
        ),
        user,
        None,
    )
    response = await pdf_recibo_cobro(receipt.cobro_id, db_session, user)
    content = "\n".join(p.extract_text() for p in PdfReader(BytesIO(response.body)).pages)
    assert patient.nombre in content and "Sin factura asociada" in content and "30.00" in content
    with pytest.raises(HTTPException) as error:
        await pdf_recibo_cobro(
            receipt.cobro_id,
            db_session,
            TokenData(user.user_id, user.username, "recepcion", uuid4()),
        )
    assert error.value.status_code == 403
    invoice = await invoice_charges(
        db_session,
        patient.id,
        FacturarCargosRequest(request_id=uuid4(), cargo_ids=[account.cargos[0].id]),
        user,
    )
    document = await db_session.scalar(
        select(DocumentoFiscal).where(DocumentoFiscal.factura_id == invoice.id)
    )
    content = "\n".join(
        p.extract_text() for p in PdfReader(BytesIO(read_archived_pdf(document))).pages
    )
    assert "30.00" in content and method.nombre in content
    response = await pdf_recibo_cobro(receipt.cobro_id, db_session, user)
    content = "\n".join(p.extract_text() for p in PdfReader(BytesIO(response.body)).pages)
    assert f"{invoice.serie}-{invoice.numero:04d}" in content
