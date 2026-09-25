"""Issue and seal an invoice from a treatment plan in one transaction."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
)
from app.domains.billing.application.facturas import _siguiente_numero
from app.domains.billing.application.fiscal_document_service import archivar_pdf_factura
from app.domains.billing.application.invoice_account import invoice_response, link_invoice_charges
from app.domains.billing.application.ledger import account_patient
from app.domains.billing.application.verifactu_service import (
    registrar_evento_sif,
    registrar_registro_facturacion,
    sellar_factura,
)
from app.domains.billing.persistence.cuenta import CargoPaciente
from app.domains.billing.persistence.factura import Cobro, Factura, FacturaLinea
from app.domains.billing.schemas.factura import FacturaResponse
from app.domains.clinical.persistence.historial import HistorialClinico
from app.domains.treatment_plans.application.queries import get_presupuesto_or_404
from app.domains.treatment_plans.persistence.presupuesto import (
    PresupuestoLinea,
    TrabajoPendiente,
)
from app.domains.treatment_plans.schemas.presupuesto import (
    PresupuestoConvertirFacturaCreate,
)

FACTURA_LOAD = [
    selectinload(Factura.paciente),
    selectinload(Factura.entidad),
    selectinload(Factura.forma_pago),
    selectinload(Factura.lineas),
    selectinload(Factura.cobros).selectinload(Cobro.forma_pago),
]


async def _get_factura_response(db: AsyncSession, factura_id: UUID) -> Factura:
    result = await db.execute(
        select(Factura).options(*FACTURA_LOAD).where(Factura.id == factura_id)
    )
    return result.scalar_one()


async def _siguiente_numero_factura(db: AsyncSession, serie: str, clinica_id: UUID | None) -> int:
    return await _siguiente_numero(db, serie)


def _detalle_factura(factura: Factura) -> dict:
    return {
        "serie": factura.serie,
        "numero": factura.numero,
        "total": str(factura.total),
        "num_registro": factura.num_registro,
        "estado_verifactu": factura.estado_verifactu,
    }


def _importe_linea(linea: PresupuestoLinea) -> tuple[Decimal, Decimal, Decimal]:
    base = (
        linea.precio_unitario * (Decimal("1.00") - linea.descuento_porcentaje / Decimal("100"))
    ).quantize(Decimal("0.01"))
    iva = (base * linea.tratamiento.iva_porcentaje / Decimal("100")).quantize(Decimal("0.01"))
    return base, iva, base + iva


async def convertir_presupuesto_a_factura(
    presupuesto_id: UUID,
    data: PresupuestoConvertirFacturaCreate,
    db: AsyncSession,
    current_user: TokenData,
) -> FacturaResponse:
    presupuesto = await get_presupuesto_or_404(db, presupuesto_id)
    ensure_clinic_access(current_user, presupuesto.clinica_id)
    await account_patient(db, presupuesto.paciente_id, current_user, lock=True)
    await db.refresh(presupuesto, ["estado"])
    if presupuesto.estado == "facturado":
        raise HTTPException(status_code=409, detail="El presupuesto ya esta facturado")

    lineas = (
        [linea for linea in presupuesto.lineas if linea.aceptado]
        if data.solo_aceptadas
        else list(presupuesto.lineas)
    )
    if not lineas:
        raise HTTPException(status_code=409, detail="No hay lineas aceptadas para facturar")

    charges = (
        await db.scalars(
            select(CargoPaciente).where(
                CargoPaciente.presupuesto_linea_id.in_([line.id for line in lineas]),
                CargoPaciente.estado == "activo",
            )
        )
    ).all()
    snapshots = {c.presupuesto_linea_id: c for c in charges}
    if any(c.factura_id or c.importe is None for c in charges):
        raise HTTPException(
            409,
            "Hay tratamientos ya documentados o pendientes de valorar. Revisa la cuenta del paciente.",
        )
    amounts = {
        line.id: (
            snapshots[line.id].base,
            snapshots[line.id].importe - snapshots[line.id].base,
            snapshots[line.id].importe,
        )
        if line.id in snapshots
        else _importe_linea(line)
        for line in lineas
    }
    subtotal = sum((values[0] for values in amounts.values()), Decimal("0"))
    iva_total = sum((values[1] for values in amounts.values()), Decimal("0"))
    total = subtotal + iva_total
    numero = await _siguiente_numero_factura(db, data.serie, presupuesto.clinica_id)
    factura = Factura(
        paciente_id=presupuesto.paciente_id,
        clinica_id=presupuesto.clinica_id,
        serie=data.serie,
        numero=numero,
        fecha=data.fecha,
        tipo="paciente",
        subtotal=subtotal,
        iva_total=iva_total,
        total=total,
        estado="emitida",
        forma_pago_id=data.forma_pago_id,
        observaciones=f"Factura generada desde presupuesto {presupuesto.numero}",
    )
    db.add(factura)
    await db.flush()

    trabajos_result = await db.execute(
        select(TrabajoPendiente).where(
            TrabajoPendiente.presupuesto_linea_id.in_([linea.id for linea in lineas])
        )
    )
    trabajos_por_linea = {
        trabajo.presupuesto_linea_id: trabajo for trabajo in trabajos_result.scalars().all()
    }

    generated_lines = []
    for linea in lineas:
        base, iva, total_linea = amounts[linea.id]
        snapshot = snapshots.get(linea.id)
        trabajo = trabajos_por_linea.get(linea.id)
        historial_id = trabajo.historial_id if trabajo else None
        if not historial_id:
            historial_id = await db.scalar(
                select(HistorialClinico.id)
                .where(HistorialClinico.presupuesto_linea_id == linea.id)
                .limit(1)
            )
        invoice_line = FacturaLinea(
            factura_id=factura.id,
            historial_id=historial_id,
            concepto=(snapshot.concepto if snapshot else linea.tratamiento.nombre)[:200],
            cantidad=1,
            precio_unitario=base,
            iva_porcentaje=snapshot.iva_porcentaje
            if snapshot
            else linea.tratamiento.iva_porcentaje,
            subtotal=total_linea,
        )
        db.add(invoice_line)
        generated_lines.append((linea, invoice_line))
    await db.flush()
    await link_invoice_charges(db, factura)
    # Explicit plan relation also prevents a second charge when a prepaid plan is performed later.
    for source, invoice_line in generated_lines:
        charge = await db.scalar(
            select(CargoPaciente).where(CargoPaciente.factura_linea_id == invoice_line.id)
        )
        if charge:
            charge.presupuesto_linea_id = source.id
            charge.descuento_porcentaje = source.descuento_porcentaje
    presupuesto.estado = "facturado"
    await sellar_factura(db, factura)
    await registrar_registro_facturacion(
        db,
        factura=factura,
        tipo_registro="alta",
        usuario_id=current_user.user_id,
        detalles={**_detalle_factura(factura), "presupuesto_id": str(presupuesto.id)},
    )
    await registrar_evento_sif(
        db,
        tipo_evento="FACTURA_ALTA_DESDE_PRESUPUESTO",
        factura_id=factura.id,
        usuario_id=current_user.user_id,
        detalles={**_detalle_factura(factura), "presupuesto_id": str(presupuesto.id)},
    )
    await db.flush()
    factura_pdf = await _get_factura_response(db, factura.id)
    await archivar_pdf_factura(db, factura=factura_pdf, created_by_id=current_user.user_id)
    await db.commit()
    return await invoice_response(db, await _get_factura_response(db, factura.id))
