import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getFacturas, getFormasPago, getIngresosReporte, getReportKpis, registrarCobro } from '../../lib/api';
import type { Factura, FormaPago } from '../../types/api';
import { formatDate, money } from '../../lib/utils';

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function CobroInlineModal({
  factura,
  formasPago,
  saving,
  onClose,
  onConfirm,
}: {
  factura: Factura;
  formasPago: FormaPago[];
  saving: boolean;
  onClose: () => void;
  onConfirm: (formaPagoId: string, importe: number) => void;
}) {
  const [formaPagoId, setFormaPagoId] = useState(formasPago[0]?.id ?? '');
  const [importeStr, setImporteStr] = useState(factura.pendiente);
  const importe = Number(importeStr.replace(',', '.'));
  const valid = formaPagoId && Number.isFinite(importe) && importe > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="patient-edit-modal" style={{ maxWidth: 400 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <strong>Registrar cobro</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid" style={{ padding: '1rem', gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
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
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-action"
            disabled={!valid || saving}
            onClick={() => onConfirm(formaPagoId, importe)}
          >
            {saving ? 'Registrando...' : 'Registrar cobro'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function CajaPage() {
  const queryClient = useQueryClient();
  const today = todayIso();
  const mesDesde = monthStart();
  const [cobroTarget, setCobroTarget] = useState<Factura | null>(null);
  const [tab, setTab] = useState<'pendientes' | 'hoy' | 'todas'>('pendientes');

  const facturasQuery = useQuery({ queryKey: ['caja-facturas'], queryFn: () => getFacturas() });
  const formasPagoQuery = useQuery({ queryKey: ['formas-pago'], queryFn: getFormasPago });
  const kpisQuery = useQuery({ queryKey: ['caja-kpis'], queryFn: getReportKpis });
  const ingresosQuery = useQuery({
    queryKey: ['caja-ingresos', mesDesde, today],
    queryFn: () => getIngresosReporte(mesDesde, today),
  });

  const cobrarMutation = useMutation({
    mutationFn: ({ facturaId, formaPagoId, importe }: { facturaId: string; formaPagoId: string; importe: number }) =>
      registrarCobro(facturaId, formaPagoId, importe),
    onSuccess: () => {
      setCobroTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['caja-facturas'] });
      void queryClient.invalidateQueries({ queryKey: ['caja-kpis'] });
      void queryClient.invalidateQueries({ queryKey: ['caja-ingresos'] });
    },
  });

  const facturas = facturasQuery.data ?? [];
  const formasPago = formasPagoQuery.data ?? [];
  const kpis = kpisQuery.data;

  const pendientes = facturas.filter((f) => Number(f.pendiente) > 0);
  const cobradashoy = facturas.filter((f) => f.cobros.some((c) => c.fecha.slice(0, 10) === today && !c.anulado_at));
  const emitidashoy = facturas.filter((f) => f.fecha.slice(0, 10) === today);

  const totalPendiente = pendientes.reduce((sum, f) => sum + Number(f.pendiente), 0);
  const totalCobradoHoy = cobradashoy.reduce((sum, f) => {
    const cobrosHoy = f.cobros.filter((c) => c.fecha.slice(0, 10) === today && !c.anulado_at);
    return sum + cobrosHoy.reduce((s, c) => s + Number(c.importe), 0);
  }, 0);
  const totalEmitidoHoy = emitidashoy.reduce((sum, f) => sum + Number(f.total), 0);

  const rows = tab === 'pendientes' ? pendientes : tab === 'hoy' ? emitidashoy : facturas;

  return (
    <section className="page fichero-screen">
      <div className="panel-caption" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <strong>Caja</strong>
        <span>Cobros, facturas y arqueo diario</span>
      </div>

      {facturasQuery.isError && (
        <div className="inline-alert">No se han podido cargar las facturas. Revisa la conexión.</div>
      )}

      <div className="dashboard-metrics">
        <div>
          <span>Pendiente de cobro</span>
          <strong>{money(totalPendiente)}</strong>
          <small>{pendientes.length} facturas</small>
        </div>
        <div>
          <span>Cobrado hoy</span>
          <strong>{money(totalCobradoHoy)}</strong>
          <small>{cobradashoy.length} cobros</small>
        </div>
        <div>
          <span>Facturado hoy</span>
          <strong>{money(totalEmitidoHoy)}</strong>
          <small>{emitidashoy.length} facturas</small>
        </div>
        <div>
          <span>Facturado este mes</span>
          <strong>{kpis ? money(kpis.facturacion.total_facturado) : '—'}</strong>
          <small>{kpis ? `${kpis.facturacion.num_facturas} facturas` : 'cargando...'}</small>
        </div>
        <div>
          <span>Cobrado este mes</span>
          <strong>{kpis ? money(kpis.facturacion.total_cobrado) : '—'}</strong>
          <small>{kpis ? `ticket medio ${money(kpis.facturacion.ticket_medio ?? 0)}` : ''}</small>
        </div>
        <div>
          <span>Ingresos mes (bruto)</span>
          <strong>{ingresosQuery.data ? money(ingresosQuery.data.total) : '—'}</strong>
          <small>{ingresosQuery.data ? `pac ${money(ingresosQuery.data.pac)} · seg ${money(ingresosQuery.data.seg)}` : ''}</small>
        </div>
      </div>

      <div className="desk-tabs" style={{ marginBottom: '0.5rem' }}>
        <button className={tab === 'pendientes' ? 'active' : ''} onClick={() => setTab('pendientes')}>
          Pendientes de cobro ({pendientes.length})
        </button>
        <button className={tab === 'hoy' ? 'active' : ''} onClick={() => setTab('hoy')}>
          Emitidas hoy ({emitidashoy.length})
        </button>
        <button className={tab === 'todas' ? 'active' : ''} onClick={() => setTab('todas')}>
          Todas las facturas ({facturas.length})
        </button>
      </div>

      <div className="caja-table-wrap">
        <table className="euro-table">
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
            {!facturasQuery.isLoading && rows.map((factura) => {
              const pending = Number(factura.pendiente);
              return (
                <tr key={factura.id} className={pending > 0 ? 'row-pending' : ''}>
                  <td>{formatDate(factura.fecha)}</td>
                  <td>{factura.serie}-{factura.numero}</td>
                  <td>
                    <Link to={`/pacientes?paciente_id=${factura.paciente_id}`} className="dashboard-patient-link">
                      Paciente
                    </Link>
                  </td>
                  <td className="num">{money(factura.total)}</td>
                  <td className="num">{money(factura.total_cobrado)}</td>
                  <td className="num">{money(factura.pendiente)}</td>
                  <td>
                    <span className={`status-pill status-${factura.estado}`}>{factura.estado}</span>
                  </td>
                  <td>
                    {pending > 0 && (
                      <button
                        type="button"
                        onClick={() => setCobroTarget(factura)}
                        disabled={cobrarMutation.isPending}
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
            {!facturasQuery.isLoading && !rows.length && (
              <tr><td colSpan={8}>
                {tab === 'pendientes' ? 'No hay facturas pendientes de cobro.' : 'No hay facturas en este filtro.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {cobroTarget && (
        <CobroInlineModal
          factura={cobroTarget}
          formasPago={formasPago}
          saving={cobrarMutation.isPending}
          onClose={() => setCobroTarget(null)}
          onConfirm={(formaPagoId, importe) => cobrarMutation.mutate({ facturaId: cobroTarget.id, formaPagoId, importe })}
        />
      )}
    </section>
  );
}
