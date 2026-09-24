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
import { clinicalNoteLabel,getDateKey,hasFinishedState } from './clinicalHistory';

type VisitGroup = {
  id: string;
  date: string;
  sortDate: string;
  citas: Cita[];
  realizados: HistorialClinico[];
  previstos: Array<{ id: string; title: string; detail: string; status: string }>;
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
  comentarios: string[];
};

export function buildVisitGroups({
  citas,
  historial,
  presupuestos,
  documentos,
  consentimientos,
  recetas,
  laboratorio,
  notasDentales,
}: {
  citas: Cita[];
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
  notasDentales: NotaDental[];
}) {
  const groups = new Map<string, VisitGroup>();

  function ensure(date: string, sortDate = date) {
    const key = getDateKey(date);
    const existing = groups.get(key);
    if (existing) {
      if (sortDate.localeCompare(existing.sortDate) > 0) existing.sortDate = sortDate;
      return existing;
    }
    const group: VisitGroup = {
      id: key,
      date: key,
      sortDate,
      citas: [],
      realizados: [],
      previstos: [],
      documentos: [],
      consentimientos: [],
      recetas: [],
      laboratorio: [],
      notasDentales: [],
      comentarios: [],
    };
    groups.set(key, group);
    return group;
  }

  citas.forEach((cita) => {
    const group = ensure(cita.fecha_hora, cita.fecha_hora);
    group.citas.push(cita);
    if (cita.observaciones) group.comentarios.push(cita.observaciones);
  });

  historial.forEach((entrada) => {
    const group = ensure(entrada.fecha, entrada.fecha);
    if (hasFinishedState(entrada.estado)) {
      group.realizados.push(entrada);
    } else {
      group.previstos.push({
        id: `hist-${entrada.id}`,
        title: entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento clinico',
        detail: [entrada.pieza_dental ? `Pieza ${entrada.pieza_dental}` : null, entrada.caras].filter(Boolean).join(' - '),
        status: entrada.estado,
      });
    }
    if (entrada.observaciones || entrada.diagnostico) group.comentarios.push(entrada.observaciones || entrada.diagnostico || '');
  });

  presupuestos.forEach((presupuesto) => {
    presupuesto.lineas
      .filter((linea) => linea.aceptado || linea.pasado_trabajo_pendiente)
      .forEach((linea) => {
        const group = ensure(presupuesto.fecha, presupuesto.fecha);
        group.previstos.push({
          id: `linea-${linea.id}`,
          title: linea.tratamiento?.nombre || 'Tratamiento pendiente',
          detail: [
            linea.pieza_dental ? `Pieza ${linea.pieza_dental}` : null,
            linea.caras,
            `Ppto. ${presupuesto.numero}`,
          ].filter(Boolean).join(' - '),
          status: linea.pasado_trabajo_pendiente ? 'pendiente' : 'aceptado',
        });
      });
  });

  // Documentos, recetas, consentimientos y laboratorio no siempre traen visita_id/cita_id;
  // se agrupan por fecha para no inventar relaciones clínicas que aún no existen en backend.
  documentos.forEach((documento) => {
    const date = documento.fecha_documento || documento.created_at;
    if (date) ensure(date, date).documentos.push(documento);
  });
  consentimientos.forEach((consentimiento) => {
    const date = consentimiento.fecha_firma || consentimiento.created_at;
    if (date) ensure(date, date).consentimientos.push(consentimiento);
  });
  recetas.forEach((receta) => {
    ensure(receta.fecha_prescripcion, receta.fecha_prescripcion).recetas.push(receta);
  });
  notasDentales.forEach((nota) => {
    const group = ensure(nota.fecha, nota.fecha);
    group.notasDentales.push(nota);
    group.comentarios.push(`${clinicalNoteLabel(nota)}: ${nota.texto}`);
  });
  laboratorio.forEach((trabajo) => {
    // Sin relacion directa de visita/sesion para laboratorio: se agrupa por fecha operativa disponible.
    const date = trabajo.fecha_recepcion || trabajo.fecha_salida || trabajo.fecha_entrega_prevista;
    if (date) ensure(date, date).laboratorio.push(trabajo);
  });

  gruposPorFecha(groups).forEach((group) => {
    group.citas.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    group.realizados.sort((a, b) => a.fecha.localeCompare(b.fecha));
    group.previstos.sort((a, b) => a.title.localeCompare(b.title));
    group.documentos.sort((a, b) => (a.fecha_documento || a.created_at || '').localeCompare(b.fecha_documento || b.created_at || ''));
    group.consentimientos.sort((a, b) => (a.fecha_firma || a.created_at || '').localeCompare(b.fecha_firma || b.created_at || ''));
    group.recetas.sort((a, b) => a.fecha_prescripcion.localeCompare(b.fecha_prescripcion));
    group.laboratorio.sort((a, b) => (a.fecha_recepcion || a.fecha_salida || a.fecha_entrega_prevista || '').localeCompare(b.fecha_recepcion || b.fecha_salida || b.fecha_entrega_prevista || ''));
  });

  return gruposPorFecha(groups).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

function gruposPorFecha(groups: Map<string, VisitGroup>) {
  return Array.from(groups.values());
}
