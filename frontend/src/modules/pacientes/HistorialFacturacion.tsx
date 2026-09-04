import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { toast } from 'sonner';
import type { ApiPaciente, Cobro, Factura, HistorialClinico, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money } from '../../lib/utils';
import type { TreatmentVisual } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { emitirRecetaPdf, openFacturaPdf } from '../../lib/api';
import { amount, getBillingTotals, getFacturaPendientePreferida } from './billingUtils';
import { PatientOdontogramFlow } from '../odontogram';

type HistoryBillingRow = {
  id: string;
  date: string;
  tratamiento: string;
  pieza: string;
  doctor: string;
  factura: string;
  recibo: string;
  importe: number;
  cobrado: number;
  saldo: number;
  comentario: string;
  estado: string;
  treatment?: TreatmentVisual;
  facturaItem?: Factura;
};

const FINISHED_HISTORY_STATES = new Set(['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo']);

function sortByDate(a: { date: string }, b: { date: string }) {
  return a.date.localeCompare(b.date);
}

function hasFinishedState(estado?: string | null) {
  const value = (estado ?? '').toLowerCase();
  return FINISHED_HISTORY_STATES.has(value)
    || value.includes('realizado')
    || value.includes('facturado')
    || value.includes('cobrado')
    || value.includes('atendido')
    || value.includes('finalizado');
}

function getFacturaForHistorial(entrada: HistorialClinico, facturas: Factura[]) {
  const factura = entrada.factura_id
    ? facturas.find((item) => item.id === entrada.factura_id)
    : facturas.find((item) => item.lineas.some((linea) => linea.historial_id === entrada.id));
  const linea = factura?.lineas.find((item) => item.historial_id === entrada.id) ?? null;
  return { factura, linea };
}

function formatFactura(factura?: Factura | null) {
  return factura ? `${factura.serie}/${factura.numero}` : 'No';
}

function activeCobros(factura?: Factura | null) {
  return factura?.cobros.filter((cobro) => !cobro.anulado_at) ?? [];
}

function formatCobros(cobros: Cobro[]) {
  if (!cobros.length) return 'No';
  const lastCobro = cobros[cobros.length - 1];
  const formaPago = lastCobro?.forma_pago?.nombre;
  return formaPago ? `${cobros.length} - ${formaPago}` : `${cobros.length} cobro${cobros.length === 1 ? '' : 's'}`;
}

function buildHistoryBillingRows(historial: HistorialClinico[], facturas: Factura[]) {
  return historial
    .filter((entrada) => hasFinishedState(entrada.estado))
    .map((entrada) => {
      const { factura, linea } = getFacturaForHistorial(entrada, facturas);
      const cobros = activeCobros(factura);
      const importeLinea = amount(linea?.subtotal ?? entrada.importe);
      const importe = importeLinea || amount(entrada.importe);
      const totalFactura = amount(factura?.total);
      const totalCobrado = amount(factura?.total_cobrado);
      const factorLinea = factura && totalFactura > 0 && importe > 0 ? importe / totalFactura : 1;
      const cobrado = factura ? Math.min(importe, totalCobrado * factorLinea) : 0;
      const saldo = Math.max(0, importe - cobrado);

      return {
        id: `hist-${entrada.id}`,
        date: entrada.fecha,
        tratamiento: entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental',
        pieza: [entrada.pieza_dental ? String(entrada.pieza_dental) : '', entrada.caras].filter(Boolean).join(' '),
        doctor: entrada.doctor?.nombre ?? '',
        factura: formatFactura(factura),
        recibo: formatCobros(cobros),
        importe,
        cobrado,
        saldo,
        comentario: entrada.observaciones || entrada.diagnostico || '',
        estado: entrada.estado,
        treatment: entrada.tratamiento,
        facturaItem: factura,
      };
    })
    .sort(sortByDate);
}

function formatStateLabel(estado: string) {
  const value = estado.toLowerCase();
  const labels: Record<string, string> = {
    realizado: 'Realizado',
    facturado: 'Facturado',
    cobrado_parcial: 'Cobrado parcial',
    cobrado_completo: 'Cobrado',
  };
  return labels[value] ?? estado;
}

