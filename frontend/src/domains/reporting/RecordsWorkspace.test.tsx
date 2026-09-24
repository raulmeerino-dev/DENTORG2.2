import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecordCatalog, getRecordPage, type RecordView } from '../../api/records';
import RecordsWorkspace from './index';

vi.mock('../identity/session/AuthContext', () => ({ useAuth: () => ({ user: { id: 'doctor', rol: 'doctor', clinica_id: 'own-clinic' } }) }));
vi.mock('../../api/records', () => ({ getRecordCatalog: vi.fn(), getRecordPage: vi.fn(), getRecordOptions: vi.fn().mockResolvedValue([]), exportRecordPage: vi.fn() }));
vi.mock('../../app/navigation/recordTargets', () => ({ recordTargetHref: () => '/pacientes?paciente_id=p1' }));

const patients: RecordView = {
  id: 'pacientes', label: 'Pacientes', group: 'records', filters: ['q', 'fecha_desde', 'fecha_hasta'], states: [], types: [],
  columns: [{ key: 'paciente', label: 'Paciente', type: 'text', sortable: true }], can_export: false, export_formats: [], default_sort: { by: 'paciente', dir: 'asc' }, date_label: 'Fecha de alta',
};
const documents: RecordView = { ...patients, id: 'documentos', label: 'Documentos', group: 'files', filters: ['q', 'tipo'], types: [{ value: 'consentimiento', label: 'Consentimientos' }] };

function Detail() {
  const location = useLocation(); const navigate = useNavigate();
  return <><span data-testid="return-to">{location.state?.returnTo}</span><button onClick={() => navigate(-1)}>Volver a resultados</button></>;
}
function renderWorkspace(path = '/registros', mode: 'records' | 'files' = 'records') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/registros" element={<RecordsWorkspace mode={mode} />} />
    <Route path="/archivos" element={<RecordsWorkspace mode={mode} />} />
    <Route path="/pacientes" element={<Detail />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRecordCatalog).mockResolvedValue({ views: [patients, documents] });
  vi.mocked(getRecordPage).mockImplementation(async (_view, query) => ({ columns: patients.columns, rows: [{ id: 'p1', cells: { paciente: 'Martina Pérez' }, target: { kind: 'paciente', id: 'p1' } }], offset: query.offset, limit: query.limit, total: 120 }));
});

describe('RecordsWorkspace', () => {
  it('uses only authorized catalog views, columns and exports even for an economic bookmark', async () => {
    renderWorkspace('/registros?vista=facturas&importe_min=100&sort_by=total');
    expect(await screen.findByText('Martina Pérez')).toBeInTheDocument();
    expect(getRecordPage).toHaveBeenCalledWith('pacientes', expect.not.objectContaining({ importe_min: '100' }), expect.any(AbortSignal));
    expect(screen.queryByRole('option', { name: 'Facturas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excel' })).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });
  it('restores filters, page and order after visiting the canonical detail', async () => {
    const user = userEvent.setup();
    renderWorkspace('/registros?vista=pacientes&q=Martina&fecha_desde=2026-01-01&offset=50&sort_by=paciente&sort_dir=desc');
    await screen.findByText('Martina Pérez');
    await user.click(screen.getByRole('link', { name: 'Abrir detalle' }));
    expect(screen.getByTestId('return-to').textContent).toContain('offset=50');
    await user.click(screen.getByRole('button', { name: 'Volver a resultados' }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar registros' })).toHaveValue('Martina');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-01-01');
    expect(screen.getByRole('columnheader', { name: 'Paciente' })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: 'Ordenar por Paciente' }));
    await waitFor(() => expect(getRecordPage).toHaveBeenLastCalledWith('pacientes', expect.objectContaining({ offset: 0, q: 'Martina', sort_dir: 'asc' }), expect.any(AbortSignal)));
  });
  it('debounces text search and keeps file mode in the documentary catalog', async () => {
    const user = userEvent.setup();
    renderWorkspace('/archivos', 'files');
    await screen.findByText('Martina Pérez');
    expect(screen.queryByRole('option', { name: 'Pacientes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de archivo')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar archivos' }), 'Martina');
    expect(screen.getByRole('link', { name: 'Abrir detalle' })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(getRecordPage).toHaveBeenLastCalledWith('documentos', expect.objectContaining({ q: 'Martina' }), expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Abrir detalle' })).toHaveAttribute('aria-disabled', 'false'));
    expect(vi.mocked(getRecordPage).mock.calls.filter(([, query]) => query.q && query.q !== 'Martina')).toHaveLength(0);
  });
  it('filters open audit actions with debounced text instead of an empty state selector', async () => {
    vi.mocked(getRecordCatalog).mockResolvedValue({ views: [{ ...patients, id: 'auditoria', label: 'Auditoría',
      filters: ['q', 'estado'], columns: [...patients.columns, { key: 'estado', label: 'Acción', type: 'status', sortable: true }],
    }] });
    const user = userEvent.setup();
    renderWorkspace('/registros?vista=auditoria');
    await screen.findByText('Martina Pérez');
    expect(screen.queryByRole('combobox', { name: 'Acción' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Acción' }), 'UPDATE');
    await waitFor(() => expect(getRecordPage).toHaveBeenLastCalledWith('auditoria', expect.objectContaining({ estado: 'UPDATE' }), expect.any(AbortSignal)));
    expect(vi.mocked(getRecordPage).mock.calls.filter(([, query]) => query.estado && query.estado !== 'UPDATE')).toHaveLength(0);
  });
});
