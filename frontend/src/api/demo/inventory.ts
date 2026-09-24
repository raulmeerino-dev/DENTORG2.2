import type {
  MovimientoInventario,
  PedidoProveedorInventario,
  ProductoInventario,
  ProveedorInventario,
} from '../types';

export async function getInventario(): Promise<ProductoInventario[]> {
  return [
    { id: 'demo-prod-1', clinica_id: null, nombre: 'Amoxicilina', categoria: 'Farmacia', sku: null, stock_min: 10, stock_act: 50, unidad: 'caja', coste_unitario: 12, proveedor_id: null, activo: true },
    { id: 'demo-prod-2', clinica_id: null, nombre: 'Guantes nitrilo M', categoria: 'Desechable', sku: null, stock_min: 20, stock_act: 8, unidad: 'caja', coste_unitario: 6, proveedor_id: null, activo: true },
  ];
}

export async function getAlertasStock(): Promise<ProductoInventario[]> {
  return [];
}

export async function getMovimientosInventario(): Promise<MovimientoInventario[]> {
  return [];
}

export async function getProveedoresInventario(): Promise<ProveedorInventario[]> {
  return [];
}

export async function getPedidosInventario(): Promise<PedidoProveedorInventario[]> {
  return [];
}
