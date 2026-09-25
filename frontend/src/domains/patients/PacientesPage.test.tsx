import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { act,render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter,useLocation,useNavigate } from 'react-router-dom';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import PacientesPage from './index';

vi.mock('../identity/session/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'admin', nombre: 'Administrador', rol: 'admin', clinica_id: null },
  }),
}));

const { createPresupuestoMock, getPacienteMock, getPacientesMock, getPresupuestosMock, resetPresupuestos, pacientesFixture } = vi.hoisted(() => {
  const basePresupuesto = {
    id: 'pres-1',
    paciente_id: 'pac-1',
    numero: 1,
    fecha: '2026-04-10',
    estado: 'presentado',
    pie_pagina: null,
    odontograma: {},
    doctor_id: 'doc-1',
    lineas: [],
    total: '0.00',
    total_aceptado: '0.00',
  };
  let presupuestosStore = [basePresupuesto];
  const resetPresupuestos = (items = [basePresupuesto]) => {
    presupuestosStore = items.map((item) => ({ ...item }));
  };
  const createPresupuestoMock = vi.fn(async (pacienteId: string, doctorId: string) => {
    const created = {
      ...basePresupuesto,
      id: 'pres-2',
      paciente_id: pacienteId,
      doctor_id: doctorId,
      numero: 2,
      fecha: '2026-05-16',
      estado: 'borrador',
    };
    presupuestosStore = [created, ...presupuestosStore.filter((item) => item.id !== created.id)];
    return created;
  });
  const getPresupuestosMock = vi.fn(async (pacienteId: string) => presupuestosStore.filter((item) => item.paciente_id === pacienteId));
  const paciente = {
    id: 'pac-1',
    num_historial: 91312,
    nombre: 'Cesar',
    apellidos: 'Gutierrez Velez',
    fecha_nacimiento: null,
    telefono: '600000000',
    telefono2: null,
    dni_nie: null,
    email: null,
    direccion: null,
    codigo_postal: null,
    ciudad: null,
    provincia: null,
    activo: true,
    observaciones: 'LIMP cada 6 meses',
    datos_salud: { alergias: 'Sin alergias registradas' },
  };
  const paciente2 = {
    ...paciente,
    id: 'pac-2',
    num_historial: 91313,
    nombre: 'Pilar',
    apellidos: 'Ojeda Calvo',
    telefono: '600000001',
    observaciones: 'Revision implante',
    datos_salud: { alergias: 'Penicilina' },
  };
  const getPacienteMock = vi.fn(async (pacienteId: string) => (pacienteId === paciente2.id ? paciente2 : paciente));
  const getPacientesMock = vi.fn(async () => [paciente, paciente2]);
  return {
    createPresupuestoMock,
    getPacienteMock,
    getPacientesMock,
    getPresupuestosMock,
    resetPresupuestos,
    pacientesFixture: [paciente, paciente2],
  };
});

vi.mock('../../api/consents', () => ({
  createConsentimientoPaciente: vi.fn(),
  firmarConsentimiento: vi.fn(),
  getConsentimientosPaciente: vi.fn().mockResolvedValue([{
    id: 'cons-1',
    paciente_id: 'pac-1',
    clinica_id: null,
    plantilla_id: null,
    tratamiento_id: null,
    doctor_id: null,
    historial_id: null,
    documento_id: null,
    tipo: 'Endodoncia',
    estado: 'pendiente_firma',
    fecha_firma: '2026-04-21',
    firmado_at: null,
    documento_path: null,
    plantilla_version: 'personalizada',
    version_plantilla: null,
    hash_documento: null,
    revocado: false,
    fecha_revocacion: null,
    motivo_revocacion: null,
    created_at: '2026-04-21T10:00:00',
  }]),
  getPlantillasConsentimiento: vi.fn().mockResolvedValue([]),
  openConsentimientoPdf: vi.fn(),
  revocarConsentimiento: vi.fn(),
}));

