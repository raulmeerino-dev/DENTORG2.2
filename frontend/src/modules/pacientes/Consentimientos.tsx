import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ApiPaciente, Consentimiento, PlantillaConsentimiento } from '../../types/api';
import { formatDate, fullName } from '../../lib/utils';

export type DocumentDesignerMode = 'consentimiento' | 'circular';

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

function renderTemplate(text: string, paciente: ApiPaciente) {
  return text
    .replaceAll('{{paciente}}', fullName(paciente))
    .replaceAll('{{historia}}', String(paciente.num_historial))
    .replaceAll('{{fecha}}', new Date().toISOString().slice(0, 10));
}

export function ConsentimientosPanel({
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

export function DocumentDesignerModal({
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
  const [templateMsg, setTemplateMsg] = useState('');

  function loadTemplate(nextTipo: string) {
    const plantilla = mode === 'consentimiento' ? plantillas.find((item) => item.nombre === nextTipo) : null;
    const base = plantilla?.contenido ?? textos[nextTipo] ?? '';
    setTipo(nextTipo);
    setTitulo(mode === 'consentimiento' ? `Consentimiento informado - ${nextTipo}` : nextTipo);
    setContenido(renderTemplate(base, paciente));
  }

  function saveLocalTemplate() {
    localStorage.setItem(`dentorg_template_${mode}_${tipo}`, contenido);
    setTemplateMsg('Plantilla guardada en este equipo.');
  }

  function loadLocalTemplate() {
    const saved = localStorage.getItem(`dentorg_template_${mode}_${tipo}`);
    if (saved) { setContenido(saved); setTemplateMsg('Plantilla cargada.'); }
    else setTemplateMsg('No hay plantilla personalizada guardada para este tipo.');
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
            {templateMsg && <span className="inline-alert" role="status">{templateMsg}</span>}
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
