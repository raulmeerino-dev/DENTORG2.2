import './styles/odontogram.css';

export { Odontogram } from './components/Odontogram';
export { BudgetOdontogramFlow } from './BudgetOdontogramFlow';
export { PatientOdontogramFlow } from './PatientOdontogramFlow';
export { odontogramMock } from './data/odontogramMock';
export { odontogramModeConfig } from './data/modeConfig';
export { dentalArches, getAnatomicalSurfaceFromVisualSurface, getPrimarySurface, mirrorMap } from './data/toothMap';
export { legendStatuses, statusConfig } from './data/statusConfig';
export { quickTreatmentCatalog } from './data/treatmentCatalog';
export {
  backendToVisualStatus,
  toBackendStatus,
  toBackendSurface,
  toVisualStatus,
  toVisualSurface,
  visualToBackendStatus,
} from './utils/statusMapping';
export {
  budgetLineToVisualTreatment,
  budgetToVisualOdontogram,
  createBudgetSnapshotFromVisual,
  treatmentCatalogToQuickTreatments,
  visualSelectionToBudgetLine,
} from './adapters/budgetAdapter';
export {
  odontogramaBackendToVisual,
  odontogramChangeToBackendPatch,
  odontogramaEventosToToothHistory,
} from './adapters/backendAdapter';
export type { QuickTreatment } from './data/treatmentCatalog';
export type { BackendPiecePatch, BackendSurfacePatch } from './adapters/backendAdapter';
export type {
  Arch,
  OdontogramChange,
  OdontogramContextAction,
  OdontogramMode,
  OdontogramProps,
  SurfaceKey,
  ToothData,
  ToothSelection,
  ToothStatus,
  ToothType,
  Treatment,
  TreatmentTargetScope,
} from './types/odontogram.types';
