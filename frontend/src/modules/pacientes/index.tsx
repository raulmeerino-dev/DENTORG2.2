import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import OdontogramaPlanView from '../../components/OdontogramaPlan';
import {
  addPresupuestoLinea,
  aceptarPresupuesto,
  createConsentimientoPaciente,
  createFacturaManual,
  createPresupuesto,
  convertirPresupuestoFactura,
  deletePresupuestoLinea,
  emitirRecetaPdf,
  facturaPdfUrl,
  firmarConsentimiento,
  generarDocumentoPdfPaciente,
  getCitas,
  getConsentimientosPaciente,
  getDoctores,
  getDocumentosPaciente,
  getFacturas,
  getFormasPago,
  getHistorialPaciente,
  getPaciente,
  getPacientes,
  getPlantillasConsentimiento,
  getPresupuestos,
  getSaldoPaciente,
  getTratamientosCatalogo,
  getTrabajosLaboratorio,
  openConsentimientoPdf,
  openDocumentoPaciente,
  pasarPresupuestoTrabajoPendiente,
  presentarPresupuesto,
  registrarCobro,
  rechazarPresupuesto,
  revocarConsentimiento,
  updatePresupuestoLinea,
  updatePaciente,
  uploadDocumentoPaciente,
} from '../../lib/api';
import type { ApiPaciente, Cita, Consentimiento, DocumentoPaciente, Factura, HistorialClinico, PlantillaConsentimiento, Presupuesto, PresupuestoLinea, TrabajoLaboratorio, TratamientoCatalogo } from '../../types/api';
import { OdontogramaPacientePanel } from '../odontograma';
import type { OdontogramaBudgetDraft } from '../odontograma';

type WorkTab = 'pacientes' | 'realizados' | 'pendiente' | 'presupuestos' | 'primera' | 'historial' | 'citas' | 'facturacion' | 'consentimientos' | 'documentos' | 'laboratorio';
type TreatmentVisual = { codigo?: string | null; nombre?: string | null; familia?: { icono?: string | null; nombre?: string | null } | null } | null;
type PatientContextMenu =
  | { x: number; y: number; kind: 'paciente' }
  | { x: number; y: number; kind: 'linea'; linea: PresupuestoLinea }
  | { x: number; y: number; kind: 'factura'; factura: Factura }
  | { x: number; y: number; kind: 'documento'; documento: DocumentoPaciente };
type PatientContextDraft =
  | { kind: 'paciente' }
  | { kind: 'linea'; linea: PresupuestoLinea }
  | { kind: 'factura'; factura: Factura }
  | { kind: 'documento'; documento: DocumentoPaciente };

const WORK_TABS: Array<{ id: WorkTab; label: string; icon: string }> = [
  { id: 'pacientes', label: 'Ficha', icon: 'PA' },
  { id: 'primera', label: 'Primera visita', icon: '1A' },
  { id: 'presupuestos', label: 'Presupuestos', icon: 'PR' },
  { id: 'pendiente', label: 'Pendientes', icon: 'TP' },
  { id: 'realizados', label: 'Realizados', icon: 'OK' },
  { id: 'facturacion', label: 'Historial / Fact.', icon: 'HF' },
];

type DocumentDesignerMode = 'consentimiento' | 'circular';
type PrimeraVisitaData = {
  fecha?: string;
  motivo?: string;
  dientes_ausentes?: string;
  implantes_previos?: string;
  protesis_previas?: string;
  caries_visibles?: string;
  periodontal?: string;
  higiene?: string;
  plan_recomendado?: string;
  observaciones_boca?: string;
};

const CONSENTIMIENTO_TEXTOS: Record<string, string> = {
  Implantes: 'Yo, {{paciente}}, he sido informado/a por la clinica sobre el tratamiento de implantes dentales, sus beneficios, alternativas, cuidados posteriores y posibles complicaciones. Declaro haber podido preguntar mis dudas y autorizo la realizacion del tratamiento indicado.',
  Extracciones: 'Yo, {{paciente}}, autorizo la extraccion indicada tras recibir informacion sobre el procedimiento, anestesia, riesgos habituales, alternativas y cuidados posteriores.',
  Endodoncia: 'Yo, {{paciente}}, he recibido informacion sobre la endodoncia propuesta, su finalidad, alternativas, controles posteriores y posibles molestias o complicaciones. Autorizo el tratamiento.',
  Ortodoncia: 'Yo, {{paciente}}, acepto el tratamiento de ortodoncia indicado y entiendo la necesidad de controles periodicos, higiene adecuada, colaboracion y uso de retenedores si procede.',
  Blanqueamiento: 'Yo, {{paciente}}, autorizo el blanqueamiento dental y he sido informado/a sobre sensibilidad temporal, mantenimiento, expectativas reales y contraindicaciones.',
  Cirugia: 'Yo, {{paciente}}, autorizo el procedimiento quirurgico dental indicado tras recibir informacion sobre tecnica, anestesia, alternativas, riesgos y cuidados posteriores.',
  Periodoncia: 'Yo, {{paciente}}, acepto el tratamiento periodontal indicado y entiendo la importancia del mantenimiento, higiene y controles periodicos.',
  Protesis: 'Yo, {{paciente}}, autorizo el tratamiento protesico indicado, comprendiendo pruebas, ajustes, tiempos de laboratorio, mantenimiento y posibles reparaciones futuras.',
  Empastes: 'Yo, {{paciente}}, autorizo la obturacion o reconstruccion indicada tras recibir informacion sobre materiales, sensibilidad posterior y alternativas.',
  Limpieza: 'Yo, {{paciente}}, autorizo la limpieza, profilaxis o raspaje indicado y he sido informado/a de posibles molestias transitorias.',
  'Otros tratamientos': 'Yo, {{paciente}}, autorizo el tratamiento dental indicado tras recibir informacion suficiente sobre finalidad, alternativas, riesgos, beneficios y cuidados.',
};

const CIRCULAR_TEXTOS: Record<string, string> = {
  'Justificante de asistencia': 'La clinica certifica que {{paciente}} ha acudido a consulta dental en la fecha indicada para atencion sanitaria. Se emite este justificante a peticion del interesado/a para los efectos oportunos.',
  'Falta de asistencia a trabajo': 'La clinica informa que {{paciente}} ha precisado asistencia odontologica en la fecha indicada, pudiendo justificar su ausencia o retraso en el puesto de trabajo durante el tiempo necesario para la atencion.',
  'Falta de asistencia a clase': 'La clinica informa que {{paciente}} ha acudido a consulta odontologica en la fecha indicada, pudiendo justificar su ausencia o retraso en el centro educativo.',
  'Circular informativa': 'La clinica comunica a {{paciente}} la siguiente informacion relativa a su atencion dental, seguimiento, citas o recomendaciones clinicas y administrativas.',
};

const CATALOGO_TRATAMIENTOS = [
  'Abrasion para obturar',
  'Abrasiones moderadas',
  'Adh-duraphat-slgh',
  'Aditamento de teflon',
  'Ajuste de protesis',
  'Ajuste funcional de ferula, por sesion',
  'Amalgama',
  'Anulo',
  'Apertura de endo',
  'Aplicacion',
  'Ataches [unidad]',
  'Atencion odontologica',
  'Blanqueamiento externo',
  'Braket',
  'Brakets metalicos',
  'Carilla de zirconio',
  'Cementado',
  'Endodoncia unirradicular',
  'Limpieza, Profilaxis y Topicacion',
  'Perno de Cuazo',
];

const FAMILY_COLORS: Record<string, string> = {
  diagnostico: '#2a7de1',
  prevencion: '#2a7de1',
  conservadora: '#16a06f',
  endodoncia: '#d94b4b',
  periodoncia: '#6fae35',
  cirugia: '#d97828',
  implantologia: '#7b61d1',
  protesis: '#9b6a32',
  ortodoncia: '#d08c00',
  estetica: '#d64f91',
  odontopediatria: '#00a3a3',
  otros: '#5f6f89',
};

function normalizeText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function colorForTreatment(tratamiento?: { codigo?: string | null; nombre?: string | null; familia?: { nombre?: string | null } | null } | null) {
  const family = normalizeText(tratamiento?.familia?.nombre);
  const name = normalizeText(tratamiento?.nombre);
  const key = Object.keys(FAMILY_COLORS).find((item) => family.includes(item) || name.includes(item));
  if (key) return FAMILY_COLORS[key];
  const source = `${tratamiento?.codigo ?? ''}${tratamiento?.nombre ?? ''}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = source.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 54% 43%)`;
}

function iconForTreatment(tratamiento?: { codigo?: string | null; nombre?: string | null; familia?: { icono?: string | null; nombre?: string | null } | null } | null) {
  if (tratamiento?.familia?.icono) return tratamiento.familia.icono;
  const text = normalizeText(`${tratamiento?.codigo ?? ''} ${tratamiento?.nombre ?? ''} ${tratamiento?.familia?.nombre ?? ''}`);
  if (text.includes('endo')) return 'E';
  if (text.includes('impl')) return 'I';
  if (text.includes('orto') || text.includes('bracket')) return 'O';
  if (text.includes('protes') || text.includes('corona')) return 'P';
  if (text.includes('cirug') || text.includes('extrac')) return 'C';
  if (text.includes('limp') || text.includes('prev')) return 'L';
  if (text.includes('estet') || text.includes('blanq')) return 'B';
  return tratamiento?.codigo?.slice(0, 2) ?? 'T';
}

function TreatmentBadge({ tratamiento }: { tratamiento?: TreatmentVisual }) {
  const color = colorForTreatment(tratamiento);
  return (
    <span className="treatment-badge" style={{ '--treatment-color': color } as CSSProperties}>
      <span>{iconForTreatment(tratamiento)}</span>
      {tratamiento?.codigo ?? 'TR'}
    </span>
  );
}

function money(value: string | number) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function fullName(paciente?: ApiPaciente | null) {
  if (!paciente) return '';
  return `${paciente.nombre} ${paciente.apellidos}`.trim();
}

function getPrimeraVisita(paciente?: ApiPaciente | null): PrimeraVisitaData {
  const data = paciente?.datos_salud?.primera_visita;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as PrimeraVisitaData;
  return {
    fecha: new Date().toISOString().slice(0, 10),
    motivo: '',
    dientes_ausentes: '',
    implantes_previos: '',
    protesis_previas: '',
    caries_visibles: '',
    periodontal: '',
    higiene: '',
    plan_recomendado: '',
    observaciones_boca: '',
  };
}

