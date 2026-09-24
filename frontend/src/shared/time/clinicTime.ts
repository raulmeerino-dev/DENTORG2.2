// The clinic owns wall-clock scheduling. Browser time zones must not shift slots.
let clinicTimeZone = 'Europe/Madrid';

export function configureClinicTimeZone(timeZone: string) {
  new Intl.DateTimeFormat('en', { timeZone }).format();
  clinicTimeZone = timeZone;
}
export function getClinicTimeZone() { return clinicTimeZone; }

function parts(value: string | Date, timeZone = clinicTimeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
}
export function clinicDate(value: string | Date) {
  const p = parts(value); return `${p.year}-${p.month}-${p.day}`;
}
/** Calendar-only clinical dates stay unchanged; timestamp instants use the clinic zone. */
export function clinicDateKey(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '';
  if (!/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)) return value.slice(0, 10);
  return Number.isNaN(Date.parse(value)) ? '' : clinicDate(value);
}
export function clinicTime(value: string | Date) {
  const p = parts(value); return `${p.hour}:${p.minute}`;
}
export function clinicDateTimeToIso(day: string, time = '00:00:00') {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute, second);
  let instant = wall;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const p = parts(new Date(instant));
    const rendered = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    if (rendered === wall) return new Date(instant).toISOString();
    instant += wall - rendered;
  }
  throw new RangeError('La hora seleccionada no existe en la zona horaria de la clínica.');
}
