import type { Factura } from '../../../api/types';

export function amount(value?: string | number | null) {
  return Number(value ?? 0) || 0;
}

export function getBillingTotals(facturas: Factura[]) {
  return facturas.reduce(
    (totals, factura) => ({
      facturado: totals.facturado + (['borrador', 'anulada'].includes(factura.estado) ? 0 : amount(factura.total)),
      // Cancelling a document does not cancel money already received.
      cobrado: totals.cobrado + amount(factura.total_cobrado),
      pendiente: totals.pendiente + (['borrador', 'anulada'].includes(factura.estado) ? 0 : amount(factura.pendiente)),
    }),
    { facturado: 0, cobrado: 0, pendiente: 0 },
  );
}

export function isFacturaPendiente(factura: Factura) {
  return amount(factura.pendiente) > 0 && !['borrador', 'anulada'].includes(factura.estado);
}

export function getFacturasPendientes(facturas: Factura[]) {
  return facturas.filter(isFacturaPendiente);
}

export function getPagosParciales(facturas: Factura[]) {
  return facturas.filter((factura) => isFacturaPendiente(factura) && amount(factura.total_cobrado) > 0);
}

export function getFacturasRecientes(facturas: Factura[], limit = 3) {
  return [...facturas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limit);
}

export function getFacturaPendientePreferida(facturas: Factura[], selected?: Factura | null) {
  if (selected && isFacturaPendiente(selected)) return selected;
  return getFacturasPendientes(facturas)[0] ?? null;
}
