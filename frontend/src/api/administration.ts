import { api } from './client';
import type {
  AuditLogEntry,
  BackupRegistro,
  ProductionReadinessReport,
} from './types';

export async function getBackups() {
  const { data } = await api.get<BackupRegistro[]>('/admin/backups');
  return data;
}

export async function getProductionReadiness() {
  const { data } = await api.get<ProductionReadinessReport>('/admin/produccion/preflight');
  return data;
}

export async function getAuditLog(params: {
  desde?: string;
  hasta?: string;
  accion?: string;
  entidad?: string;
  clinica_id?: string;
} = {}) {
  const { data } = await api.get<AuditLogEntry[]>('/admin/auditoria', { params });
  return data;
}

export async function crearBackup(alcance: 'database' | 'uploads' | 'full' = 'full') {
  const { data } = await api.post<BackupRegistro>('/admin/backups', { alcance });
  return data;
}

export async function verificarBackup(backupId: string) {
  const { data } = await api.get<{ ok: boolean; motivo?: string; hash_actual?: string; tamano_bytes?: number; tablas?: number; uploads?: number; created_at?: string }>(`/admin/backups/${backupId}/verificar`);
  return data;
}

export async function simularRestauracionBackup(backupId: string) {
  const { data } = await api.get<{ ok: boolean; motivo?: string; dry_run?: boolean; tablas?: number; uploads?: number; advertencias?: string[] }>(`/admin/backups/${backupId}/simular-restauracion`);
  return data;
}

export async function registrarPruebaRestauracionBackup(backupId: string, resultado: 'ok' | 'fallido', notas?: string) {
  const { data } = await api.post<BackupRegistro>(`/admin/backups/${backupId}/registrar-prueba-restauracion`, {
    resultado,
    notas,
  });
  return data;
}

export async function descargarBackup(backupId: string) {
  const { data } = await api.get<Blob>(`/admin/backups/${backupId}/descargar`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dentcore-backup-${backupId}.dentcorebak`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
