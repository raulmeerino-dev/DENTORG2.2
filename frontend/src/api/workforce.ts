import { api } from './client';
import type {
  FichajeRegistroResponse,
  FichajeTrabajador,
  TipoFichaje,
  TrabajadorFichaje,
} from './types';

export async function getTrabajadoresFichaje() {
  const { data } = await api.get<TrabajadorFichaje[]>('/fichajes/trabajadores');
  return data;
}

export async function getUltimoFichajeTrabajador(trabajadorId: string) {
  const { data } = await api.get<FichajeTrabajador | null>(`/fichajes/ultimo/${trabajadorId}`);
  return data;
}

export async function registrarFichaje(data: {
  trabajador_id: string;
  pin: string;
  tipo: TipoFichaje;
}) {
  const { data: registered } = await api.post<FichajeRegistroResponse>('/fichajes', data);
  return registered;
}
