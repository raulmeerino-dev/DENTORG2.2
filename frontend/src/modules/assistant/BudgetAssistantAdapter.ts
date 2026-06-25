import { createPresupuesto } from '../../lib/api';
import type { Presupuesto } from '../../types/api';
import type { AssistantContextSnapshot, AssistantIntent, AssistantProfessionalOption } from './types';

function numericTooth(value: string | null | undefined) {
  if (!value) return null;
  const tooth = Number(value);
  return Number.isInteger(tooth) ? tooth : null;
}

export async function createBudgetFromAssistant(
  intent: AssistantIntent,
  context: AssistantContextSnapshot,
  professionals: AssistantProfessionalOption[],
): Promise<Presupuesto> {
  const patientId = intent.fields.patientId;
  if (!patientId) throw new Error('No hay un paciente real para crear el presupuesto.');

  const doctorId = context.currentDoctorId ?? professionals[0]?.id ?? null;
  if (!doctorId) throw new Error('No hay doctor configurado para crear el presupuesto.');

  const lines = (intent.fields.budgetLines ?? []).map((line) => {
    if (!line.treatmentId) throw new Error(`Tratamiento sin resolver: ${line.treatmentQuery ?? 'linea de presupuesto'}.`);
    if (line.unitPrice == null) throw new Error(`Falta precio para ${line.treatmentName ?? line.treatmentQuery ?? 'una linea'}.`);
    return {
      tratamiento_id: line.treatmentId,
      pieza_dental: numericTooth(line.tooth),
      caras: null,
      precio_unitario: line.unitPrice,
      descuento_porcentaje: line.discount ?? 0,
    };
  });

  if (!lines.length) throw new Error('El presupuesto necesita al menos una linea.');
  return createPresupuesto(patientId, doctorId, lines);
}
