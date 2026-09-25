import type { HistoryData, HistoryRow } from './historyRows';
import type { HistoryActions } from './HistoryRowDetail';
import { formatDate, money } from '../../../shared/format';
import { clinicDateKey } from '../../../shared/time/clinicTime';

/** Read the same allocations as checkout; never apportion invoice totals by percentage. */
export function HistoryEconomics({
  row,
  data,
  actions,
}: {
  row: HistoryRow;
  data: HistoryData;
  actions: HistoryActions;
}) {
  const account = data.account;
  if (!account) return null;
  if (row.payment) {
    const applications = (row.payment.aplicaciones ?? []).flatMap((a) => {
      const charge = account.cargos.find((c) => c.id === a.cargo_id);
      return charge ? [{ ...a, charge }] : [];
    });
    return (
      <section className="patient-history-economics" aria-label="Destino del pago">
        <strong>
          {row.payment.anulado
            ? 'Aplicaciones originales del pago anulado'
            : 'Aplicado a tratamientos / cargos'}
        </strong>
        {applications.length ? (
          <table className="patient-history-detail-table">
            <thead>
              <tr>
                <th>Tratamiento / cargo</th>
                <th>Pieza</th>
                <th className="ph-numeric">Aplicado (€)</th>
                <th className="ph-numeric">Pendiente actual (€)</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(({ charge, importe }) => (
                <tr key={charge.id}>
                  <td>
                    {charge.historial_id && actions.onOpenRecord ? (
                      <button type="button" onClick={() => actions.onOpenRecord?.(charge.historial_id!)}>
                        {charge.concepto}
                      </button>
                    ) : (
                      charge.concepto
                    )}
                  </td>
                  <td>{[charge.pieza_dental, charge.caras].filter(Boolean).join(' ') || '—'}</td>
                  <td className="ph-numeric">
                    {money(importe)}
                    {row.payment?.anulado ? ' · Anulado' : ''}
                  </td>
                  <td className="ph-numeric">{money(charge.pendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Sin aplicaciones a cargos activos.</p>
        )}
        {!row.payment.anulado && Number(row.payment.importe) > Number(row.payment.aplicado) && (
          <p>
            A cuenta, aún sin aplicar: {money(Number(row.payment.importe) - Number(row.payment.aplicado))} €.
          </p>
        )}
      </section>
    );
  }
  const chargeIds = new Set(row.chargeIds ?? []);
  if (row.group === 'facturacion')
    account.cargos.filter((c) => c.factura_id === row.invoice?.id).forEach((c) => chargeIds.add(c.id));
  if (!chargeIds.size) return null;
  const payments = account.movimientos
    .flatMap((m) => {
      const applications = m.aplicaciones?.filter((a) => chargeIds.has(a.cargo_id)) ?? [];
      return applications.length
        ? [
            {
              movement: m,
              applied:
                applications.reduce((total, a) => total + Math.round(Number(a.importe) * 100), 0) / 100,
            },
          ]
        : [];
    })
    .sort((a, b) => a.movement.fecha.localeCompare(b.movement.fecha));
  return (
    <section className="patient-history-economics" aria-label="Pagos relacionados">
      <strong>Pagos relacionados</strong>
      {payments.length ? (
        <>
          <table className="patient-history-detail-table">
            <thead>
              <tr>
                <th>Fecha del pago</th>
                <th>Movimiento</th>
                <th className="ph-numeric">Recibido (€)</th>
                <th className="ph-numeric">Aplicado aquí (€)</th>
                <th className="ph-numeric">Saldo de cuenta al registrar (€)</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(({ movement: m, applied }) => (
                <tr key={m.id}>
                  <td>{formatDate(clinicDateKey(m.fecha))}</td>
                  <td>
                    <button type="button" onClick={() => actions.onOpenRecord?.(m.id)}>
                      {m.tipo === 'anticipo' ? 'Anticipo' : 'Cobro'} · {m.forma_pago}
                    </button>
                    {m.anulado && <span> · Anulado</span>}
                  </td>
                  <td className="ph-numeric">{money(m.importe)}</td>
                  <td className="ph-numeric">{money(m.anulado ? 0 : applied)}</td>
                  <td className="ph-numeric">
                    {m.saldo_tras_operacion == null || m.anulado ? '—' : money(m.saldo_tras_operacion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="patient-history-help">
            El saldo al registrar corresponde a la cuenta completa en ese momento. «—» indica que no se guardó
            ese saldo o que el pago está anulado. Los importes aplicados muestran la situación actual.
          </p>
        </>
      ) : (
        <p>Sin pagos aplicados a estos tratamientos.</p>
      )}
    </section>
  );
}

export function HistoryLinkedTreatments({
  row,
  actions,
  billing,
}: {
  row: HistoryRow;
  actions: HistoryActions;
  billing: boolean;
}) {
  if (!row.children?.length) return null;
  const multipleProfessionals = new Set(row.children.map((c) => c.professionalId)).size > 1;
  const multipleInvoices = billing && !row.invoice;
  return (
    <section className="patient-history-economics" aria-label="Tratamientos incluidos">
      <strong>{row.visit ? 'Tratamientos de la sesión' : 'Tratamientos incluidos'}</strong>
      <table className="patient-history-detail-table">
        <thead>
          <tr>
            <th>Tratamiento</th>
            <th>Pieza / superficies</th>
            {multipleProfessionals && <th>Profesional</th>}
            {multipleInvoices && <th>Factura</th>}
            {billing && (
              <>
                <th className="ph-numeric">Importe (€)</th>
                <th className="ph-numeric">Cobrado (€)</th>
                <th className="ph-numeric">Pendiente (€)</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {row.children.map((child) => (
            <tr key={child.id}>
              <td>
                <button
                  type="button"
                  aria-label={`Ver tratamiento: ${child.concept}${child.pieces.length ? ` · ${child.pieces.join(', ')}` : ''}`}
                  onClick={() => actions.onOpenRecord?.(child.recordId)}
                >
                  {child.concept}
                </button>
                {child.observation && <small>{child.observation}</small>}
              </td>
              <td>{[child.pieces.join(', '), child.treatment?.caras].filter(Boolean).join(' · ') || '—'}</td>
              {multipleProfessionals && <td>{child.professional || '—'}</td>}
              {multipleInvoices && (
                <td>
                  {child.invoice ? (
                    <button type="button" onClick={() => actions.onOpenFactura(child.invoice!)}>
                      {child.invoice.serie}/{child.invoice.numero}
                    </button>
                  ) : (
                    'Sin facturar'
                  )}
                </td>
              )}
              {billing && (
                <>
                  {(['amount', 'paid', 'balance'] as const).map((field) => (
                    <td className="ph-numeric" key={field}>
                      {child[field] == null ? '—' : money(child[field]!)}
                    </td>
                  ))}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
