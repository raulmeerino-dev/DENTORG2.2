import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PacientesPage from './index';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'admin', nombre: 'Administrador', rol: 'admin', clinica_id: null },
  }),
}));

const { paciente, createPresupuestoMock, getPresupuestosMock, resetPresupuestos } = vi.hoisted(() => {
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
  const getPresupuestosMock = vi.fn(async () => presupuestosStore);
  return {
  paciente: {
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
  },
    createPresupuestoMock,
    getPresupuestosMock,
    resetPresupuestos,
  };
});

vi.mock('../../lib/api', () => ({
  createConsentimientoPaciente: vi.fn(),
  createFacturaDesdeHistorial: vi.fn(),
  createFacturaManual: vi.fn(),
  createPaciente: vi.fn(),
  createNotaDental: vi.fn(),
  createPagoAnticipadoPaciente: vi.fn(),
  createPresupuesto: createPresupuestoMock,
  createRecetaClinica: vi.fn(),
  createTrabajoLaboratorio: vi.fn(),
  emitirRecetaPdf: vi.fn(),
  facturaPdfUrl: (id: string) => `http://facturas/${id}.pdf`,
  finalizarTratamientoSesion: vi.fn(),
  firmarConsentimiento: vi.fn(),
  firmarRecetaClinica: vi.fn(),
  generarDocumentoPdfPaciente: vi.fn(),
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
  getDoctores: vi.fn().mockResolvedValue([{ id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: '#0891a4', activo: true }]),
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
  getHistorialSinFacturar: vi.fn().mockResolvedValue([]),
  getOdontogramaContexto: vi.fn().mockResolvedValue({ mode: 'lectura', odontograma_id: 'odo-1', paciente_id: 'pac-1', teeth: {} }),
  getNotasDentalesPaciente: vi.fn().mockResolvedValue([]),
  getPaciente: vi.fn().mockResolvedValue(paciente),
  getPacientes: vi.fn().mockResolvedValue([paciente]),
  getPagosAnticipadosPaciente: vi.fn().mockResolvedValue([]),
  getPlantillasConsentimiento: vi.fn().mockResolvedValue([]),
  getLaboratorios: vi.fn().mockResolvedValue([{ id: 'lab-1', nombre: 'Lab Norte', telefono: null, whatsapp: null, email: null, contacto: null, notas: null, activo: true }]),
  getPresupuestos: getPresupuestosMock,
  getRecetasPaciente: vi.fn().mockResolvedValue([]),
  getSaldoPaciente: vi.fn().mockResolvedValue({ total_facturado: '60.00', total_cobrado: '0.00', pendiente: '60.00' }),
  getTratamientosCatalogo: vi.fn().mockResolvedValue([]),
  getTrabajosLaboratorio: vi.fn().mockResolvedValue([]),
  openConsentimientoPdf: vi.fn(),
  openDocumentoPaciente: vi.fn(),
  openRecetaClinicaPdf: vi.fn(),
  registrarCobro: vi.fn(),
  revocarConsentimiento: vi.fn(),
  updatePagoAnticipadoPaciente: vi.fn(),
  updatePaciente: vi.fn(),
  updatePresupuestoLinea: vi.fn(),
  updateTrabajoLaboratorio: vi.fn(),
  uploadDocumentoPaciente: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PacientesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PacientesPage structure', () => {
  beforeEach(() => {
    resetPresupuestos();
    createPresupuestoMock.mockClear();
    getPresupuestosMock.mockClear();
  });

  it('uses four main tabs and keeps documents inside ficha', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /^Ficha$/i });
    expect(screen.getAllByRole('button', { name: /^Ficha$/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Presupuestos$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Clinica$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Historial$/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Documentos$/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/Resumen odontograma/i)).toBeInTheDocument();
    expect(screen.getByTestId('mini-odontogram')).toBeInTheDocument();
    expect(screen.queryByText(/Odontograma actual/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver detalle en Clinica/i }));
    expect(await screen.findByText(/Odontograma base/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Ficha$/i }));
    expect(await screen.findByText(/Documentos y consentimientos/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Ver todos/i })[0]);
    expect(await screen.findByText(/Documentos del paciente/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pieza seleccionada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Documentos por pieza/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('rx-control.pdf').length).toBeGreaterThan(0);
  }, 10_000);

  it('shows clinical subtabs and complete history filters', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /^Clinica$/i });
    await user.click(screen.getByRole('button', { name: /^Clinica$/i }));
    expect(screen.getByRole('button', { name: /^Diagnostico$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pendientes$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sesion actual$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Visitas$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Realizados$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Historial$/i })[0]);
    await waitFor(() => expect(screen.getByText(/Historial completo/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Clinico/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Facturacion/i })).toBeInTheDocument();
    expect(screen.getByText(/Tratamientos realizados en historial/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Limpieza/i).length).toBeGreaterThan(0);
  });

  it('creates a new budget from the visible action and selects it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^Presupuestos$/i }));

    const createButton = await screen.findByRole('button', { name: /Crear nuevo presupuesto/i });
    expect(createButton).toBeInTheDocument();
    await user.click(createButton);

    await waitFor(() => expect(createPresupuestoMock).toHaveBeenCalledWith('pac-1', 'doc-1'));
    await waitFor(() => expect(screen.getByText(/Presupuesto #2/i)).toBeInTheDocument());
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

    await user.click(screen.getByRole('button', { name: /^Presupuestos$/i }));

    expect(await screen.findByText(/Este presupuesto ya esta aceptado/i)).toBeInTheDocument();
    expect(screen.getByText(/Para nuevos tratamientos crea un nuevo presupuesto/i)).toBeInTheDocument();
    expect(screen.getByText(/Total 1100/i)).toBeInTheDocument();
    expect(screen.getByText(/Aceptado 210/i)).toBeInTheDocument();
  });
});
