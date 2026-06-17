import { describe, expect, it } from 'vitest';
import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  HistorialClinico,
  Presupuesto,
  PresupuestoLinea,
  TrabajoLaboratorio,
} from '../../types/api';
import { buildPatientStatus } from './patientStatus';

const today = '2026-05-21';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 1001,
  nombre: 'Cesar',
  apellidos: 'Gutierrez',
  fecha_nacimiento: null,
  telefono: '600123456',
  activo: true,
};

function makeCita(overrides: Partial<Cita> = {}): Cita {
  return {
    id: 'cita-1',
    paciente_id: paciente.id,
    doctor_id: 'doc-1',
    gabinete_id: null,
    fecha_hora: '2026-06-01T10:00:00',
    duracion_min: 30,
    estado: 'programada',
    motivo: 'Revision',
    ...overrides,
  };
}

function makeLinea(overrides: Partial<PresupuestoLinea> = {}): PresupuestoLinea {
  return {
    id: 'linea-1',
    presupuesto_id: 'pres-1',
    tratamiento_id: 'trat-1',
    tratamiento: { id: 'trat-1', nombre: 'Endodoncia', codigo: 'END' },
    pieza_dental: 36,
    caras: 'O',
    precio_unitario: '120.00',
    descuento_porcentaje: '0',
    aceptado: false,
    pasado_trabajo_pendiente: false,
    importe_neto: '120.00',
    ...overrides,
  };
}

function makePresupuesto(overrides: Partial<Presupuesto> = {}): Presupuesto {
  return {
    id: 'pres-1',
    paciente_id: paciente.id,
    numero: 1,
    fecha: '2026-04-10',
    estado: 'borrador',
    pie_pagina: null,
    odontograma: { piezas: {} } as Presupuesto['odontograma'],
    doctor_id: 'doc-1',
    lineas: [],
    total: '0.00',
    total_aceptado: '0.00',
    ...overrides,
  };
}

function makeHistorial(overrides: Partial<HistorialClinico> = {}): HistorialClinico {
  return {
    id: 'hist-1',
    paciente_id: paciente.id,
    tratamiento_id: 'trat-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    pieza_dental: 36,
    caras: 'O',
    fecha: '2026-04-10',
    diagnostico: null,
    procedimiento: 'Primera visita',
    observaciones: null,
    estado: 'realizado',
    importe: '0',
    factura_id: null,
    origen: 'manual',
    presupuesto_linea_id: null,
    cita_id: null,
    tratamiento: { id: 'trat-1', nombre: 'Primera visita', codigo: 'PV' },
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    ...overrides,
  };
}

function makeLaboratorio(overrides: Partial<TrabajoLaboratorio> = {}): TrabajoLaboratorio {
  return {
    id: 'lab-1',
    paciente_id: paciente.id,
    doctor_id: 'doc-1',
    laboratorio_id: 'L1',
    historial_id: null,
    descripcion: 'Corona',
    pieza_dental: 36,
    color: null,
    observaciones: null,
    fecha_salida: '2026-05-01',
    fecha_entrega_prevista: '2026-05-15',
    fecha_recepcion: null,
    fecha_entrega_paciente: null,
    estado: 'en_curso',
    precio: 80,
    paciente: null,
    doctor: null,
    laboratorio: null,
    ...overrides,
  };
}

const baseInput = {
  paciente,
  today,
  citas: [] as Cita[],
  historial: [] as HistorialClinico[],
  presupuestos: [] as Presupuesto[],
  consentimientos: [] as Consentimiento[],
  laboratorio: [] as TrabajoLaboratorio[],
  saldoPendiente: 0,
};

