import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgendaPage from './index';
import type { Cita } from '../../types/api';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'admin', nombre: 'Administrador', rol: 'admin', clinica_id: null },
  }),
}));

const { mocks } = vi.hoisted(() => {
  const paciente = {
    id: 'pac-1',
    num_historial: 91312,
    nombre: 'Cesar',
    apellidos: 'Gutierrez Velez',
    fecha_nacimiento: null,
    telefono: '+34 600 123 456',
    telefono2: null,
    dni_nie: null,
    email: null,
    direccion: null,
    codigo_postal: null,
    ciudad: null,
    provincia: null,
    profesion: null,
    activo: true,
    observaciones: null,
    datos_salud: {},
  };
  const doctor = { id: 'doc-1', nombre: 'Dra. Ruiz', especialidad: null, color_agenda: '#0891a4', activo: true };
  const cita = {
    id: 'cita-new',
    paciente_id: paciente.id,
    doctor_id: doctor.id,
    gabinete_id: null,
    fecha_hora: '2026-05-20T09:00:00',
    duracion_min: 30,
    estado: 'programada',
    es_urgencia: false,
    motivo: 'Endodoncia 36',
    observaciones: '',
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
    paciente: { nombre: paciente.nombre, apellidos: paciente.apellidos, telefono: paciente.telefono },
    doctor: { nombre: doctor.nombre, color_agenda: doctor.color_agenda },
  };
  const trabajoLab = {
    id: 'lab-work-1',
    paciente_id: paciente.id,
    doctor_id: doctor.id,
    laboratorio_id: 'lab-1',
    cita_id: cita.id,
    tratamiento_id: null,
    presupuesto_linea_id: null,
    tipo_trabajo: 'Corona',
    descripcion: 'Corona zirconio 16',
    pieza_dental: 16,
    observaciones: 'Revisar ajuste antes de cementar',
    fecha_salida: '2026-05-15',
    fecha_entrega_prevista: '2026-05-20',
    fecha_recepcion: '2026-05-20',
    fecha_revision: null,
    fecha_entrega_paciente: null,
    ubicacion_clinica: 'Recepcion',
    estado: 'received_in_clinic',
    colocado: false,
    material_enviado: true,
    material_devuelto: false,
    laboratorio: { id: 'lab-1', nombre: 'Lab Dental X', contacto: 'Laura' },
  };
  return {
    mocks: {
      paciente,
      doctor,
      cita,
      trabajoLab,
      buscarHuecosLibres: vi.fn().mockResolvedValue([]),
      createCita: vi.fn(async () => cita),
      getCitas: vi.fn().mockResolvedValue([]),
      getWhatsAppComunicaciones: vi.fn().mockResolvedValue([]),
      updateCita: vi.fn(async (_id: string, patch: object) => ({ ...cita, ...patch })),
      marcarTelefonearReubicada: vi.fn(async () => ({
        id: 'tel-1',
        cita_original_id: 'cita-old',
        paciente_id: paciente.id,
        doctor_id: doctor.id,
        nueva_cita_id: cita.id,
        paciente: { nombre: paciente.nombre, apellidos: paciente.apellidos, telefono: paciente.telefono },
        doctor: { nombre: doctor.nombre, color_agenda: doctor.color_agenda },
        motivo: 'Reprogramar cirugía',
        notas: null,
        estado_contacto: 'cita_dada',
        ultimo_intento_at: '2026-05-20T09:00:00',
        proximo_intento_at: null,
        reubicada: true,
      })),
    },
  };
});

