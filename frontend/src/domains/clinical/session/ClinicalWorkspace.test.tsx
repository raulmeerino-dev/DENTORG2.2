import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act,render as renderView,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe,expect,it,vi } from 'vitest';
import type { ApiPaciente,Cita,Consentimiento,DocumentoPaciente,HistorialClinico,NotaDental,NotaDentalCreateInput,Presupuesto,RecetaClinica,SesionClinicaItem,SesionClinicaItemCreateInput,SesionClinicaItemUpdateInput,TrabajoLaboratorio,TrabajoPendiente,TratamientoCatalogo } from '../../../api/types';
import { ClinicalWorkspace } from './ClinicalWorkspace';

vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: () => <div data-testid="odontogram-flow" />,
  mapSurfaceToCaras: () => 'O',
}));

function render(ui: ReactNode) { return renderView(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>); }

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

const trabajoPendiente: TrabajoPendiente = {
  id: 'tp-1',
  paciente_id: paciente.id,
  presupuesto_linea_id: presupuesto.lineas[0].id,
  presupuesto_linea: presupuesto.lineas[0],
  tratamiento_id: tratamiento.id,
  tratamiento: presupuesto.lineas[0].tratamiento,
  pieza_dental: 16,
  caras: 'MOD',
  realizado: false,
  historial_id: null,
};

function buildSesionItem(overrides: Partial<SesionClinicaItem> = {}): SesionClinicaItem {
  return {
    id: 'sesion-1',
    paciente_id: paciente.id,
    clinica_id: null,
    doctor_id: 'doc-1',
    tratamiento_id: tratamiento.id,
    presupuesto_linea_id: 'lin-1',
    cita_id: null,
    historial_id: null,
    titulo: tratamiento.nombre,
    pieza_dental: 16,
    caras: 'MOD',
    observaciones: null,
    estado: 'planificado',
    origen: 'presupuesto_linea',
    orden: 0,
    tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    ...overrides,
  };
}

