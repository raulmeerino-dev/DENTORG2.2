from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import CurrentUser, RequireAdmin
from app.database import get_db
from app.models.clinica import Producto
from app.schemas.extras import ProductoCreate, ProductoResponse, ProductoUpdate

router = APIRouter()


async def _get_producto(db: AsyncSession, producto_id: UUID) -> Producto:
    producto = await db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


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


@router.delete("/{producto_id}", status_code=204, dependencies=[RequireAdmin])
async def desactivar_producto(producto_id: UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    producto = await _get_producto(db, producto_id)
    producto.activo = False
    await db.commit()
