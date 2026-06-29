import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ApiPaciente, Cita, Presupuesto, PresupuestoLinea, TratamientoCatalogo, UserRole } from '../../types/api';
import {
  addPresupuestoLinea,
  aceptarPresupuesto,
  convertirPresupuestoFactura,
  deletePresupuestoLinea,
  openPresupuestoPdf,
  pasarPresupuestoTrabajoPendiente,
  presentarPresupuesto,
  rechazarPresupuesto,
  updatePresupuestoLinea,
} from '../../lib/api';
import { colorForTreatment, formatDate, money } from '../../lib/utils';
import { TreatmentBadge } from '../../components/TreatmentBadge';
import { BudgetOdontogramFlow } from '../odontogram';

const ESTADO_COLOR: Record<string, string> = {
  borrador: '#687480',
  presentado: '#0f7cad',
  aceptado: '#16a34a',
  rechazado: '#dc2626',
  facturado: '#7c3aed',
};

export function PresupuestoPanel({ presupuesto, paciente, tratamientos, userRole }: { presupuesto: Presupuesto; paciente: ApiPaciente; tratamientos: TratamientoCatalogo[]; userRole?: UserRole | null }) {
  const queryClient = useQueryClient();
  const [selectedTreatmentId, setSelectedTreatmentId] = useState(tratamientos[0]?.id ?? '');
  const [lineaSeleccionada, setLineaSeleccionada] = useState<PresupuestoLinea | null>(presupuesto.lineas[0] ?? null);
  const [pieza, setPieza] = useState('');
  const [caras, setCaras] = useState('');
  const [descuento, setDescuento] = useState('0');
  const [precioLinea, setPrecioLinea] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [rechazarOpen, setRechazarOpen] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const selectedTreatment = tratamientos.find((item) => item.id === selectedTreatmentId) ?? tratamientos[0];
  const catalog = tratamientos.filter((item) => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return true;
    return `${item.codigo ?? ''} ${item.nombre} ${item.familia?.nombre ?? ''}`.toLowerCase().includes(q);
  }).slice(0, 120);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });

  const addLine = useMutation({
    mutationFn: () => {
      if (!selectedTreatment) throw new Error('Seleccione tratamiento');
      return addPresupuestoLinea(presupuesto.id, {
        tratamiento_id: selectedTreatment.id,
        pieza_dental: pieza ? Number(pieza) : null,
        caras: caras || null,
        precio_unitario: precioLinea || selectedTreatment.precio,
        descuento_porcentaje: descuento || 0,
      });
    },
    onSuccess: invalidate,
  });

  const updateLine = useMutation({
    mutationFn: (patch: Partial<{ pieza_dental: number | null; caras: string | null; precio_unitario: string | number; descuento_porcentaje: string | number; aceptado: boolean }>) => {
      if (!lineaSeleccionada) throw new Error('Seleccione linea');
      return updatePresupuestoLinea(presupuesto.id, lineaSeleccionada.id, patch);
    },
    onSuccess: invalidate,
  });

  const deleteLine = useMutation({
    mutationFn: () => {
      if (!lineaSeleccionada) throw new Error('Seleccione linea');
      return deletePresupuestoLinea(presupuesto.id, lineaSeleccionada.id);
    },
    onSuccess: () => {
      setLineaSeleccionada(null);
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
    },
  });

  const passPending = useMutation({
    mutationFn: () => pasarPresupuestoTrabajoPendiente(presupuesto.id),
    onSuccess: () => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['odontograma-contexto', presupuesto.paciente_id] });
      toast.success('Trabajo pasado a pendiente.');
    },
  });

  const presentBudget = useMutation({
    mutationFn: () => presentarPresupuesto(presupuesto.id),
    onSuccess: () => {
      void invalidate();
      toast.success('Presupuesto presentado.');
    },
  });

  const acceptBudget = useMutation({
    mutationFn: () => aceptarPresupuesto(presupuesto.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['trabajo-pendiente', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['odontograma-contexto', presupuesto.paciente_id] });
      toast.success('Presupuesto aceptado.');
    },
  });

  const rejectBudget = useMutation({
    mutationFn: (motivo: string | null) => rechazarPresupuesto(presupuesto.id, motivo || null),
    onSuccess: () => {
      setRechazarOpen(false);
      setMotivoRechazo('');
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
      toast.success('Presupuesto rechazado.');
    },
  });

  const invoiceBudget = useMutation({
    mutationFn: () => convertirPresupuestoFactura(presupuesto.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['facturas', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['saldo-paciente', presupuesto.paciente_id] });
      toast.success('Presupuesto convertido en factura.');
    },
  });

  const acceptedLines = presupuesto.lineas.filter((linea) => linea.aceptado);
  const totalBruto = presupuesto.lineas.reduce((sum, l) => sum + Number(l.precio_unitario), 0);
  const totalDescuentos = totalBruto - presupuesto.lineas.reduce((sum, l) => sum + Number(l.importe_neto), 0);
  const totalNeto = presupuesto.lineas.reduce((sum, l) => sum + Number(l.importe_neto), 0);
  const totalAceptado = acceptedLines.reduce((sum, l) => sum + Number(l.importe_neto), 0);
  const presupuestoCerrado = ['aceptado', 'facturado', 'rechazado'].includes(presupuesto.estado);
  const canInvoiceBudget = acceptedLines.length > 0 && !['facturado', 'rechazado'].includes(presupuesto.estado);

  function loadLine(linea: PresupuestoLinea) {
    setLineaSeleccionada(linea);
    setPieza(linea.pieza_dental ? String(linea.pieza_dental) : '');
    setCaras(linea.caras ?? '');
    setDescuento(String(linea.descuento_porcentaje ?? '0'));
    setPrecioLinea(String(linea.precio_unitario ?? ''));
    setSelectedTreatmentId(linea.tratamiento_id);
  }

  function selectTreatment(id: string) {
    const tratamiento = tratamientos.find((item) => item.id === id);
    setSelectedTreatmentId(id);
    setLineaSeleccionada(null);
    setPrecioLinea(tratamiento?.precio ?? '');
    setCatalogSearch('');
  }

  function abrirPdfPresupuesto() {
    void openPresupuestoPdf(presupuesto.id).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir el presupuesto.');
    });
  }

  const dtoAcum = presupuesto.lineas.reduce((sum, l) => sum + Number(l.descuento_porcentaje ?? 0), 0);
  const avgDto = presupuesto.lineas.length > 0 ? Math.round(dtoAcum / presupuesto.lineas.length) : 0;
  const hasPendingWork = acceptedLines.some((linea) => linea.pasado_trabajo_pendiente);
  const flowSteps = [
    { key: 'borrador', label: 'Borrador', done: presupuesto.lineas.length > 0, current: presupuesto.estado === 'borrador' },
    { key: 'presentado', label: 'Presentado', done: ['presentado', 'aceptado', 'facturado'].includes(presupuesto.estado), current: presupuesto.estado === 'presentado' },
    { key: 'aceptado', label: 'Aceptado', done: acceptedLines.length > 0 || ['aceptado', 'facturado'].includes(presupuesto.estado), current: presupuesto.estado === 'aceptado' && !hasPendingWork },
    { key: 'pendiente', label: 'Trabajo pendiente', done: hasPendingWork || presupuesto.estado === 'facturado', current: presupuesto.estado === 'aceptado' && hasPendingWork },
    { key: 'factura', label: 'Factura', done: presupuesto.estado === 'facturado', current: presupuesto.estado === 'facturado' },
  ];

  return (
    <section className="desk-panel budget-panel">
      {/* Redesigned header */}
      <div className="budget-panel-header">
        <div className="budget-header-top">
          <div className="budget-panel-title">
            <strong className="budget-num">Presupuesto #{presupuesto.numero}</strong>
            <span className="budget-estado-pill" style={{ background: ESTADO_COLOR[presupuesto.estado] ?? '#687480' }}>
              {presupuesto.estado}
            </span>
            <span className="budget-date">{formatDate(presupuesto.fecha)}</span>
          </div>
          <div className="budget-panel-kpis">
            <span><em>Lineas</em>{presupuesto.lineas.length}</span>
            <span><em>Total</em>{money(totalNeto)}</span>
            <span><em>Aceptado</em>{money(totalAceptado)}</span>
            {avgDto > 0 && <span><em>Dto med.</em>{avgDto}%</span>}
          </div>
        </div>
        <div className="budget-panel-actions budget-primary-actions">
          <button onClick={() => presentBudget.mutate()} disabled={presentBudget.isPending || presupuesto.estado !== 'borrador'}>Presentar</button>
          <button onClick={() => acceptBudget.mutate()} disabled={acceptBudget.isPending || !presupuesto.lineas.length || presupuestoCerrado} className="btn-accept">Aceptar todo</button>
          <button onClick={() => passPending.mutate()} disabled={passPending.isPending || !acceptedLines.length} className="btn-pending">Trabajo pendiente</button>
          <button onClick={() => invoiceBudget.mutate()} disabled={invoiceBudget.isPending || !canInvoiceBudget} className="btn-invoice">Facturar</button>
          <button onClick={abrirPdfPresupuesto}>PDF</button>
          <details className="budget-secondary-menu">
            <summary>Mas</summary>
            <div>
              <button onClick={() => updateLine.mutate({ aceptado: !lineaSeleccionada?.aceptado })} disabled={!lineaSeleccionada || updateLine.isPending || presupuestoCerrado}>{lineaSeleccionada?.aceptado ? 'Quitar aceptado' : 'Aceptar linea'}</button>
              <button onClick={() => deleteLine.mutate()} disabled={!lineaSeleccionada || deleteLine.isPending || presupuestoCerrado}>Borrar linea</button>
              <button onClick={() => setRechazarOpen(true)} disabled={rejectBudget.isPending || presupuestoCerrado} className="btn-reject">Rechazar</button>
            </div>
          </details>
        </div>
        <div className="budget-flow-strip" aria-label="Flujo de presupuesto a factura">
          {flowSteps.map((step, index) => (
            <span key={step.key} className={`${step.done ? 'done' : ''} ${step.current ? 'current' : ''}`.trim()}>
              <b>{index + 1}</b>{step.label}
            </span>
          ))}
        </div>
      </div>

      <BudgetOdontogramFlow
        paciente={paciente}
        presupuesto={presupuesto}
        tratamientos={tratamientos}
        userRole={userRole}
      />

      {/* Workbench */}
      <details className="budget-step-panel" open>
        <summary>Paso 2: anadir o editar tratamientos</summary>
      <div className="budget-workbench">
        <aside className="budget-treatment-picker">
          <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar tratamiento" />
          <div className="budget-treatment-list" role="listbox" aria-label="Tratamientos del presupuesto">
            {catalog.map((tratamiento) => (
              <button
                key={tratamiento.id}
                type="button"
                className={selectedTreatment?.id === tratamiento.id ? 'active' : ''}
                onClick={() => selectTreatment(tratamiento.id)}
              >
                <TreatmentBadge tratamiento={tratamiento} />
                <strong>{tratamiento.nombre}</strong>
                <span>{money(tratamiento.precio)}</span>
              </button>
            ))}
            {!catalog.length && <p>No hay tratamientos con ese criterio.</p>}
          </div>
        </aside>
        <div className="budget-line-editor">
          <label>Tratamiento<input readOnly value={selectedTreatment?.nombre ?? ''} /></label>
          <label>Pieza<input value={pieza} onChange={(event) => setPieza(event.target.value)} placeholder="FDI" /></label>
          <label>Caras<input value={caras} onChange={(event) => setCaras(event.target.value.toUpperCase())} placeholder="MOD" /></label>
          <label>Dto %<input value={descuento} onChange={(event) => setDescuento(event.target.value)} /></label>
          <label>Precio<input value={precioLinea || selectedTreatment?.precio || ''} onChange={(event) => setPrecioLinea(event.target.value.replace(',', '.'))} /></label>
          <div className="budget-actions">
            <button onClick={() => addLine.mutate()} disabled={!selectedTreatment || addLine.isPending || presupuestoCerrado}>Anadir</button>
            <button onClick={() => updateLine.mutate({ pieza_dental: pieza ? Number(pieza) : null, caras: caras || null, precio_unitario: precioLinea || selectedTreatment?.precio || 0, descuento_porcentaje: descuento || 0 })} disabled={!lineaSeleccionada || updateLine.isPending || presupuestoCerrado}>Modificar</button>
          </div>
        </div>
      </div>
      </details>

      {/* Lines table with totals row */}
      <table className="euro-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Tratamiento</th>
            <th>Pieza</th>
            <th>Caras</th>
            <th>Dto%</th>
            <th>Importe</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {presupuesto.lineas.map((linea) => (
            <tr
              key={linea.id}
              className={lineaSeleccionada?.id === linea.id ? 'selected-row' : ''}
              style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
              onClick={() => loadLine(linea)}
            >
              <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
              <td>{linea.tratamiento?.nombre ?? 'Tratamiento'}</td>
              <td>{linea.pieza_dental ?? ''}</td>
              <td>{linea.caras ?? ''}</td>
              <td className="num">{linea.descuento_porcentaje ? `${linea.descuento_porcentaje}%` : '—'}</td>
              <td className="num">{money(linea.importe_neto)}</td>
              <td>
                <span className={`linea-estado-badge linea-estado-${linea.aceptado ? 'aceptado' : 'planificado'}`}>
                  {linea.aceptado ? 'Aceptado' : 'Planificado'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {presupuesto.lineas.length > 0 && (
          <tfoot className="budget-totals-row">
            <tr>
              <td colSpan={5} className="totals-label">Total bruto</td>
              <td className="num">{money(totalBruto)}</td>
              <td />
            </tr>
            {totalDescuentos > 0.005 && (
              <tr>
                <td colSpan={5} className="totals-label">Descuentos</td>
                <td className="num totals-discount">-{money(totalDescuentos)}</td>
                <td />
              </tr>
            )}
            <tr className="totals-neto">
              <td colSpan={5} className="totals-label">Total neto</td>
              <td className="num">{money(totalNeto)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="totals-label">Aceptado</td>
              <td className="num totals-aceptado">{money(totalAceptado)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      {rechazarOpen && (
        <div className="modal-backdrop" onMouseDown={() => setRechazarOpen(false)}>
          <section className="patient-edit-modal" style={{ maxWidth: 380 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-titlebar">
              <strong>Rechazar presupuesto</strong>
              <button type="button" onClick={() => setRechazarOpen(false)}>Cerrar</button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label>
                Motivo (opcional)
                <input autoFocus value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} placeholder="Precio, otro..." />
              </label>
            </div>
            <footer className="modal-actions">
              <button type="button" onClick={() => setRechazarOpen(false)}>Cancelar</button>
              <button type="button" className="primary-action" disabled={rejectBudget.isPending} onClick={() => rejectBudget.mutate(motivoRechazo || null)}>
                Rechazar presupuesto
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

export function CitasPacientePanel({ citas }: { citas: Cita[] }) {
  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Citas del paciente</strong><span>Confirmacion, recordatorios y asistencia</span></div>
      <table className="euro-table">
        <thead><tr><th>Fecha</th><th>Hora</th><th>Doctor</th><th>Tratamiento previsto</th><th>Estado</th><th>Recordatorio</th><th>Obs. cita</th></tr></thead>
        <tbody>
          {citas.map((cita) => (
            <tr key={cita.id}>
              <td>{formatDate(cita.fecha_hora)}</td>
              <td>{cita.fecha_hora.slice(11, 16)}</td>
              <td>{cita.doctor?.nombre ?? ''}</td>
              <td>{cita.motivo ?? ''}</td>
              <td><span className={`status-pill status-${cita.estado}`}>{cita.estado}</span></td>
              <td>{cita.recordatorio_enviado ? `${cita.recordatorio_canal ?? ''} ${cita.recordatorio_estado ?? ''}` : 'Pendiente'}</td>
              <td>{cita.observaciones ?? ''}</td>
            </tr>
          ))}
          {!citas.length && <tr><td colSpan={7}>Sin citas registradas.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
