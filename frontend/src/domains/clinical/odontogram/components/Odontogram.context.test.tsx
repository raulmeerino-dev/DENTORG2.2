import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createBaseTooth } from '../data/toothMap';
import { Odontogram } from './Odontogram';

it('abrir el menú no modifica el borrador de piezas ni guarda; preparar utiliza la pieza pulsada', () => {
  const onChange = vi.fn(); const onSelectTooth = vi.fn(); const onPrepareTreatment = vi.fn();
  render(<Odontogram mode="budget" data={[createBaseTooth('16'), createBaseTooth('17')]} readOnly onChange={onChange} onSelectTooth={onSelectTooth} onPrepareTreatment={onPrepareTreatment} />);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Seleccionar pieza 17' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(onSelectTooth).not.toHaveBeenCalled();
  expect(onPrepareTreatment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Añadir tratamiento propuesto' }));
  expect(onPrepareTreatment).toHaveBeenCalledWith(expect.objectContaining({ toothNumber: '17' }));
  expect(onChange).not.toHaveBeenCalled();
});