type RenderClinicalOptions = {
  citas?: Cita[];
  initialSesionItems?: SesionClinicaItem[];
  presupuestos?: Presupuesto[];
  trabajosPendientes?: TrabajoPendiente[];
  onOpenPresupuestos?: () => void;
  onCreateSesionItem?: (input: SesionClinicaItemCreateInput) => Promise<SesionClinicaItem>;
  onUpdateSesionItem?: (itemId: string, cambios: SesionClinicaItemUpdateInput) => Promise<SesionClinicaItem>;
  onDeleteSesionItem?: (itemId: string) => Promise<unknown>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

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
  options: RenderClinicalOptions = {},
) {
  const onCreateSesionItem = options.onCreateSesionItem ?? vi.fn(async (input: SesionClinicaItemCreateInput) => buildSesionItem({
    id: `sesion-new-${Math.random().toString(36).slice(2, 8)}`,
    tratamiento_id: input.tratamiento_id ?? null,
    presupuesto_linea_id: input.presupuesto_linea_id ?? null,
    cita_id: input.cita_id ?? null,
    titulo: input.titulo ?? null,
    pieza_dental: input.pieza_dental ?? null,
    caras: input.caras ?? null,
    observaciones: input.observaciones ?? null,
    estado: input.estado ?? 'planificado',
    origen: input.origen ?? 'manual',
  }));
  const onUpdateSesionItem = options.onUpdateSesionItem ?? vi.fn(async (itemId: string, cambios: SesionClinicaItemUpdateInput) => buildSesionItem({
    id: itemId,
    titulo: cambios.titulo ?? tratamiento.nombre,
    pieza_dental: cambios.pieza_dental ?? 16,
    caras: cambios.caras ?? 'MOD',
    observaciones: cambios.observaciones ?? null,
    estado: cambios.estado ?? 'planificado',
  }));
  const onDeleteSesionItem = options.onDeleteSesionItem ?? vi.fn(async () => undefined);
  const onOpenPresupuestos = options.onOpenPresupuestos ?? vi.fn();
  render(
    <ClinicalWorkspace
      activeTab="sesion"
      onTabChange={vi.fn()}
      paciente={paciente}
      citas={options.citas ?? []}
      historial={[]}
      presupuestos={options.presupuestos ?? [presupuesto]}
      trabajosPendientes={options.trabajosPendientes ?? [trabajoPendiente]}
      trabajosPendientesLoading={false}
      trabajosPendientesError={null}
      documentos={[]}
      consentimientos={[]}
      recetas={[]}
      notasDentales={[]}
      laboratorio={[]}
      saldoPendiente={0}
      doctorId="doc-1"
      doctores={[{ id: 'doc-1', nombre: 'Dra. Ruiz', activo: true, color_agenda: null }]}
      tratamientos={[tratamiento]}
      savingPrimeraVisita={false}
      onSavePrimeraVisita={vi.fn()}
      onDarCita={vi.fn()}
      onContextLinea={vi.fn()}
      onCrearPedidoLab={vi.fn()}
      onCrearPedidoLabGeneral={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenConsentimiento={vi.fn()}
      onOpenDocumentos={vi.fn()}
      onOpenPresupuestos={onOpenPresupuestos}
      onOpenHistorial={vi.fn()}
      onFinalizarTratamientoSesion={onFinalizar}
      onCreateNotaDental={onCreateNotaDental}
      sesionItems={options.initialSesionItems ?? []}
      sesionItemsLoading={false}
      sesionItemsError={null}
      onCreateSesionItem={onCreateSesionItem}
      onUpdateSesionItem={onUpdateSesionItem}
      onDeleteSesionItem={onDeleteSesionItem}
      userRole="admin"
    />,
  );
  return { onFinalizar, onCreateNotaDental, onCreateSesionItem, onUpdateSesionItem, onDeleteSesionItem, onOpenPresupuestos };
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
      trabajosPendientes={[]}
      trabajosPendientesLoading={false}
      trabajosPendientesError={null}
      documentos={overrides.documentos ?? []}
      consentimientos={overrides.consentimientos ?? []}
      recetas={overrides.recetas ?? []}
      notasDentales={[]}
      laboratorio={overrides.laboratorio ?? []}
      saldoPendiente={0}
      doctorId="doc-1"
      doctores={[{ id: 'doc-1', nombre: 'Dra. Ruiz', activo: true, color_agenda: null }]}
      tratamientos={[tratamiento]}
      savingPrimeraVisita={false}
      onSavePrimeraVisita={vi.fn()}
      onDarCita={vi.fn()}
      onContextLinea={vi.fn()}
      onCrearPedidoLab={vi.fn()}
      onCrearPedidoLabGeneral={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenConsentimiento={vi.fn()}
      onOpenDocumentos={vi.fn()}
      onOpenPresupuestos={vi.fn()}
      onOpenHistorial={onOpenHistorial}
      onFinalizarTratamientoSesion={vi.fn()}
      onCreateNotaDental={vi.fn()}
      sesionItems={[]}
      sesionItemsLoading={false}
      sesionItemsError={null}
      onCreateSesionItem={vi.fn()}
      onUpdateSesionItem={vi.fn()}
      onDeleteSesionItem={vi.fn()}
      userRole="admin"
    />,
  );
  return { onOpenHistorial };
}

describe('ClinicalWorkspace sesion actual', () => {
  it('muestra los aceptados antiguos sin preparación manual', async () => {
    const legacyBudget: Presupuesto = {
      ...presupuesto,
      lineas: [{ ...presupuesto.lineas[0], pasado_trabajo_pendiente: false }],
    };
    const { onOpenPresupuestos } = renderClinical(undefined, undefined, {
      presupuestos: [legacyBudget],
      trabajosPendientes: [],
    });

    expect(await screen.findByRole('list', { name: 'Tratamientos de la sesión' })).toHaveTextContent('Corona zirconio');
    expect(screen.queryByText(/por preparar/i)).not.toBeInTheDocument();
    expect(onOpenPresupuestos).not.toHaveBeenCalled();
  });

  it('abre el registro directo desde una sesión vacía', async () => {
    const user = userEvent.setup();
    renderClinical(undefined, undefined, { presupuestos: [], trabajosPendientes: [] });

    expect(screen.getByText('Sesión sin tratamientos')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Añadir tratamiento realizado/i })[0]);
    expect(screen.getByRole('dialog', { name: 'Añadir tratamiento realizado' })).toBeInTheDocument();
  });

  it('registra un realizado manual sin presupuesto y conserva el profesional contextual', async () => {
    const user = userEvent.setup();
    const { onFinalizar, onCreateSesionItem } = renderClinical(undefined, undefined, { presupuestos: [], trabajosPendientes: [] });
    await user.click(screen.getAllByRole('button', { name: 'Añadir tratamiento realizado' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Añadir tratamiento realizado' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Tratamiento' }), 'corona');
    await user.click(within(dialog).getByRole('option', { name: /Corona zirconio/ }));
    await user.type(within(dialog).getByLabelText('Pieza FDI'), '24');
    await user.type(within(dialog).getByLabelText('Superficies'), 'O');
    await user.clear(within(dialog).getByLabelText('Importe (€)'));
    await user.type(within(dialog).getByLabelText('Importe (€)'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar tratamiento realizado' }));
    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(onCreateSesionItem).toHaveBeenCalledWith(expect.objectContaining({ doctor_id: 'doc-1', origen: 'manual' }));
    expect(onFinalizar).toHaveBeenCalledWith(expect.objectContaining({ paciente_id: paciente.id, doctor_id: 'doc-1', pieza_dental: 24, caras: 'O', importe: 0, origen: 'manual' }));
    expect(onFinalizar).not.toHaveBeenCalledWith(expect.objectContaining({ presupuesto_linea_id: expect.any(String) }));
  });

  it('muestra solo las secciones clinicas principales sin Notas / docs', () => {
    renderClinical();

    expect(screen.getByRole('button', { name: 'Pendientes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sesión actual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visitas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notas / docs' })).not.toBeInTheDocument();
  });

  it('finaliza un pendiente aceptado guardando observacion, pieza/caras y vinculo a presupuesto_linea', async () => {
    const user = userEvent.setup();
    const { onFinalizar, onCreateSesionItem, onUpdateSesionItem } = renderClinical();

    expect((await screen.findAllByText('Corona zirconio')).length).toBeGreaterThan(0);
    await user.clear(screen.getByLabelText(/Observacion clinica del tratamiento/i));
    await user.type(screen.getByLabelText(/Observacion clinica del tratamiento/i), 'Preparacion y provisional colocado');
    await user.click(screen.getByRole('button', { name: /Finalizar como realizado/i }));

    // La sesion se materializa al primer onBlur de observaciones (origen='presupuesto_linea').
    await waitFor(() => expect(onCreateSesionItem).toHaveBeenCalled());
    expect(onCreateSesionItem).toHaveBeenCalledWith(expect.objectContaining({
      presupuesto_linea_id: 'lin-1',
      origen: 'presupuesto_linea',
    }));
    // El PATCH persiste la observacion antes de finalizar.
    await waitFor(() => expect(onUpdateSesionItem).toHaveBeenCalled());
    expect(onUpdateSesionItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ observaciones: 'Preparacion y provisional colocado' }),
    );

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(onFinalizar).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: paciente.id,
      tratamiento_id: tratamiento.id,
      doctor_id: 'doc-1',
      presupuesto_linea_id: 'lin-1',
      pieza_dental: 16,
      caras: 'MOD',
      origen: 'presupuesto_linea',
      sesion_item_id: expect.any(String),
    }));
    expect(await screen.findByText('En historial')).toBeInTheDocument();
  });

  it('persiste la sesion al refrescar: items entregados como prop se renderizan sin trabajo local', async () => {
    const persisted: SesionClinicaItem = {
      id: 'sesion-persist-1',
      paciente_id: paciente.id,
      clinica_id: null,
      doctor_id: 'doc-1',
      tratamiento_id: tratamiento.id,
      presupuesto_linea_id: null,
      cita_id: null,
      historial_id: null,
      titulo: 'Empaste manual pieza 24',
      pieza_dental: 24,
      caras: 'MOD',
      observaciones: 'Anestesia infiltrativa',
      estado: 'en_curso',
      origen: 'manual',
      orden: 0,
      tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
      doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    };
    renderClinical(undefined, undefined, { initialSesionItems: [persisted] });

    expect((await screen.findAllByText('Empaste manual pieza 24')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pieza 24/).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Anestesia infiltrativa')).toBeInTheDocument();
  });

  it('al pulsar Eliminar de sesion sobre un item persistido llama al backend', async () => {
    const user = userEvent.setup();
    const persisted: SesionClinicaItem = {
      id: 'sesion-del-1',
      paciente_id: paciente.id,
      clinica_id: null,
      doctor_id: 'doc-1',
      tratamiento_id: tratamiento.id,
      presupuesto_linea_id: null,
      cita_id: null,
      historial_id: null,
      titulo: 'Item a borrar',
      pieza_dental: null,
      caras: null,
      observaciones: null,
      estado: 'planificado',
      origen: 'manual',
      orden: 0,
      tratamiento: null,
      doctor: null,
    };
    const onDelete = vi.fn(async () => undefined);
    renderClinical(undefined, undefined, { initialSesionItems: [persisted], onDeleteSesionItem: onDelete });

    await user.click(await screen.findByRole('button', { name: /Eliminar de sesion/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('sesion-del-1'));
  });

  it('muestra error accionable y NO marca como guardado cuando finalizar falla por red', async () => {
    const user = userEvent.setup();
    const failingFinalize = vi.fn(async () => {
      throw new Error('Backend no conectado (ERR_NETWORK). Verifica que el backend este ejecutandose en http://127.0.0.1:8011/api.');
    });
    renderClinical(failingFinalize);

    expect((await screen.findAllByText('Corona zirconio')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Finalizar como realizado/i }));

    await waitFor(() => expect(failingFinalize).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Backend no conectado/i);
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
      plantilla_id: null,
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
      prescriptor_nombre: null,
      prescriptor_num_colegiado: null,
      prescriptor_colegio: null,
      prescriptor_provincia: null,
      prescriptor_especialidad: null,
      prescriptor_nif: null,
      fecha_prescripcion: '2026-05-20',
      fecha_dispensacion: null,
      estado: 'emitida_local',
      provider_mode: 'disabled',
      external_id: null,
      provider_status: null,
      provider_error: null,
      verification_code: null,
      pdf_documento_id: null,
      pdf_path: null,
      pdf_hash_sha256: null,
      firma_data_url: null,
      pdf_generado_at: null,
      emitida_at: null,
      enviada_proveedor_at: null,
      certificada_at: null,
      rechazada_at: null,
      anulada_at: null,
      dispensada_at: null,
      certificada_real: false,
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

    await user.click(screen.getByRole('button', { name: /Abrir visita/i }));
    expect(onOpenHistorial).toHaveBeenCalledWith(visitaCita.id);
  });
});

