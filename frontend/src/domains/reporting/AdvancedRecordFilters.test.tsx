import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { RecordView } from '../../api/records';
import { AdvancedRecordFilters } from './AdvancedRecordFilters';

it('allows filtering an open product classification without inventing options or exposing forbidden filters', async () => {
  const view: RecordView = {
    id: 'inventario', label: 'Inventario', group: 'records', filters: ['q', 'tipo'], types: [], states: [],
    columns: [], can_export: false, export_formats: [], date_label: '', default_sort: { by: 'concepto', dir: 'asc' },
  };
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><AdvancedRecordFilters view={view}
    query={{ offset: 0, limit: 50, sort_by: 'concepto', sort_dir: 'asc' }} scope="doctor:clinic"
    onClose={() => {}} onApply={onApply} fileMode={false} /></QueryClientProvider>);
  await user.type(screen.getByRole('textbox', { name: 'Clasificación de producto' }), 'biomaterial');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText('Importe mínimo')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  expect(onApply).toHaveBeenCalledWith({ tipo: 'biomaterial' });
});
