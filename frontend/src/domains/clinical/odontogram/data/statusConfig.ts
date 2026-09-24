import type { ToothStatus } from '../types/odontogram.types';

export type StatusConfig = {
  label: string;
  color: string;
  softColor: string;
  contrast: string;
};

export const statusConfig: Record<ToothStatus, StatusConfig> = {
  healthy: {
    label: 'Sano',
    color: '#2BB673',
    softColor: '#EAF8F1',
    contrast: '#0F6B3F',
  },
  caries: {
    label: 'Caries',
    color: '#E5484D',
    softColor: '#FDECEC',
    contrast: '#9F1D24',
  },
  filling: {
    label: 'Obturación',
    color: '#2F80ED',
    softColor: '#EAF2FE',
    contrast: '#1758AE',
  },
  endodontics: {
    label: 'Endodoncia',
    color: '#7B61FF',
    softColor: '#F0EDFF',
    contrast: '#4B36C9',
  },
  crown: {
    label: 'Corona',
    color: '#F59E0B',
    softColor: '#FFF6E7',
    contrast: '#995F00',
  },
  implant: {
    label: 'Implante',
    color: '#00A6A6',
    softColor: '#E7FAFA',
    contrast: '#006D6D',
  },
  missing: {
    label: 'Ausente',
    color: '#98A6B3',
    softColor: '#F0F3F5',
    contrast: '#52616D',
  },
  extraction: {
    label: 'Extracción',
    color: '#B83280',
    softColor: '#FBEAF4',
    contrast: '#7D1D57',
  },
  fracture: {
    label: 'Fractura',
    color: '#DB2777',
    softColor: '#FCE7F3',
    contrast: '#9D174D',
  },
  mobility: {
    label: 'Movilidad',
    color: '#64748B',
    softColor: '#F1F5F9',
    contrast: '#334155',
  },
  prosthesis: {
    label: 'Prótesis',
    color: '#0EA5E9',
    softColor: '#EAF7FE',
    contrast: '#03658C',
  },
  pending: {
    label: 'Pendiente',
    color: '#F59E0B',
    softColor: '#FFF6E7',
    contrast: '#995F00',
  },
  completed: {
    label: 'Realizado',
    color: '#2BB673',
    softColor: '#EAF8F1',
    contrast: '#0F6B3F',
  },
};

export const legendStatuses: ToothStatus[] = [
  'healthy',
  'caries',
  'filling',
  'endodontics',
  'crown',
  'implant',
  'missing',
  'extraction',
  'fracture',
  'mobility',
  'prosthesis',
  'pending',
  'completed',
];
