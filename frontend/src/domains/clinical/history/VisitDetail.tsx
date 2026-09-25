import { statusMetaForCita } from '../../scheduling/agenda/appointmentStatus';
import type {
  Cita,
  DocumentoPaciente,
  HistorialClinico,
  NotaDental,
  Consentimiento,
} from '../../../api/types';
import { formatDate } from '../../../shared/format';
import { clinicTime } from '../../../shared/time/clinicTime';
import { useEffect, useRef } from 'react';
import { isClinicalNote } from './clinicalNotes';

export function VisitDetail({
  cita,
  historial,
  notas,
  documentos,
  consentimientos,
  onClose,
  onOpenDocumento,
  onOpenConsentimiento,
}: {
  cita: Cita;
  historial: HistorialClinico[];
  notas: NotaDental[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  onClose: () => void;
  onOpenDocumento: (documento: DocumentoPaciente) => void;
  onOpenConsentimiento: (consentimiento: Consentimiento) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const owner = panel.current?.closest('.dc-patient-body');
    if (owner) owner.scrollTop = 0;
    panel.current?.focus({ preventScroll: true });
  }, [cita.id]);
  const linked = historial.filter((row) => row.cita_id === cita.id && row.estado === 'realizado');
  const linkedNotes = notas.filter(
    (row) =>
      isClinicalNote(row) && (row.cita_id === cita.id || (row.historial_id && linked.some((item) => item.id === row.historial_id))),
  );
  const pieces = [
    ...new Set(
      [...linked, ...linkedNotes]
        .map((row) => row.pieza_dental)
        .filter((piece): piece is number => Boolean(piece)),
    ),
  ];
  const linkedDocuments = documentos.filter(
    (doc) => doc.historial_id && linked.some((t) => t.id === doc.historial_id),
  );
  const linkedConsents = consentimientos.filter(
    (doc) => doc.historial_id && linked.some((t) => t.id === doc.historial_id),
  );
  return (
    <section ref={panel} tabIndex={-1} className="dc-visit-detail" aria-label="Detalle de visita">
      <header>
        <button type="button" onClick={onClose}>
          Volver al historial
        </button>
        <h2>Visita · {formatDate(cita.fecha_hora)}</h2>
        <span>{statusMetaForCita(cita).label}</span>
      </header>
      <dl>
        <dt>Motivo</dt>
        <dd>{cita.motivo || 'Sin motivo registrado'}</dd>
        <dt>Profesional</dt>
        <dd>{cita.doctor?.nombre || 'Sin profesional registrado'}</dd>
        <dt>Sesión</dt>
        <dd>
          {clinicTime(cita.fecha_hora)} · {cita.duracion_min} min
        </dd>
        <dt>Notas de la cita</dt>
        <dd>{cita.observaciones || 'Sin notas registradas'}</dd>
      </dl>
      <section>
        <h3>Tratamientos realizados</h3>
        {linked.map((row) => (
          <article key={row.id}>
            <strong>{row.procedimiento || row.tratamiento?.nombre}</strong>
            <p>
              {[
                row.pieza_dental ? `Pieza ${row.pieza_dental}` : null,
                row.caras,
                row.estado,
                row.doctor?.nombre,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {row.diagnostico && <p>{row.diagnostico}</p>}
            {row.observaciones && <p>{row.observaciones}</p>}
          </article>
        ))}
        {!linked.length && <p>Sin tratamientos realizados vinculados a esta visita.</p>}
        {linkedNotes.map((note) => (
          <article key={note.id}>
            <strong>{note.doctor?.nombre || 'Nota clínica'}</strong>
            <p>{note.texto}</p>
          </article>
        ))}
      </section>
      {pieces.length > 0 && (
        <section aria-label="Información odontológica de la visita">
          <h3>Piezas y cambios registrados</h3>
          <p>Piezas y anotaciones vinculadas a esta cita; no incluye el odontograma completo.</p>
          <div className="dc-visit-pieces">
            {pieces.map((piece) => (
              <article key={piece}>
                <strong>Pieza {piece}</strong>
                {linked
                  .filter((row) => row.pieza_dental === piece)
                  .map((row) => (
                    <p key={row.id}>
                      {[row.procedimiento || row.tratamiento?.nombre, row.caras, row.estado]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ))}
                {linkedNotes
                  .filter((note) => note.pieza_dental === piece)
                  .map((note) => (
                    <p key={note.id}>{note.texto}</p>
                  ))}
              </article>
            ))}
          </div>
        </section>
      )}
      {(linkedDocuments.length > 0 || linkedConsents.length > 0) && (
        <section>
          <h3>Documentación vinculada</h3>
          {linkedDocuments.map((doc) => (
            <button key={doc.id} onClick={() => onOpenDocumento(doc)}>
              Documento · {doc.descripcion || doc.nombre_original}
            </button>
          ))}
          {linkedConsents.map((doc) => (
            <button key={doc.id} onClick={() => onOpenConsentimiento(doc)}>
              Consentimiento · {doc.tipo} · {doc.estado}
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
