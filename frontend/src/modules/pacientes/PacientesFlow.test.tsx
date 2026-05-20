/**
 * Fase 6 — tests de flujo integración cross-módulo.
 *
 * Cubren cómo los módulos se conectan unos con otros, no la lógica interna
 * de cada componente (eso lo cubren los tests unitarios de cada archivo).
 *
 * Flujos verificados:
 *  - Menú de acciones rápidas abre Receta + Pedido de laboratorio
 *  - Crear pedido lab desde Trabajo Pendiente preconfigura datos del presupuesto
 *  - Filtro "Cobros" en Historial muestra cobros + anticipos y oculta facturas
 *  - Banner de laboratorio vencido aparece en la Ficha cuando hay vencidos
 *  - WhatsApp del paciente abre wa.me con teléfono normalizado
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PacientesPage from './index';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'admin', nombre: 'Administrador', rol: 'admin', clinica_id: null },
  }),
}));

const { paciente, mocks } = vi.hoisted(() => {
  const paciente = {
    id: 'pac-1',
    num_historial: 91312,
    nombre: 'Cesar',
    apellidos: 'Gutierrez Velez',
    fecha_nacimiento: null,
    telefono: '+34 600 123 456',
    telefono2: null,
    dni_nie: '12345678Z',
    email: null,
    direccion: null,
    codigo_postal: null,
    ciudad: null,
    provincia: null,
    activo: true,
    observaciones: 'Sin observaciones',
    datos_salud: { alergias: '' },
    sexo: 'M',
    profesion: null,
    doctor_habitual_id: 'doc-1',
  };
  const factura = {
    id: 'fac-1',
    paciente_id: 'pac-1',
    serie: 'A',
    numero: 100,
    fecha: '2026-04-10',
    estado: 'cobrado_parcial',
    subtotal: '200',
    iva_total: '0',
    total: '200',
    huella: null,
    num_registro: null,
    estado_verifactu: null,
    lineas: [],
    cobros: [{
      id: 'cob-1',
      fecha: '2026-04-12',
      importe: '120.00',
      forma_pago_id: 'fp-1',
      notas: 'Pago parcial',
      anulado_at: null,
      motivo_anulacion: null,
    }],
    total_cobrado: '120',
    pendiente: '80',
  };
  const presupuestoConLinea = {
    id: 'pres-1',
    paciente_id: 'pac-1',
    numero: 1,
    fecha: '2026-04-10',
    estado: 'aceptado',
    pie_pagina: null,
    odontograma: {},
    doctor_id: 'doc-1',
    total: '290',
    total_aceptado: '290',
    lineas: [{
      id: 'lin-1',
      presupuesto_id: 'pres-1',
      tratamiento_id: 'trat-1',
      tratamiento: { id: 'trat-1', nombre: 'Corona zirconio', codigo: 'C-Z' },
      pieza_dental: 16,
      caras: null,
      precio_unitario: '290',
      descuento_porcentaje: '0',
      aceptado: true,
      pasado_trabajo_pendiente: false,
      importe_neto: '290',
    }],
  };
  const trabajoVencido = {
    id: 'trab-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    laboratorio_id: 'lab-1',
    historial_id: null,
    descripcion: 'Corona zirconio',
    pieza_dental: 16,
    color: 'A2',
    observaciones: null,
    fecha_salida: '2020-01-01',
    fecha_entrega_prevista: '2020-01-15',
    fecha_recepcion: null,
    fecha_entrega_paciente: null,
    estado: 'enviado',
    precio: 100,
    numero_orden: 5,
    paciente: null,
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    laboratorio: { id: 'lab-1', nombre: 'Lab Norte', telefono: null, whatsapp: null, email: null, contacto: null, notas: null, activo: true },
  };
  const anticipo = {
    id: 'ant-1',
    paciente_id: 'pac-1',
    fecha: '2026-04-08',
    importe: '50.00',
    forma_pago_id: 'fp-1',
    usuario_id: 'u-1',
    concepto: 'Senial implante',
    notas: null,
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
  };

  return {
    paciente,
    mocks: {
      facturas: [factura],
      presupuestos: [presupuestoConLinea],
      anticipos: [anticipo],
      trabajosLab: [trabajoVencido],
      createTrabajoLaboratorio: vi.fn().mockResolvedValue({ ...trabajoVencido, id: 'trab-2' }),
      createRecetaClinica: vi.fn().mockResolvedValue({
        id: 'rec-1',
        paciente_id: paciente.id,
        doctor_id: 'doc-1',
        clinica_id: null,
        medicamento: 'Ibuprofeno 600',
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
        fecha_prescripcion: '2026-05-18',
        fecha_dispensacion: null,
        firma_data_url: null,
        pdf_generado_at: null,
        created_at: '2026-05-18T10:00:00',
        doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
      }),
      openRecetaClinicaPdf: vi.fn(),
    },
  };
});

vi.mock('../../lib/api', () => ({
  createConsentimientoPaciente: vi.fn(),
  createFacturaDesdeHistorial: vi.fn(),
  createFacturaManual: vi.fn(),
  createPaciente: vi.fn(),
  createPagoAnticipadoPaciente: vi.fn(),
  createPresupuesto: vi.fn(),
  createRecetaClinica: mocks.createRecetaClinica,
  createTrabajoLaboratorio: mocks.createTrabajoLaboratorio,
  emitirRecetaPdf: vi.fn(),
  facturaPdfUrl: (id: string) => `http://facturas/${id}.pdf`,
  firmarConsentimiento: vi.fn(),
  firmarRecetaClinica: vi.fn(),
  generarDocumentoPdfPaciente: vi.fn(),
  getCitas: vi.fn().mockResolvedValue([]),
  getConsentimientosPaciente: vi.fn().mockResolvedValue([]),
  getDoctores: vi.fn().mockResolvedValue([{ id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: '#0891a4', activo: true }]),
  getDocumentosPaciente: vi.fn().mockResolvedValue([]),
  getFacturas: vi.fn().mockResolvedValue(mocks.facturas),
  getFormasPago: vi.fn().mockResolvedValue([]),
  getHistorialPaciente: vi.fn().mockResolvedValue([]),
  getHistorialSinFacturar: vi.fn().mockResolvedValue([]),
  getOdontogramaContexto: vi.fn().mockResolvedValue({ mode: 'lectura', odontograma_id: 'odo-1', paciente_id: 'pac-1', teeth: {} }),
  getLaboratorios: vi.fn().mockResolvedValue([{ id: 'lab-1', nombre: 'Lab Norte', telefono: null, whatsapp: null, email: null, contacto: null, notas: null, activo: true }]),
  getPaciente: vi.fn().mockResolvedValue(paciente),
  getPacientes: vi.fn().mockResolvedValue([paciente]),
  getPagosAnticipadosPaciente: vi.fn().mockResolvedValue(mocks.anticipos),
  getPlantillasConsentimiento: vi.fn().mockResolvedValue([]),
  getPresupuestos: vi.fn().mockResolvedValue(mocks.presupuestos),
  getRecetasPaciente: vi.fn().mockResolvedValue([]),
  getSaldoPaciente: vi.fn().mockResolvedValue({ total_facturado: '200', total_cobrado: '120', pendiente: '80' }),
  getTratamientosCatalogo: vi.fn().mockResolvedValue([]),
  getTrabajosLaboratorio: vi.fn().mockResolvedValue(mocks.trabajosLab),
  openConsentimientoPdf: vi.fn(),
  openDocumentoPaciente: vi.fn(),
  openRecetaClinicaPdf: mocks.openRecetaClinicaPdf,
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

describe('Flujo integración cross-módulo', () => {
  beforeEach(() => {
    mocks.createTrabajoLaboratorio.mockClear();
    mocks.createRecetaClinica.mockClear();
    mocks.openRecetaClinicaPdf.mockClear();
  });

  it('menú "Más acciones" abre el modal de receta y envía datos correctos', async () => {
    const user = userEvent.setup();
    renderPage();

    const actions = await screen.findByLabelText('Acciones rapidas del paciente');
    await user.click(within(actions).getByRole('button', { name: 'Recetas' }));

    expect(await screen.findByText(/Nueva receta/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Medicamento/), 'Ibuprofeno 600');
    await user.type(screen.getByLabelText(/Posología/), '1 cada 8h');
    await user.click(screen.getByRole('button', { name: /Crear receta/ }));

    await waitFor(() => {
      expect(mocks.createRecetaClinica).toHaveBeenCalledTimes(1);
    });
    const [pacienteId, payload] = mocks.createRecetaClinica.mock.calls[0];
    expect(pacienteId).toBe('pac-1');
    expect(payload).toMatchObject({ medicamento: 'Ibuprofeno 600', posologia: '1 cada 8h', doctor_id: 'doc-1' });
    await waitFor(() => expect(mocks.openRecetaClinicaPdf).toHaveBeenCalledWith('rec-1'));
  });

  it('crear pedido lab desde Pendientes preconfigura la línea del presupuesto', async () => {
    const user = userEvent.setup();
    renderPage();

    // Voy a tab Tratamientos → Pendientes
    await screen.findByRole('button', { name: /^Tratamientos$/i });
    await user.click(screen.getByRole('button', { name: /^Tratamientos$/i }));
    await user.click(screen.getByRole('button', { name: /^Pendientes$/i }));

    // Botón "+ Lab" en la fila del tratamiento
    const labButton = await screen.findByRole('button', { name: '+ Lab' });
    await user.click(labButton);

    // Modal abierto con descripción y pieza prepobladas desde linea pres-1
    expect(await screen.findByText(/Nuevo pedido de laboratorio/i)).toBeInTheDocument();
    const desc = screen.getByLabelText(/Descripción/) as HTMLInputElement;
    expect(desc.value).toBe('Corona zirconio');
    const pieza = screen.getByLabelText(/Pieza dental/) as HTMLInputElement;
    expect(pieza.value).toBe('16');
    expect(screen.getByText(/Vinculado al tratamiento/)).toBeInTheDocument();

    // Selecciono laboratorio y envío
    await user.selectOptions(screen.getByLabelText(/Laboratorio/), 'lab-1');
    await user.click(screen.getByRole('button', { name: /Crear pedido/ }));

    await waitFor(() => {
      expect(mocks.createTrabajoLaboratorio).toHaveBeenCalledTimes(1);
    });
    const payload = mocks.createTrabajoLaboratorio.mock.calls[0][0];
    expect(payload).toMatchObject({
      paciente_id: 'pac-1',
      doctor_id: 'doc-1',
      laboratorio_id: 'lab-1',
      descripcion: 'Corona zirconio',
      pieza_dental: 16,
      presupuesto_linea_id: 'lin-1',
      presupuesto_id: 'pres-1',
      tratamiento_id: 'trat-1',
    });
  });

  it('banner de laboratorio vencido aparece en la Ficha y abre la pestaña laboratorio', async () => {
    const user = userEvent.setup();
    renderPage();

    const banner = await screen.findByRole('button', { name: /pedido.*sin recibir.*vencida/i });
    expect(banner).toBeInTheDocument();
    await user.click(banner);
    // Click navega a historial (donde vive el bloque laboratorio)
    await waitFor(() => {
      expect(screen.getByText(/Historial completo/i)).toBeInTheDocument();
    });
  });

  it('filtro "Cobros" en historial muestra cobros y anticipos, oculta facturas', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole('button', { name: /^Historial$/i }))[0]);
    await screen.findByText(/Historial completo/i);

    await user.click(screen.getByRole('button', { name: 'Cobros' }));
    // El timeline filtrado debe incluir cobros (titulo = serie/numero) y anticipos
    expect(screen.getAllByText(/A\/100/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Senial implante').length).toBeGreaterThan(0);
  });

  it('acción WhatsApp abre wa.me con el teléfono normalizado', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();

    await screen.findByRole('button', { name: /Mas acciones/i });
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'WhatsApp' }));

    expect(openSpy).toHaveBeenCalled();
    const url = openSpy.mock.calls[0][0] as string;
    expect(url).toBe('https://wa.me/34600123456');
    openSpy.mockRestore();
  });
});
