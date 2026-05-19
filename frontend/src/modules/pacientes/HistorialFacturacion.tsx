import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { ApiPaciente, Factura, HistorialClinico, PagoAnticipadoPaciente, UserRole } from '../../types/api';
import { colorForTreatment, formatDate, money } from '../../lib/utils';
import type { TreatmentVisual } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { emitirRecetaPdf, facturaPdfUrl } from '../../lib/api';
import { amount, getBillingTotals, getFacturaPendientePreferida, getPagosParciales } from './billingUtils';
import { PatientOdontogramFlow } from '../odontogram';

type HistoryBillingRow = {
  id: string;
  kind: 'tratamiento' | 'cobro' | 'factura' | 'anticipo';
  date: string;
  tratamiento: string;
  pieza: string;
  fp: string;
  entidad: string;
  factura: string;
  recibo: string;
  doc: string;
  gabinete: string;
  importe: number;
  cobrado: number;
  saldo: number;
  comentario: string;
  estado: string;
  treatment?: TreatmentVisual;
  facturaItem?: Factura;
  anticipoItem?: PagoAnticipadoPaciente;
};

function sortByDate(a: { date: string }, b: { date: string }) {
  return a.date.localeCompare(b.date);
}

function buildHistoryBillingRows(historial: HistorialClinico[], facturas: Factura[], anticipos: PagoAnticipadoPaciente[]) {
  const rows: Omit<HistoryBillingRow, 'saldo'>[] = [];

  historial.forEach((entrada) => {
    const factura = entrada.factura_id
      ? facturas.find((item) => item.id === entrada.factura_id)
      : facturas.find((item) => item.lineas.some((linea) => linea.historial_id === entrada.id));
    rows.push({
      id: `hist-${entrada.id}`,
      kind: 'tratamiento',
      date: entrada.fecha,
      tratamiento: entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental',
      pieza: entrada.pieza_dental ? String(entrada.pieza_dental) : '',
      fp: 'TC',
      entidad: '',
      factura: factura ? `${factura.serie}/${factura.numero}` : entrada.factura_id ? 'Si' : 'No',
      recibo: 'No',
      doc: entrada.doctor?.nombre?.replace(/\D/g, '').slice(-3).padStart(3, '0') || '',
      gabinete: entrada.gabinete_id ? String(entrada.gabinete_id).slice(0, 3) : '',
      importe: amount(entrada.importe),
      cobrado: 0,
      comentario: entrada.observaciones || entrada.diagnostico || '',
      estado: entrada.estado,
      treatment: entrada.tratamiento,
      facturaItem: factura,
    });
  });

  facturas.forEach((factura) => {
    const linkedHistory = historial.find((entrada) => entrada.factura_id === factura.id);
    if (!linkedHistory && factura.lineas.length) {
      rows.push({
        id: `fac-${factura.id}`,
        kind: 'factura',
        date: factura.fecha,
        tratamiento: factura.lineas[0]?.concepto ?? 'Factura dental',
        pieza: '',
        fp: 'TC',
        entidad: '',
        factura: `${factura.serie}/${factura.numero}`,
        recibo: 'No',
        doc: '004',
        gabinete: '',
        importe: amount(factura.total),
        cobrado: 0,
        comentario: factura.estado,
        estado: factura.estado,
        treatment: null,
        facturaItem: factura,
      });
    }

    factura.cobros.forEach((cobro) => {
      rows.push({
        id: `cobro-${cobro.id}`,
        kind: 'cobro',
        date: cobro.fecha,
        tratamiento: cobro.anulado_at ? 'Cobro anulado' : 'Cobro',
        pieza: '0',
        fp: 'TC',
        entidad: '',
        factura: `${factura.serie}/${factura.numero}`,
        recibo: 'No',
        doc: '004',
        gabinete: '',
        importe: 0,
        cobrado: cobro.anulado_at ? 0 : amount(cobro.importe),
        comentario: cobro.motivo_anulacion || cobro.notas || '',
        estado: cobro.anulado_at ? 'anulado' : 'cobrado',
        treatment: null,
        facturaItem: factura,
      });
    });
  });

  anticipos.forEach((anticipo) => {
    rows.push({
      id: `anticipo-${anticipo.id}`,
      kind: 'anticipo',
      date: anticipo.fecha,
      tratamiento: anticipo.concepto || 'Pago anticipado',
      pieza: '0',
      fp: 'PA',
      entidad: '',
      factura: 'No',
      recibo: 'Si',
      doc: '004',
      gabinete: '',
      importe: 0,
      cobrado: anticipo.anulado_at ? 0 : amount(anticipo.importe),
      comentario: anticipo.motivo_anulacion || anticipo.notas || 'Pago a cuenta del paciente',
      estado: anticipo.anulado_at ? 'anulado' : 'anticipo',
      treatment: null,
      anticipoItem: anticipo,
    });
  });

  let saldo = 0;
  return rows
    .sort(sortByDate)
    .map((row) => {
      saldo += row.importe - row.cobrado;
      return { ...row, saldo };
    });
}