vi.mock('../../lib/api', () => ({
  buscarHuecosLibres: mocks.buscarHuecosLibres,
  cancelarCitaAvanzada: vi.fn(),
  confirmarCita: vi.fn(),
  createCita: mocks.createCita,
  createPaciente: vi.fn(),
  enviarRecordatorioCita: vi.fn(),
  getCitas: mocks.getCitas,
  getDoctores: vi.fn().mockResolvedValue([mocks.doctor]),
  getHorarios: vi.fn().mockResolvedValue(Array.from({ length: 7 }, (_, dia) => ({
    id: `hor-${dia}`,
    doctor_id: mocks.doctor.id,
    dia_semana: dia,
    tipo_dia: 'laborable',
    bloques: [{ inicio: '09:00', fin: '10:00' }],
    intervalo_min: 30,
  }))),
  getPacientes: vi.fn().mockResolvedValue([mocks.paciente]),
  getTelefonear: vi.fn().mockResolvedValue([{
    id: 'tel-1',
    cita_original_id: 'cita-old',
    paciente_id: mocks.paciente.id,
    doctor_id: mocks.doctor.id,
    nueva_cita_id: null,
    paciente: { nombre: mocks.paciente.nombre, apellidos: mocks.paciente.apellidos, telefono: mocks.paciente.telefono },
    doctor: { nombre: mocks.doctor.nombre, color_agenda: mocks.doctor.color_agenda },
    motivo: 'Reprogramar cirugía',
    notas: null,
    estado_contacto: 'pendiente',
    ultimo_intento_at: null,
    proximo_intento_at: null,
    reubicada: false,
  }]),
  marcarFaltaCita: vi.fn(),
  marcarTelefonearReubicada: mocks.marcarTelefonearReubicada,
  getWhatsAppComunicaciones: mocks.getWhatsAppComunicaciones,
  updateCita: mocks.updateCita,
}));

