import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import OdontogramaPlanView from '../../components/OdontogramaPlan';
import {
  addPresupuestoLinea,
  createConsentimientoPaciente,
  createFacturaManual,
  createPresupuesto,
  deletePresupuestoLinea,
  emitirRecetaPdf,
  facturaPdfUrl,
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
  getTratamientosCatalogo,
  getTrabajosLaboratorio,
  openDocumentoPaciente,
  pasarPresupuestoTrabajoPendiente,
  registrarCobro,
  saveOdontograma,
  updatePresupuestoLinea,
  updatePaciente,
  uploadDocumentoPaciente,
} from '../../lib/api';
import type { ApiPaciente, Cita, Consentimiento, DocumentoPaciente, Factura, HistorialClinico, OdontogramaPlan, PlantillaConsentimiento, Presupuesto, PresupuestoLinea, TrabajoLaboratorio, TratamientoCatalogo } from '../../types/api';

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
  { id: 'pacientes', label: 'Pacientes', icon: 'PA' },
  { id: 'primera', label: 'Primera Visita', icon: '1' },
  { id: 'presupuestos', label: 'Presupuestos', icon: 'PR' },
  { id: 'pendiente', label: 'Tratamientos Pendientes', icon: 'TP' },
  { id: 'realizados', label: 'Tratamientos Realizados', icon: 'TR' },
  { id: 'facturacion', label: 'Historial / Facturacion', icon: 'HF' },
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

function calcAge(value?: string | null) {
  if (!value) return '';
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return String(age);
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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) =>
      `${p.num_historial} ${p.codigo ?? ''} ${p.nombre} ${p.apellidos} ${p.telefono ?? ''}`.toLowerCase().includes(q),
    );
  }, [pacientes, query]);

  return (
    <div className="patient-finder">
      <label>
        Buscar
        <input id="patient-search-input" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(event) => {
          const paciente = pacientes.find((item) => item.id === event.target.value);
          if (paciente) onSelect(paciente);
        }}
      >
        {filtered.map((paciente) => (
          <option key={paciente.id} value={paciente.id}>
            {String(paciente.num_historial).padStart(5, '0')} - {paciente.apellidos}, {paciente.nombre}
          </option>
        ))}
      </select>
      {query.trim() && (
        <div className="patient-live-results patient-finder-results">
          {filtered.slice(0, 5).map((paciente) => (
            <button
              type="button"
              className={paciente.id === selectedId ? 'active' : ''}
              key={paciente.id}
              onClick={() => onSelect(paciente)}
            >
              <strong>{paciente.apellidos}, {paciente.nombre}</strong>
              <span>{paciente.telefono ?? 'sin telefono'} · H{paciente.num_historial}</span>
            </button>
          ))}
          {!filtered.length && <span>No hay pacientes con ese criterio.</span>}
        </div>
      )}
    </div>
  );
}

function FieldBox({ label, value, wide = false }: { label: string; value?: string | number | null; wide?: boolean }) {
  return (
    <label className={wide ? 'form-box wide' : 'form-box'}>
      <span>{label}</span>
      <input readOnly value={value ?? ''} />
    </label>
  );
}

function TextBox({ label, value }: { label: string; value?: string | null }) {
  return (
    <label className="form-box textarea-box">
      <span>{label}</span>
      <textarea readOnly value={value ?? ''} />
    </label>
  );
}

function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return Object.entries(datos)
    .filter(([key]) => !['temporal', 'pendiente_completar'].includes(key))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}

