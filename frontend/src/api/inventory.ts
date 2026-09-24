import { api } from './client';
import type {
  MovimientoInventario,
  PedidoProveedorInventario,
  ProductoInventario,
  ProveedorInventario,
} from './types';

export async function getInventario() {
  const { data } = await api.get<ProductoInventario[]>('/inventario');
  return data;
}

export async function getAlertasStock() {
  const { data } = await api.get<ProductoInventario[]>('/inventario/alertas-stock');
  return data;
}

export async function createProductoInventario(data: Partial<ProductoInventario> & { nombre: string; stock_min: number; stock_act: number }) {
  const { data: created } = await api.post<ProductoInventario>('/inventario', data);
  return created;
}

export async function updateProductoInventario(id: string, data: Partial<ProductoInventario>) {
  const { data: updated } = await api.patch<ProductoInventario>(`/inventario/${id}`, data);
  return updated;
}

export async function getMovimientosInventario(productoId: string) {
  const { data } = await api.get<MovimientoInventario[]>(`/inventario/${productoId}/movimientos`);
  return data;
}

export async function registrarMovimientoInventario(productoId: string, data: {
  tipo: MovimientoInventario['tipo'];
    cantidad: number;
    motivo?: string | null;
    factura_id?: string | null;
    referencia_tipo?: string | null;
    referencia_id?: string | null;
}) {
  const { data: updated } = await api.post<ProductoInventario>(`/inventario/${productoId}/movimientos`, data);
  return updated;
}

export async function getProveedoresInventario() {
  const { data } = await api.get<ProveedorInventario[]>('/inventario/proveedores');
  return data;
}

export async function createProveedorInventario(data: {
  nombre: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  notas?: string | null;
}) {
  const { data: created } = await api.post<ProveedorInventario>('/inventario/proveedores', data);
  return created;
}

export async function getPedidosInventario() {
  const { data } = await api.get<PedidoProveedorInventario[]>('/inventario/pedidos');
  return data;
}

export async function createPedidoInventario(data: {
  proveedor_id: string;
  fecha?: string | null;
  notas?: string | null;
  lineas: { producto_id: string; cantidad: number; coste_unitario: number }[];
}) {
  const { data: created } = await api.post<PedidoProveedorInventario>('/inventario/pedidos', data);
  return created;
}

export async function updatePedidoInventario(id: string, data: Partial<PedidoProveedorInventario>) {
  const { data: updated } = await api.patch<PedidoProveedorInventario>(`/inventario/pedidos/${id}`, data);
  return updated;
}

export async function recibirPedidoInventario(id: string) {
  const { data } = await api.post<PedidoProveedorInventario>(`/inventario/pedidos/${id}/recibir`);
  return data;
}
