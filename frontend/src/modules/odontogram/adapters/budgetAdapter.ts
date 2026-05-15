import type { QuickTreatment } from '../data/treatmentCatalog';
import type { OdontogramaPlan, Presupuesto, PresupuestoLinea, TratamientoCatalogo } from '../../../types/api';
import type { OdontogramChange, SurfaceKey, ToothData, ToothSelection, Treatment } from '../types/odontogram.types';
import { odontogramaBackendToVisual } from './backendAdapter';

const FACE_BY_SURFACE: Partial<Record<SurfaceKey, string>> = {
  mesial: 'M',
  distal: 'D',
  vestibular: 'V',
  buccal: 'V',
  palatal: 'L',
  lingual: 'L',
  occlusal: 'O',
  incisal: 'O',
  root: 'R',
  crown: 'C',
};

const SURFACE_BY_FACE: Record<string, SurfaceKey> = {
  M: 'mesial',
  D: 'distal',
  V: 'vestibular',
  B: 'vestibular',
  L: 'lingual',
  P: 'palatal',
  O: 'occlusal',
  I: 'incisal',
  R: 'root',
  C: 'crown',
};

function statusForTreatment(name: string): QuickTreatment['status'] {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized.includes('implante')) return 'implant';
  if (normalized.includes('corona') || normalized.includes('puente') || normalized.includes('carilla')) return 'crown';
  if (normalized.includes('endo')) return 'endodontics';
  if (normalized.includes('extraccion') || normalized.includes('exodoncia')) return 'extraction';
  if (normalized.includes('protesis') || normalized.includes('ferula')) return 'prosthesis';
  if (normalized.includes('empaste') || normalized.includes('obtur')) return 'filling';
  return 'pending';
}

function surfaceFromFaces(faces?: string | null): SurfaceKey | undefined {
  const first = faces?.trim().toUpperCase()[0];
  return first ? SURFACE_BY_FACE[first] : undefined;
}

export function treatmentCatalogToQuickTreatments(tratamientos: TratamientoCatalogo[]): QuickTreatment[] {
  return tratamientos.map((tratamiento) => ({
    id: tratamiento.id,
    name: tratamiento.nombre,
    category: tratamiento.familia?.nombre ?? 'Tratamiento',
    status: statusForTreatment(tratamiento.nombre),
    targetScope: tratamiento.requiere_caras ? 'surface' : 'tooth',
    price: Number(tratamiento.precio ?? 0),
    keywords: [
      tratamiento.codigo ?? '',
      tratamiento.nombre,
      tratamiento.familia?.nombre ?? '',
    ].filter(Boolean),
  }));
}

export function budgetLineToVisualTreatment(linea: PresupuestoLinea): Treatment {
  return {
    id: linea.tratamiento_id,
    name: linea.tratamiento?.nombre ?? 'Tratamiento presupuestado',
    status: linea.aceptado ? 'pending' : 'planned',
    targetScope: linea.caras ? 'surface' : 'tooth',
    price: Number(linea.importe_neto || linea.precio_unitario || 0),
    surface: surfaceFromFaces(linea.caras),
    toothNumbers: linea.pieza_dental ? [String(linea.pieza_dental)] : [],
  };
}

export function budgetToVisualOdontogram(presupuesto: Presupuesto, base?: ToothData[]): ToothData[] {
  const visual = base?.length ? base : odontogramaBackendToVisual(null);
  return visual.map((tooth) => {
    const lines = presupuesto.lineas.filter((linea) => String(linea.pieza_dental ?? '') === tooth.number);
    if (!lines.length) return tooth;
    const surfaces = { ...tooth.surfaces };
    const plannedTreatments = [...(tooth.plannedTreatments ?? [])];
    for (const linea of lines) {
      const surface = surfaceFromFaces(linea.caras);
      if (surface) surfaces[surface] = 'pending';
      plannedTreatments.push(budgetLineToVisualTreatment(linea));
    }
    return {
      ...tooth,
      status: tooth.status === 'missing' ? tooth.status : 'pending',
      surfaces,
      plannedTreatments,
    };
  });
}

export function visualSelectionToBudgetLine(change: OdontogramChange): {
  tratamiento_id: string;
  pieza_dental: number | null;
  caras: string | null;
  precio_unitario: number;
  descuento_porcentaje: number;
} | null {
  if (change.type !== 'add_treatment') return null;
  const pieza = Number(change.toothNumber);
  return {
    tratamiento_id: change.treatment.id,
    pieza_dental: Number.isFinite(pieza) ? pieza : null,
    caras: FACE_BY_SURFACE[change.surface ?? change.treatment.surface ?? 'crown'] ?? null,
    precio_unitario: Number(change.treatment.price ?? 0),
    descuento_porcentaje: 0,
  };
}

export function hasBudgetLineForSelection(
  presupuesto: Presupuesto,
  treatment: Treatment,
  selection: ToothSelection,
): boolean {
  const toothNumber = Number(selection.toothNumber);
  const face = FACE_BY_SURFACE[selection.surface ?? treatment.surface ?? 'crown'] ?? null;
  return presupuesto.lineas.some((linea) => (
    linea.tratamiento_id === treatment.id
    && linea.pieza_dental === (Number.isFinite(toothNumber) ? toothNumber : null)
    && (linea.caras ?? null) === face
  ));
}

export function createBudgetSnapshotFromVisual(data: ToothData[]): OdontogramaPlan {
  const teeth: NonNullable<OdontogramaPlan['teeth']> = {};
  for (const tooth of data) {
    const activeSurfaces = Object.entries(tooth.surfaces)
      .filter(([, status]) => status && status !== 'healthy')
      .map(([surface]) => FACE_BY_SURFACE[surface as SurfaceKey])
      .filter(Boolean) as string[];
    if (tooth.status !== 'healthy' || activeSurfaces.length || tooth.plannedTreatments?.length) {
      teeth[tooth.number] = {
        estado: tooth.status ?? 'pending',
        superficies: activeSurfaces.length ? activeSurfaces : ['C'],
        lineaId: tooth.plannedTreatments?.[0]?.id,
      };
    }
  }
  return { version: 2, teeth };
}
