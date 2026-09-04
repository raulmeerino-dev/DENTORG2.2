export type ToothStatus =
  | 'healthy'
  | 'caries'
  | 'filling'
  | 'endodontics'
  | 'crown'
  | 'implant'
  | 'missing'
  | 'extraction'
  | 'fracture'
  | 'mobility'
  | 'prosthesis'
  | 'pending'
  | 'completed';

export type SurfaceKey =
  | 'buccal'
  | 'vestibular'
  | 'palatal'
  | 'lingual'
  | 'mesial'
  | 'distal'
  | 'occlusal'
  | 'incisal'
  | 'root'
  | 'crown';

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar';

export type Arch = 'upper' | 'lower';
export type Side = 'right' | 'left';
export type TreatmentTargetScope = 'tooth' | 'surface' | 'root' | 'sector' | 'arch' | 'mouth';

export type Treatment = {
  id: string;
  name: string;
  status: 'planned' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
  targetScope?: TreatmentTargetScope;
  price?: number;
  surface?: SurfaceKey;
  toothNumbers?: string[];
  createdAt?: string;
  completedAt?: string;
};

export type OdontogramMode =
  | 'summary'
  | 'initialVisit'
  | 'diagnosis'
  | 'budget'
  | 'pending'
  | 'completed'
  | 'current'
  | 'history'
  | 'documents'
  | 'reading';

export type OdontogramaToolMode =
  | 'diagnostico'
  | 'presupuesto'
  | 'pendiente'
  | 'realizado'
  | 'historial'
  | 'documentos'
  | 'lectura';

export type ToothData = {
  number: string;
  type: ToothType;
  arch: Arch;
  side: Side;
  status?: ToothStatus;
  surfaces: Partial<Record<SurfaceKey, ToothStatus>>;
  plannedTreatments?: Treatment[];
  completedTreatments?: Treatment[];
  notes?: string;
  contextLabel?: string;
  contextAmount?: string;
  contextState?: string;
  contextMeta?: Record<string, unknown>;
  visualAssetUrl?: string;
  occlusalAssetUrl?: string;
};

export type ToothSelection = {
  toothNumber: string;
  surface?: SurfaceKey;
};

export type OdontogramContextAction = 'quick_treatment' | 'mark_missing' | 'clear_treatments' | 'view_history';

export type OdontogramChange =
  | {
      type: 'apply_status';
      toothNumber: string;
      surface?: SurfaceKey;
      status: ToothStatus;
    }
  | {
      type: 'clear_surface';
      toothNumber: string;
      surface?: SurfaceKey;
    }
  | {
      type: 'add_treatment';
      toothNumber: string;
      surface?: SurfaceKey;
      treatment: Treatment;
      status: ToothStatus;
    }
  | {
      type: 'mark_missing';
      toothNumber: string;
    }
  | {
      type: 'clear_treatments';
      toothNumber: string;
    };

export type OdontogramProps = {
  patientId?: string;
  budgetId?: string;
  data?: ToothData[];
  mode?: OdontogramMode;
  title?: string;
  subtitle?: string;
  patientName?: string;
  contextDate?: string;
  totalBudget?: number;
  selected?: ToothSelection;
  readOnly?: boolean;
  showDemoHeader?: boolean;
  showLegend?: boolean;
  enableQuickTreatments?: boolean;
  quickTreatments?: QuickTreatment[];
  onChange?: (nextData: ToothData[], change: OdontogramChange) => void;
  onAddTreatment?: (treatment: Treatment, selection: ToothSelection, nextData: ToothData[]) => void;
  onStartTreatment?: (treatment: Treatment, selection: ToothSelection) => void;
  onCompleteTreatment?: (treatment: Treatment, selection: ToothSelection) => void;
  onSelectTooth?: (selection: ToothSelection, tooth: ToothData) => void;
  onContextAction?: (action: OdontogramContextAction, tooth: ToothData, selection: ToothSelection) => void;
};
import type { QuickTreatment } from '../data/treatmentCatalog';