function PresupuestoPanel({ presupuesto, tratamientos }: { presupuesto: Presupuesto; tratamientos: TratamientoCatalogo[] }) {
  const queryClient = useQueryClient();
  const [odontograma, setOdontograma] = useState<OdontogramaPlan>(presupuesto.odontograma ?? {});
  const [selectedTreatmentId, setSelectedTreatmentId] = useState(tratamientos[0]?.id ?? '');
  const [lineaSeleccionada, setLineaSeleccionada] = useState<PresupuestoLinea | null>(presupuesto.lineas[0] ?? null);
  const [pieza, setPieza] = useState('');
  const [caras, setCaras] = useState('');
  const [descuento, setDescuento] = useState('0');
  const [precioLinea, setPrecioLinea] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const mutation = useMutation({
    mutationFn: () => saveOdontograma(presupuesto.id, odontograma),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presupuestos', presupuesto.paciente_id] }),
  });
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
  }

  return (
    <section className="desk-panel budget-panel">
      <div className="panel-caption">
        <strong>Presupuesto #{presupuesto.numero}</strong>
        <span>{formatDate(presupuesto.fecha)} - {presupuesto.estado}</span>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Guardar odontograma</button>
        <button onClick={() => passPending.mutate()} disabled={passPending.isPending}>Pasar aceptados a T.P.</button>
      </div>
      <OdontogramaPlanView value={odontograma} onChange={setOdontograma} />
      <div className="budget-workbench">
        <aside>
          <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar tratamiento" />
          <select size={9} value={selectedTreatment?.id ?? ''} onChange={(event) => selectTreatment(event.target.value)}>
            {catalog.map((tratamiento) => (
              <option key={tratamiento.id} value={tratamiento.id}>
                {tratamiento.codigo ?? 'TR'} · {tratamiento.nombre} · {money(tratamiento.precio)}
              </option>
            ))}
          </select>
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

function PatientForm({ paciente, facturas, onEdit }: { paciente: ApiPaciente | null; facturas: Factura[]; onEdit: () => void }) {
  const total = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const cobrado = facturas.reduce((sum, factura) => sum + Number(factura.total_cobrado), 0);
  const saldo = facturas.reduce((sum, factura) => sum + Number(factura.pendiente), 0);
  const temporal = paciente?.observaciones?.toLowerCase().includes('temporal');
  const address = [paciente?.direccion, paciente?.codigo_postal, paciente?.ciudad, paciente?.provincia].filter(Boolean).join(' · ');
  const initials = paciente ? `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase() : '--';
  const healthText = readableHealthData(paciente?.datos_salud);

  return (
    <div className="patient-form-grid">
      {temporal && (
        <button type="button" className="temporary-patient-banner" onClick={onEdit}>
          Paciente temporal: completar datos en clínica
        </button>
      )}
      <section className="patient-hero-card">
        <div className="patient-avatar">{initials}</div>
        <div>
          <span>Paciente</span>
          <strong>{fullName(paciente) || 'Sin seleccionar'}</strong>
          <em>Historia {paciente?.num_historial ?? '-'} · {paciente?.codigo ?? `#${String(paciente?.num_historial ?? '').padStart(6, '0')}`}</em>
        </div>
        <button type="button" onClick={onEdit} disabled={!paciente}>Editar ficha</button>
      </section>

      <section className="patient-info-card">
        <h3>Identificación</h3>
        <FieldBox label="N.I.F." value={paciente?.dni_nie} />
        <FieldBox label="Nacimiento" value={formatDate(paciente?.fecha_nacimiento)} />
        <FieldBox label="Edad" value={calcAge(paciente?.fecha_nacimiento)} />
      </section>

      <section className="patient-info-card patient-contact-card">
        <h3>Contacto</h3>
        <FieldBox label="Teléfono" value={paciente?.telefono} />
        <FieldBox label="Móvil" value={paciente?.telefono2} />
        <FieldBox label="E-mail" value={paciente?.email} />
        <FieldBox label="Dirección" value={address} wide />
      </section>

      <section className="patient-info-card patient-clinical-card">
        <h3>Clínica</h3>
        <TextBox label="Alergias / salud" value={healthText} />
        <TextBox label="Observaciones generales" value={paciente?.observaciones} />
      </section>

      <section className="patient-money-card">
        <h3>Saldo</h3>
        <span>Débitos</span><strong>{money(total)}</strong>
        <span>Pagos</span><strong>{money(cobrado)}</strong>
        <span>Pendiente</span><strong className={saldo > 0 ? 'debt' : ''}>{money(saldo)}</strong>
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

function BillingHistory({
  facturas,
  onCobrar,
  onOrtodoncia,
  onRecibos,
  onContextFactura,
}: {
  facturas: Factura[];
  onCobrar: () => void;
  onOrtodoncia: () => void;
  onRecibos: () => void;
  onContextFactura: (event: MouseEvent, factura: Factura) => void;
}) {
  return (
    <div className="billing-panel">
      <table className="euro-table billing-table">
        <thead>
          <tr>
            <th>Fecha</th><th>Tratamiento</th><th>Pieza</th><th>FP</th><th>Factura</th><th>Recibo</th>
            <th>Doc.</th><th>Gab.</th><th>Importe</th><th>Cobrado</th><th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((factura, index) => (
            <tr
              key={factura.id}
              className={index === facturas.length - 1 ? 'selected-row' : ''}
              onContextMenu={(event) => onContextFactura(event, factura)}
            >
              <td>{formatDate(factura.fecha)}</td>
              <td>{factura.lineas[0]?.concepto ?? 'Tratamiento dental'}</td>
              <td>{factura.lineas[0]?.concepto_ficticio ?? ''}</td>
              <td>TC</td>
              <td>{factura.serie}/{factura.numero}</td>
              <td>No</td>
              <td>004</td>
              <td>002</td>
              <td className="num">{money(factura.total)}</td>
              <td className="num">{money(factura.total_cobrado)}</td>
              <td className="num">{money(factura.pendiente)}</td>
            </tr>
          ))}
          {!facturas.length && (
            <tr><td colSpan={11}>Sin movimientos de facturacion.</td></tr>
          )}
        </tbody>
      </table>
      <div className="history-footer">
        <label>Observaciones: <textarea readOnly value="" /></label>
        <button onClick={onOrtodoncia}>C.Ortod.</button>
        <button onClick={() => facturas[0] && window.open(facturaPdfUrl(facturas[0].id), '_blank')}>Imprimir</button>
        <button onClick={onCobrar}>Cobrar</button>
        <button onClick={() => facturas[0] && window.open(facturaPdfUrl(facturas[0].id), '_blank')}>Facturas</button>
        <button onClick={() => facturas[0] && void emitirRecetaPdf(facturas[0].id)}>Emitir receta</button>
        <button onClick={onRecibos}>Recibos</button>
      </div>
    </div>
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
}: {
  consentimientos: Consentimiento[];
  plantillas: PlantillaConsentimiento[];
  onDisenar: (tipo?: string) => void;
}) {
  return (
    <section className="desk-panel consent-panel">
      <div className="panel-caption">
        <strong>Consentimiento informado</strong>
        <span>Editor propio, plantillas por tratamiento, firma y PDF archivado</span>
        <select onChange={(event) => event.target.value && onDisenar(event.target.value)} defaultValue="">
          <option value="">Disenar desde plantilla...</option>
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
              <td>{item.documento_id ? 'Ver en Enlaces' : 'Firmar/archivar'}</td>
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
  const [tipo, setTipo] = useState(defaultTipo);
  const [titulo, setTitulo] = useState(mode === 'consentimiento' ? `Consentimiento informado - ${defaultTipo}` : defaultTipo);
  const [contenido, setContenido] = useState(renderTemplate(textos[defaultTipo] ?? '', paciente));
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  function loadTemplate(nextTipo: string) {
    const base = textos[nextTipo] ?? '';
    setTipo(nextTipo);
    setTitulo(mode === 'consentimiento' ? `Consentimiento informado - ${nextTipo}` : nextTipo);
    setContenido(renderTemplate(base, paciente));
  }

  function saveLocalTemplate() {
    localStorage.setItem(`dentorg_template_${mode}_${tipo}`, contenido);
    window.alert('Plantilla guardada en este equipo');
  }

  function loadLocalTemplate() {
    const saved = localStorage.getItem(`dentorg_template_${mode}_${tipo}`);
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
  const [contextMenu, setContextMenu] = useState<PatientContextMenu | null>(null);
  const [searchParams] = useSearchParams();
  const pacientesQuery = useQuery({ queryKey: ['pacientes'], queryFn: getPacientes });
  const pacientes = pacientesQuery.data ?? [];
  const requestedPatientId = searchParams.get('paciente_id') ?? sessionStorage.getItem('dentorg_selected_patient_id');
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
  const totalFacturado = facturas.reduce((sum, factura) => sum + Number(factura.total), 0);
  const totalPendiente = facturas.reduce((sum, factura) => sum + Number(factura.pendiente), 0);
  const tratamientosRealizados = historialQuery.data?.filter((item) => ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(item.estado)).length ?? 0;
  const nextCita = citasPacienteQuery.data?.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];

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
      const categoria = designer.mode === 'consentimiento' ? 'consentimiento' : 'circular';
      const doc = await generarDocumentoPdfPaciente(active.id, {
        titulo: data.titulo,
        categoria,
        contenido: data.contenido,
        descripcion: data.titulo,
        etiquetas: designer.mode === 'consentimiento' ? `consentimiento, ${data.tipo}` : `circular, ${data.tipo}`,
        doctor_id: doctoresQuery.data?.[0]?.id ?? null,
        firma_data_url: data.firmaDataUrl,
      });
      if (designer.mode === 'consentimiento') {
        await createConsentimientoPaciente(active.id, data.tipo, doctoresQuery.data?.[0]?.id, {
          documento_id: doc.id,
          documento_path: doc.ruta ?? doc.nombre_original,
          estado: data.firmaDataUrl ? 'firmado' : 'pendiente_firma',
          plantilla_version: 'personalizada',
          contenido: data.contenido,
        });
      }
      return doc;
    },
    onSuccess: (doc) => {
      void documentosQuery.refetch();
      void consentimientosQuery.refetch();
      setDesigner(null);
      setTab('documentos');
      if (active && doc.id) void openDocumentoPaciente(active.id, doc.id, doc.nombre_original);
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
    sessionStorage.setItem('dentorg_selected_patient_id', active.id);
    sessionStorage.setItem('dentorg_selected_patient_name', fullName(active));
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
    sessionStorage.setItem('dentorg_selected_patient_id', active.id);
    sessionStorage.setItem('dentorg_selected_patient_name', fullName(active));
    sessionStorage.setItem('dentorg_selected_treatment', linea.tratamiento?.nombre ?? 'Tratamiento dental');
    setContextMenu(null);
    navigate('/agenda');
  }

  return (
    <section className={`page patient-screen${tab === 'pacientes' ? '' : ' no-bottom-bar'}`} onClick={() => setContextMenu(null)}>
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
      <div className="patient-command-row">
        <PatientFinder
          pacientes={pacientes}
          selectedId={active?.id ?? null}
          onSelect={(paciente) => {
            setSelected(paciente);
            sessionStorage.setItem('dentorg_selected_patient_id', paciente.id);
            setTab('pacientes');
          }}
        />
        <button onClick={() => nuevoPresupuesto.mutate()} disabled={!active || nuevoPresupuesto.isPending}>Nuevo ppto</button>
        <button onClick={() => emitirFactura.mutate()} disabled={!active || emitirFactura.isPending}>Emitir factura</button>
        <button onClick={() => cobrarFactura.mutate()} disabled={!active || cobrarFactura.isPending}>Cobrar</button>
        <button onClick={() => setEditingPatient(true)} disabled={!active}>Editar ficha</button>
      </div>

      <aside className="patient-summary-strip" onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
        <span><b>Paciente</b>{active ? fullName(active) : 'Sin seleccionar'} · Hª {active?.num_historial ?? '-'}</span>
        <span><b>Próxima</b>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)} · ${nextCita.motivo ?? ''}` : 'sin cita programada'}</span>
        <span><b>Realizados</b>{tratamientosRealizados}</span>
        <span><b>Saldo</b>{money(totalPendiente)} / {money(totalFacturado)}</span>
        <span><b>Docs</b>{documentosQuery.data?.length ?? 0} · CI {consentimientosQuery.data?.length ?? 0}</span>
      </aside>

      <main className="patient-desk">
        {tab === 'pacientes' && (
          <div onContextMenu={(event) => openContext(event, { kind: 'paciente' })}>
            <PatientForm paciente={active} facturas={facturas} onEdit={() => setEditingPatient(true)} />
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
                tratamientos={tratamientosQuery.data ?? []}
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
          <div className="historial-facturacion-workspace">
            <ClinicalHistoryPanel
              historial={historialQuery.data ?? []}
              onFacturar={() => emitirFactura.mutate()}
              onCobrar={() => cobrarFactura.mutate()}
              onVerDeuda={verSaldoPaciente}
              onAsociarFactura={asociarFactura}
            />
            <BillingHistory
              facturas={facturas}
              onCobrar={() => cobrarFactura.mutate()}
              onOrtodoncia={() => setTab('realizados')}
              onRecibos={abrirRecibos}
              onContextFactura={(event, factura) => openContext(event, { kind: 'factura', factura })}
            />
          </div>
        )}
        {tab === 'consentimientos' && (
          <ConsentimientosPanel
            consentimientos={consentimientosQuery.data ?? []}
            plantillas={plantillasQuery.data ?? []}
            onDisenar={(tipo) => setDesigner(active ? { mode: 'consentimiento', tipo } : null)}
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
          <button onClick={() => setTab('citas')}>Agenda</button>
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
    </section>
  );
}
