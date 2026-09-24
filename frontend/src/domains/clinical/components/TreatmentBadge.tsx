import type { CSSProperties } from 'react';
import { colorForTreatment, iconForTreatment } from './treatmentVisual';
import type { TreatmentVisual } from './treatmentVisual';

export function TreatmentBadge({ tratamiento }: { tratamiento?: TreatmentVisual }) {
  const color = colorForTreatment(tratamiento);
  return (
    <span className="treatment-badge" style={{ '--treatment-color': color } as CSSProperties}>
      <span>{iconForTreatment(tratamiento)}</span>
      {tratamiento?.codigo ?? 'TR'}
    </span>
  );
}