describe('Cierre de visita y guardados de sesión', () => {
  const activeVisit = { ...visitaCita, estado: 'en_atencion', estado_operativo: 'en_atencion' } as Cita;

  it('espera todos los guardados concurrentes y conserva campos editados', async () => {
    const user = userEvent.setup();
    const first = deferred<SesionClinicaItem>();
    const second = deferred<SesionClinicaItem>();
    const onUpdate = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderClinical(undefined, undefined, { initialSesionItems: [buildSesionItem()], citas: [activeVisit], onUpdateSesionItem: onUpdate });
    const finish = screen.getByRole('button', { name: /^Finalizar visita$/i });
    const name = screen.getByLabelText('Nombre en sesion');
    await user.clear(name);
    await user.type(name, 'Corona revisada');
    expect(finish).toBeDisabled();
    await user.tab();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const notes = screen.getByLabelText('Observacion clinica del tratamiento');
    await user.type(notes, 'Control preparado');
    await user.tab();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve(buildSesionItem({ titulo: 'Corona revisada' })));
    expect(finish).toBeDisabled();
    expect(notes).toHaveValue('Control preparado');
    await act(async () => second.resolve(buildSesionItem({ observaciones: 'Control preparado' })));
    await waitFor(() => expect(finish).toBeEnabled());
    expect(name).toHaveValue('Corona revisada');
  });

  it('un guardado fallido mantiene la visita abierta hasta reintentar el campo', async () => {
    const user = userEvent.setup();
    const write = deferred<SesionClinicaItem>();
    const onUpdate = vi.fn().mockReturnValueOnce(write.promise).mockResolvedValueOnce(buildSesionItem({ titulo: 'Corona revisada' }));
    renderClinical(undefined, undefined, { initialSesionItems: [buildSesionItem()], citas: [activeVisit], onUpdateSesionItem: onUpdate });
    const name = screen.getByLabelText('Nombre en sesion');
    await user.clear(name);
    await user.type(name, 'Corona revisada');
    await user.tab();
    await act(async () => write.reject(new Error('Error al guardar la sesión')));
    expect(screen.getByRole('button', { name: /^Finalizar visita$/i })).toBeDisabled();
    expect(screen.getByText('Error al guardar la sesión')).toBeInTheDocument();
    await user.click(name);
    await user.tab();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Finalizar visita$/i })).toBeEnabled());
  });

  it('bloquea finalizar mientras se crea el tratamiento del catálogo', async () => {
    const user = userEvent.setup();
    const create = deferred<SesionClinicaItem>();
    const onCreate = vi.fn(() => create.promise);
    renderClinical(undefined, undefined, { initialSesionItems: [buildSesionItem()], citas: [activeVisit], onCreateSesionItem: onCreate });
    await user.click(screen.getByRole('button', { name: /^Planificar tratamiento$/i }));
    expect(screen.getByRole('button', { name: /^Añadir a sesión$/i })).toBeDisabled();
    await user.type(screen.getByRole('combobox', { name: 'Planificar tratamiento' }), 'corona');
    await user.keyboard('{ArrowDown}{Enter}');
    await user.click(screen.getByRole('button', { name: /^Añadir a sesión$/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^Finalizar visita$/i })).toBeDisabled();
    await act(async () => create.resolve(buildSesionItem({ id: 'new-treatment', estado: 'en_curso' })));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Finalizar visita$/i })).toBeEnabled());
  });

  it('planifica un concepto manual sin crear un tratamiento del catálogo ni registrar un realizado', async () => {
    const user = userEvent.setup();
    const { onCreateSesionItem, onFinalizar } = renderClinical(undefined, undefined, { presupuestos: [], trabajosPendientes: [] });
    await user.click(screen.getByRole('button', { name: /^Planificar tratamiento$/i }));
    await user.type(screen.getByRole('combobox', { name: 'Planificar tratamiento' }), 'Control personalizado');
    expect(screen.getByRole('button', { name: 'Añadir a sesión' })).toBeDisabled();
    expect(onCreateSesionItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /como concepto manual/ }));
    await user.click(screen.getByRole('button', { name: 'Añadir a sesión' }));
    await waitFor(() => expect(onCreateSesionItem).toHaveBeenCalledWith(expect.objectContaining({ tratamiento_id: null, titulo: 'Control personalizado', origen: 'manual' })));
    expect(onFinalizar).not.toHaveBeenCalled();
  });
});
