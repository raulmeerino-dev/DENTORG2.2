import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { ApiPaciente, Cobro, Factura, HistorialClinico, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money } from '../../lib/utils';
import type { TreatmentVisual } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { emitirRecetaPdf, facturaPdfUrl } from '../../lib/api';
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

export function EurodentHistoryBillingPanel({
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

  return (
    <section className="history-billing-eurodent">
      <div className="history-ledger-toolbar">
        <div className="history-ledger-title">
          <strong>Historial de tratamientos</strong>
          <span>
            {paciente ? `${paciente.apellidos}, ${paciente.nombre} - H ${paciente.num_historial}` : 'Paciente sin seleccionar'}
            {' - '}
            {rows.length} realizado{rows.length === 1 ? '' : 's'}
            {' - '}
            saldo {money(totals.pendiente)}
          </span>
        </div>
        <div className="history-toolbar-actions" ref={historyToolbarRef}>
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
                <button
                  role="menuitem"
                  onClick={() => {
                    setHistoryActionsOpen(false);
                    if (selectedFactura) window.open(facturaPdfUrl(selectedFactura.id), '_blank');
                  }}
                  disabled={!selectedFactura}
                >
                  Imprimir
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setHistoryActionsOpen(false);
                    if (onCrearReceta) {
                      onCrearReceta();
                    } else if (selectedFactura) {
                      void emitirRecetaPdf(selectedFactura.id);
                    }
                  }}
                  disabled={!onCrearReceta && !selectedFactura}
                >
                  Receta
                </button>
                <button role="menuitem" onClick={() => { setHistoryActionsOpen(false); onRecibos(); }}>Recibos</button>
                {onOpenActivity && (
                  <button role="menuitem" onClick={() => { setHistoryActionsOpen(false); onOpenActivity(); }}>Actividad completa</button>
                )}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="history-ledger-scroll" aria-label="Historial de tratamientos con desplazamiento" onContextMenu={openBlankHistoryMenu}>
        <table className="euro-table history-ledger-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Tratamiento</th>
              <th>Pieza</th>
              <th>Doctor</th>
              <th>Factura</th>
              <th>Recibo/Cobro</th>
              <th>Importe</th>
              <th>Cobrado</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${selectedRow?.id === row.id ? 'selected-row ' : ''}treatment-coded-row`}
                style={{ '--treatment-color': colorForTreatment(row.treatment) } as CSSProperties}
                onClick={() => setSelectedId(row.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelectedId(row.id);
                  setHistoryMenu({ x: event.clientX, y: event.clientY, row });
                }}
              >
                <td>{formatDate(row.date)}</td>
                <td><TreatmentBadge tratamiento={row.treatment} /></td>
                <td className="history-treatment-cell">
                  <strong>{row.tratamiento}</strong>
                  <small>{formatStateLabel(row.estado)}</small>
                </td>
                <td>{row.pieza}</td>
                <td>{row.doctor}</td>
                <td>{row.factura}</td>
                <td>{row.recibo}</td>
                <td className="num">{row.importe ? money(row.importe) : '0,00'}</td>
                <td className="num editable-cobrado-cell" onDoubleClick={(event) => handleCobradoDoubleClick(event, row)} title="Doble clic para anadir pago">{row.cobrado ? money(row.cobrado) : '0,00'}</td>
                <td className="num">{money(row.saldo)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10}>Sin tratamientos realizados en el historial.</td></tr>}
          </tbody>
        </table>
      </div>

      <label className="history-comments">
        <span>Observaciones</span>
        <textarea
          readOnly
          value={selectedRow?.comentario || 'Sin observaciones especificas para el tratamiento seleccionado.'}
        />
      </label>
      {historyMenu && (
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
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="document-modal invoice-history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-titlebar">
          <strong>Historial de facturas</strong>
          <button onClick={onClose}>Cerrar</button>
        </header>
        <div className="invoice-history-list">
          <table className="euro-table">
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
                  <td><button onClick={() => window.open(facturaPdfUrl(factura.id), '_blank')}>Abrir</button></td>
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
      <table className="euro-table treatment-table">
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
