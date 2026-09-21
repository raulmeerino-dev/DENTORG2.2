"""Application use cases: tenant checks, orchestration and existing transactions."""
from datetime import date
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit_log import write_audit_log
from app.core.permissions import (
    TokenData,
    ensure_clinic_access,
    resolve_clinic_id,
    scope_select_by_clinic,
)
from app.domains.inventory.persistence.inventario import (
    MovimientoInventario,
    PedidoLinea,
    PedidoProveedor,
    Producto,
    Proveedor,
)
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


async def listar_alertas_stock(db: AsyncSession, current_user: TokenData) -> list[ProductoResponse]:
    stmt = select(Producto).where(Producto.activo == True, Producto.stock_act < Producto.stock_min).order_by(Producto.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Producto, current_user)
    result = await db.execute(stmt)
    return [ProductoResponse.model_validate(item) for item in result.scalars().all()]


async def listar_proveedores(db: AsyncSession, current_user: TokenData) -> list[ProveedorResponse]:
    stmt = select(Proveedor).where(Proveedor.activo == True).order_by(Proveedor.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Proveedor, current_user)
    result = await db.execute(stmt)
    return [ProveedorResponse.model_validate(item) for item in result.scalars().all()]


async def crear_proveedor(data: ProveedorCreate, db: AsyncSession, current_user: TokenData, request: Request) -> ProveedorResponse:
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


async def actualizar_proveedor(proveedor_id: UUID, data: ProveedorUpdate, db: AsyncSession, current_user: TokenData, request: Request) -> ProveedorResponse:
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


async def desactivar_proveedor(proveedor_id: UUID, db: AsyncSession, current_user: TokenData, request: Request) -> None:
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


async def listar_pedidos(db: AsyncSession, current_user: TokenData) -> list[PedidoProveedorResponse]:
    stmt = (
        select(PedidoProveedor)
        .options(selectinload(PedidoProveedor.lineas))
        .order_by(PedidoProveedor.fecha.desc(), PedidoProveedor.created_at.desc())
    )
    stmt = scope_select_by_clinic(stmt, PedidoProveedor, current_user)
    result = await db.execute(stmt)
    return [PedidoProveedorResponse.model_validate(item) for item in result.scalars().unique().all()]


async def crear_pedido(data: PedidoProveedorCreate, db: AsyncSession, current_user: TokenData, request: Request) -> PedidoProveedorResponse:
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


async def actualizar_pedido(pedido_id: UUID, data: PedidoProveedorUpdate, db: AsyncSession, current_user: TokenData, request: Request) -> PedidoProveedorResponse:
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


async def recibir_pedido(pedido_id: UUID, db: AsyncSession, current_user: TokenData, request: Request) -> PedidoProveedorResponse:
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


async def listar_inventario(db: AsyncSession, current_user: TokenData) -> list[ProductoResponse]:
    stmt = select(Producto).where(Producto.activo == True).order_by(Producto.nombre)  # noqa: E712
    stmt = scope_select_by_clinic(stmt, Producto, current_user)
    result = await db.execute(stmt)
    return [ProductoResponse.model_validate(item) for item in result.scalars().all()]


async def crear_producto(data: ProductoCreate, db: AsyncSession, current_user: TokenData, request: Request) -> ProductoResponse:
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


async def actualizar_producto(producto_id: UUID, data: ProductoUpdate, db: AsyncSession, current_user: TokenData, request: Request) -> ProductoResponse:
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


async def listar_movimientos_producto(producto_id: UUID, db: AsyncSession, current_user: TokenData) -> list[MovimientoInventarioResponse]:
    await _get_producto(db, producto_id, current_user)
    result = await db.execute(
        select(MovimientoInventario)
        .where(MovimientoInventario.producto_id == producto_id)
        .order_by(MovimientoInventario.created_at.desc())
    )
    return [MovimientoInventarioResponse.model_validate(item) for item in result.scalars().all()]


async def registrar_movimiento_producto(producto_id: UUID, data: MovimientoInventarioCreate, db: AsyncSession, current_user: TokenData, request: Request) -> ProductoResponse:
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


async def desactivar_producto(producto_id: UUID, db: AsyncSession, current_user: TokenData, request: Request) -> None:
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
