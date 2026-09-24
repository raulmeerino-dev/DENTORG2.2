import type { SurfaceKey, ToothData, ToothStatus } from '../types/odontogram.types';
import { getPrimarySurface } from '../data/toothMap';

export type SurfaceOption = {
  key: SurfaceKey;
  label: string;
  title: string;
};

export function getSurfaceOptions(tooth: ToothData): SurfaceOption[] {
  const lingualKey: SurfaceKey = tooth.arch === 'upper' ? 'palatal' : 'lingual';
  return [
    { key: 'vestibular', label: 'V', title: 'Vestibular / bucal' },
    { key: 'mesial', label: 'M', title: 'Mesial' },
    {
      key: getPrimarySurface(tooth.type),
      label: tooth.type === 'incisor' || tooth.type === 'canine' ? 'I' : 'O',
      title: 'Oclusal / incisal',
    },
    { key: 'distal', label: 'D', title: 'Distal' },
    { key: lingualKey, label: tooth.arch === 'upper' ? 'P' : 'L', title: 'Lingual / palatina' },
    { key: 'root', label: 'R', title: 'Raiz' },
  ];
}

export function getSurfaceStatus(tooth: ToothData, surface: SurfaceKey): ToothStatus {
  return tooth.surfaces[surface] ?? 'healthy';
}