vi.mock('../../api/billing', () => ({
  createFacturaDesdeHistorial: vi.fn(),
  createFacturaManual: vi.fn(),
  createPagoAnticipadoPaciente: vi.fn(),
  facturaPdfUrl: (id: string) => `http://facturas/${id}.pdf`,
  openFacturaPdf: vi.fn(),
  getFacturas: vi.fn().mockResolvedValue([{
    id: 'fac-1',
    paciente_id: 'pac-1',
    serie: 'A',
    numero: 381,
    fecha: '2026-04-14',
    estado: 'emitida',
    subtotal: '60.00',
    iva_total: '0.00',
    total: '60.00',
    total_cobrado: '0.00',
    pendiente: '60.00',
    lineas: [],
    cobros: [],
  }]),
  getFormasPago: vi.fn().mockResolvedValue([]),
  getHistorialSinFacturar: vi.fn().mockResolvedValue([]),
  getPagosAnticipadosPaciente: vi.fn().mockResolvedValue([]),
  getSaldoPaciente: vi.fn().mockResolvedValue({ total_facturado: '60.00', total_cobrado: '0.00', pendiente: '60.00' }),
  registrarCobro: vi.fn(),
  updatePagoAnticipadoPaciente: vi.fn(),
}));

vi.mock('../../api/patients', () => ({
  createPaciente: vi.fn(),
  getPaciente: getPacienteMock,
  getPacientes: getPacientesMock,
  updatePaciente: vi.fn(),
}));

vi.mock('../../api/clinical', () => ({
  createNotaDental: vi.fn(),
  finalizarTratamientoSesion: vi.fn(),
  getHistorialPaciente: vi.fn().mockResolvedValue([{
    id: 'hist-1',
    paciente_id: 'pac-1',
    fecha: '2026-04-14',
    doctor_id: 'doc-1',
    gabinete_id: null,
    tratamiento_id: 'trat-1',
    pieza_dental: 24,
    caras: 'O',
    diagnostico: 'Control',
    procedimiento: 'Limpieza',
    observaciones: 'Control en 6 meses',
    estado: 'realizado',
    importe: '60.00',
    factura_id: 'fac-1',
    tratamiento: null,
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
  }]),
  getNotasDentalesPaciente: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../api/treatmentPlans', () => ({
  createPresupuesto: createPresupuestoMock,
  openPresupuestoPdf: vi.fn(),
  getPresupuestos: getPresupuestosMock,
  getTrabajosPendientesPaciente: vi.fn().mockResolvedValue([]),
  updatePresupuestoLinea: vi.fn(),
}));

vi.mock('../../api/prescriptions', () => ({
  createRecetaClinica: vi.fn(),
  emitirRecetaLocal: vi.fn(),
  emitirRecetaPdf: vi.fn(),
  enviarRecetaProveedor: vi.fn(),
  firmarRecetaClinica: vi.fn(),
  getRecetaPlantillas: vi.fn().mockResolvedValue([]),
  getRecetaProviderStatus: vi.fn().mockResolvedValue({
    mode: 'disabled',
    provider_available: false,
    real_certification_enabled: false,
    warning: 'Receta no certificada. Modo local/mock o proveedor real no configurado.',
  }),
  getRecetasPaciente: vi.fn().mockResolvedValue([]),
  openRecetaClinicaPdf: vi.fn(),
  importRecetaPlantilla: vi.fn(),
}));

vi.mock('../../api/laboratory', () => ({
  createTrabajoLaboratorio: vi.fn(),
  getLaboratorios: vi.fn().mockResolvedValue([{ id: 'lab-1', nombre: 'Lab Norte', telefono: null, whatsapp: null, email: null, contacto: null, notas: null, activo: true }]),
  getTrabajosLaboratorio: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../api/documents', () => ({
  generarDocumentoPdfPaciente: vi.fn(),
  getDocumentosPaciente: vi.fn().mockResolvedValue([{
    id: 'doc-1',
    paciente_id: 'pac-1',
    nombre_original: 'rx-control.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 123,
    categoria: 'radiografia',
    descripcion: 'Control',
    fecha_documento: '2026-04-20',
    tratamiento_id: null,
    historial_id: null,
    doctor_id: null,
    etiquetas: null,
    created_at: '2026-04-20T10:00:00',
  }]),
  openDocumentoPaciente: vi.fn(),
  uploadDocumentoPaciente: vi.fn(),
}));

