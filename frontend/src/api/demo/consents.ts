import type {
  Consentimiento,
  PlantillaConsentimiento,
} from '../types';
import { DEMO_CONSENTIMIENTOS, DEMO_PLANTILLAS_CONSENTIMIENTO } from './data';

export async function getPlantillasConsentimiento(): Promise<PlantillaConsentimiento[]> {
  return DEMO_PLANTILLAS_CONSENTIMIENTO;
}

export async function getConsentimientosPaciente(pacienteId: string): Promise<Consentimiento[]> {
  return DEMO_CONSENTIMIENTOS.filter((item) => item.paciente_id === pacienteId || pacienteId.startsWith('demo-'));
}
