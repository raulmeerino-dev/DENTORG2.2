import type { Cita } from '../../../api/types';

export type AppointmentLane = { cita: Cita; lane: number; laneCount: number };

/** Allocate lanes across connected overlaps so appointments never cover one another. */
export function appointmentLanes(citas: Cita[]): AppointmentLane[] {
  const ordered = [...citas].sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime() || a.id.localeCompare(b.id));
  const result: AppointmentLane[] = [];
  let group: AppointmentLane[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => { result.push(...group.map(item => ({ ...item, laneCount: laneEnds.length }))); group = []; laneEnds = []; };
  for (const cita of ordered) {
    const start = new Date(cita.fecha_hora).getTime();
    const end = start + cita.duracion_min * 60_000;
    if (start >= groupEnd) flush();
    const freeLane = laneEnds.findIndex(value => value <= start);
    const lane = freeLane < 0 ? laneEnds.length : freeLane;
    laneEnds[lane] = end;
    groupEnd = Math.max(group.length ? groupEnd : -Infinity, end);
    group.push({ cita, lane, laneCount: 1 });
  }
  flush();
  return result;
}
