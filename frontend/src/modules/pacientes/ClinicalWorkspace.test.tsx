import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Cita, Consentimiento, DocumentoPaciente, HistorialClinico, NotaDental, NotaDentalCreateInput, Presupuesto, RecetaClinica, TrabajoLaboratorio, TratamientoCatalogo } from '../../types/api';
import { ClinicalWorkspace } from './ClinicalWorkspace';

vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: () => <div data-testid="odontogram-flow" />,
  mapSurfaceToCaras: () => 'O',
}));

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '+34 600 123 456',
  activo: true,
  observaciones: null,
  datos_salud: {},
};

const tratamiento: TratamientoCatalogo = {
  id: 'trat-1',
  familia_id: 'fam-1',
  familia: null,
  codigo: 'TR001',
  nombre: 'Corona zirconio',
  precio: '320.00',
  iva_porcentaje: '0',
  requiere_pieza: true,
  requiere_caras: true,
  activo: true,
};

const presupuesto: Presupuesto = {
  id: 'pres-1',
  paciente_id: paciente.id,
  numero: 12,
  fecha: '2026-05-20',
  estado: 'aceptado',
  pie_pagina: null,
  odontograma: { teeth: {} },
  doctor_id: 'doc-1',
  total: '320.00',
  total_aceptado: '320.00',
  lineas: [{
    id: 'lin-1',
    presupuesto_id: 'pres-1',
    tratamiento_id: tratamiento.id,
    tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
    pieza_dental: 16,
    caras: 'MOD',
    precio_unitario: '320.00',
    descuento_porcentaje: '0',
    aceptado: true,
    pasado_trabajo_pendiente: true,
    importe_neto: '320.00',
  }],
};

