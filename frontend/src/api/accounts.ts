import { api } from "./client";
import type { Factura } from "./types";

export interface PatientCharge {
  id: string;
  historial_id: string | null;
  factura_id: string | null;
  cita_id: string | null;
  doctor_id: string | null;
  concepto: string;
  fecha: string;
  pieza_dental: number | null;
  caras: string | null;
  importe: string | null;
  cobrado: string;
  pendiente: string;
  motivo_cero: string | null;
  origen: string;
}
export interface AccountMovement {
  id: string;
  tipo: "cobro" | "anticipo";
  fecha: string;
  importe: string;
  forma_pago: string;
  aplicado: string;
  anulado: boolean;
  factura_id: string | null;
  concepto?: string | null;
  notas?: string | null;
  motivo_anulacion?: string | null;
}
export interface PatientAccount {
  paciente_id: string;
  paciente_nombre: string;
  version: string;
  cargos: PatientCharge[];
  movimientos: AccountMovement[];
  total_cargos: string;
  total_cobrado: string;
  pendiente_cargos: string;
  saldo_favor: string;
  saldo: string;
  realizado_hoy: string;
  saldo_anterior: string;
  sin_valorar: number;
  cita_id: string | null;
  doctor_id: string | null;
  gabinete_id: string | null;
  pendiente_salida: boolean;
}
export interface CheckoutInput {
  request_id: string;
  version: string;
  importe: string;
  forma_pago_id: string | null;
  usar_saldo_favor: boolean;
  cita_id: string | null;
  resolver_salida: boolean;
  notas?: string;
}
export interface CheckoutReceipt {
  operacion_id: string;
  cobro_id: string | null;
  importe_recibido: string;
  saldo_aplicado: string;
  saldo_pendiente: string;
  salida_resuelta: boolean;
}
export interface AccountRow {
  id: string;
  nombre: string;
  apellidos: string;
  num_historial: number;
  total_cargos: string;
  total_cobrado: string;
  saldo: string;
  sin_valorar: number;
}
export const getPatientAccount = async (id: string, citaId?: string | null) =>
  (
    await api.get<PatientAccount>(`/cuentas/${id}`, {
      params: { cita_id: citaId || undefined },
    })
  ).data;
export const getCheckoutQueue = async () =>
  (await api.get<PatientAccount[]>("/cuentas/salidas")).data;
export const getPendingAccounts = async (q = "", offset = 0) =>
  (
    await api.get<{ items: AccountRow[]; total: number }>("/cuentas", {
      params: { q, offset, limit: 50 },
    })
  ).data;
export const confirmCheckout = async (id: string, payload: CheckoutInput) =>
  (await api.post<CheckoutReceipt>(`/cuentas/${id}/checkout`, payload)).data;
export const invoiceCharges = async (
  id: string,
  cargoIds: string[],
  requestId: string,
) =>
  (
    await api.post<Factura>(
      `/cuentas/${id}/facturar`,
      { cargo_ids: cargoIds, request_id: requestId },
      { timeout: 60000 },
    )
  ).data;
export const valueCharge = async (
  patientId: string,
  chargeId: string,
  base: string,
  motivo: string,
) =>
  (
    await api.patch<PatientAccount>(
      `/cuentas/${patientId}/cargos/${chargeId}/valorar`,
      { base, motivo },
    )
  ).data;

export const cancelAccountPayment = async (
  patientId: string,
  paymentId: string,
  motivo: string,
) =>
  api.post<void>(`/cuentas/${patientId}/cobros/${paymentId}/anular`, {
    motivo,
  });
