import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HoyPage from './index';
import type { Cita } from '../../types/api';

const { mocks } = vi.hoisted(() => {
  const baseCita = {
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    duracion_min: 30,
    es_urgencia: false,
    motivo: 'Revision',
    observaciones: null,
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
    paciente: { nombre: 'Paula', apellidos: 'Portal', telefono: '600000001' },
    doctor: { nombre: 'Dra. Ruiz', color_agenda: '#0f89b8' },
  } satisfies Omit<Cita, 'id' | 'fecha_hora' | 'estado'>;
  return {
    mocks: {
      cambio: { ...baseCita, id: 'cita-cambio', fecha_hora: '2026-06-17T10:00:00', estado: 'reschedule_requested' } as Cita,
      enClinica: { ...baseCita, id: 'cita-clinica', fecha_hora: '2026-06-17T09:30:00', estado: 'en_clinica' } as Cita,
    },
  };
});

vi.mock('../../lib/api', () => ({
  confirmarCita: vi.fn(),
  enviarRecordatorioCita: vi.fn(),
  getCitas: vi.fn(async () => [mocks.cambio, mocks.enClinica]),
  getReportDashboard: vi.fn(async () => ({
    alertas: {
      citas_sin_confirmar: 0,
      pacientes_en_clinica: 1,
      faltas_periodo: 0,
      deuda_pendiente: 120,
      presupuestos_pendientes: 2,
    },
  })),
  getTelefonear: vi.fn(async () => []),
  getWhatsAppComunicaciones: vi.fn(async () => []),
  updateCita: vi.fn(async (_id: string, patch: Partial<Cita>) => ({ ...mocks.enClinica, ...patch })),
}));

function renderHoy() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HoyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HoyPage flujo operativo', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('muestra solicitudes de cambio y prepara foco de agenda al reubicar', async () => {
    const user = userEvent.setup();
    renderHoy();

    const board = await screen.findByLabelText(/Trabajo operativo de hoy/i);
    await waitFor(() => {
      expect(board).toHaveTextContent('Cambios solicitados');
      expect(board).toHaveTextContent('1');
    });

    await user.click(screen.getByRole('button', { name: /^Reubicar$/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem('dentorg_agenda_focus_cita_id')).toBe('cita-cambio');
      expect(sessionStorage.getItem('dentorg_agenda_focus_date')).toBe('2026-06-17');
    });
  });
});