describe('buildPatientStatus', () => {
  it('devuelve Activo por defecto cuando el paciente no tiene actividad relevante', () => {
    const result = buildPatientStatus(baseInput);
    expect(result.status).toBe('activo');
    expect(result.severity).toBe('ok');
    expect(result.label).toBe('Activo');
  });

  it('devuelve Inactivo si paciente.activo es false (override de todo)', () => {
    const result = buildPatientStatus({
      ...baseInput,
      paciente: { ...paciente, activo: false },
      saldoPendiente: 200,
    });
    expect(result.status).toBe('inactivo');
    expect(result.severity).toBe('info');
  });

  it('devuelve null seguro y label informativo si no hay paciente', () => {
    const result = buildPatientStatus({ ...baseInput, paciente: null });
    expect(result.status).toBe('activo');
    expect(result.severity).toBe('info');
  });

  it('marca Pendiente de cobro cuando saldoPendiente > 0', () => {
    const result = buildPatientStatus({ ...baseInput, saldoPendiente: 150.5 });
    expect(result.status).toBe('pendiente_cobro');
    expect(result.severity).toBe('critical');
    expect(result.suggestedAction).toBeDefined();
  });

  it('acepta saldoPendiente como string numerico', () => {
    const result = buildPatientStatus({ ...baseInput, saldoPendiente: '90.00' });
    expect(result.status).toBe('pendiente_cobro');
  });

  it('Pendiente de cobro tiene prioridad sobre laboratorio pendiente', () => {
    const result = buildPatientStatus({
      ...baseInput,
      saldoPendiente: 50,
      laboratorio: [makeLaboratorio()],
    });
    expect(result.status).toBe('pendiente_cobro');
  });

  it('Inactivo tiene prioridad sobre saldoPendiente', () => {
    const result = buildPatientStatus({
      ...baseInput,
      paciente: { ...paciente, activo: false },
      saldoPendiente: 100,
    });
    expect(result.status).toBe('inactivo');
  });

  it('marca Pendiente de laboratorio cuando hay trabajo en curso sin recepcion', () => {
    const result = buildPatientStatus({
      ...baseInput,
      laboratorio: [makeLaboratorio()],
    });
    expect(result.status).toBe('pendiente_laboratorio');
    expect(result.severity).toBe('warning');
  });

  it('ignora laboratorio recibido o entregado', () => {
    const result = buildPatientStatus({
      ...baseInput,
      laboratorio: [
        makeLaboratorio({ fecha_recepcion: '2026-05-10' }),
        makeLaboratorio({ id: 'lab-2', estado: 'entregado', fecha_entrega_paciente: '2026-05-10' }),
      ],
    });
    expect(result.status).toBe('activo');
  });

  it('marca Presupuesto aceptado sin cita cuando hay presupuesto aceptado y no hay cita futura', () => {
    const result = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'aceptado',
        lineas: [makeLinea({ aceptado: true })],
      })],
    });
    expect(result.status).toBe('presupuesto_aceptado_sin_cita');
    expect(result.severity).toBe('warning');
  });

  it('si hay presupuesto aceptado Y cita futura, marca En tratamiento', () => {
    const result = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'aceptado',
        lineas: [makeLinea({ aceptado: true })],
      })],
      citas: [makeCita()],
    });
    expect(result.status).toBe('en_tratamiento');
    expect(result.severity).toBe('info');
  });

  it('Pendiente de cita: hay tratamientos pendientes pero ningun presupuesto aceptado y sin cita futura', () => {
    const result = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'borrador',
        lineas: [makeLinea({ pasado_trabajo_pendiente: true })],
      })],
    });
    expect(result.status).toBe('pendiente_cita');
    expect(result.severity).toBe('warning');
  });

  it('Pendiente de presupuesto: hay primera visita en historial pero ningun presupuesto', () => {
    const result = buildPatientStatus({
      ...baseInput,
      historial: [makeHistorial()],
      presupuestos: [],
    });
    expect(result.status).toBe('pendiente_presupuesto');
    expect(result.severity).toBe('info');
  });

  it('Revision vencida: ultima visita hace mas de 12 meses sin cita futura', () => {
    const result = buildPatientStatus({
      ...baseInput,
      historial: [makeHistorial({ fecha: '2025-01-01', estado: 'realizado' })],
    });
    expect(result.status).toBe('revision_vencida');
    expect(result.severity).toBe('warning');
  });

  it('Revision vencida no aplica si hay cita futura programada', () => {
    const result = buildPatientStatus({
      ...baseInput,
      historial: [makeHistorial({ fecha: '2025-01-01' })],
      citas: [makeCita()],
    });
    expect(result.status).not.toBe('revision_vencida');
  });

  it('cita anulada o falta no cuenta como cita futura', () => {
    const result = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'aceptado',
        lineas: [makeLinea({ aceptado: true })],
      })],
      citas: [makeCita({ estado: 'anulada' })],
    });
    expect(result.status).toBe('presupuesto_aceptado_sin_cita');
  });

  it('cita pasada no cuenta como cita futura para En tratamiento', () => {
    const result = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'aceptado',
        lineas: [makeLinea({ aceptado: true })],
      })],
      citas: [makeCita({ fecha_hora: '2026-04-01T10:00:00' })],
    });
    expect(result.status).toBe('presupuesto_aceptado_sin_cita');
  });

  it('siempre incluye label y description no vacios', () => {
    const result = buildPatientStatus(baseInput);
    expect(result.label.length).toBeGreaterThan(0);
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('estados criticos siempre incluyen suggestedAction', () => {
    const cobro = buildPatientStatus({ ...baseInput, saldoPendiente: 50 });
    expect(cobro.suggestedAction).toBeTruthy();

    const sinCita = buildPatientStatus({
      ...baseInput,
      presupuestos: [makePresupuesto({
        estado: 'aceptado',
        lineas: [makeLinea({ aceptado: true })],
      })],
    });
    expect(sinCita.suggestedAction).toBeTruthy();
  });
});
