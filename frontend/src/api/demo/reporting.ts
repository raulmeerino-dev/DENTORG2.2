import type {
  ReportCitasDoctor,
  ReportDashboard,
  ReportKpis,
  ReportPaciente,
  ReportTopTratamiento,
  IngresosReporte,
} from '../types';
import { DEMO_DOCTORES, DEMO_PACIENTES, DEMO_TRATAMIENTOS } from './data';

export async function getIngresosReporte(): Promise<IngresosReporte> {
  return {
    total: 12345,
    pac: 6789,
    seg: 4556,
  };
}

export async function getReportKpis(): Promise<ReportKpis> {
  return {
    citas: { total: 18, por_estado: { confirmada: 12, atendida: 4, falta: 2 }, asistencia: 4, faltas: 2, anuladas: 0, no_show_rate: 11.1 },
    pacientes_nuevos: 5,
    facturacion: { num_facturas: 7, total_facturado: 4260, total_cobrado: 3110, pendiente: 1150, ticket_medio: 608.57 },
    tratamientos_realizados: 22,
    presupuestos: { total: 9, por_estado: { borrador: 2, aceptado: 5, rechazado: 2 }, aceptacion_rate: 55.5, rechazo_rate: 22.2 },
  };
}

export async function getReportDashboard(): Promise<ReportDashboard> {
  const fallbackKpis: ReportKpis = {
    citas: { total: 18, por_estado: { programada: 3, confirmada: 8, en_clinica: 2, atendida: 4, falta: 1 }, asistencia: 4, faltas: 1, anuladas: 0, no_show_rate: 5.55 },
    pacientes_nuevos: 5,
    facturacion: { num_facturas: 7, total_facturado: 4260, total_cobrado: 3110, pendiente: 1150, ticket_medio: 608.57 },
    tratamientos_realizados: 22,
    presupuestos: { total: 9, por_estado: { borrador: 2, presentado: 1, aceptado: 5, rechazado: 1 }, aceptacion_rate: 55.5, rechazo_rate: 11.1 },
  };
  return {
    periodo: { desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), hasta: new Date().toISOString().slice(0, 10) },
    kpis: fallbackKpis,
    series: {
      ingresos_mensuales: Array.from({ length: 12 }, (_, index) => ({
        mes: index + 1,
        facturado: index < new Date().getMonth() + 1 ? 1800 + index * 220 : 0,
        cobrado: index < new Date().getMonth() + 1 ? 1400 + index * 180 : 0,
        num_facturas: index < new Date().getMonth() + 1 ? 4 + index : 0,
      })),
    },
    doctores: DEMO_DOCTORES.map((doctor, index) => ({
      doctor_id: doctor.id,
      doctor: doctor.nombre,
      color: doctor.color_agenda,
      total: 14 - index,
      atendidas: 9 - index,
      faltas: index,
      ocupacion_pct: 62 - index * 8,
    })),
    tratamientos: DEMO_TRATAMIENTOS.slice(0, 5).map((item, index) => ({
      tratamiento: item.nombre,
      cantidad: 12 - index,
      importe: (12 - index) * Number(item.precio),
    })),
    pacientes_deuda: DEMO_PACIENTES.slice(0, 2).map((paciente, index) => ({
      id: paciente.id,
      num_historial: paciente.num_historial,
      nombre: paciente.nombre,
      apellidos: paciente.apellidos,
      saldo_pendiente: index === 0 ? 145 : 80,
    })),
    alertas: {
      citas_sin_confirmar: 3,
      pacientes_en_clinica: 2,
      faltas_periodo: 1,
      deuda_pendiente: 1150,
      presupuestos_pendientes: 3,
    },
  };
}

export async function getReportPacientes(): Promise<ReportPaciente[]> {
  return DEMO_PACIENTES.map((paciente, index) => ({
    id: paciente.id,
    num_historial: paciente.num_historial,
    nombre: paciente.nombre,
    apellidos: paciente.apellidos,
    fecha_nacimiento: paciente.fecha_nacimiento,
    activo: paciente.activo,
    total_citas: index === 0 ? 14 : 7,
    saldo_pendiente: index === 0 ? 145 : 0,
  }));
}

export async function getReportTopTratamientos(): Promise<ReportTopTratamiento[]> {
  return DEMO_TRATAMIENTOS.slice(0, 5).map((item, index) => ({
    tratamiento: item.nombre,
    cantidad: 12 - index,
  }));
}

export async function getReportCitasDoctor(): Promise<ReportCitasDoctor[]> {
  return DEMO_DOCTORES.map((doctor, index) => ({
    doctor_id: doctor.id,
    doctor: doctor.nombre,
    color: doctor.color_agenda,
    total: 12 - index,
    atendidas: 8 - index,
    faltas: index,
  }));
}
