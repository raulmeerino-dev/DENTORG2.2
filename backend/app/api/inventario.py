from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.clinica import MovimientoInventario, Producto
from app.schemas.extras import (
    MovimientoInventarioCreate,
    MovimientoInventarioResponse,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
)

router = APIRouter()


async def _get_producto(db: AsyncSession, producto_id: UUID) -> Producto:
    producto = await db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


def _aplicar_movimiento(producto: Producto, data: MovimientoInventarioCreate, usuario_id: UUID) -> MovimientoInventario:
    if data.tipo in {"salida", "consumo_factura"}:
        nuevo_stock = producto.stock_act - data.cantidad
        if nuevo_stock < 0:
            raise HTTPException(status_code=409, detail="Stock insuficiente para registrar la salida")
    elif data.tipo == "entrada":
        nuevo_stock = producto.stock_act + data.cantidad
    else:
        nuevo_stock = data.cantidad

    producto.stock_act = nuevo_stock
    return MovimientoInventario(
        producto_id=producto.id,
        tipo=data.tipo,
        cantidad=data.cantidad,
        stock_resultante=nuevo_stock,
        motivo=data.motivo,
        factura_id=data.factura_id,
        usuario_id=usuario_id,
    )


@router.get("", response_model=list[ProductoResponse])
async def listar_inventario(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[ProductoResponse]:
    result = await db.execute(select(Producto).where(Producto.activo == True).order_by(Producto.nombre))  # noqa: E712
    return [ProductoResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED, dependencies=[RequireAdmin])
async def crear_producto(
    data: ProductoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductoResponse:
    producto = Producto(**data.model_dump())
    db.add(producto)
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.patch("/{producto_id}", response_model=ProductoResponse, dependencies=[RequireAdmin])
async def actualizar_producto(
    producto_id: UUID,
    data: ProductoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductoResponse:
    producto = await _get_producto(db, producto_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(producto, field, value)
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoInventarioResponse])
async def listar_movimientos_producto(
    producto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: CurrentUser,
) -> list[MovimientoInventarioResponse]:
    await _get_producto(db, producto_id)
    result = await db.execute(
        select(MovimientoInventario)
        .where(MovimientoInventario.producto_id == producto_id)
        .order_by(MovimientoInventario.created_at.desc())
    )
    return [MovimientoInventarioResponse.model_validate(item) for item in result.scalars().all()]


@router.post(
    "/{producto_id}/movimientos",
    response_model=ProductoResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[RequireAdmin],
)
async def registrar_movimiento_producto(
    producto_id: UUID,
    data: MovimientoInventarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> ProductoResponse:
    producto = await _get_producto(db, producto_id)
    movimiento = _aplicar_movimiento(producto, data, current_user.user_id)
    db.add(movimiento)
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.delete("/{producto_id}", status_code=204, dependencies=[RequireAdmin])
async def desactivar_producto(producto_id: UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    producto = await _get_producto(db, producto_id)
    producto.activo = False
    await db.commit()
