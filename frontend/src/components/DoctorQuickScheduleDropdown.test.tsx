import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorQuickScheduleDropdown from './DoctorQuickScheduleDropdown';
import type { Cita, UsuarioMe } from '../types/api';

const { authState, getCitasMock } = vi.hoisted(() => ({
  authState: {
    user: null as UsuarioMe | null,
  },
  getCitasMock: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
  }),
}));

vi.mock('../lib/api', () => ({
  getCitas: getCitasMock,
}));

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeCita(overrides: Partial<Cita>): Cita {
  const today = localToday();
  return {
    id: 'cita-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    fecha_hora: `${today}T09:30:00`,
    duracion_min: 30,
    estado: 'en_clinica',
    es_urgencia: false,
    motivo: 'Ortodoncia',
    observaciones: '',
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
    paciente: {
      nombre: 'Maria',
      apellidos: 'Lopez',
      telefono: '600000000',
    },
    doctor: { nombre: 'Dra. Ruiz', color_agenda: '#0891a4' },
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderDropdown() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hoy']}>
        <DoctorQuickScheduleDropdown />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DoctorQuickScheduleDropdown', () => {
  beforeEach(() => {
    getCitasMock.mockReset();
    getCitasMock.mockResolvedValue([]);
    authState.user = {
      id: 'user-1',
      username: 'doctor',
      nombre: 'Dra. Ruiz',
      rol: 'doctor',
      doctor_id: 'doc-1',
      clinica_id: null,
    };
  });

  it('no se muestra para usuarios sin rol doctor', () => {
    authState.user = {
      id: 'user-2',
      username: 'recepcion',
      nombre: 'Recepcion',
      rol: 'recepcion',
      doctor_id: null,
      clinica_id: null,
    };

    renderDropdown();

    expect(screen.queryByRole('button', { name: /mi agenda de hoy/i })).not.toBeInTheDocument();
    expect(getCitasMock).not.toHaveBeenCalled();
  });

  it('muestra solo citas activas del doctor conectado', async () => {
    const today = localToday();
    getCitasMock.mockResolvedValue([
      makeCita({ id: 'cita-1', doctor_id: 'doc-1', estado: 'en_clinica', fecha_hora: `${today}T09:30:00` }),
      makeCita({ id: 'cita-2', doctor_id: 'doc-2', paciente: { nombre: 'Luis', apellidos: 'Ramos', telefono: null } }),
      makeCita({ id: 'cita-3', doctor_id: 'doc-1', estado: 'atendida', paciente: { nombre: 'Ana', apellidos: 'Diaz', telefono: null } }),
    ]);
    const user = userEvent.setup();

    renderDropdown();

    await waitFor(() => expect(getCitasMock).toHaveBeenCalledWith({
      doctor_id: 'doc-1',
      fecha_desde: `${today}T00:00:00`,
      fecha_hasta: `${today}T23:59:59`,
    }));

    await user.click(screen.getByRole('button', { name: /mi agenda de hoy/i }));

    expect(await screen.findByText('Maria Lopez')).toBeInTheDocument();
    expect(screen.getByText('Ortodoncia')).toBeInTheDocument();
    expect(screen.getByText(/IN En clinica/i)).toBeInTheDocument();
    expect(screen.queryByText('Luis Ramos')).not.toBeInTheDocument();
    expect(screen.queryByText('Ana Diaz')).not.toBeInTheDocument();
  });

  it('abre la cita en la agenda manteniendo fecha, doctor y cita', async () => {
    const today = localToday();
    getCitasMock.mockResolvedValue([
      makeCita({ id: 'cita-1', doctor_id: 'doc-1', fecha_hora: `${today}T09:30:00` }),
    ]);
    const user = userEvent.setup();

    renderDropdown();

    await user.click(await screen.findByRole('button', { name: /mi agenda de hoy/i }));
    await user.click(await screen.findByRole('button', { name: /ver cita/i }));

    expect(screen.getByLabelText('location')).toHaveTextContent(`/agenda?fecha=${today}&doctor_id=doc-1&cita_id=cita-1`);
  });
});