vi.mock('../../api/scheduling', () => ({
  getCitas: vi.fn().mockResolvedValue([{
    id: 'cita-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    fecha_hora: '2026-06-01T10:00:00',
    duracion_min: 30,
    estado: 'programada',
    es_urgencia: false,
    motivo: 'Revision',
    observaciones: 'Control',
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
  }]),
}));

vi.mock('../../api/identity', () => ({
  getDoctores: vi.fn().mockResolvedValue([{ id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: '#0891a4', activo: true }]),
}));

vi.mock('../../api/odontogram', () => ({
  getOdontogramaContexto: vi.fn().mockResolvedValue({ mode: 'lectura', odontograma_id: 'odo-1', paciente_id: 'pac-1', teeth: {} }),
}));

vi.mock('../../api/treatmentCatalog', () => ({
  getTratamientosCatalogo: vi.fn().mockResolvedValue([]),
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span data-testid="location-probe">{location.pathname}{location.search}</span><button type="button" onClick={() => navigate('/pacientes?paciente_id=pac-2')}>Abrir paciente B desde navegación global</button></>;
}

function renderPage(initialEntries = ['/pacientes']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const paciente of pacientesFixture) queryClient.setQueryData(['paciente-detalle', paciente.id], paciente);
  queryClient.setQueryData(['pacientes', { q: '', limit: 50, offset: 0 }], pacientesFixture);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LocationProbe />
        <PacientesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PacientesPage structure', () => {
  beforeEach(() => {
    resetPresupuestos();
    createPresupuestoMock.mockClear();
    getPacienteMock.mockClear();
    getPacientesMock.mockClear();
    getPacientesMock.mockImplementation(async () => pacientesFixture);
    getPresupuestosMock.mockClear();
    window.sessionStorage.clear();
  });

  it('mantiene búsqueda y foco mientras llegan resultados de otro filtro', async () => {
    const user = userEvent.setup();
    renderPage(['/pacientes?paciente_id=pac-1']);
    await waitFor(() => expect(getPacientesMock).toHaveBeenCalled());
    let resolveSearch!: (value: typeof pacientesFixture) => void;
    const pendingSearch = new Promise<typeof pacientesFixture>((resolve) => { resolveSearch = resolve; });
    getPacientesMock.mockImplementation(() => pendingSearch);
    const finder = screen.getByRole('textbox', { name: 'Buscar paciente' });
    await user.type(finder, 'Ojeda');
    expect(finder).toHaveFocus();
    expect(finder).toHaveValue('Ojeda');
    expect(screen.getByLabelText('Paciente activo')).toHaveTextContent('91312');
    expect(screen.getByTitle('Cesar Gutierrez Velez')).toBeVisible();
    await act(async () => { resolveSearch(pacientesFixture); await pendingSearch; });
    expect(finder).toHaveFocus();
  });

  it.each(['receta', 'consentimiento', 'presupuesto'] as const)('aísla %s al cambiar de paciente desde navegación global con ambos pacientes en caché', async (task) => {
    const user = userEvent.setup();
    renderPage(['/pacientes?paciente_id=pac-1']);
    if (task === 'presupuesto') {
      await user.click(screen.getByRole('button', { name: /^Presupuestos\s+\d+$/i }));
      await screen.findByRole('region', { name: /^Presupuestos$/i });
    } else {
      await user.click(screen.getByRole('button', { name: /Más acciones del paciente/i }));
      await user.click(screen.getByRole('menuitem', { name: task === 'receta' ? 'Nueva receta' : 'Consentimiento informado' }));
      await user.type(screen.getByRole('textbox', { name: task === 'receta' ? /Medicamento/ : 'Texto del documento' }), 'Borrador exclusivo paciente A');
    }
    await user.click(screen.getByRole('button', { name: 'Abrir paciente B desde navegación global' }));
    expect(screen.getByLabelText('Paciente activo')).toHaveTextContent('91313');
    expect(screen.getByTitle('Pilar Ojeda Calvo')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Nueva receta|Consentimiento informado|^Presupuestos$/ })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Borrador exclusivo paciente A/)).not.toBeInTheDocument();
    if (task !== 'presupuesto') {
      await user.click(screen.getByRole('button', { name: /Más acciones del paciente/i }));
      await user.click(screen.getByRole('menuitem', { name: task === 'receta' ? 'Nueva receta' : 'Consentimiento informado' }));
      expect(screen.getByRole('region', { name: task === 'receta' ? 'Nueva receta' : 'Consentimiento informado' })).toHaveTextContent('Pilar Ojeda Calvo');
      expect(screen.getByRole('textbox', { name: task === 'receta' ? /Medicamento/ : 'Texto del documento' })).not.toHaveValue('Borrador exclusivo paciente A');
    } else {
      await user.click(screen.getByRole('button', { name: /^Presupuestos\s+\d+$/i }));
      await waitFor(() => expect(screen.getByRole('region', { name: /^Presupuestos$/i })).toHaveTextContent('No hay presupuestos'));
    }
  });

  it.each(['receta', 'consentimiento'] as const)('conserva el borrador de %s y una única tarea cuando IA pide abrir presupuestos', async (task) => {
    const user = userEvent.setup();
    renderPage(['/pacientes?paciente_id=pac-1']);
    await user.click(screen.getByRole('button', { name: /Más acciones del paciente/i }));
    await user.click(screen.getByRole('menuitem', { name: task === 'receta' ? 'Nueva receta' : 'Consentimiento informado' }));
    const field = screen.getByRole('textbox', { name: task === 'receta' ? /Medicamento/ : 'Texto del documento' });
    await user.type(field, 'Borrador conservado');
    act(() => window.dispatchEvent(new CustomEvent('dentcore:patient-fast-action', { detail: { action: 'budgets' } })));
    expect(screen.queryByRole('region', { name: /^Presupuestos$/i })).not.toBeInTheDocument();
    expect(field).toHaveValue('Borrador conservado');
    expect(screen.getByRole('heading', { name: task === 'receta' ? 'Nueva receta' : 'Consentimiento informado' })).toHaveFocus();
  });

  it('seleccionar paciente actualiza la URL canonica', async () => {
    const user = userEvent.setup();
    renderPage(['/pacientes']);

    const finder = await screen.findByPlaceholderText(/Buscar paciente/i);
    await user.click(finder);
    await user.click(await screen.findByRole('button', { name: /Ojeda Calvo, Pilar/i }));

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/pacientes?paciente_id=pac-2'));
    expect(window.sessionStorage.getItem('dentcore_selected_patient_id')).toBe('pac-2');
  });

  it('refrescar con paciente_id mantiene ese paciente', async () => {
    renderPage(['/pacientes?paciente_id=pac-2']);

    await waitFor(() => expect(getPacienteMock).toHaveBeenCalledWith('pac-2'));
    await waitFor(() => expect(window.sessionStorage.getItem('dentcore_selected_patient_id')).toBe('pac-2'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/pacientes?paciente_id=pac-2');
  });

  it('sessionStorage obsoleto no gana frente a paciente_id de la URL', async () => {
    window.sessionStorage.setItem('dentcore_selected_patient_id', 'pac-1');
    renderPage(['/pacientes?paciente_id=pac-2']);

    await waitFor(() => expect(getPacienteMock).toHaveBeenCalledWith('pac-2'));
    expect(getPacienteMock).not.toHaveBeenCalledWith('pac-1');
    await waitFor(() => expect(window.sessionStorage.getItem('dentcore_selected_patient_id')).toBe('pac-2'));
  });

  it('uses three main tabs and keeps patient documents in ficha context', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /^Ficha$/i });
    const mainTabs = screen.getByRole('navigation');
    expect(within(mainTabs).getByRole('button', { name: /^Ficha$/i })).toBeInTheDocument();
    expect(within(mainTabs).queryByRole('button', { name: /^Presupuestos$/i })).not.toBeInTheDocument();
    expect(within(mainTabs).getByRole('button', { name: /^Tratamientos$/i })).toBeInTheDocument();
    expect(within(mainTabs).getByRole('button', { name: /^Historial$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Nueva cita$/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Documentos\s+\d+$/i })).toBeInTheDocument();
    expect(await screen.findByText(/Resumen odontograma/i)).toBeInTheDocument();
    expect(screen.getByTestId('mini-odontogram')).toBeInTheDocument();
    expect(screen.queryByText(/Odontograma actual/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver detalle en Tratamientos/i }));
    expect(await screen.findByText(/Odontograma diagnóstico/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a tratamientos' }));
    await user.click(screen.getByRole('button', { name: /^Ficha$/i }));
    expect(await screen.findByText(/Documentos y consentimientos/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Ver todos/i })[0]);
    expect(await screen.findByText(/Documentos del paciente/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pieza seleccionada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Documentos por pieza/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('rx-control.pdf').length).toBeGreaterThan(0);
  }, 10_000);

  it('shows clinical subtabs and opens the complete timeline as the main history view', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /^Tratamientos$/i });
    await user.click(screen.getByRole('button', { name: /^Tratamientos$/i }));
    expect(screen.getByRole('button', { name: /^Diagnóstico$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pendientes$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sesión actual$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Visitas$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Realizados$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Historial$/i })[0]);
    await screen.findByRole('table', { name: 'Cronología del paciente' });
    expect(within(screen.getByRole('navigation', { name: 'Filtros del historial completo' })).getByRole('button', { name: /^Tratamientos$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Facturación' })).toBeInTheDocument();
    expect(screen.getAllByText(/Limpieza/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Tratamientos y facturaci/i }));
    await waitFor(() => expect(screen.getByText(/Historial de tratamientos/i)).toBeInTheDocument());
  });

  it('creates a new budget from the patient action menu and selects it', async () => {
    const user = userEvent.setup();
    renderPage();

    const moreButton = await screen.findByRole('button', { name: /^M[aá]s acciones del paciente$/i });
    await waitFor(() => expect(moreButton).not.toBeDisabled());
    await user.click(moreButton);
    const createButton = await waitFor(() => {
      const enabled = screen
        .getAllByRole('menuitem', { name: /^Nuevo presupuesto$/i })
        .find((button) => !button.hasAttribute('disabled'));
      expect(enabled).toBeTruthy();
      return enabled!;
    });
    await user.click(createButton);

    await waitFor(() => expect(createPresupuestoMock).toHaveBeenCalledWith('pac-1', 'doc-1'));
    expect(await screen.findByRole('region', { name: /^Presupuestos$/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Presupuesto #2/i)).toBeInTheDocument());
    expect(screen.getByTestId('location-probe')).toHaveTextContent('presupuesto_id=pres-2');
    await user.click(screen.getByRole('button', { name: /^#1\s*Presentado/i }));
    expect(await screen.findByText(/Presupuesto #1/i)).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('presupuesto_id=pres-1');
  });

  it('shows a closed budget warning when the active budget is accepted', async () => {
    resetPresupuestos([{
      id: 'pres-accepted',
      paciente_id: 'pac-1',
      numero: 381,
      fecha: '2026-04-14',
      estado: 'aceptado',
      pie_pagina: null,
      odontograma: {},
      doctor_id: 'doc-1',
      lineas: [],
      total: '1100.00',
      total_aceptado: '210.00',
    }]);
    const user = userEvent.setup();
    renderPage();

    const openBudgets = await screen.findByRole('button', { name: /^Presupuestos\s+1$/i });
    await waitFor(() => expect(openBudgets).not.toBeDisabled());
    await user.click(openBudgets);

    expect(await screen.findByText(/Este presupuesto ya esta aceptado/i)).toBeInTheDocument();
    expect(screen.getByText(/Para nuevos tratamientos crea un nuevo presupuesto/i)).toBeInTheDocument();
    expect(screen.getByText(/Total 1100/i)).toBeInTheDocument();
    expect(screen.getByText(/Aceptado 210/i)).toBeInTheDocument();
  });
});
