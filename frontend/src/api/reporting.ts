import { api } from './client';
import type {
  ReportCitasDoctor,
  ReportDashboard,
  ReportKpis,
  ReportPaciente,
  ReportTopTratamiento,
  IngresosReporte,
} from './types';

type ReportDateParams = {
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  doctor_id?: string;
  clinica_id?: string;
  tratamiento_id?: string;
};

export async function getIngresosReporte(desde: string, hasta: string) {
  const { data } = await api.get<IngresosReporte>('/reportes/ingresos', { params: { desde, hasta } });
  return data;
}

export function getReportKpis(): Promise<ReportKpis>;

export function getReportKpis(params: ReportDateParams): Promise<ReportKpis>;

export async function getReportKpis(params: ReportDateParams = {}): Promise<ReportKpis> {
  const { data } = await api.get<ReportKpis>('/reportes/kpis', { params });
  return data;
}

export function getReportDashboard(): Promise<ReportDashboard>;

export function getReportDashboard(params: ReportDateParams): Promise<ReportDashboard>;

export async function getReportDashboard(params: ReportDateParams = {}): Promise<ReportDashboard> {
  const { data } = await api.get<ReportDashboard>('/reportes/dashboard', { params });
  return data;
}

export async function getReportPacientes() {
  const { data } = await api.get<ReportPaciente[]>('/reportes/pacientes');
  return data;
}

export function getReportTopTratamientos(): Promise<ReportTopTratamiento[]>;

export function getReportTopTratamientos(params: ReportDateParams): Promise<ReportTopTratamiento[]>;

export async function getReportTopTratamientos(params: ReportDateParams = {}): Promise<ReportTopTratamiento[]> {
  const { data } = await api.get<ReportTopTratamiento[]>('/reportes/top-tratamientos', { params });
  return data;
}

export function getReportCitasDoctor(): Promise<ReportCitasDoctor[]>;

export function getReportCitasDoctor(params: ReportDateParams): Promise<ReportCitasDoctor[]>;

export async function getReportCitasDoctor(params: ReportDateParams = {}): Promise<ReportCitasDoctor[]> {
  const { data } = await api.get<ReportCitasDoctor[]>('/reportes/citas-por-doctor', { params });
  return data;
}
