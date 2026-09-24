import { CalendarDays } from 'lucide-react';
import { useMemo } from 'react';
import { formatDate } from '../../../shared/format';
import type {
Cita,
Consentimiento,
DocumentoPaciente,
HistorialClinico,
NotaDental,
Presupuesto,
RecetaClinica,
TrabajoLaboratorio
} from '../../../api/types';
import { getTime } from './clinicalHistory';
import { buildVisitGroups } from './visitGroups';

export function VisitsWorkspace({
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  laboratorio,
  notasDentales,
  onOpenHistorial,
}: {
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
  onOpenHistorial: () => void;
}) {
  const visitas = useMemo(() => buildVisitGroups({
    citas,
    historial,
    presupuestos,
    documentos,
    consentimientos,
    recetas,
    laboratorio,
    notasDentales,
  }), [citas, consentimientos, documentos, historial, laboratorio, notasDentales, presupuestos, recetas]);
  const citasOrdenadas = useMemo(() => citas.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)), [citas]);

  function nextAfter(date: string) {
    return citasOrdenadas.find((cita) => cita.fecha_hora.slice(0, 10) > date);
  }

  return (
    <section className="visits-workspace">
      <header className="visits-head">
        <div>
          <span><CalendarDays size={15} aria-hidden="true" /> Visitas del paciente</span>
          <strong>{visitas.length} dia{visitas.length === 1 ? '' : 's'} con actividad clinica</strong>
        </div>
        <button type="button" onClick={onOpenHistorial}>Abrir historial completo</button>
      </header>
      <div className="visits-list">
        {visitas.map((visita) => {
          const citaPrincipal = visita.citas[0];
          const proxima = nextAfter(visita.date);
          const doctor = citaPrincipal?.doctor?.nombre || visita.realizados.find((entrada) => entrada.doctor?.nombre)?.doctor?.nombre || visita.laboratorio.find((trabajo) => trabajo.doctor?.nombre)?.doctor?.nombre;
          const gabinete = citaPrincipal?.gabinete_id;
          const motivoCita = visita.citas.map((cita) => cita.motivo).filter(Boolean).join(' - ');
          const estadoVisita = visita.citas.length
            ? `${visita.citas.length} cita${visita.citas.length === 1 ? '' : 's'}`
            : visita.realizados.length ? 'con tratamientos' : 'actividad clinica';
          const tituloVisita = motivoCita || visita.realizados[0]?.procedimiento || visita.realizados[0]?.tratamiento?.nombre || 'Visita clinica';
          const comments = Array.from(new Set(visita.comentarios.filter(Boolean))).slice(0, 3);
          return (
            <article key={visita.id} className="visit-card">
              <header>
                <time>{formatDate(visita.date)}{getTime(citaPrincipal?.fecha_hora) ? ` - ${getTime(citaPrincipal?.fecha_hora)}` : ''}</time>
                <span>{citaPrincipal?.estado || estadoVisita}</span>
                <div>
                  <strong>Motivo: {tituloVisita}</strong>
                  <p>{[doctor, gabinete ? `Gab. ${gabinete}` : null, citaPrincipal?.duracion_min ? `${citaPrincipal.duracion_min} min` : null].filter(Boolean).join(' - ') || 'Sin doctor o gabinete asignado'}</p>
                </div>
                <button type="button" onClick={onOpenHistorial}>Abrir detalle en Historial</button>
              </header>
              <div className="visit-body">
                <section>
                  <span>Realizado</span>
                  {visita.realizados.slice(0, 4).map((entrada) => (
                    <p key={entrada.id}>
                      <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                      <small>{[entrada.pieza_dental ? `Pieza ${entrada.pieza_dental}` : null, entrada.caras, entrada.estado].filter(Boolean).join(' - ')}</small>
                    </p>
                  ))}
                  {!visita.realizados.length && <em>Sin tratamientos realizados registrados ese dia.</em>}
                </section>
                <section>
                  <span>Previsto / pospuesto</span>
                  {visita.previstos.slice(0, 3).map((item) => (
                    <p key={item.id}>
                      <strong>{item.title}</strong>
                      <small>{[item.detail, item.status].filter(Boolean).join(' - ')}</small>
                    </p>
                  ))}
                  {!visita.previstos.length && <em>Sin pendientes asociados por fecha.</em>}
                </section>
                <section className="visit-comments">
                  <span>Comentarios</span>
                  {comments.map((comentario, index) => <p key={`${visita.id}-comment-${index}`}>{comentario}</p>)}
                  {!comments.length && <em>Sin comentarios clinicos u observaciones de cita.</em>}
                </section>
                <section className="visit-links">
                  <span>Asociado por fecha</span>
                  <p>
                    <small>{visita.documentos.length} docs</small>
                    <small>{visita.recetas.length} recetas</small>
                    <small>{visita.consentimientos.length} consent.</small>
                    <small>{visita.laboratorio.length} lab.</small>
                  </p>
                  {[...visita.recetas.slice(0, 1).map((receta) => receta.medicamento), ...visita.documentos.slice(0, 1).map((documento) => documento.descripcion || documento.nombre_original), ...visita.laboratorio.slice(0, 1).map((trabajo) => trabajo.descripcion)].map((item, index) => (
                    <em key={`${visita.id}-assoc-${index}`}>{item}</em>
                  ))}
                  {proxima && <em>Proxima cita: {formatDate(proxima.fecha_hora)} {getTime(proxima.fecha_hora)} - {proxima.motivo || 'sin motivo'}</em>}
                </section>
              </div>
            </article>
          );
        })}
        {!visitas.length && (
          <div className="visits-empty">
            <strong>Sin visitas registradas</strong>
            <span>Cuando haya citas, tratamientos o documentos con fecha se agruparan aqui.</span>
          </div>
        )}
      </div>
    </section>
  );
}
