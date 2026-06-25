import type {
  DocumentoPaciente,
  HistorialClinico,
  NotaDental,
  Presupuesto,
} from '../../types/api';

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
  notasDentales.forEach((nota) => {
    if (nota.pieza_dental) pieces.add(nota.pieza_dental);
  });
  documentos.forEach((documento) => {
    const match = `${documento.descripcion ?? ''} ${documento.nombre_original} ${documento.etiquetas ?? ''}`.match(/(^|\D)([1-4][1-8])(\D|$)/);
    if (match?.[2]) pieces.add(Number(match[2]));
  });
  return Array.from(pieces).sort((a, b) => a - b);
}
