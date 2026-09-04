import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StaffClockPopover from './StaffClockPopover';

const apiMocks = vi.hoisted(() => ({
  getTrabajadoresFichaje: vi.fn(),
  getUltimoFichajeTrabajador: vi.fn(),
  registrarFichaje: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  getApiErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
  getTrabajadoresFichaje: apiMocks.getTrabajadoresFichaje,
  getUltimoFichajeTrabajador: apiMocks.getUltimoFichajeTrabajador,
  registrarFichaje: apiMocks.registrarFichaje,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

function renderClock(currentUserId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StaffClockPopover label="jue, 25 jun 12:00" currentUserId={currentUserId} />
    </QueryClientProvider>,
  );
}

describe('StaffClockPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTrabajadoresFichaje.mockResolvedValue([
      {
        id: 'worker-1',
        nombre: 'Dra. Test',
        origen: 'usuario',
        codigo: 'dra.test',
        rol: 'doctor',
        clinica_id: null,
        pin_configurado: true,
      },
    ]);
    apiMocks.getUltimoFichajeTrabajador.mockResolvedValue(null);
    apiMocks.registrarFichaje.mockResolvedValue({
      fichaje: {
        id: 'fichaje-1',
        trabajador_id: 'worker-1',
        trabajador_origen: 'usuario',
        trabajador_nombre: 'Dra. Test',
        clinica_id: null,
        fecha: '2026-06-25',
        hora_exacta: '2026-06-25T10:00:00Z',
        tipo: 'entrada',
        equipo: 'Recepcion',
        ip_address: null,
        user_agent: null,
        registrado_por_usuario_id: 'user-1',
      },
      ultimo_fichaje: null,
    });
  });

  it('registra entrada desde el reloj con trabajador y PIN', async () => {
    const user = userEvent.setup();
    renderClock();

    await user.click(screen.getByRole('button', { name: /Fichaje/i }));
    expect(await screen.findByRole('dialog', { name: 'Fichaje' })).toBeInTheDocument();
    expect(await screen.findByText('Dra. Test')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Contraseña del trabajador'), '1234');
    await user.click(screen.getByRole('button', { name: /Registrar entrada/i }));

    await waitFor(() => {
      expect(apiMocks.registrarFichaje).toHaveBeenCalledWith({
        trabajador_id: 'worker-1',
        pin: '1234',
        tipo: 'entrada',
      });
    });
  });

  it('permite al usuario autenticado fichar directamente sin pedir otra credencial', async () => {
    const user = userEvent.setup();
    renderClock('worker-1');

    await user.click(screen.getByRole('button', { name: /Fichaje/i }));
    expect(await screen.findByText('Dra. Test')).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar entrada/i }));

    await waitFor(() => {
      expect(apiMocks.registrarFichaje).toHaveBeenCalledWith({
        trabajador_id: 'worker-1',
        pin: '',
        tipo: 'entrada',
      });
    });
  });
});
