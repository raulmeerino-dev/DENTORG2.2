export interface Paciente {
  id: string;
  nHistoria: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  fechaNacimiento: string;
  direccion: string;
  ultimaVisita: string | null;
  proximaVisita: string | null;
  saldo: number;
  notas: string;
}
