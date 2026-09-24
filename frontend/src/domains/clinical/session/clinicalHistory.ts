import type {
HistorialClinico,
NotaDental
} from '../../../api/types';
import { clinicDate, clinicDateKey, clinicTime } from '../../../shared/time/clinicTime';


export function isToday(value?: string | null) {
  if (!value) return false;
  return clinicDateKey(value) === clinicDate(new Date());
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
  return clinicDateKey(value) || 'sin-fecha';
}

export function getTime(value?: string | null) {
  if (!value || value.length < 16) return null;
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? clinicTime(value) : value.slice(11, 16);
}

export function clinicalNoteLabel(nota: NotaDental) {
  if (nota.origen === 'dictado_clinico') return 'Dictado clinico';
  if (nota.pieza_dental) return `Pieza ${nota.pieza_dental}${nota.caras ? ` - ${nota.caras}` : ''}`;
  return 'Nota general';
}
