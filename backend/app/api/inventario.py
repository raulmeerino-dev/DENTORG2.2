from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    CurrentUser,
    TokenData,
    ensure_clinic_access,
    require_admin,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.database import get_db
from app.models.clinica import (
    MovimientoInventario,
    PedidoLinea,
    PedidoProveedor,
    Producto,
    Proveedor,
)
from app.schemas.extras import (
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
from app.services.audit import write_audit_log

router = APIRouter()


async def _get_producto(db: AsyncSession, producto_id: UUID, current_user: TokenData) -> Producto:
    producto = await db.get(Producto, producto_id)
    if not producto or not producto.activo:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    ensure_clinic_access(current_user, producto.clinica_id)
    return producto


async def _get_proveedor(db: AsyncSession, proveedor_id: UUID, current_user: TokenData) -> Proveedor:
    proveedor = await db.get(Proveedor, proveedor_id)
    if not proveedor or not proveedor.activo:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    ensure_clinic_access(current_user, proveedor.clinica_id)
    return proveedor


async def _get_pedido(db: AsyncSession, pedido_id: UUID, current_user: TokenData) -> PedidoProveedor:
    result = await db.execute(
        select(PedidoProveedor)
        .options(selectinload(PedidoProveedor.lineas))
        .where(PedidoProveedor.id == pedido_id)
    )
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    ensure_clinic_access(current_user, pedido.clinica_id)
    return pedido


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
        referencia_tipo=data.referencia_tipo,
        referencia_id=data.referencia_id,
        usuario_id=usuario_id,
    )


async def _validar_lineas_pedido(
    db: AsyncSession,
    current_user: TokenData,
    lineas: list,
) -> list[Producto]:
    productos: list[Producto] = []
    for linea in lineas:
        producto = await _get_producto(db, linea.producto_id, current_user)
        productos.append(producto)
    return productos


@router.get("/alertas-stock", response_model=list[ProductoResponse])
async def listar_alertas_stock(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProductoResponse]:
    stmt = select(Producto).where(Producto.activo == True, Producto.stock_act < Producto.stock_min).order_by(Producto.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Producto, current_user)
    result = await db.execute(stmt)
    return [ProductoResponse.model_validate(item) for item in result.scalars().all()]


