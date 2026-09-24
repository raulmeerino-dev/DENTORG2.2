import { legendStatuses, statusConfig } from '../data/statusConfig';
import type { ToothData, ToothStatus } from '../types/odontogram.types';

type OdontogramLegendProps = {
  data?: ToothData[];
  compact?: boolean;
};

function getActiveStatuses(data: ToothData[]): Set<ToothStatus> {
  const active = new Set<ToothStatus>(['healthy']);

  data.forEach((tooth) => {
    if (tooth.status) active.add(tooth.status);
    Object.values(tooth.surfaces).forEach((status) => {
      if (status) active.add(status);
    });
  });

  return active;
}

export function OdontogramLegend({ data, compact = false }: OdontogramLegendProps) {
  const activeStatuses = data ? getActiveStatuses(data) : undefined;
  const statuses = compact && activeStatuses ? legendStatuses.filter((status) => activeStatuses.has(status)) : legendStatuses;

  return (
    <div className="od-legend" aria-label="Leyenda de estados clínicos">
      {statuses.map((status) => (
        <span className="od-legend-chip" key={status}>
          <i style={{ background: statusConfig[status].color }} />
          {statusConfig[status].label}
        </span>
      ))}
    </div>
  );
}
