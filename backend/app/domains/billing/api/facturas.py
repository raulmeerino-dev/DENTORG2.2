"""HTTP adapter: request validation, role dependencies and response contracts."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    RequireBilling,
)
from app.database import get_db
from app.domains.billing.application import facturas as use_cases
from app.domains.billing.schemas.factura import (
    CobroAnulacionCreate,
    CobroCreate,
    FacturaCreate,
    FacturaLineaCreate,
    FacturaRectificativaCreate,
    FacturaResponse,
    FacturaUpdate,
    FormaPagoCreate,
    FormaPagoResponse,
    HistorialSinFacturarResponse,
)

router = APIRouter(dependencies=[RequireBilling])


@router.get("/formas-pago", response_model=list[FormaPagoResponse])
async def listar_formas_pago(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[FormaPagoResponse]:
    return await use_cases.listar_formas_pago(db=db, _=_)


@router.post("/formas-pago", response_model=FormaPagoResponse, status_code=201, dependencies=[RequireAdmin])
async def crear_forma_pago(
    data: FormaPagoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FormaPagoResponse:
    return await use_cases.crear_forma_pago(data=data, db=db)


@router.get("", response_model=list[FacturaResponse])
async def listar_facturas(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    paciente_id: UUID | None = Query(None),
    estado: str | None = Query(None, pattern=r"^(borrador|emitida|cobrada|pagada|parcial|anulada)$"),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    serie: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[FacturaResponse]:
    return await use_cases.listar_facturas(db=db, current_user=current_user, paciente_id=paciente_id, estado=estado, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, serie=serie, limit=limit, offset=offset)


@router.post("", response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
async def crear_factura(
    data: FacturaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.crear_factura(data=data, db=db, current_user=current_user)


@router.get("/historial-sin-facturar", response_model=list[HistorialSinFacturarResponse])
async def historial_sin_facturar(
    paciente_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[HistorialSinFacturarResponse]:
    return await use_cases.historial_sin_facturar(paciente_id=paciente_id, db=db, current_user=current_user)


@router.get("/{factura_id}", response_model=FacturaResponse)
async def obtener_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.obtener_factura(factura_id=factura_id, db=db, current_user=current_user)


@router.post("/{factura_id}/emitir", response_model=FacturaResponse)
async def emitir_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.emitir_factura(factura_id=factura_id, db=db, current_user=current_user)


@router.post("/{factura_id}/receta")
async def generar_receta(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> Response:
    return await use_cases.generar_receta(factura_id=factura_id, db=db, current_user=current_user)


@router.patch("/{factura_id}", response_model=FacturaResponse)
async def actualizar_factura(
    factura_id: UUID,
    data: FacturaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.actualizar_factura(factura_id=factura_id, data=data, db=db, current_user=current_user)


@router.post("/{factura_id}/anular", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_factura_post(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.anular_factura_post(factura_id=factura_id, db=db, current_user=current_user)


@router.delete("/{factura_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequireAdmin])
async def anular_factura(
    factura_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.anular_factura(factura_id=factura_id, db=db, current_user=current_user)


@router.post("/{factura_id}/rectificar", response_model=FacturaResponse, status_code=status.HTTP_201_CREATED)
async def rectificar_factura(
    factura_id: UUID,
    data: FacturaRectificativaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.rectificar_factura(factura_id=factura_id, data=data, db=db, current_user=current_user)


@router.post("/{factura_id}/lineas", response_model=FacturaResponse, status_code=201)
async def anadir_linea(
    factura_id: UUID,
    data: FacturaLineaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.anadir_linea(factura_id=factura_id, data=data, db=db, current_user=current_user)


@router.delete("/{factura_id}/lineas/{linea_id}", status_code=204)
async def eliminar_linea(
    factura_id: UUID,
    linea_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.eliminar_linea(factura_id=factura_id, linea_id=linea_id, db=db, current_user=current_user)


@router.post("/{factura_id}/cobros", response_model=FacturaResponse, status_code=201)
async def registrar_cobro(
    factura_id: UUID,
    data: CobroCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.registrar_cobro(factura_id=factura_id, data=data, db=db, current_user=current_user)


@router.post("/{factura_id}/pagos", response_model=FacturaResponse, status_code=201)
async def registrar_pago(
    factura_id: UUID,
    data: CobroCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> FacturaResponse:
    return await use_cases.registrar_pago(factura_id=factura_id, data=data, db=db, current_user=current_user)


@router.post("/{factura_id}/cobros/{cobro_id}/anular", status_code=204, dependencies=[RequireAdmin])
async def anular_cobro_post(
    factura_id: UUID,
    cobro_id: UUID,
    data: CobroAnulacionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.anular_cobro_post(factura_id=factura_id, cobro_id=cobro_id, data=data, db=db, current_user=current_user)


@router.delete("/{factura_id}/cobros/{cobro_id}", status_code=204, dependencies=[RequireAdmin])
async def anular_cobro(
    factura_id: UUID,
    cobro_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> None:
    return await use_cases.anular_cobro(factura_id=factura_id, cobro_id=cobro_id, db=db, current_user=current_user)


@router.get("/verifactu/integridad/{serie}", dependencies=[RequireAdmin])
async def verificar_integridad(
    serie: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await use_cases.verificar_integridad(serie=serie, db=db)


@router.get("/verifactu/eventos/integridad", dependencies=[RequireAdmin])
async def verificar_integridad_eventos(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return await use_cases.verificar_integridad_eventos(db=db)


@router.get("/verifactu/eventos", dependencies=[RequireAdmin])
async def listar_eventos_sif(
    db: Annotated[AsyncSession, Depends(get_db)],
    factura_id: UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    return await use_cases.listar_eventos_sif(db=db, factura_id=factura_id, limit=limit)