function renderClinical(
  onFinalizar = vi.fn(async () => ({
  id: 'hist-1',
  paciente_id: paciente.id,
  tratamiento_id: tratamiento.id,
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 16,
  caras: 'MOD',
  fecha: '2026-05-20',
  diagnostico: null,
  procedimiento: tratamiento.nombre,
  observaciones: 'Preparacion y provisional colocado',
  estado: 'realizado',
  importe: '320.00',
  factura_id: null,
  origen: 'presupuesto_linea',
  presupuesto_linea_id: 'lin-1',
  cita_id: null,
  tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
} as HistorialClinico)),
  onCreateNotaDental = vi.fn(async (data: NotaDentalCreateInput) => ({
    id: 'nota-1',
    ...data,
    fecha: data.fecha ?? '2026-05-20',
    doctor_id: data.doctor_id ?? null,
    cita_id: data.cita_id ?? null,
    historial_id: data.historial_id ?? null,
    caras: data.caras ?? null,
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
  } as NotaDental)),
) {
  render(
    <ClinicalWorkspace
      activeTab="sesion"
      onTabChange={vi.fn()}
      paciente={paciente}
      citas={[]}
      historial={[]}
      presupuestos={[presupuesto]}
      documentos={[]}
      consentimientos={[]}
      recetas={[]}
      notasDentales={[]}
      plantillas={[]}
      laboratorio={[]}
      saldoPendiente={0}
      doctorId="doc-1"
      tratamientos={[tratamiento]}
      savingPrimeraVisita={false}
      onSavePrimeraVisita={vi.fn()}
      onDarCita={vi.fn()}
      onContextLinea={vi.fn()}
      onCrearPedidoLab={vi.fn()}
      onCrearPedidoLabGeneral={vi.fn()}
      onActualizarTrabajoLab={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenConsentimiento={vi.fn()}
      onOpenConsentimientoPdf={vi.fn()}
      onRevocarConsentimiento={vi.fn()}
      onOpenDocumentos={vi.fn()}
      onOpenHistorial={vi.fn()}
      onFinalizarTratamientoSesion={onFinalizar}
      onCreateNotaDental={onCreateNotaDental}
      userRole="admin"
    />,
  );
  return { onFinalizar, onCreateNotaDental };
}

const visitaCita: Cita = {
  id: 'cita-visita-1',
  paciente_id: paciente.id,
  doctor_id: 'doc-1',
  gabinete_id: 'Gabinete 2',
  fecha_hora: '2026-05-20T10:30:00',
  duracion_min: 45,
  estado: 'atendida',
  motivo: 'Revision endodoncia',
  observaciones: 'Paciente acude con molestias controladas',
  doctor: { nombre: 'Dra. Ruiz', color_agenda: '#0891a4' },
};

const historialVisita: HistorialClinico = {
  id: 'hist-visita-1',
  paciente_id: paciente.id,
  tratamiento_id: tratamiento.id,
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 16,
  caras: 'O',
  fecha: '2026-05-20',
  diagnostico: null,
  procedimiento: 'Obturacion pieza 16',
  observaciones: 'Aislamiento absoluto y control oclusal',
  estado: 'realizado',
  importe: '90.00',
  factura_id: null,
  origen: 'manual',
  presupuesto_linea_id: null,
  cita_id: visitaCita.id,
  tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
};

function renderVisits(overrides: Partial<{
  citas: Cita[];
  historial: HistorialClinico[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas: RecetaClinica[];
  laboratorio: TrabajoLaboratorio[];
}> = {}) {
  const onOpenHistorial = vi.fn();
  render(
    <ClinicalWorkspace
      activeTab="visitas"
      onTabChange={vi.fn()}
      paciente={paciente}
      citas={overrides.citas ?? []}
      historial={overrides.historial ?? []}
      presupuestos={[]}
      documentos={overrides.documentos ?? []}
      consentimientos={overrides.consentimientos ?? []}
      recetas={overrides.recetas ?? []}
      notasDentales={[]}
      plantillas={[]}
      laboratorio={overrides.laboratorio ?? []}
      saldoPendiente={0}
      doctorId="doc-1"
      tratamientos={[tratamiento]}
      savingPrimeraVisita={false}
      onSavePrimeraVisita={vi.fn()}
      onDarCita={vi.fn()}
      onContextLinea={vi.fn()}
      onCrearPedidoLab={vi.fn()}
      onCrearPedidoLabGeneral={vi.fn()}
      onActualizarTrabajoLab={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenConsentimiento={vi.fn()}
      onOpenConsentimientoPdf={vi.fn()}
      onRevocarConsentimiento={vi.fn()}
      onOpenDocumentos={vi.fn()}
      onOpenHistorial={onOpenHistorial}
      onFinalizarTratamientoSesion={vi.fn()}
      onCreateNotaDental={vi.fn()}
      userRole="admin"
    />,
  );
  return { onOpenHistorial };
}

describe('ClinicalWorkspace sesion actual', () => {
  it('finaliza un pendiente aceptado guardando observacion, pieza/caras y vinculo a presupuesto_linea', async () => {
    const user = userEvent.setup();
    const { onFinalizar } = renderClinical();

    expect((await screen.findAllByText('Corona zirconio')).length).toBeGreaterThan(0);
    await user.clear(screen.getByLabelText(/Observacion clinica del tratamiento/i));
    await user.type(screen.getByLabelText(/Observacion clinica del tratamiento/i), 'Preparacion y provisional colocado');
    await user.click(screen.getByRole('button', { name: /Finalizar como realizado/i }));

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(onFinalizar).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: paciente.id,
      tratamiento_id: tratamiento.id,
      doctor_id: 'doc-1',
      presupuesto_linea_id: 'lin-1',
      pieza_dental: 16,
      caras: 'MOD',
      observaciones: 'Preparacion y provisional colocado',
      origen: 'presupuesto_linea',
    }));
    expect(await screen.findByText('En historial')).toBeInTheDocument();
  });

  it('muestra error accionable y NO marca como guardado cuando finalizar falla por red', async () => {
    const user = userEvent.setup();
    const failingFinalize = vi.fn(async () => {
      throw new Error('No se pudo conectar con el servidor (ERR_NETWORK). Verifica que el backend este ejecutandose en http://127.0.0.1:8011/api.');
    });
    renderClinical(failingFinalize);

    expect((await screen.findAllByText('Corona zirconio')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Finalizar como realizado/i }));

    await waitFor(() => expect(failingFinalize).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/No se pudo conectar con el servidor/i);
    expect(screen.queryByText('En historial')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finalizar como realizado/i })).toBeEnabled();
  });

  it('guarda nota rapida asociada a pieza/caras sin usar observacion general del paciente', async () => {
    const user = userEvent.setup();
    const { onCreateNotaDental } = renderClinical();

    await user.type(await screen.findByLabelText(/Nota rapida de pieza/i), 'Sangrado leve en distal');
    await user.click(screen.getByRole('button', { name: /Guardar nota de pieza/i }));

    await waitFor(() => expect(onCreateNotaDental).toHaveBeenCalledTimes(1));
    expect(onCreateNotaDental).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: paciente.id,
      pieza_dental: 16,
      caras: 'MOD',
      texto: 'Sangrado leve en distal',
      doctor_id: 'doc-1',
    }));
  });
});

