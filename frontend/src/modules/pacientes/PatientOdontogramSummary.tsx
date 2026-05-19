import type { HistorialClinico, Presupuesto, PresupuestoLinea } from '../../types/api';
import { formatDate } from '../../lib/utils';
import { ScanLine } from 'lucide-react';

type MiniToothState = 'neutral' | 'realizado' | 'presupuestado' | 'pendiente';

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const REALIZADO_STATES = new Set(['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo']);

function setToothState(map: Map<number, MiniToothState>, piece: number | null | undefined, state: MiniToothState) {
  if (!piece) return;
  const current = map.get(piece) ?? 'neutral';
  const priority: Record<MiniToothState, number> = {
    neutral: 0,
    realizado: 1,
    presupuestado: 2,
    pendiente: 3,
  };
  if (priority[state] >= priority[current]) {
    map.set(piece, state);
  }
}

function lineHasPiece(line: PresupuestoLinea) {
  return typeof line.pieza_dental === 'number' && Number.isFinite(line.pieza_dental);
}

export function PatientOdontogramSummary({
  presupuestos,
  historial,
  onOpenDetail,
}: {
  presupuestos: Presupuesto[];
  historial: HistorialClinico[];
  onOpenDetail: () => void;
}) {
  const toothStates = new Map<number, MiniToothState>();
  const allLines = presupuestos.flatMap((presupuesto) => presupuesto.lineas);
  const pendingLines = allLines.filter((linea) => linea.aceptado);
  const plannedLines = allLines.filter((linea) => !linea.aceptado);
  const realizedEntries = historial.filter((entry) => REALIZADO_STATES.has(entry.estado));

  realizedEntries.forEach((entry) => setToothState(toothStates, entry.pieza_dental, 'realizado'));
  plannedLines.forEach((linea) => setToothState(toothStates, linea.pieza_dental, 'presupuestado'));
  pendingLines.forEach((linea) => setToothState(toothStates, linea.pieza_dental, 'pendiente'));

  const dates = [
    ...presupuestos.map((presupuesto) => presupuesto.fecha),
    ...historial.map((entry) => entry.fecha),
  ].filter(Boolean).sort((a, b) => b.localeCompare(a));
  const lastUpdate = dates[0] ? formatDate(dates[0]) : 'Sin datos';
  const teethWithClinicalData = new Set([
    ...allLines.filter(lineHasPiece).map((linea) => linea.pieza_dental as number),
    ...realizedEntries.filter((entry) => entry.pieza_dental).map((entry) => entry.pieza_dental as number),
  ]).size;

  function renderArch(teeth: number[], label: string) {
    return (
      <div className="mini-odontogram-arch" aria-label={label}>
        {teeth.map((piece) => {
          const state = toothStates.get(piece) ?? 'neutral';
          return (
            <span
              key={piece}
              className={`mini-tooth mini-tooth-${state}`}
              title={`${piece} - ${state}`}
              aria-label={`Pieza ${piece}: ${state}`}
            >
              <i />
              <small>{piece}</small>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <section className="patient-odontogram-summary-card" aria-label="Resumen odontograma">
      <div className="patient-card-head">
        <h3>
          <span className="patient-card-head-icon" aria-hidden="true">
            <ScanLine size={14} strokeWidth={2.2} />
          </span>
          Resumen odontograma
        </h3>
        <div className="patient-card-head-right">
          <span>{teethWithClinicalData} piezas con datos</span>
          <button type="button" onClick={onOpenDetail}>Ver detalle en Tratamientos</button>
        </div>
      </div>
      <div className="mini-odontogram" data-testid="mini-odontogram" role="img" aria-label="Mini odontograma resumen">
        {renderArch(UPPER_TEETH, 'Mini arcada superior')}
        {renderArch(LOWER_TEETH, 'Mini arcada inferior')}
      </div>
      <div className="mini-odontogram-footer">
        <span data-testid="mini-odontogram-pendientes"><b>Pendientes:</b> {pendingLines.length}</span>
        <span data-testid="mini-odontogram-realizados"><b>Realizados:</b> {realizedEntries.length}</span>
        <span data-testid="mini-odontogram-presupuestados"><b>Presupuestados:</b> {plannedLines.length}</span>
        <span><b>Ultima actualizacion:</b> {lastUpdate}</span>
      </div>
      <div className="mini-odontogram-legend" aria-label="Leyenda odontograma resumen">
        <span><i className="mini-tooth-pendiente" />Pendiente</span>
        <span><i className="mini-tooth-presupuestado" />Presupuestado</span>
        <span><i className="mini-tooth-realizado" />Realizado</span>
        <span><i className="mini-tooth-neutral" />Neutro</span>
      </div>
    </section>
  );
}
