import { api } from './client';
import type {
  CumplimientoSif,
  Factura,
  FormaPago,
  HistorialSinFacturar,
  PagoAnticipadoPaciente,
  SaldoPaciente,
} from './types';
import { openOrDownloadBlob } from './downloads';

export async function getFacturas(pacienteId?: string) {
  const { data } = await api.get<Factura[]>('/facturas', { params: pacienteId ? { paciente_id: pacienteId } : {} });
  return data;
}

export async function getSaldoPaciente(pacienteId: string) {
  const { data } = await api.get<SaldoPaciente>(`/pacientes/${pacienteId}/saldo`);
  return data;
}

export async function getPagosAnticipadosPaciente(pacienteId: string) {
  const { data } = await api.get<PagoAnticipadoPaciente[]>(`/pacientes/${pacienteId}/pagos-anticipados`);
  return data;
}

export async function createPagoAnticipadoPaciente(pacienteId: string, data: {
  importe: number;
  forma_pago_id: string;
  concepto?: string;
  notas?: string | null;
}) {
  const { data: created } = await api.post<PagoAnticipadoPaciente>(`/pacientes/${pacienteId}/pagos-anticipados`, data);
  return created;
}

export async function updatePagoAnticipadoPaciente(pacienteId: string, pagoId: string, data: Partial<{
  importe: number;
  forma_pago_id: string;
  concepto: string;
  notas: string | null;
}>) {
  const { data: updated } = await api.patch<PagoAnticipadoPaciente>(`/pacientes/${pacienteId}/pagos-anticipados/${pagoId}`, data);
  return updated;
}

export async function getHistorialSinFacturar(pacienteId: string) {
  const { data } = await api.get<HistorialSinFacturar[]>('/facturas/historial-sin-facturar', { params: { paciente_id: pacienteId } });
  return data;
}

export async function getFormasPago() {
  const { data } = await api.get<FormaPago[]>('/facturas/formas-pago');
  return data;
}

export async function createFacturaManual(pacienteId: string, concepto: string, importe: number) {
  const { data: factura } = await api.post<Factura>('/facturas', {
    paciente_id: pacienteId,
    serie: 'A',
    fecha: new Date().toISOString().slice(0, 10),
    tipo: 'paciente',
    lineas: [{
      concepto,
      cantidad: 1,
      precio_unitario: importe,
      iva_porcentaje: 0,
    }],
  });
  return factura;
}

export async function createFacturaDesdeHistorial(pacienteId: string, data: {
  fecha: string;
  serie: string;
  forma_pago_id?: string | null;
  descuento_porcentaje?: number;
  observaciones?: string | null;
  lineas: HistorialSinFacturar[];
}) {
  const descuento = Math.max(0, Math.min(100, Number(data.descuento_porcentaje ?? 0)));
  const { data: factura } = await api.post<Factura>('/facturas', {
    paciente_id: pacienteId,
    serie: data.serie || 'A',
    fecha: data.fecha,
    tipo: 'paciente',
    forma_pago_id: data.forma_pago_id ?? null,
    observaciones: data.observaciones ?? 'Factura generada desde historial clinico',
    lineas: data.lineas.map((linea) => ({
      historial_id: linea.id,
      concepto: linea.tratamiento_nombre,
      cantidad: 1,
      precio_unitario: Number(linea.tratamiento_precio) * (1 - descuento / 100),
      iva_porcentaje: Number(linea.tratamiento_iva ?? 0),
    })),
  });
  return factura;
}

export async function registrarCobro(facturaId: string, formaPagoId: string, importe: number) {
  const { data: factura } = await api.post<Factura>(`/facturas/${facturaId}/pagos`, {
    forma_pago_id: formaPagoId,
    importe,
  });
  return factura;
}

export async function getCumplimientoSif() {
  const { data } = await api.get<CumplimientoSif>('/admin/cumplimiento-sif');
  return data;
}

export function facturaPdfUrl(facturaId: string) {
  return `${api.defaults.baseURL}/pdf/facturas/${facturaId}`;
}

export async function openFacturaPdf(facturaId: string) {
  const { data } = await api.get<Blob>(`/pdf/facturas/${facturaId}`, { responseType: 'blob' });
  return openOrDownloadBlob(data, `factura_${facturaId}.pdf`, { requirePdf: true });
}
