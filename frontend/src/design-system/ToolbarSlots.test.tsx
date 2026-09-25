import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ToolbarSlots, ToolbarSlot, ToolbarContribution } from './ToolbarSlots';
import { ContextToolbar, FiltersPopover, ActiveFilterChips } from './ContextToolbar';
function Example() {
 const [mode, setMode] = useState(true);
 const [filter, setFilter] = useState('');
 return <ToolbarSlots><header data-testid="global"><ToolbarSlot name="module" /></header><button onClick={() => setMode(!mode)}>Cambiar módulo</button>
 {mode && <ToolbarContribution slot="module"><strong>Contexto del módulo</strong></ToolbarContribution>}
 <ContextToolbar><FiltersPopover count={filter ? 1 : 0}><label>Profesional<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos</option><option>Ana</option></select></label></FiltersPopover>
 <ActiveFilterChips filters={filter ? [{ key: 'doctor', label: filter, onRemove: () => setFilter('') }] : []} /></ContextToolbar></ToolbarSlots>;
}
describe('toolbar composition', () => {
 it('retira el contexto del shell al salir del módulo', async () => {
  const user = userEvent.setup();render(<Example />);
  expect(within(screen.getByTestId('global')).getByText('Contexto del módulo')).toBeVisible();
  await user.click(screen.getByText('Cambiar módulo'));
  expect(screen.queryByText('Contexto del módulo')).not.toBeInTheDocument();
 });
 it('conserva filtros al cerrar el popover y permite quitarlos desde su chip', async () => {
  const user = userEvent.setup();render(<Example />);
  await user.click(screen.getByRole('button', { name: 'Filtros' }));
  await user.selectOptions(screen.getByLabelText('Profesional'), 'Ana');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Filtros1' }));
  expect(screen.getByLabelText('Profesional')).toHaveValue('Ana');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Quitar filtro Ana' }));
  expect(screen.getByRole('button', { name: 'Filtros' })).toBeVisible();
 });
});
