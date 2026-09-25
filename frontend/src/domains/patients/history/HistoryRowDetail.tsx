import type { Consentimiento, DocumentoPaciente, Factura, Presupuesto, Cita } from '../../../api/types';
import { clinicDateKey } from '../../../shared/time/clinicTime';
import { formatDate, money } from '../../../shared/format';
import { isClinicalVisit, isPerformedTreatment, type HistoryData, type HistoryRow } from './historyRows';
import { useState } from 'react';
import { openPaymentReceipt } from '../../../api/billing';
import { getApiErrorMessage } from '../../../api/errors';
import { HistoryEconomics, HistoryLinkedTreatments } from './HistoryEconomics';

export interface HistoryActions {
  onOpenDocumento: (document: DocumentoPaciente) => void;
  onOpenConsentimiento: (consent: Consentimiento) => void;
  onOpenFactura: (invoice: Factura) => void;
  onOpenPresupuesto?: (budget: Presupuesto) => void;
  onOpenVisit: (visit: Cita) => void;
  onOpenRecord?: (recordId: string) => void;
}
export function HistoryRowDetail({
  row,
  data,
  actions,
  billing,
}: {
  row: HistoryRow;
  data: HistoryData;
  actions: HistoryActions;
  billing: boolean;
}) {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const treatment = row.treatment;
  const relatedVisit = row.visit || data.citas.find((c) => c.id === treatment?.cita_id);
  const visit = relatedVisit && isClinicalVisit(relatedVisit, data) ? relatedVisit : undefined;
  const treatmentIds = new Set(
    treatment
      ? [treatment.id]
      : row.children?.map((child) => child.recordId) ?? (visit
        ? data.historial.filter((t) => t.cita_id === visit.id && isPerformedTreatment(t)).map((t) => t.id)
        : []),
  );
  const documents = data.documentos.filter((d) => d.historial_id && treatmentIds.has(d.historial_id));
  const consents = data.consentimientos.filter((c) => c.historial_id && treatmentIds.has(c.historial_id));
  const fields = [
    { label: 'Fecha', value: row.day ? formatDate(row.day) : 'Sin fecha registrada' },
    { label: 'Profesional', value: row.professional || 'No consta' },
    ...(row.status ? [{ label: 'Estado', value: row.status }] : []),
    ...(row.pieces.length ? [{ label: 'Piezas', value: row.pieces.join(', ') }] : []),
    ...row.fields,
  ];
  if (billing) {
    if (row.invoice) fields.push({ label: 'Factura', value: `${row.invoice.serie}/${row.invoice.numero}` });
    if (row.amount != null)
      fields.push({
        label: 'Importe',
        value: `${money(row.amount)} €`,
      });
    if (row.paid != null)
      fields.push({
        label: row.group === 'facturacion' ? 'Cobrado actual de la factura' : row.visit ? 'Cobrado de la sesión' : row.treatment ? 'Cobrado del tratamiento' : 'Cobro efectivo',
        value: `${money(row.paid)} €`,
      });
    if (row.balance != null)
      fields.push({ label: row.balanceAtPayment ? 'Saldo de cuenta al registrar el pago' : row.visit ? 'Pendiente de la sesión' : row.treatment ? 'Pendiente del tratamiento' : 'Saldo actual de la factura', value: `${money(row.balance)} €` });
  }
  return (
    <section className="patient-history-detail" aria-label={`Detalle de ${row.type.toLowerCase()}`}>
      <strong>{row.observation === row.concept ? row.type : row.concept}</strong>
      <dl>
        {fields.map((field, i) => (
          <div key={i}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      <HistoryLinkedTreatments row={row} actions={actions} billing={billing} />
      {row.observation && (
        <div className="patient-history-observation">
          <strong>Observaciones</strong>
          <p>{row.observation}</p>
        </div>
      )}
      {billing && treatment && (
        <p className="patient-history-billing-status">
          {row.invoice
            ? `Factura ${row.invoice.serie}/${row.invoice.numero} · ${row.invoice.estado}`
            : row.amount != null && Number(row.amount) === 0
              ? 'Cortesía · 0 € · Sin factura'
              : 'Pendiente de facturar'}
        </p>
      )}
      {billing && <HistoryEconomics row={row} data={data} actions={actions} />}
      {billing && row.invoice && !data.account && (
        <section className="patient-history-payments" aria-label="Cobros relacionados con la factura">
          <strong>
            Factura {row.invoice.serie}/{row.invoice.numero} · Cobrado {money(row.invoice.total_cobrado)} € ·{' '}
            {Number(row.invoice.pendiente) < 0 ? 'A favor' : 'Pendiente'}{' '}
            {money(row.invoice.estado === 'anulada' ? 0 : Math.abs(Number(row.invoice.pendiente)))} €
          </strong>
          {row.invoice.cobros.map((payment) => (
            <p key={payment.id}>
              {formatDate(clinicDateKey(payment.fecha))} · {payment.forma_pago?.nombre || 'Cobro'} ·{' '}
              {money(payment.importe)} €
              {payment.anulado_at ? ` · Anulado: ${payment.motivo_anulacion || 'Sin motivo registrado'}` : ''}
            </p>
          ))}
          {!row.invoice.cobros.length && <p>Sin cobros registrados en esta factura.</p>}
        </section>
      )}
      <div className="patient-history-detail-actions">
        {billing && row.payment?.tipo === 'cobro' && (
          <button type="button" onClick={() => {
            setReceiptError(null);
            void openPaymentReceipt(row.payment!.id).catch(e => setReceiptError(getApiErrorMessage(e, 'No se pudo abrir el recibo.')));
          }}>Abrir recibo</button>
        )}
        {billing && !row.invoice && row.relatedInvoices?.map(invoice => (
          <button key={invoice.id} type="button" onClick={() => actions.onOpenFactura(invoice)}>
            Abrir factura {invoice.serie}/{invoice.numero}
          </button>
        ))}
        {visit && (
          <>
            <button type="button" onClick={() => actions.onOpenVisit(visit)}>
              Abrir visita
            </button>
            <a
              href={`/jornada?vista=agenda&cita_id=${encodeURIComponent(visit.id)}&fecha=${encodeURIComponent(clinicDateKey(visit.fecha_hora))}`}
            >
              Abrir cita en Agenda
            </a>
          </>
        )}
        {row.budget && actions.onOpenPresupuesto && (
          <button type="button" onClick={() => actions.onOpenPresupuesto?.(row.budget!)}>
            Abrir presupuesto #{row.budget.numero}
          </button>
        )}
        {row.invoice && billing && (
          <button type="button" onClick={() => actions.onOpenFactura(row.invoice!)}>
            Abrir factura {row.invoice.serie}/{row.invoice.numero}
          </button>
        )}
        {documents.map((d) => (
          <button type="button" key={d.id} onClick={() => actions.onOpenDocumento(d)}>
            Documento · {d.nombre_original}
          </button>
        ))}
        {consents.map((c) => (
          <button type="button" key={c.id} onClick={() => actions.onOpenConsentimiento(c)}>
            Consentimiento · {c.tipo}
          </button>
        ))}
      </div>
      {receiptError && <p role="alert">{receiptError}</p>}
    </section>
  );
}
