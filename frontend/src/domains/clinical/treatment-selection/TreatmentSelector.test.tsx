import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../../design-system/Dialog';
import { TreatmentSelector } from './TreatmentSelector';
import { filterTreatments, indexTreatments, type TreatmentOption } from './treatmentSearch';

const items: TreatmentOption[] = [
  { id: 'endo-1', code: 'EN-01', name: 'Endodoncia unirradicular', category: 'Endodoncia', price: 120 },
  { id: 'endo-2', code: 'EN-02', name: 'Endodoncia multirradicular', category: 'Endodoncia', price: 200 },
  { id: 'rest', code: 'RC-01', name: 'Restauración de composite', category: 'Operatoria', price: 0 },
  { id: 'limp', code: 'HI-01', name: 'Profilaxis', category: 'Higiene' },
];
const describeItem = (item: TreatmentOption) => item;

function Picker({ manual, selected = vi.fn(), manualSelected = vi.fn(), catalog = items }: {
  manual?: boolean; selected?: (item: TreatmentOption) => void; manualSelected?: (text: string) => void; catalog?: TreatmentOption[];
}) {
  const [query, setQuery] = useState('');
  const [id, setId] = useState('');
  const [free, setFree] = useState('');
  return <TreatmentSelector items={catalog} describe={describeItem} query={query} selectedId={id} manualValue={free} showPrice
    onQueryChange={text => { setQuery(text); setId(''); setFree(''); }}
    onSelect={item => { setQuery(item.name); setId(item.id); selected(item); }}
    onManual={manual ? text => { setQuery(text); setId(''); setFree(text); manualSelected(text); } : undefined} />;
}

describe('treatment search', () => {
  const index = indexTreatments(items, describeItem);
  it('matches partial words, accents, word order and codes independently of punctuation', () => {
    for (const query of ['RESTauracion', 'compo rest', 'RC01', 'rc-01']) {
      expect(filterTreatments(index, query).map(entry => entry.option.id)).toEqual(['rest']);
    }
    expect(filterTreatments(index, 'endo').length).toBe(2);
    expect(filterTreatments(index, 'limp').map(entry => entry.option.id)).toEqual(['limp']);
    expect(filterTreatments(index, 'inexistente')).toEqual([]);
  });
  it('prioritizes names and codes over category-only matches', () => {
    const categoryFirst = indexTreatments([{ id: 'extra', name: 'Apicectomía', category: 'Endodoncia' }, ...items], describeItem);
    expect(filterTreatments(categoryFirst, 'endo').map(entry => entry.option.id)).toEqual(['endo-1', 'endo-2', 'extra']);
  });
});

describe('TreatmentSelector', () => {
  it('updates suggestions per keystroke and selects with arrows and Enter without submitting the form', async () => {
    const user = userEvent.setup(), selected = vi.fn(), submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><Picker selected={selected} /></form>);
    const input = screen.getByRole('combobox', { name: 'Tratamiento' });
    await user.type(input, 'endo');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(selected).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(selected).toHaveBeenCalledWith(items[0]);
    expect(input).toHaveValue(items[0].name);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Catálogo · EN-01')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'compo');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByText('Catálogo · EN-01')).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Restauración/ }));
    expect(selected).toHaveBeenLastCalledWith(items[2]);
  });

  it('closes with Escape, Tab and outside click without closing the surrounding dialog', async () => {
    const user = userEvent.setup(), close = vi.fn();
    render(<Dialog label="Registro" onClose={close}><Picker /><button>Fuera</button></Dialog>);
    const input = screen.getByRole('combobox', { name: 'Tratamiento' });
    await user.type(input, 'endo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    await user.click(screen.getByRole('button', { name: 'Fuera' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('requires explicit manual selection, distinguishes it from catalog and never invents a catalog entry', async () => {
    const user = userEvent.setup(), selected = vi.fn(), manual = vi.fn();
    render(<Picker manual selected={selected} manualSelected={manual} />);
    await user.type(screen.getByRole('combobox', { name: 'Tratamiento' }), 'Control adaptado');
    expect(screen.getByRole('status')).toHaveTextContent('Sin resultados');
    expect(manual).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(manual).toHaveBeenCalledWith('Control adaptado');
    expect(selected).not.toHaveBeenCalled();
    expect(screen.getByText('Concepto manual · no se añade al catálogo')).toBeVisible();
  });

  it('does not offer manual entries in catalog-only flows and does not select during IME composition', async () => {
    const user = userEvent.setup(), selected = vi.fn();
    render(<Picker selected={selected} />);
    const input = screen.getByRole('combobox', { name: 'Tratamiento' });
    await user.type(input, 'sin resultados');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(selected).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'endo');
    await user.keyboard('{ArrowDown}');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(selected).not.toHaveBeenCalled();
  });

  it('prefers an exact catalog match on Enter but allows explicitly keeping its name as a manual concept', async () => {
    const user = userEvent.setup(), selected = vi.fn(), manual = vi.fn();
    render(<Picker manual selected={selected} manualSelected={manual} />);
    await user.type(screen.getByRole('combobox', { name: 'Tratamiento' }), items[0].name);
    await user.keyboard('{Enter}');
    expect(selected).toHaveBeenCalledWith(items[0]);
    expect(manual).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: /como concepto manual/ }));
    expect(manual).toHaveBeenCalledWith(items[0].name);
    expect(screen.getByText('Concepto manual · no se añade al catálogo')).toBeVisible();
  });

  it('offers the complete catalog beyond suggestion limits and reuses search and family filters', async () => {
    const user = userEvent.setup(), selected = vi.fn();
    const catalog = [...items, ...Array.from({ length: 140 }, (_, i) => ({ id: `extra-${i}`, name: `Tratamiento ${i}`, category: 'Otros' }))];
    render(<Picker catalog={catalog} selected={selected} />);
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    const region = screen.getByRole('region', { name: 'Catálogo completo de tratamientos' });
    expect(within(region).getByText('144 tratamientos')).toBeVisible();
    await user.click(within(region).getByRole('button', { name: /Tratamiento 139/ }));
    expect(selected).toHaveBeenCalledWith(catalog.at(-1));
    await user.click(screen.getByRole('button', { name: 'Ver catálogo completo' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Familia' }), 'Endodoncia');
    expect(within(region).getByText('2 tratamientos')).toBeVisible();
    await user.type(screen.getByRole('combobox', { name: 'Tratamiento' }), 'multi');
    expect(within(region).getByText('1 tratamiento')).toBeVisible();
    await user.click(within(region).getByRole('button', { name: /Endodoncia multirradicular/ }));
    expect(selected).toHaveBeenLastCalledWith(items[1]);
  });
});
