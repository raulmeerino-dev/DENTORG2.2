"""HTTP adapter: request validation, role dependencies and response contracts."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CurrentUser,
    RequireAdmin,
    TokenData,
    require_admin,
)
from app.database import get_db
from app.domains.inventory.application import inventario as use_cases
from app.domains.inventory.schemas.inventario import (
    MovimientoInventarioCreate,
    MovimientoInventarioResponse,
    PedidoProveedorCreate,
    PedidoProveedorResponse,
    PedidoProveedorUpdate,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
    ProveedorCreate,
    ProveedorResponse,
    ProveedorUpdate,
)

router = APIRouter(dependencies=[RequireAdmin])


@router.get("/alertas-stock", response_model=list[ProductoResponse])
async def listar_alertas_stock(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProductoResponse]:
    return await use_cases.listar_alertas_stock(db=db, current_user=current_user)


@router.get("/proveedores", response_model=list[ProveedorResponse])
async def listar_proveedores(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProveedorResponse]:
    return await use_cases.listar_proveedores(db=db, current_user=current_user)


@router.post("/proveedores", response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
async def crear_proveedor(
    data: ProveedorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProveedorResponse:
    return await use_cases.crear_proveedor(data=data, db=db, current_user=current_user, request=request)


@router.patch("/proveedores/{proveedor_id}", response_model=ProveedorResponse)
async def actualizar_proveedor(
    proveedor_id: UUID,
    data: ProveedorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProveedorResponse:
    return await use_cases.actualizar_proveedor(proveedor_id=proveedor_id, data=data, db=db, current_user=current_user, request=request)


@router.delete("/proveedores/{proveedor_id}", status_code=204)
async def desactivar_proveedor(
    proveedor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> None:
    return await use_cases.desactivar_proveedor(proveedor_id=proveedor_id, db=db, current_user=current_user, request=request)


@router.get("/pedidos", response_model=list[PedidoProveedorResponse])
async def listar_pedidos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PedidoProveedorResponse]:
    return await use_cases.listar_pedidos(db=db, current_user=current_user)


@router.post("/pedidos", response_model=PedidoProveedorResponse, status_code=status.HTTP_201_CREATED)
async def crear_pedido(
    data: PedidoProveedorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    return await use_cases.crear_pedido(data=data, db=db, current_user=current_user, request=request)


@router.patch("/pedidos/{pedido_id}", response_model=PedidoProveedorResponse)
async def actualizar_pedido(
    pedido_id: UUID,
    data: PedidoProveedorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    return await use_cases.actualizar_pedido(pedido_id=pedido_id, data=data, db=db, current_user=current_user, request=request)


@router.post("/pedidos/{pedido_id}/recibir", response_model=PedidoProveedorResponse)
async def recibir_pedido(
    pedido_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    return await use_cases.recibir_pedido(pedido_id=pedido_id, db=db, current_user=current_user, request=request)


@router.get("", response_model=list[ProductoResponse])
async def listar_inventario(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProductoResponse]:
    return await use_cases.listar_inventario(db=db, current_user=current_user)


@router.post("", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
async def crear_producto(
    data: ProductoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    return await use_cases.crear_producto(data=data, db=db, current_user=current_user, request=request)


@router.patch("/{producto_id}", response_model=ProductoResponse)
async def actualizar_producto(
    producto_id: UUID,
    data: ProductoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    return await use_cases.actualizar_producto(producto_id=producto_id, data=data, db=db, current_user=current_user, request=request)


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoInventarioResponse])
async def listar_movimientos_producto(
    producto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[MovimientoInventarioResponse]:
    return await use_cases.listar_movimientos_producto(producto_id=producto_id, db=db, current_user=current_user)


@router.post(
    "/{producto_id}/movimientos",
    response_model=ProductoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def registrar_movimiento_producto(
    producto_id: UUID,
    data: MovimientoInventarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    return await use_cases.registrar_movimiento_producto(producto_id=producto_id, data=data, db=db, current_user=current_user, request=request)


@router.delete("/{producto_id}", status_code=204)
async def desactivar_producto(
    producto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> None:
    return await use_cases.desactivar_producto(producto_id=producto_id, db=db, current_user=current_user, request=request)
