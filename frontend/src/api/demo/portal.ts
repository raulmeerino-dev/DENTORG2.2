import type {
  Cita,
  Consentimiento,
  DocumentoPaciente,
  PortalMe,
} from '../types';
import { DEMO_CONSENTIMIENTOS, DEMO_DOCUMENTOS, DEMO_PACIENTES } from './data';
import { getDocumentosPaciente } from './documents';
import { getConsentimientosPaciente } from './consents';
import { getPacienteCitas } from './scheduling';

function demoPortalPatient(pacienteId?: string | null) {
  return DEMO_PACIENTES.find((item) => item.id === pacienteId) ?? DEMO_PACIENTES[0];
}

export async function getPortalMe(pacienteId?: string | null): Promise<PortalMe> {
  const paciente = demoPortalPatient(pacienteId);
  return {
    paciente,
    resumen: {
      proximas_citas: 1,
      documentos: DEMO_DOCUMENTOS.filter((item) => item.paciente_id === paciente.id || paciente.id.startsWith('demo-')).length,
      consentimientos_pendientes: DEMO_CONSENTIMIENTOS.filter((item) => item.estado === 'pendiente_firma').length,
    },
  };
}

export async function getPortalCitas(pacienteId?: string | null): Promise<Cita[]> {
  const fallback = await getPacienteCitas(demoPortalPatient(pacienteId).id);
  return fallback;
}

export async function getPortalDocumentos(pacienteId?: string | null): Promise<DocumentoPaciente[]> {
  const fallback = await getDocumentosPaciente(demoPortalPatient(pacienteId).id);
  return fallback;
}

export async function getPortalConsentimientos(pacienteId?: string | null): Promise<Consentimiento[]> {
  const fallback = await getConsentimientosPaciente(demoPortalPatient(pacienteId).id);
  return fallback;
}