function renderAgenda() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgendaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('AgendaPage flujos de cita', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.buscarHuecosLibres.mockClear();
    mocks.createCita.mockClear();
    mocks.getCitas.mockReset();
    mocks.getCitas.mockResolvedValue([]);
    mocks.getWhatsAppComunicaciones.mockReset();
    mocks.getWhatsAppComunicaciones.mockResolvedValue([]);
    mocks.updateCita.mockClear();
    mocks.marcarTelefonearReubicada.mockClear();
  });

  it('muestra resumen operativo del dia y busca huecos al abrir el modal', async () => {
    const user = userEvent.setup();
    renderAgenda();

    expect(await screen.findByLabelText(/Resumen operativo de agenda/i)).toHaveTextContent('Huecos visibles');

    await user.click(screen.getByRole('button', { name: /^Buscar hueco$/i }));

    await waitFor(() => expect(mocks.buscarHuecosLibres).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Buscar hueco libre/i)).toBeInTheDocument();
  });

  it('no duplica el filtro activo ni estados equivalentes en agenda', async () => {
    renderAgenda();

    const toolbar = await screen.findByLabelText(/Filtros y acciones de agenda/i);
    expect(within(toolbar).getAllByText('Todas las agendas')).toHaveLength(1);
    expect(within(toolbar).getByText('Resumen')).toBeInTheDocument();

    const legend = await screen.findByLabelText(/Leyenda de estados de cita/i);
    expect(within(legend).getAllByText('Sin confirmar')).toHaveLength(1);
    expect(within(legend).getAllByText('Confirmada')).toHaveLength(1);
    expect(within(legend).getAllByText('Mensaje enviado')).toHaveLength(1);
  });

  it('muestra laboratorio en la tarjeta y en el detalle rapido de cita', async () => {
    const user = userEvent.setup();
    mocks.getCitas.mockResolvedValueOnce([
      {
        ...mocks.cita,
        motivo: 'Prueba corona',
        laboratorio: [mocks.trabajoLab],
      },
    ]);

    renderAgenda();

    expect(await screen.findByText(/Lab: Corona zirconio 16/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Resumen laboratorio agenda/i)).toHaveTextContent('Trabajos de laboratorio hoy1');

    await user.click(screen.getByText('Cesar Gutierrez Velez'));

    expect(await screen.findByLabelText(/Laboratorio asociado a la cita/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Lab Dental X/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recibido en clinica, pendiente de revisar/i).length).toBeGreaterThan(0);
  });

  it('filtra citas con laboratorio o motivo compatible con laboratorio', async () => {
    const user = userEvent.setup();
    mocks.getCitas.mockResolvedValueOnce([
      {
        ...mocks.cita,
        id: 'cita-lab',
        fecha_hora: '2026-05-20T09:00:00',
        motivo: 'Prueba corona',
        laboratorio: [mocks.trabajoLab],
      },
      {
        ...mocks.cita,
        id: 'cita-normal',
        fecha_hora: '2026-05-20T09:30:00',
        motivo: 'Revision general',
        laboratorio: [],
      },
    ]);

    renderAgenda();

    expect(await screen.findByText('Prueba corona')).toBeInTheDocument();
    expect(screen.getByText('Revision general')).toBeInTheDocument();

    const toolbar = screen.getByLabelText(/Filtros y acciones de agenda/i);
    await user.click(within(toolbar).getByRole('button', { name: /Citas con laboratorio/i }));

    expect(screen.getByText('Prueba corona')).toBeInTheDocument();
    expect(screen.queryByText('Revision general')).not.toBeInTheDocument();
  });

  it('abre nueva cita desde Pacientes con paciente y tratamiento precargados y llama a createCita', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.setItem('dentcore_selected_patient_id', mocks.paciente.id);
    sessionStorage.setItem('dentcore_selected_treatment', 'Endodoncia 36');
    sessionStorage.setItem('dentcore_selected_presupuesto_linea_id', 'linea-pres-36');

    renderAgenda();

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tratamiento previsto/i)).toHaveValue('Endodoncia 36');

    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledTimes(1));
    expect(mocks.createCita).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: mocks.paciente.id,
      doctor_id: mocks.doctor.id,
      presupuesto_linea_id: 'linea-pres-36',
      motivo: 'Endodoncia 36',
    }));
    expect(sessionStorage.getItem('dentcore_selected_treatment')).toBeNull();
    expect(sessionStorage.getItem('dentcore_selected_presupuesto_linea_id')).toBeNull();
  });

  it('cambia el estado de cita con botones rapidos sin guardar automaticamente', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.setItem('dentcore_selected_patient_id', mocks.paciente.id);

    renderAgenda();

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Estado/i })).not.toBeInTheDocument();

    const statusGroup = screen.getByRole('group', { name: /Estado de la cita/i });
    const confirmedButton = within(statusGroup).getByRole('button', { name: 'Confirmada' });

    await user.click(confirmedButton);

    expect(confirmedButton).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.createCita).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.updateCita).toHaveBeenCalledWith('cita-new', expect.objectContaining({
      estado: 'confirmada',
    })));
  });

  it('mantiene En tratamiento compatible con el estado backend de paciente en clinica', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.setItem('dentcore_selected_patient_id', mocks.paciente.id);

    renderAgenda();

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();

    const statusGroup = screen.getByRole('group', { name: /Estado de la cita/i });
    await user.click(within(statusGroup).getByRole('button', { name: 'En tratamiento' }));
    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledWith(expect.objectContaining({
      observaciones: expect.stringContaining('En tratamiento'),
    })));
    await waitFor(() => expect(mocks.updateCita).toHaveBeenCalledWith('cita-new', expect.objectContaining({
      estado: 'en_clinica',
    })));
  });

  it('muestra el historial WhatsApp asociado al editar una cita', async () => {
    const user = userEvent.setup();
    mocks.getCitas.mockResolvedValueOnce([mocks.cita]);
    mocks.getWhatsAppComunicaciones.mockResolvedValueOnce([
      {
        id: 'wa-1',
        clinica_id: null,
        patient_id: mocks.paciente.id,
        appointment_id: mocks.cita.id,
        direction: 'outbound',
        phone: mocks.paciente.telefono,
        message_body: 'Hola Cesar, le recordamos su cita.',
        received_at: null,
        sent_at: '2026-05-20T08:30:00',
        interpreted_intent: null,
        processed: true,
        provider_message_id: null,
        idempotency_key: null,
        raw_payload: null,
        created_at: '2026-05-20T08:30:00',
        patient: { id: mocks.paciente.id, nombre: mocks.paciente.nombre, apellidos: mocks.paciente.apellidos, num_historial: mocks.paciente.num_historial },
        appointment: { id: mocks.cita.id, fecha_hora: mocks.cita.fecha_hora, estado: 'reminder_sent', motivo: mocks.cita.motivo, doctor_nombre: mocks.doctor.nombre, doctor_id: mocks.doctor.id, gabinete_id: null, duracion_min: 30 },
      },
      {
        id: 'wa-2',
        clinica_id: null,
        patient_id: mocks.paciente.id,
        appointment_id: mocks.cita.id,
        direction: 'inbound',
        phone: mocks.paciente.telefono,
        message_body: 'confirmo',
        received_at: '2026-05-20T08:35:00',
        sent_at: null,
        interpreted_intent: 'affirmative',
        processed: true,
        provider_message_id: 'wamid-1',
        idempotency_key: 'inbound:provider:wamid-1',
        raw_payload: null,
        created_at: '2026-05-20T08:35:00',
        patient: { id: mocks.paciente.id, nombre: mocks.paciente.nombre, apellidos: mocks.paciente.apellidos, num_historial: mocks.paciente.num_historial },
        appointment: { id: mocks.cita.id, fecha_hora: mocks.cita.fecha_hora, estado: 'confirmed', motivo: mocks.cita.motivo, doctor_nombre: mocks.doctor.nombre, doctor_id: mocks.doctor.id, gabinete_id: null, duracion_min: 30 },
      },
    ]);

    renderAgenda();

    await user.click(await screen.findByText('Cesar Gutierrez Velez'));

    expect(await screen.findByLabelText(/Historial WhatsApp de la cita/i)).toBeInTheDocument();
    expect(await screen.findByText('Hola Cesar, le recordamos su cita.')).toBeInTheDocument();
    expect(screen.getByText('confirmo')).toBeInTheDocument();
    expect(mocks.getWhatsAppComunicaciones).toHaveBeenCalledWith({ appointment_id: mocks.cita.id, limit: 6 });
  });

  it('al arrastrar Telefonear a un hueco crea cita real y marca la entrada como reubicada', async () => {
    const user = userEvent.setup();
    const { container } = renderAgenda();
    const data = new Map<string, string>();

    const row = (await screen.findByText('Reprogramar cirugía')).closest('tr');
    expect(row).toBeTruthy();
    fireEvent.dragStart(row as HTMLTableRowElement, {
      dataTransfer: {
        setData: (type: string, value: string) => data.set(type, value),
        getData: (type: string) => data.get(type) ?? '',
      },
    });

    const slot = await waitFor(() => {
      const target = container.querySelector('.agenda-slot-content');
      expect(target).toBeTruthy();
      return target as HTMLElement;
    });
    fireEvent.drop(slot, {
      dataTransfer: { getData: (type: string) => data.get(type) ?? '' },
    });

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tratamiento previsto/i)).toHaveValue('Reprogramar cirugía');

    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.marcarTelefonearReubicada).toHaveBeenCalledWith('tel-1', 'cita-new'));
  });

  it('permite dar cita desde el boton de Telefonear y persiste la cita', async () => {
    const user = userEvent.setup();
    renderAgenda();

    await user.click(await screen.findByRole('button', { name: /Dar cita/i }));

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tratamiento previsto/i)).toHaveValue('Reprogramar cirugía');

    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: mocks.paciente.id,
      doctor_id: mocks.doctor.id,
      motivo: 'Reprogramar cirugía',
    })));
    await waitFor(() => expect(mocks.marcarTelefonearReubicada).toHaveBeenCalledWith('tel-1', 'cita-new'));
  });

  it('tras crear cita invalida citas-paciente para que Ficha vea la nueva cita', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('dentcore_agenda_action', 'new');
    sessionStorage.setItem('dentcore_selected_patient_id', mocks.paciente.id);

    const { queryClient } = renderAgenda();
    // Simula que Ficha ya cargo la lista de citas del paciente.
    queryClient.setQueryData<Cita[]>(['citas-paciente', mocks.paciente.id], []);
    expect(queryClient.getQueryState(['citas-paciente', mocks.paciente.id])?.isInvalidated).toBe(false);

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(queryClient.getQueryState(['citas-paciente', mocks.paciente.id])?.isInvalidated).toBe(true),
    );
  });
});
