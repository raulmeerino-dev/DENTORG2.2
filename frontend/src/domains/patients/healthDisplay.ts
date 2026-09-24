

const HEALTH_LABELS: Record<string, string> = {
  alergias: 'Alergias',
  contraindicaciones: 'Contraindicaciones',
  observaciones_medicas: 'Observaciones médicas',
  observaciones: 'Observaciones médicas',
  medicacion: 'Medicación',
  medicacion_actual: 'Medicación actual',
  anticoagulantes: 'Anticoagulantes',
  ansiedad: 'Ansiedad',
  antecedentes: 'Antecedentes',
  enfermedades: 'Enfermedades',
  embarazo: 'Embarazo',
};

function healthLabel(key: string) {
  if (key === 'observaciones_medicas' || key === 'observaciones') return 'Observaciones medicas';
  if (key === 'medicacion' || key === 'medicacion_actual') return key === 'medicacion_actual' ? 'Medicacion actual' : 'Medicacion';
  if (HEALTH_LABELS[key]) return HEALTH_LABELS[key];
  const clean = key.replaceAll('_', ' ').trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : key;
}

export function readableHealthItems(datos?: Record<string, unknown> | null) {
  if (!datos) return [];
  return Object.entries(datos)
    .filter(([key, value]) => !['temporal', 'pendiente_completar'].includes(key) && value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => ({ key, label: healthLabel(key), value: String(value).trim() }));
}

export function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return readableHealthItems(datos)
    .map((item) => `${item.label}: ${item.value}`)
    .join('\n');
}
