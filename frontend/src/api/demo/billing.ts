import type {
  Factura,
  FormaPago,
  HistorialSinFacturar,
  PagoAnticipadoPaciente,
  SaldoPaciente,
} from '../types';
import { DEMO_FACTURAS, DEMO_FORMAS_PAGO, DEMO_HISTORIAL } from './data';

export async function getFacturas(pacienteId?: string): Promise<Factura[]> {
  return pacienteId ? DEMO_FACTURAS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-')) : DEMO_FACTURAS;
}

export async function getSaldoPaciente(pacienteId: string): Promise<SaldoPaciente> {
  const facturas = DEMO_FACTURAS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-'));
  const totalFacturado = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const totalCobrado = facturas.reduce((sum, factura) => sum + Number(factura.total_cobrado ?? 0), 0);
  return {
    paciente_id: pacienteId,
    total_facturado: totalFacturado.toFixed(2),
    total_cobrado: totalCobrado.toFixed(2),
    pendiente: (totalFacturado - totalCobrado).toFixed(2),
    facturas_pendientes: facturas.filter((factura) => Number(factura.pendiente) > 0).length,
  };
}

export async function getPagosAnticipadosPaciente(): Promise<PagoAnticipadoPaciente[]> {
  return [];
}

export async function getHistorialSinFacturar(pacienteId: string): Promise<HistorialSinFacturar[]> {
  const fallback = DEMO_HISTORIAL
    .filter((item) => (item.paciente_id === pacienteId || pacienteId.startsWith('demo-')) && !item.factura_id)
    .map<HistorialSinFacturar>((item) => ({
      id: item.id,
      fecha: item.fecha,
      pieza_dental: item.pieza_dental,
      caras: item.caras,
      observaciones: item.observaciones,
      tratamiento_id: item.tratamiento_id,
      tratamiento_nombre: item.tratamiento?.nombre ?? item.procedimiento ?? 'Tratamiento dental',
      tratamiento_precio: item.importe ?? '0',
      tratamiento_iva: '0',
      doctor_id: item.doctor_id,
      doctor_nombre: item.doctor?.nombre ?? 'Doctor',
    }));
  return fallback;
}

export async function getFormasPago(): Promise<FormaPago[]> {
  return DEMO_FORMAS_PAGO;
}
