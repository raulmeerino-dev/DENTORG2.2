import type { SurfaceKey, ToothStatus, TreatmentTargetScope } from '../types/odontogram.types';

export type QuickTreatment = {
  id: string;
  name: string;
  category: string;
  status: ToothStatus;
  targetScope?: TreatmentTargetScope;
  price?: number;
  defaultSurface?: SurfaceKey;
  keywords: string[];
};

export const quickTreatmentCatalog: QuickTreatment[] = [
  {
    id: 'quick-caries',
    name: 'Caries / restauración',
    category: 'Operatoria',
    status: 'caries',
    targetScope: 'surface',
    price: 95,
    keywords: ['caries', 'restauracion', 'restauración', 'composite'],
  },
  {
    id: 'quick-filling',
    name: 'Obturación composite',
    category: 'Operatoria',
    status: 'filling',
    targetScope: 'surface',
    price: 85,
    keywords: ['obturacion', 'obturación', 'empaste', 'composite'],
  },
  {
    id: 'quick-endo',
    name: 'Endodoncia',
    category: 'Endodoncia',
    status: 'endodontics',
    targetScope: 'root',
    price: 280,
    defaultSurface: 'root',
    keywords: ['endo', 'endodoncia', 'conducto', 'raiz', 'raíz'],
  },
  {
    id: 'quick-crown',
    name: 'Corona cerámica',
    category: 'Prótesis',
    status: 'crown',
    targetScope: 'tooth',
    price: 420,
    defaultSurface: 'crown',
    keywords: ['corona', 'ceramica', 'cerámica', 'protesis', 'prótesis'],
  },
  {
    id: 'quick-implant',
    name: 'Implante',
    category: 'Cirugía',
    status: 'implant',
    targetScope: 'tooth',
    price: 650,
    keywords: ['implante', 'cirugia', 'cirugía'],
  },
  {
    id: 'quick-extraction',
    name: 'Extracción',
    category: 'Cirugía',
    status: 'extraction',
    targetScope: 'tooth',
    price: 110,
    keywords: ['extraccion', 'extracción', 'exodoncia', 'cirugia'],
  },
  {
    id: 'quick-fracture',
    name: 'Fractura coronaria',
    category: 'Diagnóstico',
    status: 'fracture',
    targetScope: 'tooth',
    price: 0,
    defaultSurface: 'crown',
    keywords: ['fractura', 'fisura', 'trauma'],
  },
  {
    id: 'quick-mobility',
    name: 'Movilidad dental',
    category: 'Periodoncia',
    status: 'mobility',
    targetScope: 'tooth',
    price: 0,
    keywords: ['movilidad', 'periodoncia', 'periodontal'],
  },
  {
    id: 'quick-prosthesis',
    name: 'Prótesis provisional',
    category: 'Prótesis',
    status: 'prosthesis',
    targetScope: 'sector',
    price: 180,
    keywords: ['protesis', 'prótesis', 'provisional'],
  },
  {
    id: 'quick-pending',
    name: 'Pendiente de valorar',
    category: 'Plan clínico',
    status: 'pending',
    targetScope: 'tooth',
    price: 0,
    keywords: ['pendiente', 'valorar', 'plan'],
  },
];