export function DentCoreHistoryBillingPanel({
  paciente,
  historial,
  facturas,
  onFacturar,
  onCobrar,
  onHistorialFacturas,
  onAddAnticipo,
  onCobrarImporte,
  onRecibos,
  onContextFactura,
  onCrearReceta,
  onOpenActivity,
  canManageBilling = true,
}: {
  paciente: ApiPaciente | null;
  historial: HistorialClinico[];
  facturas: Factura[];
  onFacturar: () => void;
  onCobrar: () => void;
  onHistorialFacturas: () => void;
  onAddAnticipo: () => void;
  onCobrarImporte: (factura: Factura) => void;
  onRecibos: () => void;
  onContextFactura: (event: MouseEvent, factura: Factura) => void;
  onCrearReceta?: () => void;
  onOpenActivity?: () => void;
  canManageBilling?: boolean;
}) {
  const rows = useMemo(() => buildHistoryBillingRows(historial, facturas), [historial, facturas]);
  const [historyMenu, setHistoryMenu] = useState<{ x: number; y: number; row: HistoryBillingRow | null } | null>(null);
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(false);
  const [historyActionsOpen, setHistoryActionsOpen] = useState(false);
  const historyToolbarRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRow = rows.find((row) => row.id === selectedId) ?? rows[rows.length - 1] ?? null;
  const selectedFactura = selectedRow?.facturaItem ?? null;
  const totals = getBillingTotals(facturas);
  const firstPendingFactura = getFacturaPendientePreferida(facturas, selectedFactura);

  function abrirFacturaPdf(factura: Factura) {
    void openFacturaPdf(factura.id).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la factura.');
    });
  }

  useEffect(() => {
    if (!historyActionsOpen && !invoiceMenuOpen) return;
    function handlePointerDown(event: globalThis.MouseEvent) {
      if (!historyToolbarRef.current?.contains(event.target as Node)) {
        setHistoryActionsOpen(false);
        setInvoiceMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHistoryActionsOpen(false);
        setInvoiceMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [historyActionsOpen, invoiceMenuOpen]);

  function openBlankHistoryMenu(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('tr')) return;
    event.preventDefault();
    setHistoryMenu({ x: event.clientX, y: event.clientY, row: null });
  }

  function handleCobradoDoubleClick(event: MouseEvent<HTMLTableCellElement>, row: HistoryBillingRow) {
    event.preventDefault();
    event.stopPropagation();
    if (row.facturaItem) {
      onCobrarImporte(row.facturaItem);
      return;
    }
    onAddAnticipo();
  }

  function openRowMenuFromButton(event: MouseEvent<HTMLButtonElement>, row: HistoryBillingRow) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    setSelectedId(row.id);
    setHistoryMenu({
      x: Math.max(10, Math.min(rect.left, window.innerWidth - menuWidth - 10)),
      y: Math.min(rect.bottom + 6, window.innerHeight - 160),
      row,
    });
  }

  return (
    <section className="history-billing-dentcore">
      <div className="history-ledger-toolbar">
        <div className="history-ledger-title">
          <strong>Historial de tratamientos</strong>
          <span>
            {paciente ? `${paciente.apellidos}, ${paciente.nombre} - H ${paciente.num_historial}` : 'Paciente sin seleccionar'}
            {' - '}
            {rows.length} realizado{rows.length === 1 ? '' : 's'}
            {canManageBilling && (
              <> - saldo {money(totals.pendiente)}</>
            )}
          </span>
        </div>
        <div className="history-toolbar-actions" ref={historyToolbarRef}>
          {canManageBilling && (
            <>
              <button onClick={() => {
                setHistoryActionsOpen(false);
                setInvoiceMenuOpen(false);
                if (firstPendingFactura) {
                  onCobrarImporte(firstPendingFactura);
                } else {
                  onCobrar();
                }
              }}>Cobrar</button>
              <span className="invoice-split-button">
                <button onClick={() => {
                  setHistoryActionsOpen(false);
                  setInvoiceMenuOpen((open) => !open);
                }}>Facturas</button>
                {invoiceMenuOpen && (
                  <span className="invoice-action-popover">
                    <button onClick={() => { onHistorialFacturas(); setInvoiceMenuOpen(false); }}>Historial de facturas</button>
                    <button onClick={() => { onFacturar(); setInvoiceMenuOpen(false); }}>Generar factura</button>
                  </span>
                )}
              </span>
            </>
          )}
          <span className="invoice-split-button history-more-button">
            <button
              type="button"
              className="secondary"
              aria-haspopup="menu"
              aria-expanded={historyActionsOpen}
              onClick={() => {
                setInvoiceMenuOpen(false);
                setHistoryActionsOpen((open) => !open);
              }}
            >
              Mas
            </button>
            {historyActionsOpen && (
              <span className="invoice-action-popover history-actions-popover" role="menu" aria-label="Mas acciones de historial">
                {canManageBilling && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setHistoryActionsOpen(false);
                      if (selectedFactura) abrirFacturaPdf(selectedFactura);
                    }}
                    disabled={!selectedFactura}
                  >
                    Imprimir
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setHistoryActionsOpen(false);
                    if (onCrearReceta) {
                      onCrearReceta();
                    } else if (selectedFactura) {
                      void emitirRecetaPdf(selectedFactura.id).catch((error) => {
                        toast.error(error instanceof Error ? error.message : 'No se pudo emitir la receta.');
                      });
                    }
                  }}
                  disabled={!onCrearReceta && !selectedFactura}
                >
                  Receta
                </button>
                {canManageBilling && (
                  <button role="menuitem" onClick={() => { setHistoryActionsOpen(false); onRecibos(); }}>Recibos</button>
                )}
                {onOpenActivity && (
                  <button role="menuitem" onClick={() => { setHistoryActionsOpen(false); onOpenActivity(); }}>Actividad completa</button>
                )}
              </span>
            )}
          </span>
        </div>
      </div>

      <div
        className="history-ledger-scroll"
        aria-label="Historial de tratamientos con desplazamiento"
        onContextMenu={canManageBilling ? openBlankHistoryMenu : undefined}
      >
        <table className="dentcore-table history-ledger-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Tratamiento</th>
              <th>Pieza</th>
              <th>Doctor</th>
              {canManageBilling && (
                <>
                  <th>Factura</th>
                  <th>Recibo/Cobro</th>
                  <th>Importe</th>
                  <th>Cobrado</th>
                  <th>Saldo</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${selectedRow?.id === row.id ? 'selected-row ' : ''}treatment-coded-row`}
                style={{ '--treatment-color': colorForTreatment(row.treatment) } as CSSProperties}
                onClick={() => setSelectedId(row.id)}
                onContextMenu={canManageBilling ? (event) => {
                  event.preventDefault();
                  setSelectedId(row.id);
                  setHistoryMenu({ x: event.clientX, y: event.clientY, row });
                } : undefined}
              >
                <td data-label="Fecha">{formatDate(row.date)}</td>
                <td data-label="Tipo"><TreatmentBadge tratamiento={row.treatment} /></td>
                <td data-label="Tratamiento" className="history-treatment-cell">
                  <strong>{row.tratamiento}</strong>
                  <small>{formatStateLabel(row.estado)}</small>
                </td>
                <td data-label="Pieza">{row.pieza}</td>
                <td data-label="Doctor">{row.doctor}</td>
                {canManageBilling && (
                  <>
                    <td data-label="Factura">{row.factura}</td>
                    <td data-label="Recibo/Cobro">{row.recibo}</td>
                    <td data-label="Importe" className="num">{row.importe ? money(row.importe) : '0,00'}</td>
                    <td data-label="Cobrado" className="num editable-cobrado-cell" onDoubleClick={(event) => handleCobradoDoubleClick(event, row)} title="Doble clic para anadir pago">{row.cobrado ? money(row.cobrado) : '0,00'}</td>
                    <td data-label="Saldo" className="num">{money(row.saldo)}</td>
                  </>
                )}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={canManageBilling ? 10 : 5}>Sin tratamientos realizados en el historial.</td></tr>}
          </tbody>
        </table>
        <div className="history-ledger-mobile-list" role="list" aria-label="Historial de tratamientos en tarjetas">
          {rows.map((row) => (
            <article
              key={`mobile-${row.id}`}
              className={`${selectedRow?.id === row.id ? 'selected-row ' : ''}history-treatment-card treatment-coded-row`}
              style={{ '--treatment-color': colorForTreatment(row.treatment) } as CSSProperties}
              role="listitem"
              aria-selected={selectedRow?.id === row.id}
              onClick={() => setSelectedId(row.id)}
              onContextMenu={canManageBilling ? (event) => {
                event.preventDefault();
                setSelectedId(row.id);
                setHistoryMenu({ x: event.clientX, y: event.clientY, row });
              } : undefined}
            >
              <header>
                <time dateTime={row.date}>{formatDate(row.date)}</time>
                <TreatmentBadge tratamiento={row.treatment} />
                {canManageBilling && (
                  <button
                    type="button"
                    className="history-card-menu-button"
                    aria-label="Mas acciones del tratamiento"
                    onClick={(event) => openRowMenuFromButton(event, row)}
                  >
                    ...
                  </button>
                )}
              </header>
              <strong className="history-card-treatment">{row.tratamiento}</strong>
              <div className="history-card-meta">
                <span>{formatStateLabel(row.estado)}</span>
                {row.pieza && <span>Pieza {row.pieza}</span>}
                {row.doctor && <span>{row.doctor}</span>}
              </div>
              {canManageBilling && (
                <>
                  <dl className="history-card-money">
                    <div>
                      <dt>Importe</dt>
                      <dd>{row.importe ? money(row.importe) : '0,00'}</dd>
                    </div>
                    <div>
                      <dt>Cobrado</dt>
                      <dd>{row.cobrado ? money(row.cobrado) : '0,00'}</dd>
                    </div>
                    <div>
                      <dt>Saldo</dt>
                      <dd className={row.saldo > 0 ? 'is-pending' : ''}>{money(row.saldo)}</dd>
                    </div>
                  </dl>
                  <footer>
                    <span>Factura {row.factura}</span>
                    <span>Cobro {row.recibo}</span>
                  </footer>
                </>
              )}
            </article>
          ))}
          {!rows.length && <div className="history-ledger-empty-card">Sin tratamientos realizados en el historial.</div>}
        </div>
      </div>

      <label className="history-comments">
        <span>Observaciones</span>
        <textarea
          readOnly
          value={selectedRow?.comentario || 'Sin observaciones especificas para el tratamiento seleccionado.'}
        />
      </label>
      {canManageBilling && historyMenu && (
        <div className="context-menu patient-context-menu history-row-context-menu" style={{ left: historyMenu.x, top: historyMenu.y }}>
          <strong>Historial / facturacion</strong>
          <button onClick={() => { onAddAnticipo(); setHistoryMenu(null); }}>Anadir pago / anticipo</button>
          {historyMenu.row?.facturaItem && (
            <>
              <button onClick={() => { onCobrarImporte(historyMenu.row!.facturaItem!); setHistoryMenu(null); }}>Anadir cobro a esta factura</button>
              <button onClick={(event) => { onContextFactura(event as unknown as MouseEvent, historyMenu.row!.facturaItem!); setHistoryMenu(null); }}>Opciones de factura</button>
            </>
          )}
          <button onClick={() => setHistoryMenu(null)}>Cerrar</button>
        </div>
      )}
    </section>
  );
}

export function InvoiceHistoryModal({
  facturas,
  onClose,
}: {
  facturas: Factura[];
  onClose: () => void;
}) {
  function abrirFacturaPdf(factura: Factura) {
    void openFacturaPdf(factura.id).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la factura.');
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="document-modal invoice-history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-titlebar">
          <strong>Historial de facturas</strong>
          <button onClick={onClose}>Cerrar</button>
        </header>
        <div className="invoice-history-list">
          <table className="dentcore-table">
            <thead><tr><th>Fecha</th><th>Factura</th><th>Estado</th><th>Total</th><th>Cobrado</th><th>Pendiente</th><th>PDF</th></tr></thead>
            <tbody>
              {facturas.map((factura) => (
                <tr key={factura.id}>
                  <td>{formatDate(factura.fecha)}</td>
                  <td><strong>{factura.serie}/{factura.numero}</strong></td>
                  <td>{factura.estado}</td>
                  <td className="num">{money(factura.total)}</td>
                  <td className="num">{money(factura.total_cobrado)}</td>
                  <td className="num">{money(factura.pendiente)}</td>
                  <td><button onClick={() => abrirFacturaPdf(factura)}>Abrir</button></td>
                </tr>
              ))}
              {!facturas.length && <tr><td colSpan={7}>Este paciente no tiene facturas emitidas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ClinicalHistoryPanel({ paciente, historial, onFacturar, onCobrar, onVerDeuda, onAsociarFactura, userRole }: { paciente: ApiPaciente | null; historial: HistorialClinico[]; onFacturar: () => void; onCobrar: () => void; onVerDeuda: () => void; onAsociarFactura: () => void; userRole?: UserRole | null }) {
  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Historial clinico</strong><span>Observaciones por tratamiento, no mezcladas con la ficha general</span></div>
      <table className="dentcore-table treatment-table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Diagnostico</th><th>Estado</th><th>Importe</th><th>Factura</th></tr></thead>
        <tbody>
          {historial.map((entrada, index) => (
            <tr key={entrada.id} className={index === 0 ? 'selected-row treatment-coded-row' : 'treatment-coded-row'} style={{ '--treatment-color': colorForTreatment(entrada.tratamiento) } as CSSProperties}>
              <td>{formatDate(entrada.fecha)}</td>
              <td><TreatmentBadge tratamiento={entrada.tratamiento} /></td>
              <td>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</td>
              <td>{entrada.pieza_dental ?? ''}</td>
              <td>{entrada.diagnostico ?? ''}</td>
              <td>{entrada.estado}</td>
              <td className="num">{entrada.importe ? money(entrada.importe) : ''}</td>
              <td>{entrada.factura_id ? 'Si' : 'No'}</td>
            </tr>
          ))}
          {!historial.length && <tr><td colSpan={8}>Sin historial clinico registrado.</td></tr>}
        </tbody>
      </table>
      <div className="history-footer">
        <button onClick={onFacturar}>Generar factura</button>
        <button onClick={onCobrar}>Anadir cobro</button>
        <button onClick={onVerDeuda}>Ver deuda</button>
        <button onClick={onAsociarFactura}>Asociar factura</button>
      </div>
      <PatientOdontogramFlow
        paciente={paciente}
        mode="history"
        title="Historial por pieza"
        subtitle="Mapa de lectura para filtrar y consultar la evolucion clinica por pieza."
        readOnly
        enableQuickTreatments={false}
        userRole={userRole}
      />
    </section>
  );
}
