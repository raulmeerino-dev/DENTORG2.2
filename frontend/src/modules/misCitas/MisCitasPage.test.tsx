import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MisCitasPage from './index';
import type { Cita } from '../../types/api';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-paciente', username: 'paciente', nombre: 'Paciente', rol: 'paciente', paciente_id: 'pac-1' },
  }),
}));

const { mocks } = vi.hoisted(() => {
  const cita: Cita = {
    id: 'cita-1',
    paciente_id: 'pac-1',
    doctor_id: 'doc-1',
    gabinete_id: null,
    fecha_hora: '2026-06-20T09:00:00',
    duracion_min: 30,
    estado: 'confirmada',
    es_urgencia: false,
    motivo: 'Revision',
    observaciones: null,
    recordatorio_enviado: false,
    recordatorio_canal: null,
    recordatorio_estado: null,
    recordatorio_at: null,
    confirmado_at: null,
    motivo_cancelacion: null,
    paciente: { nombre: 'Paula', apellidos: 'Portal', num_historial: 12, telefono: '600000001' },
    doctor: { nombre: 'Dra. Portal', color_agenda: '#0f89b8' },
  };
  return {
    mocks: {
      cita,
      getPortalCitas: vi.fn(async () => [cita]),
      solicitarCambioPortalCita: vi.fn(async () => ({ ...cita, estado: 'reschedule_requested' })),
    },
  };
});

vi.mock('../../lib/api', () => ({
  cancelarPortalCita: vi.fn(),
  confirmarPortalCita: vi.fn(),
  firmarPortalConsentimiento: vi.fn(),
  getPacientes: vi.fn(),
  getPortalCitas: mocks.getPortalCitas,
  getPortalConsentimientos: vi.fn(async () => []),
  getPortalDocumentos: vi.fn(async () => []),
  getPortalMe: vi.fn(async () => ({
    paciente: {
      id: 'pac-1',
      num_historial: 12,
      nombre: 'Paula',
      apellidos: 'Portal',
      telefono: '600000001',
      activo: true,
    },
    resumen: { proximas_citas: 1, documentos: 0, consentimientos_pendientes: 0 },
  })),
  openConsentimientoPdf: vi.fn(),
  openDocumentoPaciente: vi.fn(),
  solicitarCambioPortalCita: mocks.solicitarCambioPortalCita,
}));

function renderPortal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MisCitasPage />
    </QueryClientProvider>,
  );
}

describe('MisCitasPage portal paciente', () => {
  beforeEach(() => {
    mocks.getPortalCitas.mockClear();
    mocks.solicitarCambioPortalCita.mockClear();
  });

  it('solicita cambio sin cancelar la cita desde el portal', async () => {
    const user = userEvent.setup();
    renderPortal();

    expect(await screen.findByText('Confirmada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Solicitar cambio/i }));

    await waitFor(() => expect(mocks.solicitarCambioPortalCita).toHaveBeenCalledWith(
      'cita-1',
      undefined,
      'Solicita cambiar la cita desde portal paciente',
    ));
  });
});
