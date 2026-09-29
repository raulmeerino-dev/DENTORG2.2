import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Presupuesto, PresupuestoLinea, TratamientoCatalogo } from '../../api/types';
import * as api from '../../api/treatmentPlans';
import { clearSessionDrafts, setSessionDraftOwner } from '../identity/session/sessionDrafts';
import { PresupuestoPanel } from './Presupuestos';
import { budgetLineStatus, parseBudgetTeeth } from './budgetView';

vi.mock('../../api/treatmentPlans', () => ({ addPresupuestoLinea: vi.fn(), updatePresupuestoLinea: vi.fn(), deletePresupuestoLinea: vi.fn(), aceptarPresupuesto: vi.fn(), presentarPresupuesto: vi.fn(), rechazarPresupuesto: vi.fn(), convertirPresupuestoFactura: vi.fn(), createPresupuesto: vi.fn(), openPresupuestoPdf: vi.fn() }));
vi.mock('../clinical/odontogram', () => ({ BudgetOdontogramFlow: ({ onSelectPiece }: { onSelectPiece: (piece: number, faces?: string) => void }) => <button onClick={() => onSelectPiece(26, 'M')}>Seleccionar pieza 26</button> }));
const patient = { id: 'p', nombre: 'Paciente', apellidos: 'Prueba', num_historial: 12 } as ApiPaciente;
const treatment: TratamientoCatalogo = { id: 't', nombre: 'Obturación', codigo: 'OB01', precio: '100', familia_id: 'f', familia: null, iva_porcentaje: '0', requiere_pieza: true, requiere_caras: false, activo: true };
const line = (id = 'l1', piece: number | null = 16): PresupuestoLinea => ({ id, presupuesto_id: 'b', tratamiento_id: 't', tratamiento: treatment, pieza_dental: piece, caras: 'M', precio_unitario: '100', descuento_porcentaje: '0', importe_neto: '100', aceptado: false, pasado_trabajo_pendiente: false, revision: 3 });
const base = (): Presupuesto => ({ id: 'b', paciente_id: 'p', doctor_id: 'd', numero: 42, fecha: '2026-09-29', estado: 'borrador', pie_pagina: null, odontograma: {}, lineas: [], total: '0', total_aceptado: '0' });
function setup(budget = base()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['presupuestos', 'p'], [budget]);
  function Workspace({ visible = true }: { visible?: boolean }) {
    const { data = [] } = useQuery<Presupuesto[]>({ queryKey: ['presupuestos', 'p'], enabled: false });
    return visible ? <PresupuestoPanel presupuesto={data[0]} paciente={patient} tratamientos={[treatment]} userRole="admin" /> : <p>Otra sección</p>;
  }
  const view = render(<QueryClientProvider client={client}><Workspace /></QueryClientProvider>);
  return { client, switchSection: (visible: boolean) => view.rerender(<QueryClientProvider client={client}><Workspace visible={visible} /></QueryClientProvider>) };
}
async function choose(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('combobox', { name: 'Buscar tratamiento' }), 'obt');
  await user.click(screen.getByRole('option', { name: /OB01.*Obturación/ }));
}
beforeEach(() => {
  vi.resetAllMocks(); Element.prototype.scrollIntoView = vi.fn(); clearSessionDrafts(); setSessionDraftOwner({ id: 'u', clinica_id: null });
  let count = 0;
  vi.mocked(api.addPresupuestoLinea).mockImplementation(async (_id, input) => ({ ...line(`new-${++count}`, input.pieza_dental ?? null), caras: input.caras ?? null, precio_unitario: String(input.precio_unitario), descuento_porcentaje: String(input.descuento_porcentaje), importe_neto: String(Number(input.precio_unitario) * (1 - Number(input.descuento_porcentaje ?? 0) / 100)) }));
});
describe('PresupuestoPanel', () => {
  it('busca por teclado, añade varias piezas y actualiza líneas y totales con la respuesta confirmada', async () => {
    setup(); const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Presentar' })).toBeDisabled();
    await user.type(screen.getByRole('combobox', { name: 'Buscar tratamiento' }), 'OB01');
    await user.keyboard('{ArrowDown}{Enter}');
    await user.type(screen.getByLabelText('Piezas'), '16, 17, 16');
    await user.clear(screen.getByLabelText('Dto %')); await user.type(screen.getByLabelText('Dto %'), '10');
    expect(screen.getByLabelText('Importe de la línea')).toHaveTextContent('180,00');
    await user.click(screen.getByRole('button', { name: 'Añadir 2 líneas' }));
    await screen.findByRole('button', { name: 'Editar línea 2' });
    expect(api.addPresupuestoLinea).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole('region', { name: 'Líneas del presupuesto' })).getByText('180,00 €')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Presentar' })).toBeEnabled();
  });
  it('edita una línea sin añadir otra y permite vaciar pieza y caras', async () => {
    setup({ ...base(), lineas: [line()] }); const user = userEvent.setup();
    vi.mocked(api.updatePresupuestoLinea).mockResolvedValue({ ...line(), pieza_dental: null, caras: null, precio_unitario: '80', importe_neto: '80', revision: 4 });
    await user.click(screen.getByRole('button', { name: 'Editar línea 1' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Pieza')); await user.clear(screen.getByLabelText('Caras'));
    await user.clear(screen.getByLabelText('Precio unitario')); await user.type(screen.getByLabelText('Precio unitario'), '80');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.updatePresupuestoLinea).toHaveBeenCalledWith('b', 'l1', { revision: 3, pieza_dental: null, caras: null, precio_unitario: '80', descuento_porcentaje: '0' }));
    expect(api.addPresupuestoLinea).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Editar línea' })).not.toBeInTheDocument());
  });
  it('conserva lo guardado y deja solo piezas restantes si falla una inserción múltiple', async () => {
    setup(); const user = userEvent.setup(); await choose(user);
    vi.mocked(api.addPresupuestoLinea).mockResolvedValueOnce(line('first', 16)).mockRejectedValueOnce(new Error('Conflicto de pieza'));
    await user.type(screen.getByLabelText('Piezas'), '16, 17');
    await user.click(screen.getByRole('button', { name: 'Añadir 2 líneas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 línea guardada');
    expect(screen.getByLabelText('Piezas')).toHaveValue('17');
    expect(screen.getByRole('button', { name: 'Editar línea 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await screen.findByRole('button', { name: 'Editar línea 2' });
    expect(vi.mocked(api.addPresupuestoLinea).mock.calls.map(call => call[1].pieza_dental)).toEqual([16, 17, 17]);
  });
  it('conserva precio y revisión originales al navegar o recibir un conflicto', async () => {
    const workspace = setup({ ...base(), lineas: [line()] }); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar línea 1' }));
    await user.clear(screen.getByLabelText('Precio unitario')); await user.type(screen.getByLabelText('Precio unitario'), '85');
    workspace.switchSection(false); workspace.switchSection(true);
    expect(screen.getByLabelText('Precio unitario')).toHaveValue('85');
    vi.mocked(api.updatePresupuestoLinea).mockRejectedValue(new Error('La línea ha cambiado; vuelve a abrirla.'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La línea ha cambiado');
    expect(screen.getByLabelText('Precio unitario')).toHaveValue('85');
    expect(api.updatePresupuestoLinea).toHaveBeenCalledWith('b', 'l1', expect.objectContaining({ revision: 3 }));
  });
  it('confirma aceptación parcial y bloquea la línea aceptada', async () => {
    const budget = { ...base(), lineas: [line(), line('l2', 17)] }; setup(budget); const user = userEvent.setup();
    vi.mocked(api.aceptarPresupuesto).mockResolvedValue({ ...budget, estado: 'parcial', lineas: [{ ...line(), aceptado: true, pasado_trabajo_pendiente: true }, line('l2', 17)] });
    await user.click(screen.getByRole('button', { name: 'Acciones: Obturación · Pieza 16' })); await user.click(screen.getByRole('menuitem', { name: 'Aceptar línea' }));
    expect(api.aceptarPresupuesto).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar aceptación' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar línea 1' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Editar línea 2' })).toBeEnabled();
    expect(api.aceptarPresupuesto).toHaveBeenCalledWith('b', ['l1']);
    expect(screen.getAllByText('Aceptación parcial').length).toBeGreaterThan(0);
  });
  it('duplica como borrador en otra pieza, pide confirmar eliminación y no cambia otras líneas', async () => {
    setup({ ...base(), lineas: [line()] }); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acciones: Obturación · Pieza 16' })); await user.click(screen.getByRole('menuitem', { name: 'Duplicar en otra pieza' }));
    expect(screen.getByLabelText('Piezas')).toHaveValue(''); expect(screen.getByLabelText('Precio unitario')).toHaveValue('100');
    expect(api.addPresupuestoLinea).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await user.click(screen.getByRole('button', { name: 'Acciones: Obturación · Pieza 16' })); await user.click(screen.getByRole('menuitem', { name: 'Eliminar línea' }));
    expect(api.deletePresupuestoLinea).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar línea' }));
    await screen.findByText('Empieza por un tratamiento');
    expect(api.deletePresupuestoLinea).toHaveBeenCalledWith('b', 'l1');
  });
  it('no sustituye un borrador al elegir otra línea sin decisión explícita', async () => {
    setup({ ...base(), lineas: [line(), line('l2', 17)] }); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar línea 1' }));
    await user.click(screen.getByRole('button', { name: 'Editar línea 2' }));
    await user.click(screen.getByRole('button', { name: 'Seguir editando' })); expect(screen.getByLabelText('Pieza')).toHaveValue('16');
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' })); expect(api.updatePresupuestoLinea).not.toHaveBeenCalled();
  });
  it('permite resolver un borrador si el presupuesto se cierra desde otra sesión', async () => {
    const budget = { ...base(), lineas: [line()] };
    const { client } = setup(budget); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar línea 1' }));
    act(() => client.setQueryData(['presupuestos', 'p'], [{ ...budget, estado: 'aceptado', lineas: [{ ...line(), aceptado: true }] }]));
    expect(await screen.findByText(/El presupuesto se ha cerrado/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Editar línea' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(screen.queryByText(/Este borrador no se ha guardado/)).not.toBeInTheDocument();
    expect(api.updatePresupuestoLinea).not.toHaveBeenCalled();
  });
  it('integra el odontograma bajo demanda y conserva selección al cerrarlo', async () => {
    setup(); const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Seleccionar pieza 26' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir odontograma' })); await user.click(screen.getByRole('button', { name: 'Seleccionar pieza 26' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar odontograma' })); await choose(user);
    expect(screen.getByLabelText('Piezas')).toHaveValue('26'); expect(screen.getByLabelText('Caras')).toHaveValue('M');
    expect(api.addPresupuestoLinea).not.toHaveBeenCalled();
  });
  it('rechazado y facturado no muestran un editor utilizable ni estados engañosos', () => {
    const rejected = { ...base(), estado: 'rechazado', lineas: [line()] }; setup(rejected);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar todo' })).toBeDisabled();
    expect(screen.queryByText('Planificado')).not.toBeInTheDocument();
    expect(budgetLineStatus({ ...base(), estado: 'facturado' }, { ...line(), aceptado: true }).label).toBe('Facturado');
    expect(budgetLineStatus({ ...base(), estado: 'facturado' }, line()).label).toBe('No aceptado');
    expect(budgetLineStatus(base(), { ...line(), aceptado: true }, true).label).toBe('Pendiente');
  });
  it('impide FDI y descuentos inválidos sin enviar peticiones', async () => {
    setup(); const user = userEvent.setup(); await choose(user);
    fireEvent.change(screen.getByLabelText('Piezas'), { target: { value: '19' } });
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeDisabled();
    expect(parseBudgetTeeth('55 85, 11')).toEqual([55, 85, 11]);
    fireEvent.change(screen.getByLabelText('Piezas'), { target: { value: '16' } }); fireEvent.change(screen.getByLabelText('Dto %'), { target: { value: '101' } });
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeDisabled(); expect(api.addPresupuestoLinea).not.toHaveBeenCalled();
  });
});
