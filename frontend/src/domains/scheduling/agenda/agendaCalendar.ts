import { isoDate } from './agendaTime';

export function changeAgendaMonth(day: string, year: number, month: number) {
  const date = new Date(`${day}T12:00:00`);
  const last = new Date(year, month + 1, 0, 12).getDate();
  return isoDate(new Date(year, month, Math.min(date.getDate(), last), 12));
}

