import { statusMetaForCita } from '../../scheduling/agenda/appointmentStatus';
import type { Cita, DocumentoPaciente, HistorialClinico, NotaDental, Consentimiento, RecetaClinica } from '../../../api/types';
import { formatDate } from '../../../shared/format';
import { clinicDateKey } from '../../../shared/time/clinicTime';
import { useEffect, useRef } from 'react';

export function VisitDetail({ cita, historial, notas, documentos, consentimientos, recetas, onClose, onOpenDocumento, onOpenConsentimiento, onOpenReceta }: {
  cita: Cita; historial: HistorialClinico[]; notas: NotaDental[]; documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[]; recetas: RecetaClinica[]; onClose: () => void;
  onOpenDocumento: (documento: DocumentoPaciente) => void;
  onOpenConsentimiento: (consentimiento: Consentimiento) => void;
  onOpenReceta?: (receta: RecetaClinica) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { const owner = panel.current?.closest('.dc-patient-body'); if (owner) owner.scrollTop = 0; panel.current?.focus({ preventScroll: true }); }, [cita.id]);
  const day = clinicDateKey(cita.fecha_hora);
  const sameDay = (date?: string | null) => Boolean(date && clinicDateKey(date) === day);
  const linked = historial.filter(row => row.cita_id === cita.id);
  const linkedNotes = notas.filter(row => row.cita_id === cita.id || (row.historial_id && linked.some(item => item.id === row.historial_id)));
  const pieces = [...new Set([...linked, ...linkedNotes].map(row => row.pieza_dental).filter((piece): piece is number => Boolean(piece)))];
  const unlinked = historial.filter(row => !row.cita_id && sameDay(row.fecha));
  const dayNotes = notas.filter(row => !row.cita_id && !row.historial_id && sameDay(row.fecha));
  const dayDocuments = documentos.filter(doc => sameDay(doc.fecha_documento || doc.created_at));
  const dayConsents = consentimientos.filter(doc => sameDay(doc.fecha_firma || doc.created_at));
  const dayPrescriptions = recetas.filter(doc => sameDay(doc.fecha_prescripcion));
  const hasSameDayRecords = unlinked.length + dayNotes.length + dayDocuments.length + dayConsents.length + dayPrescriptions.length > 0;
  return <section ref={panel} tabIndex={-1} className="dc-visit-detail" aria-label="Detalle de visita">
    <header><button type="button" onClick={onClose}>Volver al historial</button><h2>Visita · {formatDate(cita.fecha_hora)}</h2><span>{statusMetaForCita(cita).label}</span></header>
    <dl><dt>Motivo</dt><dd>{cita.motivo || 'Sin motivo registrado'}</dd><dt>Profesional</dt><dd>{cita.doctor?.nombre || 'Sin profesional registrado'}</dd><dt>Notas de la cita</dt><dd>{cita.observaciones || 'Sin notas registradas'}</dd></dl>
    <section><h3>Tratamientos de la visita</h3>{linked.map(row => <article key={row.id}><strong>{row.procedimiento || row.tratamiento?.nombre}</strong><p>{[row.pieza_dental ? `Pieza ${row.pieza_dental}` : null, row.caras, row.estado, row.doctor?.nombre].filter(Boolean).join(' · ')}</p>{row.diagnostico && <p>{row.diagnostico}</p>}{row.observaciones && <p>{row.observaciones}</p>}</article>)}{!linked.length && <p>Sin tratamientos vinculados a esta cita.</p>}{linkedNotes.map(note => <article key={note.id}><strong>{note.doctor?.nombre || 'Nota clínica'}</strong><p>{note.texto}</p></article>)}</section>
    {pieces.length > 0 && <section aria-label="Información odontológica de la visita"><h3>Piezas y cambios registrados</h3><p>Piezas y anotaciones vinculadas a esta cita; no incluye el odontograma completo.</p><div className="dc-visit-pieces">{pieces.map(piece => <article key={piece}><strong>Pieza {piece}</strong>{linked.filter(row => row.pieza_dental === piece).map(row => <p key={row.id}>{[row.procedimiento || row.tratamiento?.nombre, row.caras, row.estado].filter(Boolean).join(' · ')}</p>)}{linkedNotes.filter(note => note.pieza_dental === piece).map(note => <p key={note.id}>{note.texto}</p>)}</article>)}</div></section>}
    {hasSameDayRecords && <section><h3>Otros registros del mismo día</h3><p>Coincidencia de fecha; no implica vinculación con esta visita.</p>
      {unlinked.map(row => <article key={row.id}><strong>{row.procedimiento || row.tratamiento?.nombre}</strong><p>{[row.pieza_dental ? `Pieza ${row.pieza_dental}` : null, row.caras, row.observaciones || row.diagnostico, row.estado].filter(Boolean).join(' · ')}</p></article>)}
      {dayNotes.map(note => <p key={note.id}>{note.texto}</p>)}
      {dayDocuments.map(doc => <button key={doc.id} onClick={() => onOpenDocumento(doc)}>Documento · {doc.descripcion || doc.nombre_original}</button>)}
      {dayConsents.map(doc => <button key={doc.id} onClick={() => onOpenConsentimiento(doc)}>Consentimiento · {doc.tipo} · {doc.estado}</button>)}
      {dayPrescriptions.map(doc => <p key={doc.id}>{doc.medicamento} · {doc.posologia} {onOpenReceta && <button onClick={() => onOpenReceta(doc)}>Abrir receta</button>}</p>)}
    </section>}
  </section>;
}
