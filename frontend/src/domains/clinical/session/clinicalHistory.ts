import type {
HistorialClinico,
NotaDental
} from '../../../api/types';


export function isToday(value?: string | null) {
  if (!value) return false;
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function hasFinishedState(value?: string | null) {
  const estado = (value ?? '').toLowerCase();
  return estado.includes('realizado') || estado.includes('facturado') || estado.includes('cobrado') || estado.includes('atendido') || estado.includes('finalizado');
}

export function recentClinicalHistory(historial: HistorialClinico[]) {
  return historial
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);
}

export function getDateKey(value?: string | null) {
  return value?.slice(0, 10) || 'sin-fecha';
}

export function getTime(value?: string | null) {
  return value && value.length >= 16 ? value.slice(11, 16) : null;
}

export function clinicalNoteLabel(nota: NotaDental) {
  if (nota.origen === 'dictado_clinico') return 'Dictado clinico';
  if (nota.pieza_dental) return `Pieza ${nota.pieza_dental}${nota.caras ? ` - ${nota.caras}` : ''}`;
  return 'Nota general';
}
