import type { SurfaceKey } from '../types/odontogram.types';

const surfaceToCara: Partial<Record<SurfaceKey, string>> = {
  occlusal: 'O',
  incisal: 'I',
  mesial: 'M',
  distal: 'D',
  vestibular: 'V',
  buccal: 'V',
  lingual: 'L',
  palatal: 'L',
  root: 'R',
};

const caraToSurface: Record<string, SurfaceKey> = {
  O: 'occlusal',
  I: 'incisal',
  M: 'mesial',
  D: 'distal',
  V: 'vestibular',
  L: 'lingual',
  P: 'palatal',
  R: 'root',
};

export function mapSurfaceToCaras(surface?: SurfaceKey | null) {
  if (!surface) return null;
  return surfaceToCara[surface] ?? null;
}

export function mapCarasToSurface(caras?: string | null): SurfaceKey[] {
  if (!caras) return ['occlusal'];
  const surfaces = caras
    .toUpperCase()
    .split('')
    .map((char) => caraToSurface[char])
    .filter(Boolean);
  return Array.from(new Set(surfaces.length ? surfaces : ['occlusal']));
}
