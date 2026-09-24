import type {
  DocumentoPaciente,
} from '../types';
import { DEMO_DOCUMENTOS } from './data';

export async function getDocumentosPaciente(pacienteId: string, categoria?: string): Promise<DocumentoPaciente[]> {
  const docs = DEMO_DOCUMENTOS.filter((item) => {
    if (!(item.paciente_id === pacienteId || pacienteId.startsWith('demo-'))) return false;
    return !categoria || item.categoria === categoria;
  });
  return docs;
}
