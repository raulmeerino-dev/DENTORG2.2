import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminReportes } from './AdminReportes';

vi.mock('../../lib/api', () => ({
  getClinicas: vi.fn().mockResolvedValue([{ id: 'clinica-1', nombre: 'Clinica Dental', direccion: 'Calle', activa: true }]),
  getDoctores: vi.fn().mockResolvedValue([{ id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: '#0891a4', activo: true }]),
  getTratamientosCatalogo: vi.fn().mockResolvedValue([{ id: 'trat-1', nombre: 'Limpieza', precio: '60.00', activo: true }]),
  getReportKpis: vi.fn().mockResolvedValue({
    citas: { total: 10, por_estado: { confirmada: 8, falta: 2 }, asistencia: 8, faltas: 2, anuladas: 0, no_show_rate: 20 },
    pacientes_nuevos: 3,
    facturacion: { num_facturas: 4, total_facturado: 1200, total_cobrado: 900, pendiente: 300, ticket_medio: 300 },
    tratamientos_realizados: 12,
    presupuestos: { total: 5, por_estado: { aceptado: 3, rechazado: 2 }, aceptacion_rate: 60, rechazo_rate: 40 },
  }),
  getReportDashboard: vi.fn().mockResolvedValue({
    periodo: { desde: '2026-05-01', hasta: '2026-05-16' },
    kpis: {
      citas: { total: 10, por_estado: { confirmada: 8, falta: 2 }, asistencia: 8, faltas: 2, anuladas: 0, no_show_rate: 20 },
      pacientes_nuevos: 3,
      facturacion: { num_facturas: 4, total_facturado: 1200, total_cobrado: 900, pendiente: 300, ticket_medio: 300 },
      tratamientos_realizados: 12,
      presupuestos: { total: 5, por_estado: { aceptado: 3, rechazado: 2 }, aceptacion_rate: 60, rechazo_rate: 40 },
    },
    series: { ingresos_mensuales: [{ mes: 5, facturado: 1200, cobrado: 900, num_facturas: 4 }] },
    doctores: [{ doctor_id: 'doc-1', doctor: 'Dra. Ruiz', color: '#0891a4', total: 10, atendidas: 8, faltas: 2, ocupacion_pct: 70 }],
    tratamientos: [{ tratamiento: 'Limpieza', cantidad: 8, importe: 480 }],
    pacientes_deuda: [{ id: 'pac-1', num_historial: 1, nombre: 'Ana', apellidos: 'Garcia', saldo_pendiente: 300 }],
    alertas: { citas_sin_confirmar: 2, pacientes_en_clinica: 1, faltas_periodo: 2, deuda_pendiente: 300, presupuestos_pendientes: 1 },
  }),
  getReportPacientes: vi.fn().mockResolvedValue([]),
  getReportTopTratamientos: vi.fn().mockResolvedValue([{ tratamiento: 'Limpieza', cantidad: 8, importe: 480 }]),
  getReportCitasDoctor: vi.fn().mockResolvedValue([{ doctor_id: 'doc-1', doctor: 'Dra. Ruiz', color: '#0891a4', total: 10, atendidas: 8, faltas: 2, ocupacion_pct: 70 }]),
}));

function renderReportes() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminReportes />
    </QueryClientProvider>,
  );
}

describe('AdminReportes', () => {
  it('shows filters, KPIs, report sections and CSV export', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    renderReportes();

    expect(await screen.findByText(/Control visual de clinica/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hasta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Doctor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Clinica/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tratamiento/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Facturado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cobrado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Presupuestos/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Laboratorio/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Exportaciones/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Exportar CSV/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
