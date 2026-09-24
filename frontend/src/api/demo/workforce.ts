import type {
  FichajeTrabajador,
  TrabajadorFichaje,
} from '../types';
import { getDemoUser } from './identity';

function demoTrabajadoresFichaje(): TrabajadorFichaje[] {
  const user = getDemoUser();
  if (!user || user.rol === 'paciente') return [];
  return [
    {
      id: user.id,
      nombre: user.nombre,
      origen: 'usuario',
      codigo: user.username,
      rol: user.rol,
      clinica_id: user.clinica_id ?? null,
      pin_configurado: true,
    },
  ];
}

export async function getTrabajadoresFichaje(): Promise<TrabajadorFichaje[]> {
  return demoTrabajadoresFichaje();
}

export async function getUltimoFichajeTrabajador(): Promise<FichajeTrabajador | null> {
  return null;
}