export function EurodentHistoryBillingPanel({
  paciente,
  historial,
  facturas,
  anticipos,
  onFacturar,
  onCobrar,
  onHistorialFacturas,
  onAddAnticipo,
  onEditAnticipo,
  onCobrarImporte,
  onOrtodoncia,
  onRecibos,
  onContextFactura,
  onCrearReceta,
}: {
  paciente: ApiPaciente | null;
  historial: HistorialClinico[];
  facturas: Factura[];
  anticipos: PagoAnticipadoPaciente[];
  onFacturar: () => void;
  onCobrar: () => void;
  onHistorialFacturas: () => void;
  onAddAnticipo: () => void;
  onEditAnticipo: (anticipo: PagoAnticipadoPaciente) => void;
  onCobrarImporte: (factura: Factura) => void;
  onOrtodoncia: () => void;
  onRecibos: () => void;
  onContextFactura: (event: MouseEvent, factura: Factura) => void;
  onCrearReceta?: () => void;
}) {
  const rows = useMemo(() => buildHistoryBillingRows(historial, facturas, anticipos), [historial, facturas, anticipos]);
  const [hideZeros, setHideZeros] = useState(false);
  const [historyMenu, setHistoryMenu] = useState<{ x: number; y: number; row: HistoryBillingRow | null } | null>(null);
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(false);
  const displayRows = useMemo(
    () => (hideZeros ? rows.filter((row) => row.importe !== 0 || row.cobrado !== 0 || row.saldo !== 0) : rows),
    [hideZeros, rows],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const defaultSelectedRow = [...displayRows].reverse().find((row) => row.kind === 'tratamiento') ?? displayRows[displayRows.length - 1] ?? null;
  const selectedRow = displayRows.find((row) => row.id === selectedId) ?? defaultSelectedRow;
  const selectedFactura = selectedRow?.facturaItem ?? facturas[0] ?? null;
  const totals = getBillingTotals(facturas);
  const pagosParciales = getPagosParciales(facturas);
  const firstPendingFactura = getFacturaPendientePreferida(facturas, selectedFactura);
  const doctores = Array.from(new Set(historial.map((entrada) => entrada.doctor?.nombre).filter(Boolean))) as string[];
  const currentDoctor = selectedRow?.kind === 'tratamiento'
    ? historial.find((entrada) => `hist-${entrada.id}` === selectedRow.id)?.doctor?.nombre
    : doctores[0];

  function openBlankHistoryMenu(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('tr')) return;
    event.preventDefault();
    setHistoryMenu({ x: event.clientX, y: event.clientY, row: null });
  }

  function handleCobradoDoubleClick(event: MouseEvent<HTMLTableCellElement>, row: HistoryBillingRow) {
    event.preventDefault();
    event.stopPropagation();
    if (row.anticipoItem) {
      onEditAnticipo(row.anticipoItem);
      return;
    }
    if (row.facturaItem) {
      onCobrarImporte(row.facturaItem);
      return;
    }
    onAddAnticipo();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedId && defaultSelectedRow) setSelectedId(defaultSelectedRow.id);
    if (selectedId && defaultSelectedRow && !displayRows.some((row) => row.id === selectedId)) setSelectedId(defaultSelectedRow.id);
  }, [defaultSelectedRow, displayRows, selectedId]);

  return (
    <section className="history-billing-eurodent">
      <div className="billing-operational-strip">
        <div>
          <span>Saldo paciente</span>
          <strong className={totals.pendiente > 0 ? 'debt' : ''}>{money(totals.pendiente)}</strong>
        </div>
        <div>
          <span>Facturado</span>
          <strong>{money(totals.facturado)}</strong>
        </div>
        <div>
          <span>Cobrado</span>
          <strong>{money(totals.cobrado)}</strong>
        </div>
        <div>
          <span>Parciales</span>
          <strong>{pagosParciales.length}</strong>
        </div>
        <button type="button" onClick={() => firstPendingFactura ? onCobrarImporte(firstPendingFactura) : onAddAnticipo()}>
          {firstPendingFactura ? 'Registrar cobro' : 'Registrar anticipo'}
        </button>
        <button type="button" onClick={onFacturar}>Emitir factura</button>
      </div>
      <div className="history-eurodent-head">
        <label>
          Nombre
          <input readOnly value={paciente ? `${paciente.apellidos}, ${paciente.nombre}` : ''} />
        </label>
        <label className="short">
          N Historial
          <input readOnly value={paciente?.num_historial ?? ''} />
        </label>
        <label>
          Doctor
          <select value={currentDoctor ?? ''} onChange={() => undefined}>
            <option value="">Sin doctor</option>
            {doctores.map((doctor) => <option key={doctor} value={doctor}>{doctor}</option>)}
          </select>
        </label>
      </div>

      <div className="history-ledger-scroll" aria-label="Historial y facturacion con desplazamiento" onContextMenu={openBlankHistoryMenu}>
        <table className="euro-table history-ledger-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tratamiento</th>
              <th>Pieza</th>
              <th>FP</th>
              <th>Entidad</th>
              <th>Factura</th>
              <th>Recibo</th>
              <th>Doc.</th>
              <th>Gab.</th>
              <th>Importe</th>
              <th>Cobrado</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr
                key={row.id}
                className={`${selectedRow?.id === row.id ? 'selected-row ' : ''}${row.kind === 'cobro' ? 'payment-row ' : row.kind === 'anticipo' ? 'advance-payment-row ' : 'treatment-coded-row '}`}
                style={{ '--treatment-color': colorForTreatment(row.treatment) } as CSSProperties}
                onClick={() => setSelectedId(row.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelectedId(row.id);
                  setHistoryMenu({ x: event.clientX, y: event.clientY, row });
                }}
              >
                <td>{formatDate(row.date)}</td>
                <td className="history-treatment-cell">
                  {row.kind === 'cobro' ? <span className="payment-label">Cobro</span> : row.kind === 'anticipo' ? <span className="advance-label">Anticipo</span> : <TreatmentBadge tratamiento={row.treatment} />}
                  <strong>{row.tratamiento}</strong>
                  {row.comentario && <small>{row.comentario}</small>}
                </td>
                <td>{row.pieza}</td>
                <td>{row.fp}</td>
                <td>{row.entidad}</td>
                <td>{row.factura}</td>
                <td>{row.recibo}</td>
                <td>{row.doc}</td>
                <td>{row.gabinete}</td>
                <td className="num">{row.importe ? money(row.importe) : '0,00'}</td>
                <td className="num editable-cobrado-cell" onDoubleClick={(event) => handleCobradoDoubleClick(event, row)} title="Doble clic para añadir pago">{row.cobrado ? money(row.cobrado) : '0,00'}</td>
                <td className="num">{money(row.saldo)}</td>
              </tr>
            ))}
            {!displayRows.length && <tr><td colSpan={12}>Sin movimientos visibles de historial o facturacion.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="history-eurodent-footer">
        <label className="history-comments">
          <span>Observaciones tratamiento</span>
          <textarea
            readOnly
            value={selectedRow?.comentario || 'Sin observaciones especificas para esta linea.'}
          />
        </label>
        <label className="history-toggle">
          <input type="checkbox" checked={hideZeros} onChange={(event) => setHideZeros(event.currentTarget.checked)} />
          Ocultar 0's
        </label>
        <div className="history-action-buttons">
          <button onClick={onOrtodoncia}>C.Ortod.</button>
          <button onClick={() => selectedFactura && window.open(facturaPdfUrl(selectedFactura.id), '_blank')} disabled={!selectedFactura}>Imprimir</button>
          <button onClick={() => firstPendingFactura ? onCobrarImporte(firstPendingFactura) : onCobrar()}>Cobrar</button>
          <span className="invoice-split-button">
            <button onClick={() => setInvoiceMenuOpen((open) => !open)}>Facturas</button>
            {invoiceMenuOpen && (
              <span className="invoice-action-popover">
                <button onClick={() => { onHistorialFacturas(); setInvoiceMenuOpen(false); }}>Historial de facturas</button>
                <button onClick={() => { onFacturar(); setInvoiceMenuOpen(false); }}>Generar factura</button>
              </span>
            )}
          </span>
          <button onClick={() => onCrearReceta ? onCrearReceta() : (selectedFactura && void emitirRecetaPdf(selectedFactura.id))} disabled={!onCrearReceta && !selectedFactura}>Receta</button>
          <button onClick={onRecibos}>Recibos</button>
        </div>
      </div>
      {historyMenu && (
        <div className="context-menu patient-context-menu history-row-context-menu" style={{ left: historyMenu.x, top: historyMenu.y }}>
          <strong>Historial / facturación</strong>
          <button onClick={() => { onAddAnticipo(); setHistoryMenu(null); }}>Añadir pago / anticipo</button>
          {historyMenu.row?.anticipoItem && (
            <button onClick={() => { onEditAnticipo(historyMenu.row!.anticipoItem!); setHistoryMenu(null); }}>Editar anticipo seleccionado</button>
          )}
          {historyMenu.row?.facturaItem && (
            <>
              <button onClick={() => { onCobrarImporte(historyMenu.row!.facturaItem!); setHistoryMenu(null); }}>Añadir cobro a esta factura</button>
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
