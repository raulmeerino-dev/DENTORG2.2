

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

function healthValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.map(healthValue).filter(Boolean).join(', ');
  return '';
}

export function readableHealthItems(datos?: Record<string, unknown> | null) {
  if (!datos) return [];
  return Object.entries(datos)
    // Assessments have their own clinical reader; never stringify their internal records in the summary.
    .filter(([key]) => !['temporal', 'pendiente_completar', 'primera_visita', 'valoraciones'].includes(key))
    .map(([key, value]) => ({ key, label: healthLabel(key), value: healthValue(value) }))
    .filter(item => item.value !== '');
}

export function readableHealthData(datos?: Record<string, unknown> | null) {
  if (!datos) return '';
  return readableHealthItems(datos)
    .map((item) => `${item.label}: ${item.value}`)
    .join('\n');
}
