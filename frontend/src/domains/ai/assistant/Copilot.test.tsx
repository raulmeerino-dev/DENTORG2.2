import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askCopilot, confirmCopilot } from '../../../api/copilot';
import AssistantFloatingButton from './AssistantFloatingButton';
import { copilotContext } from './copilotContext';

vi.mock('../../../api/copilot', () => ({ askCopilot: vi.fn(), confirmCopilot: vi.fn() }));
vi.mock('../../identity/session/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', rol: 'admin', clinica_id: 'clinic' } }) }));
vi.mock('./voiceInputService', () => ({ voiceAvailable: () => false }));
const patient = '64af3dc7-57e7-5871-b5c5-761fdac29e36';
function open() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/pacientes?paciente_id=${patient}&tab=sesion`]}><AssistantFloatingButton /></MemoryRouter></QueryClientProvider>);
  act(() => window.dispatchEvent(new Event('dentcore:open-assistant')));
}
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollTo = vi.fn();
});
describe('Copilot', () => {
  it('uses only the active route context', () => {
    expect(copilotContext('/pacientes', `?paciente_id=${patient}&tab=presupuestos`)).toEqual({ module: 'pacientes', patient_id: patient, section: 'presupuestos' });
    expect(copilotContext('/caja', `?paciente_id=${patient}`)).toEqual({ module: 'caja' });
    expect(copilotContext('/jornada', '?vista=agenda&fecha=2026-09-25')).toEqual({ module: 'agenda', day: '2026-09-25' });
  });
  it('requires a separate explicit confirmation and keeps the same receipt on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(askCopilot).mockResolvedValue({ message: 'Revisa los datos', sources: [], proposal: { id: 'proposal-id', label: 'Confirmar nota', steps: [{ title: 'Nota', risk: 'high', fields: [{label:'Paciente',value:'Paciente QA'}] }] } });
    vi.mocked(confirmCopilot).mockRejectedValueOnce(new Error('Network')).mockResolvedValue({message:'Nota guardada',sources:[],saved:true});
    open();
    await user.type(screen.getByRole('textbox', { name: 'Petición a DentCore' }), 'Anota control sin molestias');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    const button = await screen.findByRole('button', { name: 'Confirmar nota' });
    expect(confirmCopilot).not.toHaveBeenCalled();
    expect(askCopilot).toHaveBeenCalledWith(expect.objectContaining({ context: {module:'pacientes',patient_id:patient,section:'sesion'} }), expect.any(AbortSignal));
    await user.click(button);
    await screen.findByRole('alert');
    await user.click(button);
    await screen.findByText('Nota guardada');
    expect(vi.mocked(confirmCopilot).mock.calls[0]).toEqual(vi.mocked(confirmCopilot).mock.calls[1]);
    expect(screen.queryByRole('button', { name: 'Confirmar nota' })).not.toBeInTheDocument();
  });
  it('retries an unavailable provider with a fresh request, and network failures with the same id', async () => {
    vi.mocked(askCopilot).mockResolvedValueOnce({ message:'Motor no disponible', sources:[], unavailable:true }).mockRejectedValueOnce(new Error('Network')).mockResolvedValue({ message:'Disponible',sources:[] });
    open();
    fireEvent.change(screen.getByRole('textbox', {name:'Petición a DentCore'}), { target:{value:'Consulta agenda'} });
    fireEvent.click(screen.getByRole('button',{name:'Enviar petición'}));
    fireEvent.click(await screen.findByRole('button',{name:'Reintentar'}));
    await waitFor(() => expect(askCopilot).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button',{name:'Reintentar'}));
    await screen.findByText('Disponible');
    const calls=vi.mocked(askCopilot).mock.calls;
    expect(calls[0][0].request_id).not.toBe(calls[1][0].request_id);
    expect(calls[1][0].request_id).toBe(calls[2][0].request_id);
  });
});