@router.get("/proveedores", response_model=list[ProveedorResponse])
async def listar_proveedores(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProveedorResponse]:
    stmt = select(Proveedor).where(Proveedor.activo == True).order_by(Proveedor.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Proveedor, current_user)
    result = await db.execute(stmt)
    return [ProveedorResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/proveedores", response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
async def crear_proveedor(
    data: ProveedorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProveedorResponse:
    clinica_id = resolve_clinic_id(current_user, data.clinica_id)
    proveedor = Proveedor(**data.model_dump(exclude={"clinica_id"}), clinica_id=clinica_id)
    db.add(proveedor)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PROVEEDOR_CREAR",
        entity_type="proveedores",
        entity_id=proveedor.id,
        new_values={"nombre": proveedor.nombre},
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(proveedor)
    return ProveedorResponse.model_validate(proveedor)


@router.patch("/proveedores/{proveedor_id}", response_model=ProveedorResponse)
async def actualizar_proveedor(
    proveedor_id: UUID,
    data: ProveedorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProveedorResponse:
    proveedor = await _get_proveedor(db, proveedor_id, current_user)
    old_values = ProveedorResponse.model_validate(proveedor).model_dump(mode="json")
    updates = data.model_dump(exclude_none=True)
    if "clinica_id" in updates:
        updates["clinica_id"] = resolve_clinic_id(current_user, updates["clinica_id"])
    for field, value in updates.items():
        setattr(proveedor, field, value)
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PROVEEDOR_EDITAR",
        entity_type="proveedores",
        entity_id=proveedor.id,
        old_values=jsonable_encoder(old_values),
        new_values=jsonable_encoder(updates),
        clinica_id=proveedor.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(proveedor)
    return ProveedorResponse.model_validate(proveedor)


@router.delete("/proveedores/{proveedor_id}", status_code=204)
async def desactivar_proveedor(
    proveedor_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> None:
    proveedor = await _get_proveedor(db, proveedor_id, current_user)
    proveedor.activo = False
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PROVEEDOR_DESACTIVAR",
        entity_type="proveedores",
        entity_id=proveedor.id,
        clinica_id=proveedor.clinica_id,
        request=request,
    )
    await db.commit()


@router.get("/pedidos", response_model=list[PedidoProveedorResponse])
async def listar_pedidos(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[PedidoProveedorResponse]:
    stmt = (
        select(PedidoProveedor)
        .options(selectinload(PedidoProveedor.lineas))
        .order_by(PedidoProveedor.fecha.desc(), PedidoProveedor.created_at.desc())
    )
    stmt = scope_select_by_clinic(stmt, PedidoProveedor, current_user)
    result = await db.execute(stmt)
    return [PedidoProveedorResponse.model_validate(item) for item in result.scalars().unique().all()]


@router.post("/pedidos", response_model=PedidoProveedorResponse, status_code=status.HTTP_201_CREATED)
async def crear_pedido(
    data: PedidoProveedorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    proveedor = await _get_proveedor(db, data.proveedor_id, current_user)
    clinica_id = resolve_clinic_id(current_user, data.clinica_id or proveedor.clinica_id)
    ensure_clinic_access(current_user, clinica_id)
    await _validar_lineas_pedido(db, current_user, data.lineas)

    pedido = PedidoProveedor(
        proveedor_id=data.proveedor_id,
        clinica_id=clinica_id,
        estado="borrador",
        fecha=data.fecha or date.today(),
        notas=data.notas,
        lineas=[
            PedidoLinea(
                producto_id=linea.producto_id,
                cantidad=linea.cantidad,
                coste_unitario=linea.coste_unitario,
            )
            for linea in data.lineas
        ],
    )
    db.add(pedido)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PEDIDO_CREAR",
        entity_type="pedidos_proveedor",
        entity_id=pedido.id,
        new_values={"proveedor_id": str(pedido.proveedor_id), "lineas": len(pedido.lineas)},
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    return await _get_pedido(db, pedido.id, current_user)


@router.patch("/pedidos/{pedido_id}", response_model=PedidoProveedorResponse)
async def actualizar_pedido(
    pedido_id: UUID,
    data: PedidoProveedorUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    pedido = await _get_pedido(db, pedido_id, current_user)
    if pedido.estado == "recibido":
        raise HTTPException(status_code=409, detail="Un pedido recibido no se puede modificar")
    old_values = PedidoProveedorResponse.model_validate(pedido).model_dump(mode="json")
    updates = data.model_dump(exclude_unset=True)
    lineas = updates.pop("lineas", None)
    for field, value in updates.items():
        setattr(pedido, field, value)
    if lineas is not None:
        await _validar_lineas_pedido(db, current_user, lineas)
        pedido.lineas = [
            PedidoLinea(producto_id=linea.producto_id, cantidad=linea.cantidad, coste_unitario=linea.coste_unitario)
            for linea in lineas
        ]
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PEDIDO_EDITAR",
        entity_type="pedidos_proveedor",
        entity_id=pedido.id,
        old_values=jsonable_encoder(old_values),
        new_values=jsonable_encoder(updates | ({"lineas": len(lineas)} if lineas is not None else {})),
        clinica_id=pedido.clinica_id,
        request=request,
    )
    await db.commit()
    return await _get_pedido(db, pedido.id, current_user)


@router.post("/pedidos/{pedido_id}/recibir", response_model=PedidoProveedorResponse)
async def recibir_pedido(
    pedido_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> PedidoProveedorResponse:
    pedido = await _get_pedido(db, pedido_id, current_user)
    if pedido.estado == "recibido":
        return PedidoProveedorResponse.model_validate(pedido)
    if pedido.estado == "cancelado":
        raise HTTPException(status_code=409, detail="No se puede recibir un pedido cancelado")
    if not pedido.lineas:
        raise HTTPException(status_code=409, detail="No se puede recibir un pedido sin líneas")

    pedido.estado = "recibido"
    for linea in pedido.lineas:
        producto = await _get_producto(db, linea.producto_id, current_user)
        data = MovimientoInventarioCreate(
            tipo="entrada",
            cantidad=linea.cantidad,
            motivo=f"Recepción pedido {pedido.id}",
            referencia_tipo="pedido_proveedor",
            referencia_id=pedido.id,
        )
        db.add(_aplicar_movimiento(producto, data, current_user.user_id))

    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PEDIDO_RECIBIR",
        entity_type="pedidos_proveedor",
        entity_id=pedido.id,
        new_values={"estado": "recibido", "lineas": len(pedido.lineas)},
        clinica_id=pedido.clinica_id,
        request=request,
    )
    await db.commit()
    return await _get_pedido(db, pedido.id, current_user)


@router.get("", response_model=list[ProductoResponse])
async def listar_inventario(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[ProductoResponse]:
    stmt = select(Producto).where(Producto.activo == True).order_by(Producto.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Producto, current_user)
    result = await db.execute(stmt)
    return [ProductoResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
async def crear_producto(
    data: ProductoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    clinica_id = resolve_clinic_id(current_user, data.clinica_id)
    if data.proveedor_id:
        proveedor = await _get_proveedor(db, data.proveedor_id, current_user)
        if proveedor.clinica_id:
            clinica_id = resolve_clinic_id(current_user, clinica_id or proveedor.clinica_id)
    producto = Producto(**data.model_dump(exclude={"clinica_id"}), clinica_id=clinica_id)
    db.add(producto)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PRODUCTO_CREAR",
        entity_type="productos",
        entity_id=producto.id,
        new_values={"nombre": producto.nombre, "stock_act": producto.stock_act},
        clinica_id=clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.patch("/{producto_id}", response_model=ProductoResponse)
async def actualizar_producto(
    producto_id: UUID,
    data: ProductoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    producto = await _get_producto(db, producto_id, current_user)
    old_values = ProductoResponse.model_validate(producto).model_dump(mode="json")
    updates = data.model_dump(exclude_none=True)
    if "clinica_id" in updates:
        updates["clinica_id"] = resolve_clinic_id(current_user, updates["clinica_id"])
    if updates.get("proveedor_id"):
        await _get_proveedor(db, updates["proveedor_id"], current_user)
    for field, value in updates.items():
        setattr(producto, field, value)
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PRODUCTO_EDITAR",
        entity_type="productos",
        entity_id=producto.id,
        old_values=jsonable_encoder(old_values),
        new_values=jsonable_encoder(updates),
        clinica_id=producto.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoInventarioResponse])
async def listar_movimientos_producto(
    producto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
) -> list[MovimientoInventarioResponse]:
    await _get_producto(db, producto_id, current_user)
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
)
async def registrar_movimiento_producto(
    producto_id: UUID,
    data: MovimientoInventarioCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> ProductoResponse:
    producto = await _get_producto(db, producto_id, current_user)
    old_stock = producto.stock_act
    movimiento = _aplicar_movimiento(producto, data, current_user.user_id)
    db.add(movimiento)
    await db.flush()
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_MOVIMIENTO_CREAR",
        entity_type="movimientos_inventario",
        entity_id=movimiento.id,
        old_values={"stock_act": old_stock},
        new_values={"tipo": data.tipo, "cantidad": data.cantidad, "stock_act": producto.stock_act},
        clinica_id=producto.clinica_id,
        request=request,
    )
    await db.commit()
    await db.refresh(producto)
    return ProductoResponse.model_validate(producto)


@router.delete("/{producto_id}", status_code=204)
async def desactivar_producto(
    producto_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[TokenData, Depends(require_admin)],
    request: Request,
) -> None:
    producto = await _get_producto(db, producto_id, current_user)
    producto.activo = False
    await write_audit_log(
        db,
        user=current_user,
        action="INVENTARIO_PRODUCTO_DESACTIVAR",
        entity_type="productos",
        entity_id=producto.id,
        clinica_id=producto.clinica_id,
        request=request,
    )
    await db.commit()
