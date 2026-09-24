import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { FloatingPopover } from './FloatingPopover';

function Menu({ action }: { action: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} onClick={() => setOpen(value => !value)}>Opciones</button>
    {open && <FloatingPopover anchorRef={trigger} onClose={() => setOpen(false)} role="menu" aria-label="Acciones">
      <button onClick={() => { action(); setOpen(false); }}>Consultar</button>
      <button disabled>No disponible</button>
      <button>Cerrar ficha</button>
    </FloatingPopover>}
  </>;
}

describe('FloatingPopover', () => {
  it('permite navegar por teclado y Escape cierra sólo el menú dentro de un diálogo', async () => {
    const user = userEvent.setup();
    const closeDialog = vi.fn();
    render(<Dialog label="Filtros" onClose={closeDialog}><Menu action={vi.fn()} /></Dialog>);
    await user.click(screen.getByRole('button', { name: 'Opciones' }));
    expect(screen.getByRole('button', { name: 'Consultar' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Cerrar ficha' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Consultar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opciones' })).toHaveFocus();
    expect(closeDialog).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(closeDialog).toHaveBeenCalledOnce();
  });

  it('conserva la acción del menú y cierra al pulsar fuera', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<><Menu action={action} /><button>Fuera</button></>);
    await user.click(screen.getByRole('button', { name: 'Opciones' }));
    await user.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opciones' }));
    await user.click(screen.getByRole('button', { name: 'Fuera' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fuera' })).toHaveFocus();
  });
});
