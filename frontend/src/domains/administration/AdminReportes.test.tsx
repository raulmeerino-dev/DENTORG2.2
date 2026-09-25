import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminReportes } from './AdminReportes';

vi.mock('../../api/laboratory', () => ({
  getTrabajosLaboratorio: vi.fn().mockResolvedValue([{ id: 'lab-1', descripcion: 'Corona de zirconio', estado: 'enviado', laboratorio: { nombre: 'Laboratorio Central' }, paciente: { nombre: 'Ana', apellidos: 'Garcia' }, precio: '120.00', fecha_entrega_prevista: '2026-09-30' }]),
}));

vi.mock('../../api/reporting', () => ({
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

    expect(await screen.findByLabelText('Tipo de reporte')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filtros/ }));
    expect(screen.getByLabelText(/Desde/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Hasta/i)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getAllByText(/Facturado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cobrado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Presupuestos/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Laboratorio/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Exportaciones/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Exportar CSV/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Tipo de reporte'), 'laboratorio');
    expect(await screen.findByText('Corona de zirconio')).toBeInTheDocument();
    expect(screen.getByText('Laboratorio Central')).toBeInTheDocument();
    expect(screen.queryByText('Retrasos revisables')).not.toBeInTheDocument();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