function hasFinishedState(value?: string | null) {
  const estado = normalizeText(value);
  return estado.includes('realizado') || estado.includes('facturado') || estado.includes('cobrado') || estado.includes('atendido') || estado.includes('finalizado');
}

function findCitaForTreatment(citas: Cita[], linea: PresupuestoLinea) {
  const target = normalizeText(linea.tratamiento?.nombre);
  if (!target) return null;
  return citas.find((cita) => {
    const estado = normalizeText(cita.estado);
    const motivo = normalizeText(cita.motivo);
    if (estado.includes('anulada') || estado.includes('falta') || estado.includes('cancel')) return false;
    return Boolean(motivo) && (motivo.includes(target) || target.includes(motivo));
  }) ?? null;
}

function renderTemplate(text: string, paciente: ApiPaciente) {
  return text
    .replaceAll('{{paciente}}', fullName(paciente))
    .replaceAll('{{historia}}', String(paciente.num_historial))
    .replaceAll('{{fecha}}', new Date().toISOString().slice(0, 10));
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}-${month}-${year.slice(2)}` : value;
}

function PatientFinder({
  pacientes,
  selectedId,
  onSelect,
}: {
  pacientes: ApiPaciente[];
  selectedId: string | null;
  onSelect: (paciente: ApiPaciente) => void;
}) {
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) =>
      `${p.num_historial} ${p.codigo ?? ''} ${p.nombre} ${p.apellidos} ${p.telefono ?? ''}`.toLowerCase().includes(q),
    );
  }, [pacientes, query]);
  function selectPaciente(paciente: ApiPaciente) {
    onSelect(paciente);
    setResultsOpen(false);
    setQuery('');
  }

  return (
    <div className="patient-finder">
      <label>
        Buscar
        <input
          id="patient-search-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => setResultsOpen(Boolean(query.trim()))}
          placeholder="Nombre, telefono o historia"
        />
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(event) => {
          const paciente = pacientes.find((item) => item.id === event.target.value);
          if (paciente) selectPaciente(paciente);
        }}
      >
        {filtered.map((paciente) => (
          <option key={paciente.id} value={paciente.id}>
            {String(paciente.num_historial).padStart(5, '0')} - {paciente.apellidos}, {paciente.nombre}
          </option>
        ))}
      </select>
      {query.trim() && resultsOpen && (
        <div className="patient-live-results patient-finder-results">
          {filtered.slice(0, 5).map((paciente) => (
            <button
              type="button"
              className={paciente.id === selectedId ? 'active' : ''}
              key={paciente.id}
              onClick={() => selectPaciente(paciente)}
            >
              <strong>{paciente.apellidos}, {paciente.nombre}</strong>
              <span>{paciente.telefono ?? 'sin telefono'} - H{paciente.num_historial}</span>
            </button>
          ))}
          {!filtered.length && <span>No hay pacientes con ese criterio.</span>}
        </div>
      )}
    </div>
  );
}

function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return Object.entries(datos)
    .filter(([key]) => !['temporal', 'pendiente_completar'].includes(key))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}

function PresupuestoPanel({ presupuesto, paciente, tratamientos, doctorId }: { presupuesto: Presupuesto; paciente: ApiPaciente; tratamientos: TratamientoCatalogo[]; doctorId?: string | null }) {
  const queryClient = useQueryClient();
  const [selectedTreatmentId, setSelectedTreatmentId] = useState(tratamientos[0]?.id ?? '');
  const [lineaSeleccionada, setLineaSeleccionada] = useState<PresupuestoLinea | null>(presupuesto.lineas[0] ?? null);
  const [pieza, setPieza] = useState('');
  const [caras, setCaras] = useState('');
  const [descuento, setDescuento] = useState('0');
  const [precioLinea, setPrecioLinea] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const selectedTreatment = tratamientos.find((item) => item.id === selectedTreatmentId) ?? tratamientos[0];
  const catalog = tratamientos.filter((item) => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return true;
    return `${item.codigo ?? ''} ${item.nombre} ${item.familia?.nombre ?? ''}`.toLowerCase().includes(q);
  }).slice(0, 120);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });

  const addLineFromOdontograma = useMutation({
    mutationFn: (draft: OdontogramaBudgetDraft) => {
      const treatment = tratamientos.find((item) => item.id === draft.tratamientoId);
      if (!treatment) throw new Error('Seleccione tratamiento');
      return addPresupuestoLinea(presupuesto.id, {
        tratamiento_id: draft.tratamientoId,
        pieza_dental: draft.piezaFdi,
        caras: draft.caras || null,
        precio_unitario: draft.precioUnitario || treatment.precio,
        descuento_porcentaje: descuento || 0,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });

  const updateLine = useMutation({
    mutationFn: (patch: Partial<{ pieza_dental: number | null; caras: string | null; precio_unitario: string | number; descuento_porcentaje: string | number; aceptado: boolean }>) => {
      if (!lineaSeleccionada) throw new Error('Seleccione linea');
      return updatePresupuestoLinea(presupuesto.id, lineaSeleccionada.id, patch);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });
  const presentBudget = useMutation({
    mutationFn: () => presentarPresupuesto(presupuesto.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });
  const acceptBudget = useMutation({
    mutationFn: () => aceptarPresupuesto(presupuesto.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['trabajo-pendiente', presupuesto.paciente_id] });
    },
  });
  const rejectBudget = useMutation({
    mutationFn: () => {
      const motivo = window.prompt('Motivo del rechazo', '');
      return rechazarPresupuesto(presupuesto.id, motivo || null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });
  const invoiceBudget = useMutation({
    mutationFn: () => convertirPresupuestoFactura(presupuesto.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['facturas', presupuesto.paciente_id] });
      void queryClient.invalidateQueries({ queryKey: ['saldo-paciente', presupuesto.paciente_id] });
    },
  });
  const acceptedLines = presupuesto.lineas.filter((linea) => linea.aceptado);

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

  function applyOdontogramaDraft(draft: OdontogramaBudgetDraft) {
    if (pieza !== String(draft.piezaFdi)) setPieza(String(draft.piezaFdi));
    if (caras !== draft.caras) setCaras(draft.caras);
    if (selectedTreatmentId !== draft.tratamientoId) {
      const tratamiento = tratamientos.find((item) => item.id === draft.tratamientoId);
      setSelectedTreatmentId(draft.tratamientoId);
      setPrecioLinea(String(tratamiento?.precio ?? draft.precioUnitario ?? ''));
      setLineaSeleccionada(null);
    }
  }

  function addOdontogramaDraft(draft: OdontogramaBudgetDraft) {
    applyOdontogramaDraft(draft);
    addLineFromOdontograma.mutate(draft);
  }

  return (
    <section className="desk-panel budget-panel">
      <div className="panel-caption">
        <strong>Presupuesto #{presupuesto.numero}</strong>
        <span>{formatDate(presupuesto.fecha)} - {presupuesto.estado}</span>
        <button onClick={() => passPending.mutate()} disabled={passPending.isPending}>Pasar aceptados a T.P.</button>
        <button onClick={() => presentBudget.mutate()} disabled={presentBudget.isPending || presupuesto.estado !== 'borrador'}>Presentar</button>
        <button onClick={() => acceptBudget.mutate()} disabled={acceptBudget.isPending || !presupuesto.lineas.length || presupuesto.estado === 'rechazado'}>Aceptar</button>
        <button onClick={() => invoiceBudget.mutate()} disabled={invoiceBudget.isPending || !acceptedLines.length}>Facturar</button>
        <button onClick={() => rejectBudget.mutate()} disabled={rejectBudget.isPending || presupuesto.estado === 'rechazado'}>Rechazar</button>
      </div>
      <OdontogramaPacientePanel
        paciente={paciente}
        tratamientos={tratamientos}
        doctorId={doctorId}
        context="presupuesto"
        onBudgetDraftChange={applyOdontogramaDraft}
        onAddBudgetTreatment={addOdontogramaDraft}
        onPresupuestoCreado={() => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] })}
      />
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
            <button onClick={() => addLine.mutate()} disabled={!selectedTreatment || addLine.isPending}>Añadir</button>
            <button onClick={() => updateLine.mutate({ pieza_dental: pieza ? Number(pieza) : null, caras: caras || null, precio_unitario: precioLinea || selectedTreatment?.precio || 0, descuento_porcentaje: descuento || 0 })} disabled={!lineaSeleccionada || updateLine.isPending}>Modificar</button>
            <button onClick={() => updateLine.mutate({ aceptado: !lineaSeleccionada?.aceptado })} disabled={!lineaSeleccionada || updateLine.isPending}>{lineaSeleccionada?.aceptado ? 'Quitar aceptado' : 'Aceptar'}</button>
            <button onClick={() => deleteLine.mutate()} disabled={!lineaSeleccionada || deleteLine.isPending}>Borrar</button>
          </div>
        </div>
      </div>
      <table className="euro-table">
        <thead>
          <tr><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Caras</th><th>Importe</th><th>Estado</th></tr>
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
              <td className="num">{money(linea.importe_neto)}</td>
              <td>{linea.aceptado ? 'Aceptado' : 'Planificado'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PatientForm({
  paciente,
  facturas,
  historial,
  citas,
  onEdit,
  onOpenFull,
  onOpenCitas,
  onOpenHistorial,
  onOpenDocumentos,
}: {
  paciente: ApiPaciente | null;
  facturas: Factura[];
  historial: HistorialClinico[];
  citas: Cita[];
  onEdit: () => void;
  onOpenFull: () => void;
  onOpenCitas: () => void;
  onOpenHistorial: () => void;
  onOpenDocumentos: () => void;
}) {
  const total = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const cobrado = facturas.reduce((sum, factura) => sum + Number(factura.total_cobrado), 0);
  const saldo = facturas.reduce((sum, factura) => sum + Number(factura.pendiente), 0);
  const temporal = paciente?.observaciones?.toLowerCase().includes('temporal');
  const address = [paciente?.direccion, paciente?.codigo_postal, paciente?.ciudad, paciente?.provincia].filter(Boolean).join(' - ');
  const initials = paciente ? `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase() : '--';
  const healthText = readableHealthData(paciente?.datos_salud);
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lastVisit = recentHistory[0] ?? null;
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const lastTreatment = lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado';
  const lastComment = lastVisit?.observaciones || lastVisit?.diagnostico || 'Sin comentario clinico en esta entrada.';
  const nextTreatment = nextCita?.motivo || 'Sin tratamiento indicado';
  const nextComment = nextCita?.observaciones || 'Sin observaciones para la cita.';

  return (
    <div className="patient-form-grid">
      {temporal && (
        <button type="button" className="temporary-patient-banner" onClick={onEdit}>
          Paciente temporal: completar datos en clinica
        </button>
      )}
      <section className="patient-hero-card">
        <div className="patient-avatar">{initials}</div>
        <div>
          <span>Paciente</span>
          <strong>{fullName(paciente) || 'Sin seleccionar'}</strong>
          <em>Historia {paciente?.num_historial ?? '-'} - {paciente?.codigo ?? `#${String(paciente?.num_historial ?? '').padStart(6, '0')}`}</em>
        </div>
        <div className="patient-hero-actions">
          <button type="button" onClick={onOpenFull} disabled={!paciente}>Vista completa</button>
          <button type="button" onClick={onEdit} disabled={!paciente}>Editar ficha</button>
        </div>
      </section>

      <section className="patient-next-card">
        <div className="patient-card-head">
          <h3>Proxima cita</h3>
          <span>{nextCita?.estado ?? 'sin cita'}</span>
        </div>
        <strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} - ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita programada'}</strong>
        <p><b>Tratamiento:</b> {nextTreatment}</p>
        <small>{nextComment}</small>
        <footer>
          <button type="button" onClick={onOpenCitas} disabled={!paciente}>Ver citas</button>
        </footer>
      </section>

      <section className="patient-last-card">
        <div className="patient-card-head">
          <h3>Ultima visita</h3>
          <span>{lastVisit?.estado ?? 'sin historial'}</span>
        </div>
        <strong>{lastVisit ? `${formatDate(lastVisit.fecha)} - ${lastTreatment}` : 'Sin historial clinico'}</strong>
        <p><b>Comentario:</b> {lastComment}</p>
        <small>{lastVisit?.doctor?.nombre ? `Doctor: ${lastVisit.doctor.nombre}` : 'Sin profesional asociado'}</small>
        <footer>
          <button type="button" onClick={onOpenHistorial} disabled={!paciente}>Historial</button>
        </footer>
      </section>

      <section className="patient-history-card">
        <div className="patient-card-head">
          <h3>Historial reciente</h3>
          <button type="button" onClick={onOpenHistorial} disabled={!paciente}>Ver todo</button>
        </div>
        {recentHistory.slice(0, 4).map((entrada) => (
          <article key={entrada.id}>
            <time>{formatDate(entrada.fecha)}</time>
            <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
            <span>{entrada.observaciones || entrada.diagnostico || entrada.estado}</span>
          </article>
        ))}
        {!recentHistory.length && <p>Sin entradas clinicas todavia.</p>}
      </section>

      <section className="patient-side-card">
        <div>
          <h3>Contacto</h3>
          <p><b>Tel.</b> {paciente?.telefono || paciente?.telefono2 || 'Sin telefono'}</p>
          <p><b>Email</b> {paciente?.email || 'Sin email'}</p>
          <p><b>Dir.</b> {address || 'Sin direccion'}</p>
        </div>
        <div>
          <h3>Clinica</h3>
          <p>{healthText || 'Sin alertas de salud registradas.'}</p>
          <p>{paciente?.observaciones || 'Sin observaciones generales.'}</p>
          <button type="button" onClick={onOpenDocumentos} disabled={!paciente}>Archivos</button>
        </div>
        <div className="patient-side-balance">
          <h3>Saldo</h3>
          <span>Total {money(total)}</span>
          <span>Pagado {money(cobrado)}</span>
          <strong className={saldo > 0 ? 'debt' : ''}>Pendiente {money(saldo)}</strong>
        </div>
      </section>
    </div>
  );
}

