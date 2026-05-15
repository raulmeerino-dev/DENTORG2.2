import type { OdontogramaContexto, OdontogramaContextSurface } from '../../../types/api';
import { dentalArches, createBaseTooth } from '../data/toothMap';
import type { OdontogramMode, OdontogramaToolMode, SurfaceKey, ToothData, ToothStatus, Treatment } from '../types/odontogram.types';
import { statusConfig } from '../data/statusConfig';
import { toVisualStatus, toVisualSurface } from './statusMapping';

const allAdultTeeth = [...dentalArches.upper, ...dentalArches.lower];

const contextStatusByMode: Record<OdontogramaToolMode, Record<string, ToothStatus>> = {
  diagnostico: {},
  presupuesto: {
    tratamiento_presupuestado: 'pending',
    propuesto_presupuesto: 'pending',
    incluido_presupuesto: 'pending',
  },
  pendiente: {
    tratamiento_aceptado: 'pending',
    tratamiento_pendiente: 'pending',
    en_proceso: 'pending',
  },
  realizado: {
    tratamiento_realizado: 'completed',
  },
  historial: {
    evento_historial: 'completed',
  },
  documentos: {
    documento_asociado: 'endodontics',
  },
  lectura: {},
};

export function mapToolModeToOdontogramMode(mode: OdontogramaToolMode): OdontogramMode {
  return ({
    diagnostico: 'diagnosis',
    presupuesto: 'budget',
    pendiente: 'pending',
    realizado: 'completed',
    historial: 'history',
    documentos: 'documents',
    lectura: 'reading',
  } as const satisfies Record<OdontogramaToolMode, OdontogramMode>)[mode];
}

function statusForContext(surface: OdontogramaContextSurface, mode: OdontogramaToolMode): ToothStatus {
  const contextState = surface.context_state ?? '';
  return contextStatusByMode[mode][contextState] ?? toVisualStatus(surface.diagnostico);
}

function treatmentFromContext(
  surface: OdontogramaContextSurface,
  toothNumber: string,
  surfaceKey: SurfaceKey,
  mode: OdontogramaToolMode,
): Treatment | null {
  if (!surface.tratamiento_id && !surface.presupuesto_linea_id && !surface.historial_id) return null;
  return {
    id: surface.historial_id ?? surface.presupuesto_linea_id ?? surface.tratamiento_id ?? `${toothNumber}-${surfaceKey}`,
    name: surface.label ?? 'Tratamiento',
    status: mode === 'realizado' ? 'completed' : mode === 'pendiente' ? 'pending' : 'planned',
    targetScope: 'surface',
    surface: surfaceKey,
    toothNumbers: [toothNumber],
    price: surface.amount ? Number(surface.amount) : undefined,
    completedAt: mode === 'realizado' ? surface.fecha ?? undefined : undefined,
    createdAt: mode !== 'realizado' ? surface.fecha ?? undefined : undefined,
  };
}

export function buildOdontogramaViewModel(data: OdontogramaContexto | null | undefined, mode: OdontogramaToolMode): ToothData[] {
  return allAdultTeeth.map((number) => {
    const base = createBaseTooth(number);
    const toothContext = data?.teeth?.[number];
    const surfaces: ToothData['surfaces'] = {};
    const plannedTreatments: Treatment[] = [];
    const completedTreatments: Treatment[] = [];
    let contextLabel: string | undefined;
    let contextAmount: string | undefined;
    let contextState: string | undefined;

    for (const [backendSurface, surfaceContext] of Object.entries(toothContext?.surfaces ?? {})) {
      const visualSurface = toVisualSurface(backendSurface, number);
      if (!visualSurface) continue;
      const visualStatus = statusForContext(surfaceContext, mode);
      surfaces[visualSurface] = visualStatus;
      const treatment = treatmentFromContext(surfaceContext, number, visualSurface, mode);
      if (treatment) {
        if (treatment.status === 'completed') completedTreatments.push(treatment);
        else plannedTreatments.push(treatment);
      }
      contextLabel = contextLabel ?? surfaceContext.label ?? undefined;
      contextAmount = contextAmount ?? surfaceContext.amount ?? undefined;
      contextState = contextState ?? surfaceContext.context_state ?? undefined;
    }

    return {
      ...base,
      status: toVisualStatus(toothContext?.base?.estado_general),
      surfaces,
      plannedTreatments,
      completedTreatments,
      notes: toothContext?.base?.notas ?? undefined,
      contextLabel,
      contextAmount,
      contextState,
      contextMeta: toothContext?.base,
    };
  });
}

export function getToothColor(tooth: ToothData, mode: OdontogramaToolMode) {
  const priorityStatus = Object.values(tooth.surfaces)[0] ?? tooth.status ?? 'healthy';
  if (mode === 'lectura' && priorityStatus === 'pending') return statusConfig.healthy.color;
  return statusConfig[priorityStatus].color;
}

export function getSurfaceColor(surface: ToothStatus | undefined, mode: OdontogramaToolMode) {
  if (!surface) return statusConfig.healthy.color;
  if (mode === 'lectura' && surface === 'pending') return statusConfig.healthy.color;
  return statusConfig[surface].color;
}
