import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useObjectMenu } from './useObjectMenu';

type Item = { id: string; name: string; locked?: boolean };
const items: Item[] = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beatriz' }];
function Example({ rows = items, allowed = true, run }: { rows?: Item[]; allowed?: boolean; run: (id: string) => void }) {
  const menu = useObjectMenu({ items: rows, id: row => row.id, label: row => row.name, actions: row => [
    { id: 'open', label: 'Abrir', run: () => run(row.id) },
    ...(allowed ? [{ id: 'edit', label: 'Editar', disabled: row.locked, run: () => run(`edit:${row.id}`) }] : []),
  ] });
  return <><table><tbody>{rows.map(row => <tr key={row.id} {...menu.bindings(row)}><td>{row.name}</td><td><input aria-label={`Nota ${row.name}`} /></td><td>{menu.trigger(row)}</td></tr>)}</tbody></table>{menu.menu}<button>Fuera</button></>;
}
describe('Object menus', () => {
  it('right click acts on the clicked row, marks it and restores focus with Escape', async () => {
    const user = userEvent.setup(); const run = vi.fn(); render(<Example run={run} />);
    const row = screen.getByRole('row', { name: /Beatriz/ });
    fireEvent.contextMenu(row, { clientX: 900, clientY: 700 });
    expect(row).toHaveAttribute('data-context-active', 'true');
    expect(run).not.toHaveBeenCalled();
    await user.keyboard('{Enter}'); expect(run).toHaveBeenCalledWith('b'); expect(row).toHaveFocus();
    fireEvent.contextMenu(row); await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(row).toHaveFocus();
  });
  it('visible trigger and Shift+F10 expose the same actions with arrow navigation', async () => {
    const user = userEvent.setup(); const run = vi.fn(); render(<Example run={run} />);
    await user.click(screen.getByRole('button', { name: 'Acciones: Ana' }));
    const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.textContent);
    await user.keyboard('{Escape}');
    const row = screen.getByRole('row', { name: /Ana/ }); row.focus(); await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.textContent)).toEqual(labels);
    await user.keyboard('{ArrowDown}{Enter}'); expect(run).toHaveBeenCalledWith('edit:a');
  });
  it('uses refreshed state and permissions while open, and removes a disappeared object', () => {
    const run = vi.fn(); const view = render(<Example run={run} />);
    fireEvent.contextMenu(screen.getByRole('row', { name: /Ana/ }));
    view.rerender(<Example run={run} rows={[{ ...items[0], locked: true }, items[1]]} />);
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeDisabled();
    view.rerender(<Example run={run} allowed={false} />);
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    view.rerender(<Example run={run} rows={[items[1]]} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(run).not.toHaveBeenCalled();
  });
  it('preserves the native menu for editable fields and selected text', () => {
    render(<Example run={vi.fn()} />);
    expect(fireEvent.contextMenu(screen.getByLabelText('Nota Ana'))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Texto seleccionado' } as Selection);
    expect(fireEvent.contextMenu(screen.getByRole('row', { name: /Ana/ }))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); selection.mockRestore();
  });
  it('closes on outside click and Tab without trapping or stealing focus', async () => {
    const user = userEvent.setup(); render(<Example run={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Acciones: Ana' }));
    await user.click(screen.getByRole('button', { name: 'Fuera' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Fuera' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Acciones: Ana' })); await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
