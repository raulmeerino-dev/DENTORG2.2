import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, Calendar, FileText, TrendingUp, Wallet, CheckCircle2 } from 'lucide-react';
import { getFacturas, getFormasPago, registrarCobro } from '../../../api/billing';
import { getIngresosReporte, getReportKpis } from '../../../api/reporting';
import type { Factura, FormaPago } from '../../../api/types';
import { formatDate, money } from '../../../shared/format';
import { Dialog } from '../../../design-system';
import { clinicDate, clinicDateKey } from '../../../shared/time/clinicTime';
import { StatusChip } from '../../../design-system';
import './cash-register.css';

function CobroInlineModal({
  factura,
  formasPago,
  saving,
  error,
  patientName,
  onClose,
  onConfirm,
}: {
  factura: Factura;
  formasPago: FormaPago[];
  saving: boolean;
  error?: string;
  patientName: string;
  onClose: () => void;
  onConfirm: (formaPagoId: string, importe: number) => void;
}) {
  const [formaPagoId, setFormaPagoId] = useState(formasPago[0]?.id ?? '');
  const [importeStr, setImporteStr] = useState(factura.pendiente);
  const importe = Number(importeStr.replace(',', '.'));
  const valid = formaPagoId && Number.isFinite(importe) && importe > 0;

  return (
    <Dialog label="Registrar cobro" onClose={onClose} closeDisabled={saving} className="cash-payment-dialog">
        <div className="modal-titlebar">
          <strong>Registrar cobro</strong>
          <button type="button" disabled={saving} onClick={onClose}>Cerrar</button>
        </div>
        <div className="cash-payment-fields">
          <strong>{patientName}</strong>
          <p style={{ margin: 0 }}>
            Factura {factura.serie}-{factura.numero} · Pendiente: <strong>{money(factura.pendiente)}</strong>
          </p>
          <label>
            Forma de pago
            <select value={formaPagoId} onChange={(e) => setFormaPagoId(e.target.value)}>
              {formasPago.map((fp) => <option key={fp.id} value={fp.id}>{fp.nombre}</option>)}
            </select>
          </label>
          <label>
            Importe (€)
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={importeStr}
              onChange={(e) => setImporteStr(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="inline-alert" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-action"
            disabled={!valid || saving}
            onClick={() => onConfirm(formaPagoId, importe)}
          >
            {saving ? 'Registrando...' : 'Registrar cobro'}
          </button>
        </footer>
    </Dialog>
  );
}

export default function CajaPage() {
  const queryClient = useQueryClient();
  const today = clinicDate(new Date());
  const mesDesde = `${today.slice(0, 7)}-01`;
  const [page, setPage] = useState(0);
  const [cobroTarget, setCobroTarget] = useState<Factura | null>(null);
  const [tab, setTab] = useState<'pendientes' | 'hoy' | 'todas'>('pendientes');

  const facturasQuery = useQuery({ queryKey: ['caja-facturas'], queryFn: ({ signal }) => getFacturas(undefined, signal) });
  const formasPagoQuery = useQuery({ queryKey: ['formas-pago'], queryFn: getFormasPago });
  const kpisQuery = useQuery({ queryKey: ['caja-kpis', mesDesde, today], queryFn: () => getReportKpis({ fecha_desde: mesDesde, fecha_hasta: today }) });
  const ingresosQuery = useQuery({
    queryKey: ['caja-ingresos', mesDesde, today],
    queryFn: () => getIngresosReporte(mesDesde, today),
  });

  const cobrarMutation = useMutation({
    mutationFn: ({ facturaId, formaPagoId, importe }: { facturaId: string; formaPagoId: string; importe: number }) =>
      registrarCobro(facturaId, formaPagoId, importe),
    onSuccess: (factura) => {
      setCobroTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['caja-facturas'] });
      void queryClient.invalidateQueries({ queryKey: ['caja-kpis'] });
      void queryClient.invalidateQueries({ queryKey: ['caja-ingresos'] });
      void queryClient.invalidateQueries({ queryKey: ['facturas-global'] });
      void queryClient.invalidateQueries({ queryKey: ['facturas', factura.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['saldo-paciente', factura.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['report-pacientes'] });
      void queryClient.invalidateQueries({ queryKey: ['report-kpis'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-report-kpis'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-report-dashboard'] });
    },
  });

  const facturas = facturasQuery.data ?? [];
  const formasPago = formasPagoQuery.data ?? [];
  const kpis = kpisQuery.data;
  const patientsById = new Map(facturas.filter(invoice => invoice.paciente).map(invoice => [invoice.paciente_id, invoice.paciente!]));
  const patientLabel = (id: string) => {
    const patient = patientsById.get(id);
    return patient ? [patient.apellidos, patient.nombre].filter(Boolean).join(', ') : 'Paciente no disponible';
  };

  const pendientes = facturas.filter((f) => Number(f.pendiente) > 0);
  const cobradashoy = facturas.filter((f) => f.cobros.some((c) => clinicDateKey(c.fecha) === today && !c.anulado_at));
  const emitidashoy = facturas.filter((f) => f.fecha.slice(0, 10) === today);

  const totalPendiente = pendientes.reduce((sum, f) => sum + Number(f.pendiente), 0);
  const totalCobradoHoy = cobradashoy.reduce((sum, f) => {
    const cobrosHoy = f.cobros.filter((c) => clinicDateKey(c.fecha) === today && !c.anulado_at);
    return sum + cobrosHoy.reduce((s, c) => s + Number(c.importe), 0);
  }, 0);
  const totalEmitidoHoy = emitidashoy.reduce((sum, f) => sum + Number(f.total), 0);

  const rows = tab === 'pendientes' ? pendientes : tab === 'hoy' ? emitidashoy : facturas;

  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <section className="cash-workspace" aria-label="Caja">
      <header className="cash-toolbar">
        <h1>Caja</h1><span>Cobros y facturas</span><time dateTime={today}>{formatDate(today)}</time>
      </header>

      {facturasQuery.isError && (
        <div className="inline-alert" role="alert">No se han podido cargar las facturas. <button type="button" onClick={() => void facturasQuery.refetch()}>Reintentar</button></div>
      )}

      {(kpisQuery.isError || ingresosQuery.isError) && <div className="inline-alert" role="alert">No se ha podido cargar el resumen del mes.</div>}
      {formasPagoQuery.isError && <div className="inline-alert" role="alert">No se han podido cargar las formas de pago.</div>}

      <div className="cash-totals" aria-label="Resumen de caja">
        <div className={totalPendiente > 0 ? 'cash-total cash-total--pending' : 'cash-total'}>
          <span><AlertCircle size={12} strokeWidth={2.2} aria-hidden="true" /> Pendiente de cobro</span>
          <strong>{facturasQuery.data ? money(totalPendiente) : '—'}</strong>
          <small>{facturasQuery.data ? `${pendientes.length} facturas` : 'Sin datos disponibles'}</small>
        </div>
        <div className="cash-total cash-total--paid">
          <span><CheckCircle2 size={12} strokeWidth={2.2} aria-hidden="true" /> Cobrado hoy</span>
          <strong>{facturasQuery.data ? money(totalCobradoHoy) : '—'}</strong>
          <small>{facturasQuery.data ? `${cobradashoy.length} facturas con cobros` : 'Sin datos disponibles'}</small>
        </div>
        <div className="cash-total">
          <span><FileText size={12} strokeWidth={2.2} aria-hidden="true" /> Facturado hoy</span>
          <strong>{facturasQuery.data ? money(totalEmitidoHoy) : '—'}</strong>
          <small>{facturasQuery.data ? `${emitidashoy.length} facturas` : 'Sin datos disponibles'}</small>
        </div>
        <div className="cash-total">
          <span><Calendar size={12} strokeWidth={2.2} aria-hidden="true" /> Facturado este mes</span>
          <strong>{kpis ? money(kpis.facturacion.total_facturado) : '—'}</strong>
          <small>{kpis ? `${kpis.facturacion.num_facturas} facturas` : kpisQuery.isError ? 'Sin datos disponibles' : 'Cargando…'}</small>
        </div>
        <div className="cash-total">
          <span><Wallet size={12} strokeWidth={2.2} aria-hidden="true" /> Cobrado este mes</span>
          <strong>{kpis ? money(kpis.facturacion.total_cobrado) : '—'}</strong>
          <small>{kpis ? `ticket medio ${money(kpis.facturacion.ticket_medio ?? 0)}` : ''}</small>
        </div>
        <div className="cash-total">
          <span><TrendingUp size={12} strokeWidth={2.2} aria-hidden="true" /> Ingresos mes (bruto)</span>
          <strong>{ingresosQuery.data ? money(ingresosQuery.data.total) : '—'}</strong>
          <small>{ingresosQuery.data ? `pac ${money(ingresosQuery.data.pac)} · seg ${money(ingresosQuery.data.seg)}` : ''}</small>
        </div>
      </div>

      <div className="cash-tabs" aria-label="Filtros de facturas de caja">
        <button type="button" aria-pressed={tab === 'pendientes'} className={tab === 'pendientes' ? 'active' : ''} onClick={() => { setTab('pendientes'); setPage(0); }}>
          Pendientes de cobro ({pendientes.length})
        </button>
        <button type="button" aria-pressed={tab === 'hoy'} className={tab === 'hoy' ? 'active' : ''} onClick={() => { setTab('hoy'); setPage(0); }}>
          Emitidas hoy ({emitidashoy.length})
        </button>
        <button type="button" aria-pressed={tab === 'todas'} className={tab === 'todas' ? 'active' : ''} onClick={() => { setTab('todas'); setPage(0); }}>
          Todas las facturas ({facturas.length})
        </button>
      </div>

      <div className="cash-ledger" tabIndex={0} role="region" aria-label="Facturas de caja">
        <table className="dentcore-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Factura</th>
              <th>Paciente</th>
              <th className="num">Total</th>
              <th className="num">Cobrado</th>
              <th className="num">Pendiente</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturasQuery.isLoading && (
              <tr><td colSpan={8}>Cargando facturas...</td></tr>
            )}
            {!facturasQuery.isLoading && rows.slice(currentPage * 50, (currentPage + 1) * 50).map((factura) => {
              const pending = Number(factura.pendiente);
              return (
                <tr key={factura.id} className={pending > 0 ? 'row-pending' : ''}>
                  <td>{formatDate(factura.fecha)}</td>
                  <td>{factura.serie}-{factura.numero}</td>
                  <td>
                    <Link to={`/pacientes?paciente_id=${factura.paciente_id}`} className="dashboard-patient-link">
                      {patientLabel(factura.paciente_id)}
                    </Link>
                  </td>
                  <td className="num">{money(factura.total)}</td>
                  <td className="num">{money(factura.total_cobrado)}</td>
                  <td className="num">{money(factura.pendiente)}</td>
                  <td>
                    <StatusChip tone={factura.estado === 'pagada' ? 'success' : factura.estado === 'anulada' ? 'neutral' : pending > 0 ? 'warning' : 'info'}>{{ emitida: 'Emitida', parcial: 'Parcial', pagada: 'Pagada', anulada: 'Anulada', borrador: 'Borrador' }[factura.estado] ?? factura.estado}</StatusChip>
                  </td>
                  <td>
                    {pending > 0 && (
                      <button
                        type="button"
                        onClick={() => { cobrarMutation.reset(); setCobroTarget(factura); }}
                        disabled={cobrarMutation.isPending || !formasPago.length}
                      >
                        Cobrar
                      </button>
                    )}
                    <Link to={`/pacientes?paciente_id=${factura.paciente_id}`} style={{ marginLeft: 4 }}>
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!facturasQuery.isLoading && !facturasQuery.isError && !rows.length && (
              <tr><td colSpan={8}>
                {tab === 'pendientes' ? 'No hay facturas pendientes de cobro.' : 'No hay facturas en este filtro.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="cash-pagination">
        <span>{rows.length ? `${currentPage * 50 + 1}–${Math.min((currentPage + 1) * 50, rows.length)} de ${rows.length} facturas` : facturasQuery.isError ? 'Facturas no disponibles' : facturasQuery.isLoading ? 'Cargando…' : 'Sin facturas'}</span>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button>
        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
      </footer>

      {cobroTarget && (
        <CobroInlineModal
          factura={cobroTarget}
          formasPago={formasPago}
          saving={cobrarMutation.isPending}
          patientName={patientLabel(cobroTarget.paciente_id)}
          error={cobrarMutation.error ? (cobrarMutation.error instanceof Error ? cobrarMutation.error.message : 'No se pudo registrar el cobro.') : undefined}
          onClose={() => setCobroTarget(null)}
          onConfirm={(formaPagoId, importe) => cobrarMutation.mutate({ facturaId: cobroTarget.id, formaPagoId, importe })}
        />
      )}
    </section>
  );
}
