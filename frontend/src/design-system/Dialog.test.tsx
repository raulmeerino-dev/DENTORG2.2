import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog layers', () => {
  it('only closes the topmost dialog with Escape', () => {
    const closeFirst = vi.fn(), closeSecond = vi.fn();
    render(<><Dialog label="First" onClose={closeFirst}><button>First action</button></Dialog><Dialog label="Second" onClose={closeSecond}><button>Second action</button></Dialog></>);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Second' }), { key: 'Escape' });
    expect(closeSecond).toHaveBeenCalledOnce();
    expect(closeFirst).not.toHaveBeenCalled();
  });
  it('prevents dismissal while saving', () => {
    const close = vi.fn();
    render(<Dialog label="Saving" onClose={close} closeDisabled><p>Saving</p></Dialog>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });
});
