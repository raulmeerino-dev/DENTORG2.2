import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askCopilot, confirmCopilot } from '../../../api/copilot';
import AssistantFloatingButton from './AssistantFloatingButton';
import { copilotContext } from './copilotContext';
import { captureVoiceInput, voiceAvailable } from './voiceInputService';

vi.mock('../../../api/copilot', () => ({ askCopilot: vi.fn(), confirmCopilot: vi.fn() }));
vi.mock('../../identity/session/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', rol: 'admin', clinica_id: 'clinic' } }) }));
vi.mock('./voiceInputService', () => ({ voiceAvailable: vi.fn(() => false), captureVoiceInput: vi.fn() }));
vi.mock('../../../api/patients', () => ({ getPaciente: async () => ({ nombre: 'Laura', apellidos: 'Prueba' }) }));
const patient = '64af3dc7-57e7-5871-b5c5-761fdac29e36';
function open() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[`/pacientes?paciente_id=${patient}&tab=sesion`]}><AssistantFloatingButton /></MemoryRouter></QueryClientProvider>);
  act(() => window.dispatchEvent(new Event('dentcore:open-assistant')));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(voiceAvailable).mockReturnValue(false);
  HTMLElement.prototype.scrollTo = vi.fn();
});
describe('Copilot', () => {
  it('keeps conversation across patient navigation and clears drafts from the previous patient', async () => {
    const user = userEvent.setup();
    const nextPatient = '7a31e8d8-55af-41a9-a830-3954a7e41851';
    vi.mocked(askCopilot).mockResolvedValueOnce({
      message: 'Conversación anterior',
      sources: [{ label: 'Abrir otro paciente', path: `/pacientes?paciente_id=${nextPatient}&tab=sesion` }],
      proposal: { id: 'old', label: 'Confirmar nota anterior', steps: [] },
    }).mockResolvedValueOnce({ message: 'Nuevo contexto', sources: [] });
    open();
    await user.type(screen.getByRole('textbox'), 'Primera petición');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await user.click(await screen.findByRole('button', { name: 'Abrir otro paciente' }));
    act(() => window.dispatchEvent(new Event('dentcore:open-assistant')));
    expect(screen.getByText('Conversación anterior')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmar nota anterior' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Y ahora este paciente');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await screen.findByText('Nuevo contexto');
    const calls = vi.mocked(askCopilot).mock.calls;
    expect(calls[0][0].session_id).toBe(calls[1][0].session_id);
    expect(calls[1][0].context.patient_id).toBe(nextPatient);
    expect(confirmCopilot).not.toHaveBeenCalled();
  });
  it('unlocks immediately on stop and a late response cannot unlock a newer request', async () => {
    const user = userEvent.setup();
    let resolveOld!: (result: { message: string; sources: [] }) => void;
    let resolveNew!: (result: { message: string; sources: [] }) => void;
    vi.mocked(askCopilot)
      .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
      .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
    open();
    await user.type(screen.getByRole('textbox'), 'Primera consulta');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await user.click(screen.getByRole('button', { name: 'Detener consulta' }));
    expect(screen.getByRole('textbox')).toBeEnabled();
    await user.type(screen.getByRole('textbox'), 'Segunda consulta');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await act(async () => resolveOld({ message: 'Respuesta antigua', sources: [] }));
    expect(screen.queryByText('Respuesta antigua')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    await act(async () => resolveNew({ message: 'Respuesta actual', sources: [] }));
    expect(screen.getByText('Respuesta actual')).toBeVisible();
    expect(screen.getByRole('textbox')).toBeEnabled();
  });
  it('shows the real patient context and stops late responses when the panel is closed', async () => {
    const user = userEvent.setup();
    let resolve!: (result: { message: string; sources: []; navigation: string }) => void;
    vi.mocked(askCopilot).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    open();
    await screen.findByText('Laura Prueba');
    await user.type(screen.getByRole('textbox'), 'Abre agenda');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar asistente' }));
    expect(vi.mocked(askCopilot).mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => resolve({ message: 'Respuesta tardía', navigation: '/jornada?vista=agenda', sources: [] }));
    act(() => window.dispatchEvent(new Event('dentcore:open-assistant')));
    expect(screen.queryByText('Respuesta tardía')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
  it('keeps confirmation visible until the saved result is known', async () => {
    const user = userEvent.setup();
    let resolve!: (result: { message: string; sources: []; saved: boolean }) => void;
    vi.mocked(askCopilot).mockResolvedValue({ message: 'Revisa', sources: [], proposal: { id: 'proposal', label: 'Confirmar nota', steps: [] } });
    vi.mocked(confirmCopilot).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    open();
    await user.type(screen.getByRole('textbox'), 'Anota revisión');
    await user.click(screen.getByRole('button', { name: 'Enviar petición' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar nota' }));
    await user.keyboard('{Escape}');
    fireEvent.keyDown(window, { code: 'Space', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Asistente DentCore' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cerrar asistente' })).toBeDisabled();
    await act(async () => resolve({ message: 'Guardado', sources: [], saved: true }));
    expect(screen.getByRole('button', { name: 'Cerrar asistente' })).toBeEnabled();
  });
  it('appends voice to the existing draft without sending it automatically', async () => {
    const user = userEvent.setup();
    vi.mocked(voiceAvailable).mockReturnValue(true);
    vi.mocked(captureVoiceInput).mockResolvedValue('mañana por la tarde');
    open();
    await user.type(screen.getByRole('textbox'), 'Buscar hueco');
    await user.click(screen.getByRole('button', { name: 'Dictar petición' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Buscar hueco mañana por la tarde'));
    expect(askCopilot).not.toHaveBeenCalled();
  });
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
