import { describe, expect, it } from 'vitest';
import type { Cita, TrabajoLaboratorioCitaResumen } from '../../types/api';
import {
  agendaLabSummary,
  appointmentSuggestsLab,
  buildLabAlerts,
  citaMatchesLabFilter,
} from './laboratorioAgenda';

function trabajo(overrides: Partial<TrabajoLaboratorioCitaResumen> = {}): TrabajoLaboratorioCitaResumen {
  return {
    id: 'lab-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    laboratorio_id: 'lab-cat-1',
    cita_id: 'cita-1',
    tratamiento_id: null,
    presupuesto_linea_id: null,
    tipo_trabajo: 'Corona',
    descripcion: 'Corona zirconio 16',
    pieza_dental: 16,
    observaciones: null,
    fecha_salida: '2026-06-20',
    fecha_entrega_prevista: '2026-06-28',
    fecha_recepcion: null,
    fecha_revision: null,
    fecha_entrega_paciente: null,
    ubicacion_clinica: null,
    estado: 'sent_to_lab',
    colocado: false,
    material_enviado: true,
    material_devuelto: false,
    laboratorio: { id: 'lab-cat-1', nombre: 'Lab Dental X', contacto: null },
    ...overrides,
  };
}

function cita(overrides: Partial<Cita> = {}): Cita {
  return {
    id: 'cita-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    fecha_hora: '2026-06-29T12:30:00',
    duracion_min: 30,
    estado: 'programada',
    motivo: 'Prueba corona',
    observaciones: null,
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
    laboratorio: [],
    ...overrides,
  };
}

describe('laboratorioAgenda', () => {
  it('detecta citas que parecen depender de laboratorio aunque no tengan trabajo asociado', () => {
    const item = cita({ motivo: 'Colocacion ferula descarga' });
    expect(appointmentSuggestsLab(item)).toBe(true);
    expect(citaMatchesLabFilter(item)).toBe(true);
    expect(buildLabAlerts(item, '2026-06-29')).toContain('Esta cita parece depender de laboratorio, pero no hay trabajo asociado.');
  });

  it('avisa si la cita de hoy tiene trabajo no recibido', () => {
    const item = cita({ laboratorio: [trabajo({ estado: 'sent_to_lab', fecha_recepcion: null })] });
    expect(buildLabAlerts(item, '2026-06-29')).toContain('Este trabajo todavia no consta como recibido en clinica.');
  });

  it('detecta retrasos y recibidos sin revisar', () => {
    const delayed = cita({ laboratorio: [trabajo({ fecha_entrega_prevista: '2026-06-20' })] });
    expect(buildLabAlerts(delayed, '2026-06-29')).toContain('Trabajo de laboratorio retrasado.');

    const unchecked = cita({
      laboratorio: [trabajo({ estado: 'received_in_clinic', fecha_recepcion: '2026-06-28' })],
    });
    expect(buildLabAlerts(unchecked, '2026-06-29')).toContain('Recibido en clinica, pendiente de revisar.');
  });

  it('resume trabajos listos, pendientes, retrasados y sospechosos sin asociar', () => {
    const summary = agendaLabSummary([
      cita({ id: 'c1', laboratorio: [trabajo({ estado: 'checked_in_clinic', fecha_recepcion: '2026-06-28', fecha_revision: '2026-06-28' })] }),
      cita({ id: 'c2', laboratorio: [trabajo({ id: 'lab-2', estado: 'sent_to_lab', fecha_entrega_prevista: '2026-07-01' })] }),
      cita({ id: 'c3', laboratorio: [trabajo({ id: 'lab-3', estado: 'sent_to_lab', fecha_entrega_prevista: '2026-06-20' })] }),
      cita({ id: 'c4', motivo: 'Entrega retenedor', laboratorio: [] }),
    ], '2026-06-29');

    expect(summary).toEqual({
      total: 3,
      ready: 1,
      pending: 1,
      delayed: 1,
      suspectedWithoutWork: 1,
    });
  });
});
