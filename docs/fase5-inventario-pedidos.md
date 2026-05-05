# Fase 5 - Inventario y pedidos

## Objetivo

Convertir el inventario básico en un módulo útil para clínica dental: productos, proveedores, movimientos de stock, alertas de mínimo y pedidos a proveedor.

## Backend

- Se amplían `productos` con clínica, categoría, SKU, unidad, coste unitario y proveedor.
- Se amplían `proveedores` con clínica, contacto y notas.
- Se amplían `movimientos_inventario` con referencia genérica para vincular entradas a pedidos u otros procesos.
- Se añaden `pedidos_proveedor` y `pedido_lineas`.
- Las consultas se filtran por clínica cuando el usuario tiene clínica asignada.
- Las acciones críticas se auditan:
  - crear/editar/desactivar producto;
  - registrar movimiento;
  - crear/editar/recibir pedido;
  - crear/editar/desactivar proveedor.

## Endpoints

- `GET /api/inventario`
- `POST /api/inventario`
- `PATCH /api/inventario/{producto_id}`
- `DELETE /api/inventario/{producto_id}`
- `GET /api/inventario/{producto_id}/movimientos`
- `POST /api/inventario/{producto_id}/movimientos`
- `GET /api/inventario/alertas-stock`
- `GET /api/inventario/proveedores`
- `POST /api/inventario/proveedores`
- `PATCH /api/inventario/proveedores/{proveedor_id}`
- `DELETE /api/inventario/proveedores/{proveedor_id}`
- `GET /api/inventario/pedidos`
- `POST /api/inventario/pedidos`
- `PATCH /api/inventario/pedidos/{pedido_id}`
- `POST /api/inventario/pedidos/{pedido_id}/recibir`

## Frontend

En administración, la pestaña Inventario queda organizada en:

- stock y alertas;
- nuevo producto y movimientos;
- proveedores;
- pedidos a proveedor.

Al recibir un pedido se generan movimientos de entrada y se actualiza el stock real.

## Tests

Se añade cobertura para:

- crear proveedor;
- crear producto con proveedor;
- detectar alerta bajo mínimo;
- crear pedido;
- marcar pedido como enviado;
- recibir pedido;
- comprobar aumento de stock;
- comprobar movimiento vinculado al pedido.
