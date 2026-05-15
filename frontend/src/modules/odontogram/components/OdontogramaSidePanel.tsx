import type { OdontogramMode, SurfaceKey, ToothData, ToothStatus } from '../types/odontogram.types';
import { SelectedToothPanel } from './SelectedToothPanel';

type OdontogramaSidePanelProps = {
  tooth: ToothData;
  selectedSurface?: SurfaceKey;
  readOnly?: boolean;
  mode?: OdontogramMode;
  onSelectSurface: (surface: SurfaceKey) => void;
  onApplyStatus: (status: ToothStatus) => void;
  onClearSurface: () => void;
};

export function OdontogramaSidePanel(props: OdontogramaSidePanelProps) {
  return <SelectedToothPanel {...props} />;
}
