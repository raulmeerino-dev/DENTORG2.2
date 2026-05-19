import type { ApiPaciente } from '../../types/api';

export function buildWhatsAppUrl(paciente: ApiPaciente | null): string | null {
  const raw = paciente?.telefono || paciente?.telefono2;
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
