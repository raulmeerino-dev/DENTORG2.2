from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin, RequireBilling, scope_select_by_clinic
from app.database import get_db
from app.domains.billing.application import checkout as commands
from app.domains.billing.application.ledger import read_account
from app.domains.billing.persistence.account_queries import account_totals
from app.domains.billing.persistence.cuenta import CargoPaciente
from app.domains.billing.schemas.cuenta import (
    CheckoutRequest,
    CheckoutResponse,
    CuentaListaResponse,
    CuentaResponse,
    FacturarCargosRequest,
    ValorarCargoRequest,
)
from app.domains.billing.schemas.factura import CobroAnulacionCreate, FacturaResponse
from app.domains.patients.persistence.paciente import Paciente

router = APIRouter(dependencies=[RequireBilling])
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/salidas", response_model=list[CuentaResponse])
async def pending_exits(db: DB, user: CurrentUser):
    return await commands.checkout_queue(db, user)


@router.get("", response_model=CuentaListaResponse)
async def accounts(
    db: DB,
    user: CurrentUser,
    q: str = Query("", max_length=100),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    charges, collected = account_totals(user)
    charge_scope = (
        []
        if user.rol == "admin"
        else [(CargoPaciente.clinica_id == user.clinica_id) | CargoPaciente.clinica_id.is_(None)]
    )
    unknown = (
        select(func.count())
        .where(
            *charge_scope,
            CargoPaciente.paciente_id == Paciente.id,
            CargoPaciente.importe.is_(None),
            CargoPaciente.estado == "activo",
        )
        .correlate(Paciente)
        .scalar_subquery()
    )
    statement = select(
        Paciente.id,
        Paciente.nombre,
        Paciente.apellidos,
        Paciente.num_historial,
        charges.label("total_cargos"),
        collected.label("total_cobrado"),
        (charges - collected).label("saldo"),
        unknown.label("sin_valorar"),
    )
    statement = scope_select_by_clinic(statement, Paciente, user).where(
        or_(charges - collected > 0, unknown > 0)
    )
    if q.strip():
        statement = statement.where(
            func.concat(
                Paciente.nombre, " ", Paciente.apellidos, " ", Paciente.num_historial
            ).ilike(f"%{q.strip()}%")
        )
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (
        (
            await db.execute(
                statement.order_by(Paciente.apellidos, Paciente.nombre, Paciente.id)
                .offset(offset)
                .limit(limit)
            )
        )
        .mappings()
        .all()
    )
    return {"items": [dict(row) for row in rows], "total": total}


@router.get("/{patient_id}", response_model=CuentaResponse)
async def account(patient_id: UUID, db: DB, user: CurrentUser, cita_id: UUID | None = None):
    return await read_account(db, patient_id, user, cita_id)


@router.post("/{patient_id}/checkout", response_model=CheckoutResponse)
async def confirm_checkout(
    patient_id: UUID, data: CheckoutRequest, request: Request, db: DB, user: CurrentUser
):
    return await commands.checkout(db, patient_id, data, user, request)


@router.post("/{patient_id}/facturar", response_model=FacturaResponse, status_code=201)
async def invoice(patient_id: UUID, data: FacturarCargosRequest, db: DB, user: CurrentUser):
    return await commands.invoice_charges(db, patient_id, data, user)


@router.patch("/{patient_id}/cargos/{charge_id}/valorar", response_model=CuentaResponse)
async def value(
    patient_id: UUID,
    charge_id: UUID,
    data: ValorarCargoRequest,
    request: Request,
    db: DB,
    user: CurrentUser,
):
    return await commands.value_charge(db, patient_id, charge_id, data, user, request)


@router.post(
    "/{patient_id}/cobros/{payment_id}/anular", status_code=204, dependencies=[RequireAdmin]
)
async def cancel_payment(
    patient_id: UUID,
    payment_id: UUID,
    data: CobroAnulacionCreate,
    request: Request,
    db: DB,
    user: CurrentUser,
):
    return await commands.cancel_payment(db, patient_id, payment_id, data, user, request)
