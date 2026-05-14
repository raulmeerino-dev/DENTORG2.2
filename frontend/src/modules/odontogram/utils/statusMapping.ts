import type { OdontogramaStatus } from '../../../types/api';
import type { SurfaceKey, ToothStatus } from '../types/odontogram.types';

export type BackendOdontogramStatus = OdontogramaStatus | 'extraccion' | string;

export const visualToBackendStatus: Record<ToothStatus, BackendOdontogramStatus> = {
  healthy: 'sano',
  caries: 'caries',
  filling: 'obturacion',
  endodontics: 'endodoncia',
  crown: 'corona',
  implant: 'implante',
  missing: 'ausente',
  extraction: 'extraccion',
  fracture: 'fractura',
  mobility: 'movilidad',
  prosthesis: 'protesis',
  pending: 'tratamiento_pendiente',
  completed: 'tratamiento_realizado',
};

export const backendToVisualStatus: Record<string, ToothStatus> = {
  sano: 'healthy',
  caries: 'caries',
  obturacion: 'filling',
  endodoncia: 'endodontics',
  corona: 'crown',
  implante: 'implant',
  ausente: 'missing',
  extraccion: 'extraction',
  extraccion_indicada: 'extraction',
  fractura: 'fracture',
  movilidad: 'mobility',
  protesis: 'prosthesis',
  tratamiento_pendiente: 'pending',
  tratamiento_realizado: 'completed',
};

export function toVisualStatus(status?: string | null): ToothStatus {
  if (!status) return 'healthy';
  return backendToVisualStatus[status] ?? 'healthy';
}

export function toBackendStatus(status: ToothStatus): BackendOdontogramStatus {
  return visualToBackendStatus[status];
}

export function toVisualSurface(
  backendSurface: string | null | undefined,
  toothNumber?: string | number | null,
): SurfaceKey | undefined {
  if (!backendSurface) return undefined;
  const number = toothNumber ? String(toothNumber) : '';
  const isUpper = number.startsWith('1') || number.startsWith('2');
  const isAnterior = ['1', '2', '3'].includes(number[1] ?? '');

  if (backendSurface === 'oclusal_incisal') return isAnterior ? 'incisal' : 'occlusal';
  if (backendSurface === 'lingual_palatina' || backendSurface === 'lingual_palatal') {
    return isUpper ? 'palatal' : 'lingual';
  }
  if (backendSurface === 'raiz') return 'root';
  if (backendSurface === 'vestibular') return 'vestibular';
  if (backendSurface === 'mesial' || backendSurface === 'distal') return backendSurface;
  return undefined;
}

export function toBackendSurface(surface?: SurfaceKey | null): string | null {
  if (!surface) return null;
  if (surface === 'occlusal' || surface === 'incisal') return 'oclusal_incisal';
  if (surface === 'palatal' || surface === 'lingual') return 'lingual_palatina';
  if (surface === 'root') return 'raiz';
  if (surface === 'buccal' || surface === 'vestibular') return 'vestibular';
  if (surface === 'mesial' || surface === 'distal') return surface;
  if (surface === 'crown') return null;
  return null;
}
