import type {
  OdontogramaEvento,
  OdontogramaPaciente,
  OdontogramaPieza,
  OdontogramaSuperficie,
} from '../../../types/api';
import { dentalArches, createBaseTooth } from '../data/toothMap';
import type {
  OdontogramChange,
  SurfaceKey,
  ToothData,
  ToothStatus,
  Treatment,
} from '../types/odontogram.types';
import {
  toBackendStatus,
  toBackendSurface,
  toVisualStatus,
  toVisualSurface,
} from '../utils/statusMapping';

const allAdultTeeth = [...dentalArches.upper, ...dentalArches.lower];

function surfaceMap(piece: OdontogramaPieza | undefined) {
  return new Map((piece?.superficies ?? []).map((surface) => [surface.superficie, surface]));
}

function treatmentFromSurface(surface: OdontogramaSuperficie, toothNumber: string, status: 'planned' | 'completed'): Treatment | null {
  const id = status === 'planned' ? surface.tratamiento_planificado_id : surface.tratamiento_realizado_id;
  if (!id) return null;
  return {
    id,
    name: status === 'planned' ? 'Tratamiento planificado' : 'Tratamiento realizado',
    status,
    targetScope: 'surface',
    surface: toVisualSurface(surface.superficie, toothNumber),
    toothNumbers: [toothNumber],
  };
}

export function odontogramaBackendToVisual(odontograma?: OdontogramaPaciente | null): ToothData[] {
  const pieces = new Map((odontograma?.piezas ?? []).map((piece) => [String(piece.pieza_fdi), piece]));

  return allAdultTeeth.map((number) => {
    const base = createBaseTooth(number);
    const piece = pieces.get(number);
    const surfaces = surfaceMap(piece);
    const visualSurfaces: ToothData['surfaces'] = {};
    const plannedTreatments: Treatment[] = [];
    const completedTreatments: Treatment[] = [];

    for (const surface of surfaces.values()) {
      const visualSurface = toVisualSurface(surface.superficie, number);
      if (!visualSurface) continue;
      visualSurfaces[visualSurface] = toVisualStatus(surface.condicion);
      const planned = treatmentFromSurface(surface, number, 'planned');
      const completed = treatmentFromSurface(surface, number, 'completed');
      if (planned) plannedTreatments.push(planned);
      if (completed) completedTreatments.push(completed);
    }

    return {
      ...base,
      status: toVisualStatus(piece?.estado_general),
      surfaces: visualSurfaces,
      plannedTreatments,
      completedTreatments,
      notes: piece?.notas ?? undefined,
    };
  });
}

export type BackendPiecePatch = {
  piezaFdi: number;
  estado_general?: string;
  notas?: string | null;
};

export type BackendSurfacePatch = {
  piezaFdi: number;
  superficie: string;
  condicion?: string;
  tratamiento_planificado_id?: string | null;
  tratamiento_realizado_id?: string | null;
  notas?: string | null;
};

export function odontogramChangeToBackendPatch(change: OdontogramChange): BackendPiecePatch | BackendSurfacePatch | null {
  const piezaFdi = Number(change.toothNumber);
  if (!Number.isFinite(piezaFdi)) return null;

  if (change.type === 'mark_missing') {
    return {
      piezaFdi,
      estado_general: toBackendStatus('missing'),
    };
  }

  if (change.type === 'clear_treatments') {
    return {
      piezaFdi,
      estado_general: toBackendStatus('healthy'),
    };
  }

  const superficie = toBackendSurface(change.surface as SurfaceKey | undefined);
  if (!superficie) {
    return 'status' in change
      ? { piezaFdi, estado_general: toBackendStatus(change.status as ToothStatus) }
      : null;
  }

  if (change.type === 'clear_surface') {
    return {
      piezaFdi,
      superficie,
      condicion: toBackendStatus('healthy'),
      tratamiento_planificado_id: null,
      tratamiento_realizado_id: null,
    };
  }

  if (change.type === 'add_treatment') {
    return {
      piezaFdi,
      superficie,
      condicion: toBackendStatus(change.status),
      tratamiento_planificado_id: change.treatment.id,
    };
  }

  if (change.type === 'apply_status') {
    return {
      piezaFdi,
      superficie,
      condicion: toBackendStatus(change.status),
    };
  }

  return null;
}

export function odontogramaEventosToToothHistory(events: OdontogramaEvento[] = []) {
  return events.map((event) => ({
    id: event.id,
    toothNumber: event.pieza_fdi ? String(event.pieza_fdi) : undefined,
    surface: toVisualSurface(event.superficie, event.pieza_fdi ?? undefined),
    action: event.accion,
    oldValues: event.old_values,
    newValues: event.new_values,
    userId: event.usuario_id,
  }));
}