function PatientEditModal({
  paciente,
  onClose,
  onSave,
}: {
  paciente: ApiPaciente;
  onClose: () => void;
  onSave: (data: Partial<ApiPaciente>) => void;
}) {
  const [form, setForm] = useState({
    nombre: paciente.nombre ?? '',
    apellidos: paciente.apellidos ?? '',
    fecha_nacimiento: paciente.fecha_nacimiento ?? '',
    dni_nie: paciente.dni_nie ?? '',
    telefono: paciente.telefono ?? '',
    telefono2: paciente.telefono2 ?? '',
    email: paciente.email ?? '',
    direccion: paciente.direccion ?? '',
    codigo_postal: paciente.codigo_postal ?? '',
    ciudad: paciente.ciudad ?? '',
    provincia: paciente.provincia ?? '',
    observaciones: paciente.observaciones ?? '',
    alergias: typeof paciente.datos_salud?.alergias === 'string' ? paciente.datos_salud.alergias : '',
  });

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      dni_nie: form.dni_nie || null,
      telefono: form.telefono || null,
      telefono2: form.telefono2 || null,
      email: form.email || null,
      direccion: form.direccion || null,
      codigo_postal: form.codigo_postal || null,
      ciudad: form.ciudad || null,
      provincia: form.provincia || null,
      observaciones: form.observaciones || null,
      datos_salud: { ...(paciente.datos_salud ?? {}), alergias: form.alergias },
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Editar ficha del paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label>Nombre<input value={form.nombre} onChange={(event) => setField('nombre', event.target.value)} required /></label>
          <label>Apellidos<input value={form.apellidos} onChange={(event) => setField('apellidos', event.target.value)} required /></label>
          <label>F. nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(event) => setField('fecha_nacimiento', event.target.value)} /></label>
          <label>N.I.F.<input value={form.dni_nie} onChange={(event) => setField('dni_nie', event.target.value)} /></label>
          <label>Teléfono<input value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} /></label>
          <label>Móvil<input value={form.telefono2} onChange={(event) => setField('telefono2', event.target.value)} /></label>
          <label className="wide">E-mail<input value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
          <label className="wide">Dirección<input value={form.direccion} onChange={(event) => setField('direccion', event.target.value)} /></label>
          <label>Cód. postal<input value={form.codigo_postal} onChange={(event) => setField('codigo_postal', event.target.value)} /></label>
          <label>Población<input value={form.ciudad} onChange={(event) => setField('ciudad', event.target.value)} /></label>
          <label>Provincia<input value={form.provincia} onChange={(event) => setField('provincia', event.target.value)} /></label>
          <label className="wide">Alergias / contraindicaciones<textarea value={form.alergias} onChange={(event) => setField('alergias', event.target.value)} /></label>
          <label className="wide">Observaciones generales<textarea value={form.observaciones} onChange={(event) => setField('observaciones', event.target.value)} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit">Guardar ficha</button>
        </footer>
      </form>
    </div>
  );
}

