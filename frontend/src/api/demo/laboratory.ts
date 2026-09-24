import type {
  Laboratorio,
  TrabajoLaboratorio,
} from '../types';
import { DEMO_DOCTORES } from './data';

export async function getLaboratorios(): Promise<Laboratorio[]> {
  const labs: Laboratorio[] = [
    { id: 'demo-lab-1', nombre: 'Laboratorio Norte', telefono: '942000001', whatsapp: '600100100', email: 'lab@example.test', contacto: 'Laura', notas: 'Zirconio y removible', activo: true },
    { id: 'demo-lab-2', nombre: 'Protesicos Centro', telefono: '942000002', whatsapp: null, email: '', contacto: 'Manuel', notas: 'Urgencias 48h', activo: true },
  ];
  return labs;
}

export async function getTrabajosLaboratorio(params: { pendientes?: boolean; proximos?: boolean; vencidos?: boolean; estado?: string; paciente_id?: string; cita_id?: string } = {}): Promise<TrabajoLaboratorio[]> {
  const trabajos: TrabajoLaboratorio[] = [
    { id: 'demo-labtrab-1', paciente_id: 'demo-pac-1', doctor_id: 'demo-doc-1', laboratorio_id: 'demo-lab-1', historial_id: null, cita_id: 'demo-cita-1', tratamiento_id: 't-impl', presupuesto_id: 'demo-pres-1', factura_id: null, referencia: 'LAB-24-ZIR', tipo_trabajo: 'Corona', descripcion: 'Corona zirconio 24', pieza_dental: 24, color: 'A2', observaciones: 'Probar estructura', fecha_salida: '2026-04-20', fecha_entrega_prevista: '2026-04-28', fecha_recepcion: null, fecha_revision: null, fecha_entrega_paciente: null, ubicacion_clinica: null, estado: 'enviado', precio: 120, coste_laboratorio: 120, precio_paciente: 290, margen: 170, comision_doctor_pct: 0, estado_pago_laboratorio: 'pendiente', estado_cobro_paciente: 'pendiente', paciente: { id: 'demo-pac-1', nombre: 'CESAR', apellidos: 'GUTIERREZ VELEZ', num_historial: 91312 }, doctor: { id: 'demo-doc-1', nombre: DEMO_DOCTORES[0].nombre }, laboratorio: { id: 'demo-lab-1', nombre: 'Laboratorio Norte', telefono: '942000001', whatsapp: '600100100', email: 'lab@example.test', contacto: 'Laura', notas: null, activo: true } },
  ];
  const filtered = trabajos.filter((item) => {
    if (params.paciente_id && item.paciente_id !== params.paciente_id && !params.paciente_id.startsWith('demo-')) return false;
    if (params.cita_id && item.cita_id !== params.cita_id && !params.cita_id.startsWith('demo-')) return false;
    if (params.estado && item.estado !== params.estado) return false;
    if (params.pendientes && !['pendiente', 'pendiente_enviar', 'enviado', 'en_proceso', 'en_fabricacion', 'pending_to_send', 'sent_to_lab', 'in_progress_at_lab', 'ready_at_lab'].includes(item.estado)) return false;
    return true;
  });
  return filtered;
}
