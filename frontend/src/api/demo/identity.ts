import type {
  Clinica,
  Doctor,
  UsuarioMe,
} from '../types';
import { DEMO_DOCTORES } from './data';
import { getStoredAuthToken } from '../session';

const DEMO_USERS: Record<string, { password: string; user: UsuarioMe }> = {
  admin: { password: 'admin1234', user: { id: 'demo-user-admin', username: 'admin', nombre: 'Administrador', rol: 'admin', doctor_id: null } },
  doctor: { password: 'doctor123', user: { id: 'demo-user-doctor', username: 'doctor', nombre: 'Dr. Garcia Ruiz', rol: 'doctor', doctor_id: 'demo-doc-1' } },
  recepcion: { password: 'recep123', user: { id: 'demo-user-recepcion', username: 'recepcion', nombre: 'Recepcion', rol: 'recepcion', doctor_id: null } },
};

export function demoLogin(username: string, password: string) {
  const entry = DEMO_USERS[username];
  return entry && entry.password === password ? `demo:${username}` : null;
}

export function getDemoUser(): UsuarioMe | null {
  const token = getStoredAuthToken();
  if (!token?.startsWith('demo:')) return null;
  return DEMO_USERS[token.slice(5)]?.user ?? null;
}

export async function getClinicas(): Promise<Clinica[]> {
  return [
    { id: 'demo-clinica-1', nombre: 'Clínica Norte', direccion: 'Av. Ejemplo 123', telefono: null, email: null, cif: null, activa: true },
  ];
}

export async function getDoctores(): Promise<Doctor[]> {
  return DEMO_DOCTORES;
}
