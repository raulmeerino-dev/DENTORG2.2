import { api } from './client';
import type {
  Factura,
  Presupuesto,
  PresupuestoLinea,
  TrabajoPendiente,
} from './types';
import { openOrDownloadBlob } from './downloads';

export async function getPresupuestos(pacienteId: string) {
  const { data } = await api.get<Presupuesto[]>('/presupuestos', { params: { paciente_id: pacienteId } });
  return data;
}

export async function createPresupuesto(pacienteId: string, doctorId: string, lineas: Array<{
  tratamiento_id: string;
  pieza_dental?: number | null;
  caras?: string | null;
  precio_unitario: string | number;
  descuento_porcentaje?: string | number;
}> = []) {
  const { data: created } = await api.post<Presupuesto>('/presupuestos', {
    paciente_id: pacienteId,
    doctor_id: doctorId,
    fecha: new Date().toISOString().slice(0, 10),
    lineas: lineas.map((linea) => ({
      tratamiento_id: linea.tratamiento_id,
      pieza_dental: linea.pieza_dental ?? null,
      caras: linea.caras || null,
      precio_unitario: Number(linea.precio_unitario),
      descuento_porcentaje: Number(linea.descuento_porcentaje ?? 0),
    })),
  });
  return created;
}

export async function presentarPresupuesto(presupuestoId: string) {
  const { data: presented } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/presentar`);
  return presented;
}

export async function aceptarPresupuesto(presupuestoId: string, lineaIds?: string[]) {
  const { data: accepted } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/aceptar`, {
    linea_ids: lineaIds ?? null,
    pasar_a_trabajo_pendiente: true,
  });
  return accepted;
}

export async function rechazarPresupuesto(presupuestoId: string, motivo?: string | null) {
  const { data: rejected } = await api.post<Presupuesto>(`/presupuestos/${presupuestoId}/rechazar`, { motivo });
  return rejected;
}

export async function convertirPresupuestoFactura(presupuestoId: string, data?: { serie?: string; fecha?: string; forma_pago_id?: string | null }) {
  const { data: factura } = await api.post<Factura>(`/presupuestos/${presupuestoId}/convertir-a-factura`, {
    serie: data?.serie ?? 'A',
    fecha: data?.fecha ?? new Date().toISOString().slice(0, 10),
    forma_pago_id: data?.forma_pago_id ?? null,
    solo_aceptadas: true,
  });
  return factura;
}

export async function addPresupuestoLinea(presupuestoId: string, data: {
  tratamiento_id: string;
  pieza_dental?: number | null;
  caras?: string | null;
  precio_unitario: string | number;
  descuento_porcentaje?: string | number;
}) {
  const { data: created } = await api.post<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas`, {
    tratamiento_id: data.tratamiento_id,
    pieza_dental: data.pieza_dental ?? null,
    caras: data.caras || null,
    precio_unitario: Number(data.precio_unitario),
    descuento_porcentaje: Number(data.descuento_porcentaje ?? 0),
  });
  return created;
}

export async function updatePresupuestoLinea(presupuestoId: string, lineaId: string, data: Partial<{
  revision: number;
  pieza_dental: number | null;
  caras: string | null;
  precio_unitario: string | number;
  descuento_porcentaje: string | number;
  aceptado: boolean;
}>) {
  const { data: updated } = await api.patch<PresupuestoLinea>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`, data);
  return updated;
}

export async function deletePresupuestoLinea(presupuestoId: string, lineaId: string) {
  await api.delete<void>(`/presupuestos/${presupuestoId}/lineas/${lineaId}`);
}

export async function pasarPresupuestoTrabajoPendiente(presupuestoId: string) {
  const { data } = await api.post<TrabajoPendiente[]>(`/presupuestos/${presupuestoId}/pasar-trabajo-pendiente`);
  return data;
}

export async function getTrabajosPendientesPaciente(pacienteId: string, soloPendiente = true) {
  const { data } = await api.get<TrabajoPendiente[]>(`/presupuestos/trabajo-pendiente/${pacienteId}`, {
      params: { solo_pendiente: soloPendiente },
    });
  return data;
}

export function presupuestoPdfUrl(presupuestoId: string) {
  return `${api.defaults.baseURL}/pdf/presupuestos/${presupuestoId}`;
}

export async function openPresupuestoPdf(presupuestoId: string) {
  const { data } = await api.get<Blob>(`/pdf/presupuestos/${presupuestoId}`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `presupuesto_${presupuestoId}.pdf`, { requirePdf: true });
}
