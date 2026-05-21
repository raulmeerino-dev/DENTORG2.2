import type {
  DocumentoPaciente,
  HistorialClinico,
  NotaDental,
  Presupuesto,
} from '../../types/api';
import { formatDate, money } from '../../lib/utils';

type DentalPieceHistoryPanelProps = {
  piece: number | null;
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  notasDentales: NotaDental[];
  documentos: DocumentoPaciente[];
  onOpenDocumento: (documento: DocumentoPaciente) => void;
};

function textMentionsPiece(text: string | null | undefined, piece: number) {
  if (!text) return false;
  return new RegExp(`(^|\\D)${piece}(\\D|$)`).test(text);
}

function documentMatchesPiece(
  documento: DocumentoPaciente,
  piece: number,
  historial: HistorialClinico[],
  presupuestos: Presupuesto[],
) {
  if (documento.historial_id) {
    const entrada = historial.find((item) => item.id === documento.historial_id);
    if (entrada?.pieza_dental === piece) return true;
  }
  if (documento.tratamiento_id) {
    const matchesHistorial = historial.some((entrada) => (
      entrada.pieza_dental === piece && entrada.tratamiento_id === documento.tratamiento_id
    ));
    if (matchesHistorial) return true;
    const matchesPresupuesto = presupuestos.some((presupuesto) => presupuesto.lineas.some((linea) => (
      linea.pieza_dental === piece && linea.tratamiento_id === documento.tratamiento_id
    )));
    if (matchesPresupuesto) return true;
  }
  return [
    documento.descripcion,
    documento.nombre_original,
    documento.etiquetas,
  ].some((text) => textMentionsPiece(text, piece));
}

function doctorLabel(value?: string | null) {
  if (!value) return 'Doctor no indicado';
  return value;
}

export function collectDentalPieces({
  historial,
  presupuestos,
  notasDentales,
  documentos,
}: {
  historial: HistorialClinico[];
  presupuestos: Presupuesto[];
  notasDentales: NotaDental[];
  documentos: DocumentoPaciente[];
}) {
  const pieces = new Set<number>();
  historial.forEach((entrada) => {
    if (entrada.pieza_dental) pieces.add(entrada.pieza_dental);
  });
  presupuestos.forEach((presupuesto) => presupuesto.lineas.forEach((linea) => {
    if (linea.pieza_dental) pieces.add(linea.pieza_dental);
  }));
  notasDentales.forEach((nota) => pieces.add(nota.pieza_dental));
  documentos.forEach((documento) => {
    const match = `${documento.descripcion ?? ''} ${documento.nombre_original} ${documento.etiquetas ?? ''}`.match(/(^|\D)([1-4][1-8])(\D|$)/);
    if (match?.[2]) pieces.add(Number(match[2]));
  });
  return Array.from(pieces).sort((a, b) => a - b);
}

export function DentalPieceHistoryPanel({
  piece,
  historial,
  presupuestos,
  notasDentales,
  documentos,
  onOpenDocumento,
}: DentalPieceHistoryPanelProps) {
  if (!piece) {
    return (
      <aside className="piece-history-panel">
        <strong>Historial por pieza</strong>
        <p>Selecciona una pieza en el odontograma o en el selector para ver su lectura clinica agrupada.</p>
      </aside>
    );
  }

  const realizados = historial
    .filter((entrada) => entrada.pieza_dental === piece)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lineasRelacionadas = presupuestos.flatMap((presupuesto) => (
    presupuesto.lineas
      .filter((linea) => linea.pieza_dental === piece)
      .map((linea) => ({ presupuesto, linea }))
  ));
  const pendientes = lineasRelacionadas.filter(({ presupuesto, linea }) => (
    linea.aceptado || linea.pasado_trabajo_pendiente || presupuesto.estado === 'aceptado'
  ));
  const notas = notasDentales
    .filter((nota) => nota.pieza_dental === piece)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const docs = documentos.filter((documento) => documentMatchesPiece(documento, piece, historial, presupuestos));
  const hasData = realizados.length || pendientes.length || lineasRelacionadas.length || notas.length || docs.length;

  return (
    <aside className="piece-history-panel" aria-label={`Historial de pieza ${piece}`}>
      <header>
        <span>Historial por pieza</span>
        <strong>Pieza {piece}</strong>
      </header>

      {!hasData && <p>No hay tratamientos, notas ni documentos asociados a esta pieza.</p>}

      <section>
        <h4>Tratamientos realizados</h4>
        {realizados.map((entrada) => (
          <article key={entrada.id}>
            <time>{formatDate(entrada.fecha)}</time>
            <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
            <span>{[entrada.caras, entrada.estado, doctorLabel(entrada.doctor?.nombre)].filter(Boolean).join(' · ')}</span>
            {(entrada.observaciones || entrada.diagnostico || entrada.importe) && (
              <small>{[entrada.observaciones || entrada.diagnostico, entrada.importe ? money(entrada.importe) : null].filter(Boolean).join(' · ')}</small>
            )}
          </article>
        ))}
        {!realizados.length && <p>Sin realizados registrados en esta pieza.</p>}
      </section>

      <section>
        <h4>Pendientes asociados</h4>
        {pendientes.map(({ presupuesto, linea }) => (
          <article key={`pend-${linea.id}`}>
            <time>{formatDate(presupuesto.fecha)}</time>
            <strong>{linea.tratamiento?.nombre ?? 'Tratamiento pendiente'}</strong>
            <span>{[`Ppto. #${presupuesto.numero}`, linea.caras, linea.aceptado ? 'aceptado' : 'pendiente'].filter(Boolean).join(' · ')}</span>
            <small>{money(linea.importe_neto)}</small>
          </article>
        ))}
        {!pendientes.length && <p>Sin pendientes aceptados en esta pieza.</p>}
      </section>

      <section>
        <h4>Presupuestos relacionados</h4>
        {lineasRelacionadas.map(({ presupuesto, linea }) => (
          <article key={`pres-${linea.id}`}>
            <time>{formatDate(presupuesto.fecha)}</time>
            <strong>Presupuesto #{presupuesto.numero}</strong>
            <span>{[presupuesto.estado, linea.tratamiento?.nombre, linea.caras].filter(Boolean).join(' · ')}</span>
            <small>{money(linea.importe_neto)}</small>
          </article>
        ))}
        {!lineasRelacionadas.length && <p>Sin presupuestos vinculados a esta pieza.</p>}
      </section>

      <section>
        <h4>Notas clinicas</h4>
        {notas.map((nota) => (
          <article key={nota.id}>
            <time>{formatDate(nota.fecha)}</time>
            <strong>{nota.caras ? `Caras ${nota.caras}` : 'Pieza completa'}</strong>
            <span>{doctorLabel(nota.doctor?.nombre ?? nota.doctor_id)}</span>
            <small>{nota.texto}</small>
          </article>
        ))}
        {!notas.length && <p>Sin notas clinicas de pieza.</p>}
      </section>

      <section>
        <h4>Documentos asociados</h4>
        {docs.map((documento) => (
          <article key={documento.id}>
            <time>{formatDate(documento.fecha_documento || documento.created_at)}</time>
            <strong>{documento.descripcion || documento.nombre_original}</strong>
            <span>{[documento.categoria.replaceAll('_', ' '), documento.etiquetas].filter(Boolean).join(' · ')}</span>
            <button type="button" onClick={() => onOpenDocumento(documento)}>Abrir</button>
          </article>
        ))}
        {!docs.length && <p>Sin documentos asociados.</p>}
      </section>
    </aside>
  );
}