function PatientFullViewModal({
  paciente,
  facturas,
  historial,
  citas,
  presupuestos,
  documentos,
  consentimientos,
  laboratorio,
  onClose,
  onEdit,
  onOpenTab,
}: {
  paciente: ApiPaciente;
  facturas: Factura[];
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  laboratorio: TrabajoLaboratorio[];
  onClose: () => void;
  onEdit: () => void;
  onOpenTab: (tab: WorkTab) => void;
}) {
  const address = [paciente.direccion, paciente.codigo_postal, paciente.ciudad, paciente.provincia].filter(Boolean).join(' - ');
  const healthText = readableHealthData(paciente.datos_salud);
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const lastVisit = recentHistory[0] ?? null;
  const totalFacturado = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const totalCobrado = facturas.reduce((sum, factura) => sum + Number(factura.total_cobrado), 0);
  const pendiente = facturas.reduce((sum, factura) => sum + Number(factura.pendiente), 0);
  const tratamientosPendientes = presupuestos.flatMap((presupuesto) => presupuesto.lineas).filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente);
  const initials = `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase();

  function go(tab: WorkTab) {
    onOpenTab(tab);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <section className="patient-full-modal" aria-label="Vista completa del paciente">
        <header className="patient-full-head">
          <div className="patient-full-identity">
            <span className="patient-full-avatar">{initials}</span>
            <div>
              <span>Ficha completa</span>
              <strong>{fullName(paciente)}</strong>
              <em>Historia {paciente.num_historial} - {paciente.codigo ?? `#${String(paciente.num_historial).padStart(6, '0')}`}</em>
            </div>
          </div>
          <div className="patient-full-actions">
            <button type="button" onClick={() => go('facturacion')}>Historial / fact.</button>
            <button type="button" onClick={() => go('presupuestos')}>Presupuestos</button>
            <button type="button" onClick={onEdit}>Editar ficha</button>
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </header>

        <div className="patient-full-kpis">
          <div><span>Proxima cita</span><strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</strong><small>{nextCita?.motivo ?? 'No hay tratamiento previsto'}</small></div>
          <div><span>Ultima visita</span><strong>{lastVisit ? formatDate(lastVisit.fecha) : 'Sin historial'}</strong><small>{lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado'}</small></div>
          <div><span>Pendiente</span><strong className={pendiente > 0 ? 'debt' : ''}>{money(pendiente)}</strong><small>Facturado {money(totalFacturado)} - cobrado {money(totalCobrado)}</small></div>
          <div><span>Documentos</span><strong>{documentos.length}</strong><small>{consentimientos.length} consentimientos - {laboratorio.length} trabajos lab.</small></div>
        </div>

        <div className="patient-full-grid">
          <section>
            <h3>Datos personales</h3>
            <dl>
              <div><dt>Nombre</dt><dd>{paciente.apellidos}, {paciente.nombre}</dd></div>
              <div><dt>DNI/NIE</dt><dd>{paciente.dni_nie || '-'}</dd></div>
              <div><dt>Nacimiento</dt><dd>{formatDate(paciente.fecha_nacimiento) || '-'}</dd></div>
              <div><dt>Telefono</dt><dd>{paciente.telefono || '-'}</dd></div>
              <div><dt>Movil</dt><dd>{paciente.telefono2 || '-'}</dd></div>
              <div><dt>Email</dt><dd>{paciente.email || '-'}</dd></div>
              <div className="wide"><dt>Direccion</dt><dd>{address || '-'}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Clinica y avisos</h3>
            <dl>
              <div className="wide"><dt>Salud</dt><dd>{healthText || 'Sin alertas registradas.'}</dd></div>
              <div className="wide"><dt>Observaciones generales</dt><dd>{paciente.observaciones || 'Sin observaciones generales.'}</dd></div>
            </dl>
          </section>

          <section className="span-2">
            <h3>Historial reciente</h3>
            <div className="patient-full-list">
              {recentHistory.slice(0, 6).map((entrada) => (
                <article key={entrada.id}>
                  <time>{formatDate(entrada.fecha)}</time>
                  <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                  <span>Pieza {entrada.pieza_dental ?? '-'} - {entrada.estado}</span>
                  <small>{entrada.observaciones || entrada.diagnostico || 'Sin comentario.'}</small>
                </article>
              ))}
              {!recentHistory.length && <p>Sin entradas clinicas.</p>}
            </div>
          </section>

          <section>
            <h3>Presupuestos y pendientes</h3>
            <div className="patient-full-list compact">
              {tratamientosPendientes.slice(0, 5).map((linea) => (
                <article key={linea.id}>
                  <strong>{linea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
                  <span>Pieza {linea.pieza_dental ?? '-'} - {money(linea.importe_neto)}</span>
                </article>
              ))}
              {!tratamientosPendientes.length && <p>Sin tratamientos pendientes aceptados.</p>}
            </div>
          </section>

          <section>
            <h3>Facturacion</h3>
            <div className="patient-full-list compact">
              {facturas.slice(0, 5).map((factura) => (
                <article key={factura.id}>
                  <strong>{factura.serie}-{factura.numero}</strong>
                  <span>{formatDate(factura.fecha)} - {factura.estado}</span>
                  <small>Total {money(factura.total)} - pendiente {money(factura.pendiente)}</small>
                </article>
              ))}
              {!facturas.length && <p>Sin facturas.</p>}
            </div>
          </section>

          <section>
            <h3>Proximas citas</h3>
            <div className="patient-full-list compact">
              {citas.filter((cita) => cita.fecha_hora >= nowIso).slice(0, 5).map((cita) => (
                <article key={cita.id}>
                  <strong>{formatDate(cita.fecha_hora)} {cita.fecha_hora.slice(11, 16)}</strong>
                  <span>{cita.motivo || 'Cita dental'} - {cita.estado}</span>
                  <small>{cita.observaciones || 'Sin observaciones.'}</small>
                </article>
              ))}
              {!citas.filter((cita) => cita.fecha_hora >= nowIso).length && <p>Sin citas proximas.</p>}
            </div>
          </section>

          <section>
            <h3>Documentos y consentimientos</h3>
            <div className="patient-full-list compact">
              {documentos.slice(0, 4).map((documento) => (
                <article key={documento.id}>
                  <strong>{documento.nombre_original}</strong>
                  <span>{documento.categoria} - {formatDate(documento.fecha_documento ?? documento.created_at)}</span>
                </article>
              ))}
              {consentimientos.slice(0, 3).map((consentimiento) => (
                <article key={consentimiento.id}>
                  <strong>{consentimiento.tipo}</strong>
                  <span>{consentimiento.estado} - {formatDate(consentimiento.created_at)}</span>
                </article>
              ))}
              {!documentos.length && !consentimientos.length && <p>Sin documentos ni consentimientos.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function TreatmentHistoryTable({ lineas }: { lineas: PresupuestoLinea[] }) {
  const rows = lineas.length ? lineas : [];
  return (
    <table className="euro-table treatment-table">
      <thead>
        <tr><th>Fecha</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Cuad</th><th>Doctor</th><th>Gab.</th></tr>
      </thead>
      <tbody>
        {rows.map((linea, index) => (
          <tr
            key={linea.id}
            className={index === rows.length - 1 ? 'selected-row treatment-coded-row' : 'treatment-coded-row'}
            style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
          >
            <td>{formatDate(new Date().toISOString())}</td>
            <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
            <td>{linea.tratamiento?.nombre ?? 'Tratamiento dental'}</td>
            <td>{linea.pieza_dental ?? ''}</td>
            <td>{linea.caras ?? ''}</td>
            <td>002</td>
            <td>002</td>
          </tr>
        ))}
        {!rows.length && (
          <tr><td colSpan={7}>Sin tratamientos registrados en presupuesto.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function TreatmentBoard({
  presupuestos,
  doctorName,
  doctorColor,
  tratamientos,
}: {
  presupuestos: Presupuesto[];
  doctorName: string;
  doctorColor?: string | null;
  tratamientos: TratamientoCatalogo[];
}) {
  const firstBudget = presupuestos[0];
  const lineas = presupuestos.flatMap((presupuesto) => presupuesto.lineas);
  const [selectedTool, setSelectedTool] = useState('X');

  return (
    <div className="treatments-layout">
      <div className="treatments-main">
        <div className="compact-controls">
          <label>Doctor <input readOnly value={doctorName} style={{ borderLeft: `8px solid ${doctorColor ?? '#2a7de1'}` }} /></label>
          <label>Gab. <select value="BOX 2" onChange={() => undefined}><option>BOX 2</option></select></label>
        </div>
        <div className="odontogram-stage">
          {firstBudget ? (
            <OdontogramaPlanView value={firstBudget.odontograma ?? {}} />
          ) : (
            <div className="empty-odontogram">Odontograma disponible al crear un presupuesto.</div>
          )}
        </div>
        <TreatmentHistoryTable lineas={lineas} />
        <div className="observation-strip">
          <label>Observaciones Tratamiento</label>
          <textarea readOnly value="" />
          <label><input type="checkbox" readOnly /> Hasta hoy</label>
          <label><input type="checkbox" readOnly /> Ver Ult. Ppto</label>
          <label><input type="checkbox" readOnly /> Ver T. Pte.</label>
        </div>
      </div>
      <aside className="treatment-side">
        <div className="photo-placeholder">Fotografia</div>
        <div className="tooth-tools" aria-label="Tipos de trabajo">
          {['X', 'I', 'C', 'E', 'P', 'R', 'F', 'O', 'B', 'A', 'T', 'M'].map((item) => (
            <button key={item} className={selectedTool === item ? 'active-tool' : ''} onClick={() => setSelectedTool(item)}>{item}</button>
          ))}
        </div>
        <div className="catalog-panel">
          <strong>Tratamientos</strong>
          <ul>
            {(tratamientos.length ? tratamientos : CATALOGO_TRATAMIENTOS.map((nombre, index) => ({
              id: nombre,
              codigo: `T${index + 1}`,
              nombre,
              familia: null,
              familia_id: '',
              precio: '0',
              iva_porcentaje: '0',
              requiere_pieza: false,
              requiere_caras: false,
              activo: true,
            }))).map((item) => (
              <li key={item.id} style={{ '--treatment-color': colorForTreatment(item) } as CSSProperties}>
                <TreatmentBadge tratamiento={item} />
                <span>{item.nombre}</span>
                <small>{money(item.precio)}</small>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

type HistoryBillingRow = {
  id: string;
  kind: 'tratamiento' | 'cobro' | 'factura';
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
};

function asNumber(value?: string | number | null) {
  return Number(value ?? 0) || 0;
}

function sortByDate(a: { date: string }, b: { date: string }) {
  return a.date.localeCompare(b.date);
}

function buildHistoryBillingRows(historial: HistorialClinico[], facturas: Factura[]) {
  const rows: Omit<HistoryBillingRow, 'saldo'>[] = [];

  historial.forEach((entrada) => {
    const factura = entrada.factura_id ? facturas.find((item) => item.id === entrada.factura_id) : undefined;
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
      importe: asNumber(entrada.importe),
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
        importe: asNumber(factura.total),
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
        cobrado: cobro.anulado_at ? 0 : asNumber(cobro.importe),
        comentario: cobro.motivo_anulacion || cobro.notas || '',
        estado: cobro.anulado_at ? 'anulado' : 'cobrado',
        treatment: null,
        facturaItem: factura,
      });
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

function EurodentHistoryBillingPanel({
  paciente,
  historial,
  facturas,
  onFacturar,
  onCobrar,
  onOrtodoncia,
  onRecibos,
  onContextFactura,
}: {
  paciente: ApiPaciente | null;
  historial: HistorialClinico[];
  facturas: Factura[];
  onFacturar: () => void;
  onCobrar: () => void;
  onOrtodoncia: () => void;
  onRecibos: () => void;
  onContextFactura: (event: MouseEvent, factura: Factura) => void;
}) {
  const rows = useMemo(() => buildHistoryBillingRows(historial, facturas), [historial, facturas]);
  const [hideZeros, setHideZeros] = useState(false);
  const displayRows = useMemo(
    () => (hideZeros ? rows.filter((row) => row.importe !== 0 || row.cobrado !== 0 || row.saldo !== 0) : rows),
    [hideZeros, rows],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const defaultSelectedRow = [...displayRows].reverse().find((row) => row.kind === 'tratamiento') ?? displayRows[displayRows.length - 1] ?? null;
  const selectedRow = displayRows.find((row) => row.id === selectedId) ?? defaultSelectedRow;
  const selectedFactura = selectedRow?.facturaItem ?? facturas[0] ?? null;
  const doctores = Array.from(new Set(historial.map((entrada) => entrada.doctor?.nombre).filter(Boolean))) as string[];
  const currentDoctor = selectedRow?.kind === 'tratamiento'
    ? historial.find((entrada) => `hist-${entrada.id}` === selectedRow.id)?.doctor?.nombre
    : doctores[0];

  useEffect(() => {
    if (!selectedId && defaultSelectedRow) setSelectedId(defaultSelectedRow.id);
    if (selectedId && defaultSelectedRow && !displayRows.some((row) => row.id === selectedId)) setSelectedId(defaultSelectedRow.id);
  }, [defaultSelectedRow, displayRows, selectedId]);

  return (
    <section className="history-billing-eurodent">
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

      <div className="history-ledger-scroll" aria-label="Historial y facturacion con desplazamiento">
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
                className={`${selectedRow?.id === row.id ? 'selected-row ' : ''}${row.kind === 'cobro' ? 'payment-row ' : 'treatment-coded-row '}`}
                style={{ '--treatment-color': colorForTreatment(row.treatment) } as CSSProperties}
                onClick={() => setSelectedId(row.id)}
                onContextMenu={(event) => row.facturaItem && onContextFactura(event, row.facturaItem)}
              >
                <td>{formatDate(row.date)}</td>
                <td className="history-treatment-cell">
                  {row.kind === 'cobro' ? <span className="payment-label">Cobro</span> : <TreatmentBadge tratamiento={row.treatment} />}
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
                <td className="num">{row.cobrado ? money(row.cobrado) : '0,00'}</td>
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
          <button onClick={onCobrar}>Cobrar</button>
          <button onClick={onFacturar}>Facturas</button>
          <button onClick={() => selectedFactura && void emitirRecetaPdf(selectedFactura.id)} disabled={!selectedFactura}>Receta</button>
          <button onClick={onRecibos}>Recibos</button>
        </div>
      </div>
    </section>
  );
}

function ClinicalHistoryPanel({ historial, onFacturar, onCobrar, onVerDeuda, onAsociarFactura }: { historial: HistorialClinico[]; onFacturar: () => void; onCobrar: () => void; onVerDeuda: () => void; onAsociarFactura: () => void }) {
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
    </section>
  );
}

function PrimeraVisitaPanel({
  paciente,
  onSave,
  saving,
}: {
  paciente: ApiPaciente | null;
  onSave: (data: PrimeraVisitaData) => void;
  saving: boolean;
}) {
  const [data, setData] = useState<PrimeraVisitaData>(() => getPrimeraVisita(paciente));

  useEffect(() => {
    setData(getPrimeraVisita(paciente));
  }, [paciente?.id, paciente?.datos_salud]);

  function update<K extends keyof PrimeraVisitaData>(key: K, value: PrimeraVisitaData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="desk-panel first-visit-panel">
      <div className="panel-caption">
        <strong>Primera visita</strong>
        <span>Estado inicial de la boca. Se guarda como base clinica y no sustituye al historial diario.</span>
        <button onClick={() => onSave(data)} disabled={!paciente || saving}>Guardar base</button>
      </div>
      <div className="first-visit-grid">
        <label>Fecha primera visita
          <input type="date" value={data.fecha ?? ''} onChange={(event) => update('fecha', event.target.value)} disabled={!paciente} />
        </label>
        <label>Motivo de consulta
          <input value={data.motivo ?? ''} onChange={(event) => update('motivo', event.target.value)} disabled={!paciente} />
        </label>
        <label>Dientes ausentes
          <textarea value={data.dientes_ausentes ?? ''} onChange={(event) => update('dientes_ausentes', event.target.value)} disabled={!paciente} placeholder="Ej. 18, 36, 46..." />
        </label>
        <label>Implantes ya existentes
          <textarea value={data.implantes_previos ?? ''} onChange={(event) => update('implantes_previos', event.target.value)} disabled={!paciente} placeholder="Implantes previos, coronas sobre implante, aditamentos..." />
        </label>
        <label>Protesis, coronas o puentes previos
          <textarea value={data.protesis_previas ?? ''} onChange={(event) => update('protesis_previas', event.target.value)} disabled={!paciente} />
        </label>
        <label>Caries o reconstrucciones visibles
          <textarea value={data.caries_visibles ?? ''} onChange={(event) => update('caries_visibles', event.target.value)} disabled={!paciente} />
        </label>
        <label>Estado periodontal
          <textarea value={data.periodontal ?? ''} onChange={(event) => update('periodontal', event.target.value)} disabled={!paciente} />
        </label>
        <label>Higiene y mucosas
          <textarea value={data.higiene ?? ''} onChange={(event) => update('higiene', event.target.value)} disabled={!paciente} />
        </label>
        <label className="wide">Plan recomendado inicial
          <textarea value={data.plan_recomendado ?? ''} onChange={(event) => update('plan_recomendado', event.target.value)} disabled={!paciente} />
        </label>
        <label className="wide">Observaciones especificas de la boca
          <textarea value={data.observaciones_boca ?? ''} onChange={(event) => update('observaciones_boca', event.target.value)} disabled={!paciente} />
        </label>
      </div>
    </section>
  );
}

function TrabajoPendientePanel({
  presupuestos,
  citas,
  onDarCita,
  onContextLinea,
}: {
  presupuestos: Presupuesto[];
  citas: Cita[];
  onDarCita: (linea: PresupuestoLinea) => void;
  onContextLinea: (event: MouseEvent, linea: PresupuestoLinea) => void;
}) {
  const rows = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado')
      .map((linea) => ({ presupuesto, linea, cita: findCitaForTreatment(citas, linea) }))
  ));

  return (
    <section className="desk-panel">
      <div className="panel-caption">
        <strong>Tratamientos pendientes</strong>
        <span>Solo trabajos aceptados o pasados a pendiente; muestra si ya tienen cita.</span>
      </div>
      <table className="euro-table">
        <thead><tr><th>Presupuesto</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Importe</th><th>Cita</th><th>Estado</th><th>Accion</th></tr></thead>
        <tbody>
          {rows.map(({ presupuesto, linea, cita }) => (
            <tr
              key={linea.id}
              className="treatment-coded-row"
              style={{ '--treatment-color': colorForTreatment(linea.tratamiento) } as CSSProperties}
              onContextMenu={(event) => onContextLinea(event, linea)}
            >
              <td>{presupuesto.numero}</td>
              <td><TreatmentBadge tratamiento={linea.tratamiento} /></td>
              <td>{linea.tratamiento?.nombre ?? 'Tratamiento'}</td>
              <td>{linea.pieza_dental ?? ''}</td>
              <td className="num">{money(linea.importe_neto)}</td>
              <td>{cita ? `${formatDate(cita.fecha_hora)} ${cita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</td>
              <td>{cita ? cita.estado : (linea.aceptado ? 'Aceptado' : 'Pendiente')}</td>
              <td><button onClick={() => onDarCita(linea)}>Dar cita</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8}>Sin tratamientos pendientes aceptados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function TratamientosRealizadosPanel({
  historial,
  consentimientos,
  presupuestos,
  doctorName,
  doctorColor,
  tratamientos,
}: {
  historial: HistorialClinico[];
  consentimientos: Consentimiento[];
  presupuestos: Presupuesto[];
  doctorName: string;
  doctorColor?: string | null;
  tratamientos: TratamientoCatalogo[];
}) {
  const realizados = historial.filter((entrada) => hasFinishedState(entrada.estado));

  function consentimientoFor(entrada: HistorialClinico) {
    const tratamiento = normalizeText(entrada.tratamiento?.nombre);
    return consentimientos.find((item) => (
      (entrada.tratamiento_id && item.tratamiento_id === entrada.tratamiento_id)
      || (tratamiento && normalizeText(item.tipo).includes(tratamiento))
    ));
  }

  return (
    <div className="realizados-workspace">
      <section className="desk-panel">
        <div className="panel-caption">
          <strong>Tratamientos realizados</strong>
          <span>Trabajo terminado con fecha, precio, pieza y consentimiento cuando procede.</span>
        </div>
        <table className="euro-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Tratamiento</th><th>Pieza</th><th>Doctor</th><th>Precio</th><th>Factura</th><th>Consentimiento</th></tr></thead>
          <tbody>
            {realizados.map((entrada) => {
              const consentimiento = consentimientoFor(entrada);
              return (
                <tr key={entrada.id} className="treatment-coded-row" style={{ '--treatment-color': colorForTreatment(entrada.tratamiento) } as CSSProperties}>
                  <td>{formatDate(entrada.fecha)}</td>
                  <td><TreatmentBadge tratamiento={entrada.tratamiento} /></td>
                  <td>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</td>
                  <td>{entrada.pieza_dental ?? ''}</td>
                  <td>{entrada.doctor?.nombre ?? ''}</td>
                  <td className="num">{entrada.importe ? money(entrada.importe) : ''}</td>
                  <td>{entrada.factura_id ? 'Vinculada' : 'Pendiente'}</td>
                  <td>{consentimiento ? consentimiento.estado : 'No adjunto'}</td>
                </tr>
              );
            })}
            {!realizados.length && <tr><td colSpan={8}>Sin tratamientos realizados en historial.</td></tr>}
          </tbody>
        </table>
      </section>
      <TreatmentBoard
        presupuestos={presupuestos}
        doctorName={doctorName}
        doctorColor={doctorColor}
        tratamientos={tratamientos}
      />
    </div>
  );
}

function CitasPacientePanel({ citas }: { citas: Cita[] }) {
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

function ConsentimientosPanel({
  consentimientos,
  plantillas,
  onDisenar,
  onAbrirPdf,
  onRevocar,
}: {
  consentimientos: Consentimiento[];
  plantillas: PlantillaConsentimiento[];
  onDisenar: (tipo?: string) => void;
  onAbrirPdf: (consentimiento: Consentimiento) => void;
  onRevocar: (consentimiento: Consentimiento) => void;
}) {
  return (
    <section className="desk-panel consent-panel">
      <div className="panel-caption">
        <strong>Consentimiento informado</strong>
        <span>Editor propio, plantillas por tratamiento, firma y PDF archivado</span>
        <select onChange={(event) => event.target.value && onDisenar(event.target.value)} defaultValue="">
          <option value="">Diseñar desde plantilla...</option>
          {plantillas.map((plantilla) => <option key={plantilla.codigo} value={plantilla.nombre}>{plantilla.nombre}</option>)}
        </select>
        <button onClick={() => onDisenar()}>Personalizado</button>
      </div>
      <table className="euro-table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Version</th><th>Estado</th><th>Documento</th><th>Acciones</th></tr></thead>
        <tbody>
          {consentimientos.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.fecha_firma)}</td>
              <td>{item.tipo}</td>
              <td>{item.plantilla_version ?? ''}</td>
              <td>{item.estado}</td>
              <td>{item.documento_path ? 'Archivado' : 'Pendiente'}</td>
              <td className="table-actions">
                <button onClick={() => onAbrirPdf(item)}>PDF</button>
                {item.estado !== 'revocado' && <button onClick={() => onRevocar(item)}>Revocar</button>}
              </td>
            </tr>
          ))}
          {!consentimientos.length && <tr><td colSpan={6}>Sin consentimientos para este paciente.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function DocumentosPanel({
  pacienteId,
  documentos,
  onSubir,
  onContextDocumento,
}: {
  pacienteId: string | null;
  documentos: DocumentoPaciente[];
  onSubir: (data: { archivo: File; categoria: string; descripcion?: string; fecha_documento?: string; etiquetas?: string }) => void;
  onContextDocumento: (event: MouseEvent, documento: DocumentoPaciente) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('otro');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [etiquetas, setEtiquetas] = useState('');
  const categorias = ['radiografia', 'cbct', 'escaner', 'fotografia_intraoral', 'fotografia_extraoral', 'informe', 'circular', 'consentimiento', 'presupuesto', 'factura', 'otro'];

  function submitUpload() {
    if (!archivo) {
      window.alert('Seleccione un archivo');
      return;
    }
    onSubir({ archivo, categoria, descripcion, fecha_documento: fecha, etiquetas });
    setArchivo(null);
    setDescripcion('');
    setEtiquetas('');
  }

  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Enlaces y archivos medicos</strong><span>Subida directa y consulta de documentos del paciente</span></div>
      <div className="upload-strip">
        <input type="file" onChange={(event) => setArchivo(event.target.files?.[0] ?? null)} />
        <select value={categoria} onChange={(event) => setCategoria(event.target.value)}>
          {categorias.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
        </select>
        <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
        <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Descripcion" />
        <input value={etiquetas} onChange={(event) => setEtiquetas(event.target.value)} placeholder="Etiquetas" />
        <button onClick={submitUpload} disabled={!pacienteId}>Adjuntar</button>
      </div>
      <div className="document-chip-row">
        {categorias.map((item) => (
          <span key={item}>{item.replaceAll('_', ' ')}</span>
        ))}
      </div>
      <table className="euro-table">
        <thead><tr><th>Fecha</th><th>Categoria</th><th>Archivo</th><th>Tratamiento</th><th>Profesional</th><th>Notas</th><th>Etiquetas</th><th>Acciones</th></tr></thead>
        <tbody>
          {documentos.map((doc) => (
            <tr key={doc.id} onContextMenu={(event) => onContextDocumento(event, doc)}>
              <td>{formatDate(doc.fecha_documento ?? doc.created_at)}</td>
              <td>{doc.categoria}</td>
              <td>{doc.nombre_original}</td>
              <td>{doc.tratamiento_id ?? ''}</td>
              <td>{doc.doctor_id ?? ''}</td>
              <td>{doc.descripcion ?? ''}</td>
              <td>{doc.etiquetas ?? ''}</td>
              <td>{pacienteId && <button onClick={() => void openDocumentoPaciente(pacienteId, doc.id, doc.nombre_original)}>Abrir</button>}</td>
            </tr>
          ))}
          {!documentos.length && <tr><td colSpan={8}>Sin documentos archivados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const signed = useRef(false);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawing.current = true;
    signed.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.stroke();
    onChange(canvas.toDataURL('image/png'));
  }

  function stop() {
    drawing.current = false;
    const canvas = canvasRef.current;
    onChange(canvas && signed.current ? canvas.toDataURL('image/png') : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    signed.current = false;
    onChange(null);
  }

  return (
    <div className="signature-box">
      <canvas
        ref={canvasRef}
        width={520}
        height={150}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerLeave={stop}
      />
      <button onClick={clear}>Limpiar firma</button>
    </div>
  );
}

function DocumentDesignerModal({
  mode,
  paciente,
  plantillas,
  initialTipo,
  onClose,
  onSave,
}: {
  mode: DocumentDesignerMode;
  paciente: ApiPaciente;
  plantillas: PlantillaConsentimiento[];
  initialTipo?: string;
  onClose: () => void;
  onSave: (data: { tipo: string; titulo: string; contenido: string; firmaDataUrl: string | null }) => void;
}) {
  const defaultTipo = initialTipo || (mode === 'consentimiento' ? plantillas[0]?.nombre || 'Consentimiento personalizado' : 'Justificante de asistencia');
  const textos = mode === 'consentimiento' ? CONSENTIMIENTO_TEXTOS : CIRCULAR_TEXTOS;
  const initialPlantilla = mode === 'consentimiento' ? plantillas.find((item) => item.nombre === defaultTipo) : null;
  const [tipo, setTipo] = useState(defaultTipo);
  const [titulo, setTitulo] = useState(mode === 'consentimiento' ? `Consentimiento informado - ${defaultTipo}` : defaultTipo);
  const [contenido, setContenido] = useState(renderTemplate(initialPlantilla?.contenido ?? textos[defaultTipo] ?? '', paciente));
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  function loadTemplate(nextTipo: string) {
    const plantilla = mode === 'consentimiento' ? plantillas.find((item) => item.nombre === nextTipo) : null;
    const base = plantilla?.contenido ?? textos[nextTipo] ?? '';
    setTipo(nextTipo);
    setTitulo(mode === 'consentimiento' ? `Consentimiento informado - ${nextTipo}` : nextTipo);
    setContenido(renderTemplate(base, paciente));
  }

  function saveLocalTemplate() {
    localStorage.setItem(`dentcore_template_${mode}_${tipo}`, contenido);
    window.alert('Plantilla guardada en este equipo');
  }

  function loadLocalTemplate() {
    const saved = localStorage.getItem(`dentcore_template_${mode}_${tipo}`);
    if (saved) setContenido(saved);
    else window.alert('No hay plantilla personalizada guardada para este tipo');
  }

  const options = mode === 'consentimiento'
    ? [...plantillas.map((item) => item.nombre), 'Consentimiento personalizado']
    : Object.keys(CIRCULAR_TEXTOS);

  return (
    <div className="modal-backdrop">
      <section className="document-modal">
        <div className="modal-titlebar">
          <strong>{mode === 'consentimiento' ? 'Consentimiento informado' : 'Circular personalizada'}</strong>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <div className="document-editor-grid">
          <aside>
            <label>Tipo
              <select value={tipo} onChange={(event) => loadTemplate(event.target.value)}>
                {options.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Titulo
              <input value={titulo} onChange={(event) => setTitulo(event.target.value)} />
            </label>
            <button onClick={loadLocalTemplate}>Cargar plantilla guardada</button>
            <button onClick={saveLocalTemplate}>Guardar plantilla</button>
            <button onClick={() => window.print()}>Imprimir vista</button>
          </aside>
          <main>
            <label>Texto del documento
              <textarea value={contenido} onChange={(event) => setContenido(event.target.value)} />
            </label>
            <SignaturePad onChange={setFirmaDataUrl} />
            <div className="modal-actions">
              <button onClick={() => onSave({ tipo, titulo, contenido, firmaDataUrl })}>Guardar PDF en ficha</button>
              <button onClick={onClose}>Cancelar</button>
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

function LaboratorioPacientePanel({ trabajos }: { trabajos: TrabajoLaboratorio[] }) {
  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Trabajos de laboratorio</strong><span>Protesicos, fechas, costes y cobros vinculados al paciente</span></div>
      <table className="euro-table">
        <thead><tr><th>Referencia</th><th>Tipo</th><th>Laboratorio</th><th>Trabajo</th><th>Pieza</th><th>Estado</th><th>Entrega</th><th>Coste</th><th>Pte. lab</th><th>Pte. paciente</th></tr></thead>
        <tbody>
          {trabajos.map((trabajo) => (
            <tr key={trabajo.id}>
              <td>{trabajo.referencia ?? ''}</td><td>{trabajo.tipo_trabajo ?? ''}</td><td>{trabajo.laboratorio?.nombre ?? ''}</td>
              <td>{trabajo.descripcion}</td><td>{trabajo.pieza_dental ?? ''}</td><td>{trabajo.estado}</td><td>{formatDate(trabajo.fecha_entrega_prevista)}</td>
              <td className="num">{money(trabajo.coste_laboratorio ?? trabajo.precio ?? 0)}</td><td>{trabajo.estado_pago_laboratorio ?? ''}</td><td>{trabajo.estado_cobro_paciente ?? ''}</td>
            </tr>
          ))}
          {!trabajos.length && <tr><td colSpan={10}>Sin trabajos de laboratorio asociados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export default function PacientesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ApiPaciente | null>(null);
  const [tab, setTab] = useState<WorkTab>('pacientes');
  const [designer, setDesigner] = useState<{ mode: DocumentDesignerMode; tipo?: string } | null>(null);
  const [editingPatient, setEditingPatient] = useState(false);
  const [fullPatientOpen, setFullPatientOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<PatientContextMenu | null>(null);
  const [searchParams] = useSearchParams();
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: getPacientes });
  const pacientes = pacientesQuery.data ?? [];
  const requestedPatientId = searchParams.get('paciente_id') ?? sessionStorage.getItem('dentcore_selected_patient_id');
  const activeSummary = selected ?? pacientes.find((paciente) => paciente.id === requestedPatientId) ?? pacientes[0] ?? null;
  const pacienteDetalleQuery = useQuery({
    queryKey: ['paciente-detalle', activeSummary?.id],
    queryFn: () => getPaciente(activeSummary!.id),
    enabled: Boolean(activeSummary),
  });
  const active = pacienteDetalleQuery.data ?? activeSummary;

  const presupuestosQuery = useQuery({
    queryKey: ['presupuestos', active?.id],
    queryFn: () => getPresupuestos(active!.id),
    enabled: Boolean(active),
  });
  const facturasQuery = useQuery({
    queryKey: ['facturas', active?.id],
    queryFn: () => getFacturas(active!.id),
    enabled: Boolean(active),
  });
  const saldoQuery = useQuery({
    queryKey: ['saldo-paciente', active?.id],
    queryFn: () => getSaldoPaciente(active!.id),
    enabled: Boolean(active),
  });
  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const formasPagoQuery = useQuery({ queryKey: ['formas-pago'], queryFn: getFormasPago });
  const tratamientosQuery = useQuery({ queryKey: ['tratamientos-catalogo'], queryFn: () => getTratamientosCatalogo({ solo_activos: true }) });
  const historialQuery = useQuery({
    queryKey: ['historial-paciente', active?.id],
    queryFn: () => getHistorialPaciente(active!.id),
    enabled: Boolean(active),
  });
  const citasPacienteQuery = useQuery({
    queryKey: ['citas-paciente', active?.id],
    queryFn: () => getCitas({ paciente_id: active!.id }),
    enabled: Boolean(active),
  });
  const documentosQuery = useQuery({
    queryKey: ['documentos-paciente', active?.id],
    queryFn: () => getDocumentosPaciente(active!.id),
    enabled: Boolean(active),
  });
  const plantillasQuery = useQuery({ queryKey: ['plantillas-consentimiento'], queryFn: getPlantillasConsentimiento });
  const consentimientosQuery = useQuery({
    queryKey: ['consentimientos-paciente', active?.id],
    queryFn: () => getConsentimientosPaciente(active!.id),
    enabled: Boolean(active),
  });
  const laboratorioPacienteQuery = useQuery({
    queryKey: ['laboratorio-paciente', active?.id],
    queryFn: () => getTrabajosLaboratorio({ paciente_id: active!.id }),
    enabled: Boolean(active),
  });

  const presupuestos = presupuestosQuery.data ?? [];
  const facturas = facturasQuery.data ?? [];
  const totalFacturado = Number(saldoQuery.data?.total_facturado ?? facturas.reduce((sum, factura) => sum + Number(factura.total), 0));
  const totalPendiente = Number(saldoQuery.data?.pendiente ?? facturas.reduce((sum, factura) => sum + Number(factura.pendiente), 0));
  const tratamientosRealizados = historialQuery.data?.filter((item) => ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(item.estado)).length ?? 0;
  const nextCita = citasPacienteQuery.data?.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  const hasPatientError = pacientesQuery.isError || pacienteDetalleQuery.isError || historialQuery.isError || citasPacienteQuery.isError;
  const hasPatientLoading = pacientesQuery.isLoading || (Boolean(active?.id) && pacienteDetalleQuery.isLoading);

  const nuevoPresupuesto = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error('Sin paciente');
      const doctor = doctoresQuery.data?.[0];
      if (!doctor) throw new Error('No hay doctores configurados');
      return createPresupuesto(active.id, doctor.id);
    },
    onSuccess: () => {
      void presupuestosQuery.refetch();
      setTab('presupuestos');
    },
  });

  const emitirFactura = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error('Sin paciente');
      const concepto = window.prompt('Concepto de la factura', 'Tratamiento dental');
      if (!concepto) throw new Error('Cancelado');
      const importeRaw = window.prompt('Importe final sin IVA', '0');
      const importe = Number((importeRaw ?? '').replace(',', '.'));
      if (!Number.isFinite(importe) || importe <= 0) throw new Error('Importe no valido');
      return createFacturaManual(active.id, concepto, importe);
    },
    onSuccess: () => {
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      setTab('facturacion');
    },
  });

  const cobrarFactura = useMutation({
    mutationFn: async () => {
      const forma = formasPagoQuery.data?.[0];
      if (!forma) throw new Error('No hay formas de pago configuradas');
      const factura = facturas.find((item) => Number(item.pendiente) > 0);
      if (!factura) throw new Error('No hay facturas pendientes');
      return registrarCobro(factura.id, forma.id, Number(factura.pendiente));
    },
    onSuccess: () => {
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      setTab('facturacion');
    },
  });

  const aceptarLineaPendiente = useMutation({
    mutationFn: async (linea: PresupuestoLinea) => updatePresupuestoLinea(linea.presupuesto_id, linea.id, { aceptado: true }),
    onSuccess: () => {
      setContextMenu(null);
      void presupuestosQuery.refetch();
      setTab('pendiente');
    },
  });

  const facturarLinea = useMutation({
    mutationFn: async (linea: PresupuestoLinea) => {
      if (!active) throw new Error('Sin paciente');
      const importe = Number(linea.importe_neto || linea.precio_unitario || 0);
      if (!Number.isFinite(importe) || importe <= 0) throw new Error('Importe no valido');
      return createFacturaManual(active.id, linea.tratamiento?.nombre ?? 'Tratamiento dental', importe);
    },
    onSuccess: () => {
      setContextMenu(null);
      void facturasQuery.refetch();
      void saldoQuery.refetch();
      setTab('facturacion');
    },
  });

  const subirDocumento = useMutation({
    mutationFn: async (data: { archivo: File; categoria: string; descripcion?: string; fecha_documento?: string; etiquetas?: string }) => {
      if (!active) throw new Error('Sin paciente');
      return uploadDocumentoPaciente(active.id, data);
    },
    onSuccess: () => {
      void documentosQuery.refetch();
      setTab('documentos');
    },
  });

  const guardarDocumentoDisenado = useMutation({
    mutationFn: async (data: { tipo: string; titulo: string; contenido: string; firmaDataUrl: string | null }) => {
      if (!active) throw new Error('Sin paciente');
      if (!designer) throw new Error('Sin editor');
      if (designer.mode === 'consentimiento') {
        const plantilla = (plantillasQuery.data ?? []).find((item) => item.nombre === data.tipo);
        const consentimiento = await createConsentimientoPaciente(active.id, data.tipo, doctoresQuery.data?.[0]?.id, {
          plantilla_id: plantilla?.id ?? null,
          estado: data.firmaDataUrl ? 'pendiente_firma' : 'pendiente_firma',
          plantilla_version: plantilla?.version ?? 'personalizada',
          contenido: data.contenido,
        });
        const firmado = data.firmaDataUrl
          ? await firmarConsentimiento(consentimiento.id, data.firmaDataUrl)
          : consentimiento;
        return { kind: 'consentimiento' as const, consentimiento: firmado };
      }
      const categoria = 'circular';
      const doc = await generarDocumentoPdfPaciente(active.id, {
        titulo: data.titulo,
        categoria,
        contenido: data.contenido,
        descripcion: data.titulo,
        etiquetas: `circular, ${data.tipo}`,
        doctor_id: doctoresQuery.data?.[0]?.id ?? null,
        firma_data_url: data.firmaDataUrl,
      });
      return { kind: 'documento' as const, doc };
    },
    onSuccess: (result) => {
      void documentosQuery.refetch();
      void consentimientosQuery.refetch();
      setDesigner(null);
      if (result.kind === 'consentimiento') {
        setTab('consentimientos');
        void openConsentimientoPdf(result.consentimiento.id);
        return;
      }
      setTab('documentos');
      if (active && result.doc.id) void openDocumentoPaciente(active.id, result.doc.id, result.doc.nombre_original);
    },
  });

  const guardarFichaPaciente = useMutation({
    mutationFn: async (data: Partial<ApiPaciente>) => {
      if (!active) throw new Error('Sin paciente');
      return updatePaciente(active.id, data);
    },
    onSuccess: (paciente) => {
      setSelected(paciente);
      setEditingPatient(false);
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', paciente.id] });
      void pacientesQuery.refetch();
    },
  });

  const guardarPrimeraVisita = useMutation({
    mutationFn: async (data: PrimeraVisitaData) => {
      if (!active) throw new Error('Sin paciente');
      return updatePaciente(active.id, {
        datos_salud: {
          ...(active.datos_salud ?? {}),
          primera_visita: data,
        },
      });
    },
    onSuccess: (paciente) => {
      setSelected(paciente);
      void queryClient.invalidateQueries({ queryKey: ['paciente-detalle', paciente.id] });
      void pacientesQuery.refetch();
    },
  });

  function focusPacienteSearch() {
    setTab('pacientes');
    window.setTimeout(() => document.getElementById('patient-search-input')?.focus(), 0);
  }

  function imprimirFicha() {
    setDesigner(active ? { mode: 'circular' } : null);
  }

  function verSaldoPaciente() {
    setTab('facturacion');
  }

  function asociarFactura() {
    setTab('facturacion');
    void emitirFactura.mutate();
  }

  function revocarConsentimientoPaciente(consentimiento: Consentimiento) {
    const motivo = window.prompt('Motivo de revocación del consentimiento');
    if (!motivo) return;
    void revocarConsentimiento(consentimiento.id, motivo).then(() => {
      void consentimientosQuery.refetch();
    });
  }

  function abrirRecibos() {
    setTab('facturacion');
    if (facturas[0]) window.open(facturaPdfUrl(facturas[0].id), '_blank');
  }

  function abrirEnlaces() {
    setTab('documentos');
  }

  function openContext(event: MouseEvent, menu: PatientContextDraft) {
    event.preventDefault();
    setContextMenu({ ...menu, x: event.clientX, y: event.clientY } as PatientContextMenu);
  }

  function abrirAgendaPaciente() {
    if (!active) return;
    sessionStorage.setItem('dentcore_selected_patient_id', active.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(active));
    setContextMenu(null);
    navigate('/agenda');
  }

  function copiarDatosPaciente() {
    if (!active) return;
    const datos = `${fullName(active)} - H ${active.num_historial}${active.telefono ? ` - ${active.telefono}` : ''}`;
    void navigator.clipboard?.writeText(datos);
    setContextMenu(null);
  }

  function abrirPdfFactura(factura: Factura) {
    window.open(facturaPdfUrl(factura.id), '_blank');
    setContextMenu(null);
  }

  function emitirRecetaFactura(factura: Factura) {
    void emitirRecetaPdf(factura.id);
    setContextMenu(null);
  }

  function abrirDocumento(documento: DocumentoPaciente) {
    if (!active) return;
    void openDocumentoPaciente(active.id, documento.id, documento.nombre_original);
    setContextMenu(null);
  }

  function darCitaParaTratamiento(linea: PresupuestoLinea) {
    if (!active) return;
    sessionStorage.setItem('dentcore_selected_patient_id', active.id);
    sessionStorage.setItem('dentcore_selected_patient_name', fullName(active));
    sessionStorage.setItem('dentcore_selected_treatment', linea.tratamiento?.nombre ?? 'Tratamiento dental');
    setContextMenu(null);
    navigate('/agenda');
  }

  return (
    <>
      <div className="patient-selector-bar">
      <PatientFinder
        pacientes={pacientes}
        selectedId={active?.id ?? null}
        onSelect={(paciente) => {
          setSelected(paciente);
          sessionStorage.setItem('dentcore_selected_patient_id', paciente.id);
          setTab('pacientes');
        }}
      />
      <div className="patient-selector-current">
        <span>Paciente activo</span>
        <strong>{active ? fullName(active) : 'Sin seleccionar'}</strong>
        <small>Historia {active?.num_historial ?? '-'} - {active?.telefono || 'sin telefono'}</small>
      </div>
      {hasPatientError && (
        <div className="inline-alert">
          Algunos datos del paciente no se han podido cargar. Revisa la conexion o cambia de paciente para reintentar.
        </div>
      )}
      {hasPatientLoading && (
        <div className="patient-loading-strip" aria-label="Cargando paciente">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
    <section className={`page patient-screen${tab === 'pacientes' ? ' patient-dashboard-mode' : ' no-bottom-bar'}`} onClick={() => setContextMenu(null)}>
      <div className="patient-titlebar">
        <strong>{active ? `${fullName(active)} // CLINICA DENTAL` : 'Pacientes // CLINICA DENTAL'}</strong>
      </div>
      <nav className="patient-module-tabs">
        {WORK_TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            <span>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      {tab !== 'pacientes' && (
        <aside className="patient-summary-strip" onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
          <span><b>Paciente</b>{active ? fullName(active) : 'Sin seleccionar'} - H {active?.num_historial ?? '-'}</span>
          <span><b>Proxima</b>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)} - ${nextCita.motivo ?? ''}` : 'sin cita programada'}</span>
          <span><b>Realizados</b>{tratamientosRealizados}</span>
          <span><b>Saldo</b>{money(totalPendiente)} / {money(totalFacturado)}</span>
          <span><b>Docs</b>{documentosQuery.data?.length ?? 0} · CI {consentimientosQuery.data?.length ?? 0}</span>
        </aside>
      )}

      <main className="patient-desk">
        {tab === 'pacientes' && (
          <div onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
            <PatientForm
              paciente={active}
              facturas={facturas}
              historial={historialQuery.data ?? []}
              citas={citasPacienteQuery.data ?? []}
              onEdit={() => setEditingPatient(true)}
              onOpenFull={() => setFullPatientOpen(true)}
              onOpenCitas={() => setTab('citas')}
              onOpenHistorial={() => setTab('facturacion')}
              onOpenDocumentos={() => setTab('documentos')}
            />
          </div>
        )}
        {tab === 'realizados' && (
          <TratamientosRealizadosPanel
            historial={historialQuery.data ?? []}
            consentimientos={consentimientosQuery.data ?? []}
            presupuestos={presupuestos}
            doctorName={doctoresQuery.data?.[0]?.nombre ?? 'Doctor'}
            doctorColor={doctoresQuery.data?.[0]?.color_agenda}
            tratamientos={tratamientosQuery.data ?? []}
          />
        )}
        {tab === 'pendiente' && (
          <TrabajoPendientePanel
            presupuestos={presupuestos}
            citas={citasPacienteQuery.data ?? []}
            onDarCita={darCitaParaTratamiento}
            onContextLinea={(event, linea) => openContext(event, { kind: 'linea', linea })}
          />
        )}
        {tab === 'presupuestos' && (
          <>
            {presupuestos.map((presupuesto) => (
              <PresupuestoPanel
                key={presupuesto.id}
                presupuesto={presupuesto}
                paciente={active!}
                tratamientos={tratamientosQuery.data ?? []}
                doctorId={doctoresQuery.data?.[0]?.id ?? null}
              />
            ))}
            {!presupuestosQuery.isLoading && !presupuestos.length && (
              <div className="desk-panel empty-state">No hay presupuestos para este paciente.</div>
            )}
          </>
        )}
        {tab === 'primera' && (
          <PrimeraVisitaPanel
            paciente={active}
            onSave={(data) => guardarPrimeraVisita.mutate(data)}
            saving={guardarPrimeraVisita.isPending}
          />
        )}
        {tab === 'historial' && (
          <ClinicalHistoryPanel
            historial={historialQuery.data ?? []}
            onFacturar={() => emitirFactura.mutate()}
            onCobrar={() => cobrarFactura.mutate()}
            onVerDeuda={verSaldoPaciente}
            onAsociarFactura={asociarFactura}
          />
        )}
        {tab === 'citas' && <CitasPacientePanel citas={citasPacienteQuery.data ?? []} />}
        {tab === 'facturacion' && (
          <EurodentHistoryBillingPanel
            paciente={active}
            historial={historialQuery.data ?? []}
            facturas={facturas}
            onFacturar={() => emitirFactura.mutate()}
            onCobrar={() => cobrarFactura.mutate()}
            onOrtodoncia={() => setTab('realizados')}
            onRecibos={abrirRecibos}
            onContextFactura={(event, factura) => openContext(event, { kind: 'factura', factura })}
          />
        )}
        {tab === 'consentimientos' && (
          <ConsentimientosPanel
            consentimientos={consentimientosQuery.data ?? []}
            plantillas={plantillasQuery.data ?? []}
            onDisenar={(tipo) => setDesigner(active ? { mode: 'consentimiento', tipo } : null)}
            onAbrirPdf={(consentimiento) => void openConsentimientoPdf(consentimiento.id)}
            onRevocar={revocarConsentimientoPaciente}
          />
        )}
        {tab === 'documentos' && (
          <DocumentosPanel
            pacienteId={active?.id ?? null}
            documentos={documentosQuery.data ?? []}
            onSubir={(data) => subirDocumento.mutate(data)}
            onContextDocumento={(event, documento) => openContext(event, { kind: 'documento', documento })}
          />
        )}
        {tab === 'laboratorio' && <LaboratorioPacientePanel trabajos={laboratorioPacienteQuery.data ?? []} />}
      </main>

      {tab === 'pacientes' && (
        <footer className="patient-bottom-bar">
          <button onClick={focusPacienteSearch}>Buscar</button>
          <button onClick={imprimirFicha}>Circular</button>
          <button onClick={() => setDesigner(active ? { mode: 'consentimiento' } : null)}>Cons.Inf.</button>
          <button onClick={abrirEnlaces}>Enlaces</button>
        </footer>
      )}
      {contextMenu && (
        <div className="context-menu patient-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.kind === 'paciente' && (
            <>
              <strong>Paciente</strong>
              <button onClick={() => { setEditingPatient(true); setContextMenu(null); }}>Editar ficha</button>
              <button onClick={() => { setContextMenu(null); focusPacienteSearch(); }}>Buscar / cambiar paciente</button>
              <button onClick={abrirAgendaPaciente}>Abrir agenda / nueva cita</button>
              <button onClick={() => { nuevoPresupuesto.mutate(); setContextMenu(null); }} disabled={!active || nuevoPresupuesto.isPending}>Nuevo presupuesto</button>
              <span />
              <button onClick={() => { setTab('primera'); setContextMenu(null); }}>Primera visita</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento' } : null); setContextMenu(null); }}>Consentimiento informado</button>
              <button onClick={() => { setDesigner(active ? { mode: 'circular' } : null); setContextMenu(null); }}>Circular / justificante</button>
              <button onClick={() => { setTab('documentos'); setContextMenu(null); }}>Adjuntar / ver enlaces</button>
              <span />
              <button onClick={() => { emitirFactura.mutate(); setContextMenu(null); }} disabled={!active || emitirFactura.isPending}>Emitir factura</button>
              <button onClick={() => { cobrarFactura.mutate(); setContextMenu(null); }} disabled={!active || cobrarFactura.isPending}>Registrar cobro</button>
              <button onClick={() => { setTab('facturacion'); setContextMenu(null); }}>Historial / facturacion</button>
              <button onClick={copiarDatosPaciente}>Copiar datos paciente</button>
            </>
          )}
          {contextMenu.kind === 'linea' && (
            <>
              <strong>Tratamiento pendiente</strong>
              <button onClick={() => darCitaParaTratamiento(contextMenu.linea)}>Dar cita para este tratamiento</button>
              <button onClick={() => aceptarLineaPendiente.mutate(contextMenu.linea)} disabled={aceptarLineaPendiente.isPending}>Marcar aceptado</button>
              <button onClick={() => facturarLinea.mutate(contextMenu.linea)} disabled={facturarLinea.isPending}>Facturar tratamiento</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento', tipo: contextMenu.linea.tratamiento?.nombre } : null); setContextMenu(null); }}>Consentimiento de tratamiento</button>
              <button onClick={() => { setTab('presupuestos'); setContextMenu(null); }}>Abrir presupuesto</button>
            </>
          )}
          {contextMenu.kind === 'factura' && (
            <>
              <strong>Factura</strong>
              <button onClick={() => abrirPdfFactura(contextMenu.factura)}>Ver / imprimir PDF</button>
              <button onClick={() => { cobrarFactura.mutate(); setContextMenu(null); }} disabled={cobrarFactura.isPending || Number(contextMenu.factura.pendiente) <= 0}>Registrar cobro pendiente</button>
              <button onClick={() => emitirRecetaFactura(contextMenu.factura)}>Emitir receta</button>
              <button onClick={() => { setTab('documentos'); setContextMenu(null); }}>Ver documentos del paciente</button>
            </>
          )}
          {contextMenu.kind === 'documento' && (
            <>
              <strong>Documento</strong>
              <button onClick={() => abrirDocumento(contextMenu.documento)}>Abrir documento</button>
              <button onClick={() => { setTab('documentos'); setContextMenu(null); }}>Adjuntar otro archivo</button>
              <button onClick={() => { setDesigner(active ? { mode: 'consentimiento' } : null); setContextMenu(null); }}>Crear consentimiento</button>
              <button onClick={() => { setDesigner(active ? { mode: 'circular' } : null); setContextMenu(null); }}>Crear circular</button>
            </>
          )}
        </div>
      )}
      {designer && active && (
        <DocumentDesignerModal
          mode={designer.mode}
          paciente={active}
          plantillas={plantillasQuery.data ?? []}
          initialTipo={designer.tipo}
          onClose={() => setDesigner(null)}
          onSave={(data) => guardarDocumentoDisenado.mutate(data)}
        />
      )}
      {editingPatient && active && (
        <PatientEditModal
          paciente={active}
          onClose={() => setEditingPatient(false)}
          onSave={(data) => guardarFichaPaciente.mutate(data)}
        />
      )}
      {fullPatientOpen && active && (
        <PatientFullViewModal
          paciente={active}
          facturas={facturas}
          historial={historialQuery.data ?? []}
          citas={citasPacienteQuery.data ?? []}
          presupuestos={presupuestos}
          documentos={documentosQuery.data ?? []}
          consentimientos={consentimientosQuery.data ?? []}
          laboratorio={laboratorioPacienteQuery.data ?? []}
          onClose={() => setFullPatientOpen(false)}
          onEdit={() => {
            setFullPatientOpen(false);
            setEditingPatient(true);
          }}
          onOpenTab={(targetTab) => setTab(targetTab)}
        />
      )}
    </section>
    </>
  );
}
