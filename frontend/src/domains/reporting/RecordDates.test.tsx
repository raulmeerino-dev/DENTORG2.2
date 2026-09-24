import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { getAuditRecord } from '../../api/records';
import { configureClinicTimeZone } from '../../shared/time/clinicTime';
import { AuditRecordDetail } from './AuditRecordDetail';
import { RecordsTable } from './RecordsTable';

vi.mock('../../api/records', () => ({ getAuditRecord: vi.fn() }));
afterEach(() => configureClinicTimeZone('Europe/Madrid'));

it('shows the same audit instant in the configured clinic zone in table and detail', async () => {
  configureClinicTimeZone('Pacific/Honolulu');
  vi.mocked(getAuditRecord).mockResolvedValue({
    id: 42, timestamp: '2026-01-15T12:00:00Z', action: 'UPDATE', entity_type: 'pacientes',
    user_id: null, clinica_id: null, entity_id: null, old_values: null, new_values: null,
    ip_address: null, user_agent: null, event_hash: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <RecordsTable columns={[{ key: 'fecha', label: 'Fecha', type: 'datetime', sortable: true }]}
      rows={[{ id: '42', cells: { fecha: '2026-01-15T13:00:00+01:00' }, target: null }]}
      query={{ offset: 0, limit: 50, sort_by: 'fecha', sort_dir: 'desc' }} onSort={() => {}}
      returnTo="/registros?vista=auditoria" loading={false} failed={false} />
    <AuditRecordDetail id="42" scope="admin" onClose={() => {}} />
  </MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole('cell', { name: '15/1/26, 2:00' })).toBeInTheDocument();
  expect(await screen.findByText('15/1/2026, 2:00:00')).toBeInTheDocument();
});
