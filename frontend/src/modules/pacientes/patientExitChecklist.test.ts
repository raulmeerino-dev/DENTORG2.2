import { describe, expect, it } from 'vitest';
import type {
  ApiPaciente,
  Cita,
  Consentimiento,
  DocumentoPaciente,
  HistorialClinico,
  Presupuesto,
  RecetaClinica,
  TrabajoLaboratorio,
} from '../../types/api';
import { buildPatientExitChecklist } from './patientExitChecklist';

const today = '2026-05-21';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '600123456',
  activo: true,
};

const citaFutura: Cita = {
  id: 'cita-1',
  paciente_id: paciente.id,
  doctor_id: 'doc-1',
  gabinete_id: null,
  fecha_hora: '2026-05-28T10:00:00',
  duracion_min: 30,
  estado: 'programada',
  motivo: 'Revision',
};

const historialHoy: HistorialClinico = {
  id: 'hist-1',
  paciente_id: paciente.id,
  tratamiento_id: 'trat-1',
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 36,
  caras: 'O',
  fecha: today,
  diagnostico: null,
  procedimiento: 'Endodoncia',
  observaciones: 'Sesion completada',
  estado: 'realizado',
  importe: '120.00',
  factura_id: 'fac-1',
  origen: 'manual',
  presupuesto_linea_id: null,
  cita_id: null,
  tratamiento: { id: 'trat-1', nombre: 'Endodoncia', codigo: 'END' },
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
};

const baseInput = {
  paciente,
  today,
  citas: [citaFutura],
  historial: [historialHoy],
  presupuestos: [],
  consentimientos: [],
  recetas: [],
  laboratorio: [],
  documentos: [],
  saldoPendiente: 0,
};

function item(id: string, overrides = {}) {
  const checklist = buildPatientExitChecklist({ ...baseInput, ...overrides });
  const found = checklist.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`No item found for ${id}`);
  return found;
}

describe('buildPatientExitChecklist', () => {
  it('saldo pendiente genera critical y accion de caja', () => {
    const caja = item('caja', { saldoPendiente: 80 });
    expect(caja.status).toBe('critical');
    expect(caja.description).toContain('80,00 €');
    expect(caja.actionTarget).toBe('caja');
  });

  it('consentimiento pendiente genera warning', () => {
    const pendiente: Consentimiento = {
      id: 'cons-1',
      paciente_id: paciente.id,
      clinica_id: null,
      plantilla_id: null,
      tratamiento_id: null,
      doctor_id: null,
      historial_id: null,
      documento_id: null,
      tipo: 'Endodoncia',
      estado: 'pendiente_firma',
      fecha_firma: today,
      firmado_at: null,
      documento_path: null,
      plantilla_version: null,
      version_plantilla: null,
      hash_documento: null,
      revocado: false,
      fecha_revocacion: null,
      motivo_revocacion: null,
      created_at: `${today}T09:00:00`,
    };

    const consentimientos = item('consentimientos', { consentimientos: [pendiente] });
    expect(consentimientos.status).toBe('warning');
    expect(consentimientos.actionTarget).toBe('consentimiento');
  });

  it('sin proxima cita genera warning', () => {
    const proxima = item('proxima-cita', { citas: [] });
    expect(proxima.status).toBe('warning');
    expect(proxima.actionTarget).toBe('agenda');
  });

  it('receta creada hoy genera info con accion preparada', () => {
    const receta: RecetaClinica = {
      id: 'rec-1',
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      clinica_id: null,
      medicamento: 'Ibuprofeno',
      principio_activo: null,
      forma_farmaceutica: null,
      via_administracion: null,
      unidades: null,
      duracion: null,
      posologia: '1 cada 8h',
      pauta: null,
      diagnostico: null,
      instrucciones_paciente: null,
      instrucciones_farmacia: null,
      fecha_prescripcion: today,
      fecha_dispensacion: null,
      firma_data_url: null,
      pdf_generado_at: null,
      created_at: `${today}T10:00:00`,
      doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    };

    const recetas = item('recetas', { recetas: [receta] });
    expect(recetas.status).toBe('info');
    expect(recetas.actionTarget).toBe('receta');
  });

  it('laboratorio pendiente genera warning', () => {
    const trabajo: TrabajoLaboratorio = {
      id: 'lab-job-1',
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      laboratorio_id: 'lab-1',
      historial_id: null,
      descripcion: 'Corona zirconio',
      pieza_dental: 24,
      color: null,
      observaciones: null,
      fecha_salida: today,
      fecha_entrega_prevista: '2026-05-25',
      fecha_recepcion: null,
      fecha_entrega_paciente: null,
      estado: 'enviado',
      precio: null,
      paciente: null,
      doctor: null,
      laboratorio: null,
    };

    const laboratorio = item('laboratorio', { laboratorio: [trabajo] });
    expect(laboratorio.status).toBe('warning');
    expect(laboratorio.actionTarget).toBe('laboratorio');
  });

  it('documento añadido hoy genera info', () => {
    const documento: DocumentoPaciente = {
      id: 'doc-1',
      paciente_id: paciente.id,
      nombre_original: 'rx.pdf',
      mime_type: 'application/pdf',
      tamano_bytes: 120,
      categoria: 'radiografia',
      descripcion: 'Radiografia control',
      fecha_documento: today,
      tratamiento_id: null,
      historial_id: null,
      doctor_id: null,
      etiquetas: null,
      created_at: `${today}T12:00:00`,
    };

    const documentos = item('documentos', { documentos: [documento] });
    expect(documentos.status).toBe('info');
    expect(documentos.actionTarget).toBe('documentos');
  });

  it('todo correcto devuelve salida lista', () => {
    const checklist = buildPatientExitChecklist(baseInput);
    expect(checklist.ready).toBe(true);
    expect(checklist.title).toBe('Salida lista');
    expect(checklist.items.some((entry) => entry.status === 'critical' || entry.status === 'warning')).toBe(false);
  });

  it('funciona con arrays nulos o vacios', () => {
    const checklist = buildPatientExitChecklist({
      paciente,
      today,
      citas: null,
      historial: null,
      presupuestos: null,
      consentimientos: null,
      recetas: null,
      laboratorio: null,
      documentos: null,
      saldoPendiente: null,
    });
    expect(checklist.items.length).toBeGreaterThan(0);
    expect(checklist.items.find((entry) => entry.id === 'proxima-cita')?.status).toBe('warning');
  });

  it('presupuesto aceptado sin cita explica que falta programar pendiente', () => {
    const presupuesto: Presupuesto = {
      id: 'pres-1',
      paciente_id: paciente.id,
      numero: 4,
      fecha: today,
      estado: 'aceptado',
      pie_pagina: null,
      odontograma: { teeth: {} },
      doctor_id: 'doc-1',
      total: '90.00',
      total_aceptado: '90.00',
      lineas: [{
        id: 'lin-1',
        presupuesto_id: 'pres-1',
        tratamiento_id: 'trat-1',
        tratamiento: { id: 'trat-1', nombre: 'Obturacion', codigo: 'OBT' },
        pieza_dental: 16,
        caras: 'O',
        precio_unitario: '90.00',
        descuento_porcentaje: '0',
        aceptado: true,
        pasado_trabajo_pendiente: true,
        importe_neto: '90.00',
      }],
    };

    const proxima = item('proxima-cita', { citas: [], presupuestos: [presupuesto], historial: [] });
    expect(proxima.description).toMatch(/tratamiento.*aceptado/i);
  });
});