describe('ClinicalWorkspace visitas', () => {
  it('visita con tratamiento muestra motivo, doctor, gabinete y tratamiento realizado', () => {
    renderVisits({ citas: [visitaCita], historial: [historialVisita] });

    expect(screen.getByText(/Motivo: Revision endodoncia/i)).toBeInTheDocument();
    expect(screen.getByText(/Dra\. Ruiz - Gab\. Gabinete 2 - 45 min/i)).toBeInTheDocument();
    expect(screen.getByText('Obturacion pieza 16')).toBeInTheDocument();
    expect(screen.getByText(/Pieza 16 - O - realizado/i)).toBeInTheDocument();
  });

  it('visita con comentario muestra observaciones clinicas y de cita', () => {
    renderVisits({ citas: [visitaCita], historial: [historialVisita] });

    expect(screen.getByText('Paciente acude con molestias controladas')).toBeInTheDocument();
    expect(screen.getByText('Aislamiento absoluto y control oclusal')).toBeInTheDocument();
  });

  it('visita con receta, documento y laboratorio muestra contadores asociados por fecha', () => {
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
      fecha_prescripcion: '2026-05-20',
      fecha_dispensacion: null,
      firma_data_url: null,
      pdf_generado_at: null,
      created_at: '2026-05-20T11:00:00',
    };
    const documento: DocumentoPaciente = {
      id: 'doc-1',
      paciente_id: paciente.id,
      nombre_original: 'rx-control.pdf',
      mime_type: 'application/pdf',
      tamano_bytes: 200,
      categoria: 'radiografia',
      descripcion: 'Radiografia control',
      fecha_documento: '2026-05-20',
      tratamiento_id: null,
      historial_id: null,
      doctor_id: null,
      etiquetas: null,
      created_at: '2026-05-20T11:05:00',
    };
    const trabajoLab: TrabajoLaboratorio = {
      id: 'lab-1',
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      laboratorio_id: 'lab-1',
      historial_id: null,
      descripcion: 'Corona provisional',
      pieza_dental: 16,
      color: null,
      observaciones: null,
      fecha_salida: '2026-05-20',
      fecha_entrega_prevista: '2026-05-24',
      fecha_recepcion: null,
      fecha_entrega_paciente: null,
      estado: 'enviado',
      precio: null,
      paciente: null,
      doctor: null,
      laboratorio: null,
    };

    renderVisits({ citas: [visitaCita], historial: [historialVisita], recetas: [receta], documentos: [documento], laboratorio: [trabajoLab] });

    expect(screen.getByText('1 docs')).toBeInTheDocument();
    expect(screen.getByText('1 recetas')).toBeInTheDocument();
    expect(screen.getByText('0 consent.')).toBeInTheDocument();
    expect(screen.getByText('1 lab.')).toBeInTheDocument();
    expect(screen.getByText('Ibuprofeno')).toBeInTheDocument();
    expect(screen.getByText('Radiografia control')).toBeInTheDocument();
    expect(screen.getByText('Corona provisional')).toBeInTheDocument();
  });

  it('sin visitas muestra empty state util', () => {
    renderVisits();

    expect(screen.getByText(/Sin visitas registradas/i)).toBeInTheDocument();
    expect(screen.getByText(/Cuando haya citas, tratamientos o documentos con fecha/i)).toBeInTheDocument();
  });

  it('boton de visita abre detalle en Historial', async () => {
    const user = userEvent.setup();
    const { onOpenHistorial } = renderVisits({ citas: [visitaCita], historial: [historialVisita] });

    await user.click(screen.getByRole('button', { name: /Abrir detalle en Historial/i }));
    expect(onOpenHistorial).toHaveBeenCalledTimes(1);
  });
});
