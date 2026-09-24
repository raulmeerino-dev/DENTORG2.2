import { normalizeText } from '../../../shared/text';

const FAMILY_COLORS: Record<string, string> = {
  diagnostico: '#2a7de1',
  prevencion: '#2a7de1',
  conservadora: '#16a06f',
  endodoncia: '#d94b4b',
  periodoncia: '#6fae35',
  cirugia: '#d97828',
  implantologia: '#7b61d1',
  protesis: '#9b6a32',
  ortodoncia: '#d08c00',
  estetica: '#d64f91',
  odontopediatria: '#00a3a3',
  otros: '#5f6f89',
};

export type TreatmentVisual = { codigo?: string | null; nombre?: string | null; familia?: { icono?: string | null; nombre?: string | null } | null } | null;

export function colorForTreatment(tratamiento?: { codigo?: string | null; nombre?: string | null; familia?: { nombre?: string | null } | null } | null) {
  const family = normalizeText(tratamiento?.familia?.nombre);
  const name = normalizeText(tratamiento?.nombre);
  const key = Object.keys(FAMILY_COLORS).find((item) => family.includes(item) || name.includes(item));
  if (key) return FAMILY_COLORS[key];
  const source = `${tratamiento?.codigo ?? ''}${tratamiento?.nombre ?? ''}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = source.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 54% 43%)`;
}

export function iconForTreatment(tratamiento?: { codigo?: string | null; nombre?: string | null; familia?: { icono?: string | null; nombre?: string | null } | null } | null) {
  if (tratamiento?.familia?.icono) return tratamiento.familia.icono;
  const text = normalizeText(`${tratamiento?.codigo ?? ''} ${tratamiento?.nombre ?? ''} ${tratamiento?.familia?.nombre ?? ''}`);
  if (text.includes('endo')) return 'E';
  if (text.includes('impl')) return 'I';
  if (text.includes('orto') || text.includes('bracket')) return 'O';
  if (text.includes('protes') || text.includes('corona')) return 'P';
  if (text.includes('cirug') || text.includes('extrac')) return 'C';
  if (text.includes('limp') || text.includes('prev')) return 'L';
  if (text.includes('estet') || text.includes('blanq')) return 'B';
  return tratamiento?.codigo?.slice(0, 2) ?? 'T';
}
