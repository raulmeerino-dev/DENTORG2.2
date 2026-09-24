import type {
  AuditLogEntry,
  BackupRegistro,
  ProductionReadinessReport,
} from '../types';

export async function getBackups(): Promise<BackupRegistro[]> {
  return [];
}

export async function getProductionReadiness(): Promise<ProductionReadinessReport> {
  return {
    overall: 'warn',
    generated_at: new Date().toISOString(),
    totals: { ok: 6, warn: 4, fail: 1 },
    checks: [
      {
        status: 'warn',
        area: 'entorno',
        titulo: 'Modo demo/desarrollo',
        detalle: 'Informe de ejemplo sin conexion al backend.',
        accion_recomendada: 'Conectar backend y revisar el preflight real antes de produccion.',
      },
    ],
    next_steps: [
      'Validacion juridica RGPD/LOPDGDD.',
      'Validacion fiscal VERI*FACTU/SIF.',
      'Prueba de restauracion de backup.',
    ],
  };
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  return [];
}
