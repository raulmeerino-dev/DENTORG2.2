import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  return {
    mocks: {
      paciente,
      doctor,
      cita,
      buscarHuecosLibres: vi.fn().mockResolvedValue([]),
      createCita: vi.fn(async () => cita),
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
  getCitas: vi.fn().mockResolvedValue([]),
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
  iniciarVideoConsulta: vi.fn(),
  marcarFaltaCita: vi.fn(),
  marcarTelefonearReubicada: mocks.marcarTelefonearReubicada,
  updateCita: vi.fn(async (_id: string, patch: object) => ({ ...mocks.cita, ...patch })),
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

  it('abre nueva cita desde Pacientes con paciente y tratamiento precargados y llama a createCita', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('dentorg_agenda_action', 'new');
    sessionStorage.setItem('dentorg_selected_patient_id', mocks.paciente.id);
    sessionStorage.setItem('dentorg_selected_treatment', 'Endodoncia 36');

    renderAgenda();

    expect(await screen.findByText('Nueva cita')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tratamiento previsto/i)).toHaveValue('Endodoncia 36');

    await user.click(screen.getByRole('button', { name: /Guardar cita/i }));

    await waitFor(() => expect(mocks.createCita).toHaveBeenCalledTimes(1));
    expect(mocks.createCita).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: mocks.paciente.id,
      doctor_id: mocks.doctor.id,
      motivo: 'Endodoncia 36',
    }));
    expect(sessionStorage.getItem('dentorg_selected_treatment')).toBeNull();
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
    sessionStorage.setItem('dentorg_agenda_action', 'new');
    sessionStorage.setItem('dentorg_selected_patient_id', mocks.paciente.id);

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
