import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalDictationModal } from './ClinicalDictation';
import { saveClinicalDictationNote, transcribeClinicalDictation } from '../../../api/ai';

vi.mock('../../../api/ai', () => ({ transcribeClinicalDictation: vi.fn(), saveClinicalDictationNote: vi.fn() }));
class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null; onerror: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.(); }
}
const stopTrack = vi.fn(), getUserMedia = vi.fn();
function open() {
  const onSaved = vi.fn(), onClose = vi.fn();
  const result = render(<ClinicalDictationModal pacienteId="pac-1" pacienteNombre="Laura Prueba" contexto="sesion" citaId="visit-1" onClose={onClose} onSaved={onSaved} />);
  return { ...result, onSaved, onClose };
}
async function record(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Iniciar grabación' }));
  await user.click(screen.getByRole('button', { name: 'Detener grabación' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  URL.createObjectURL = vi.fn(() => 'blob:test-audio'); URL.revokeObjectURL = vi.fn();
  vi.mocked(transcribeClinicalDictation).mockResolvedValue({ dictado_id: 'dict-1', paciente_id: 'pac-1', transcripcion: 'Revisar pieza 24.', estado: 'transcrito', proveedor: 'local_whisper', audio_conservado: false });
  vi.mocked(saveClinicalDictationNote).mockResolvedValue({ dictado_id: 'dict-1', nota_id: 'note-1', paciente_id: 'pac-1', texto: 'Texto revisado', fecha: '2026-09-25', origen: 'dictado_clinico', cita_id: 'visit-1' });
});
describe('Clinical dictation', () => {
  it('records, explicitly transcribes and saves reviewed text linked to the current visit', async () => {
    const user = userEvent.setup(), { onSaved } = open();
    await record(user);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeClinicalDictation).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Escuchar grabación')).toHaveAttribute('src', 'blob:test-audio');
    await user.click(screen.getByRole('button', { name: 'Transcribir audio' }));
    const editor = await screen.findByDisplayValue('Revisar pieza 24.');
    await user.clear(editor); await user.type(editor, 'Texto revisado');
    await user.click(screen.getByRole('button', { name: 'Guardar en sesión' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveClinicalDictationNote).toHaveBeenCalledWith('pac-1', expect.objectContaining({ dictado_id: 'dict-1', texto: 'Texto revisado', cita_id: 'visit-1', request_id: expect.any(String) }));
  });
  it('retains the audio and written text after a transcription failure and supports retry', async () => {
    const user = userEvent.setup(); open();
    await user.type(screen.getByRole('textbox', { name: 'Texto editable' }), 'Observación previa.');
    await record(user);
    vi.mocked(transcribeClinicalDictation).mockRejectedValueOnce(new Error('Motor ocupado'));
    await user.click(screen.getByRole('button', { name: 'Transcribir audio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Motor ocupado');
    expect(screen.getByRole('link', { name: 'Descargar audio' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Transcribir audio' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Texto editable' })).toHaveValue('Observación previa.\n\nRevisar pieza 24.'));
    const calls = vi.mocked(transcribeClinicalDictation).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(saveClinicalDictationNote).not.toHaveBeenCalled();
  });
  it('can transcribe an uploaded recording and releases its object URL', async () => {
    const user = userEvent.setup(), { unmount } = open();
    const file = new File(['wav'], 'sesion.wav', { type: 'audio/wav' });
    await user.upload(screen.getByLabelText('Archivo de audio'), file);
    await user.click(screen.getByRole('button', { name: 'Transcribir audio' }));
    await screen.findByDisplayValue('Revisar pieza 24.');
    expect(transcribeClinicalDictation).toHaveBeenCalledWith('pac-1', file, expect.objectContaining({ contexto: 'sesion' }));
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-audio');
  });
  it('keeps manual text available when microphone permission is denied and reuses the save request on retry', async () => {
    const user = userEvent.setup(); open();
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await user.click(screen.getByRole('button', { name: 'Iniciar grabación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de micrófono denegado');
    await user.type(screen.getByRole('textbox', { name: 'Texto editable' }), 'Nota manual');
    vi.mocked(saveClinicalDictationNote).mockRejectedValueOnce(new Error('Sin conexión'));
    await user.click(screen.getByRole('button', { name: 'Guardar en sesión' }));
    await screen.findByText('Sin conexión');
    await user.click(screen.getByRole('button', { name: 'Guardar en sesión' }));
    const calls = vi.mocked(saveClinicalDictationNote).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(transcribeClinicalDictation).not.toHaveBeenCalled();
  });
  it('requires explicit discard and never saves on Escape', async () => {
    const user = userEvent.setup(), { onClose } = open();
    await user.type(screen.getByRole('textbox', { name: 'Texto editable' }), 'Borrador');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('textbox')).toHaveValue('Borrador');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar y cerrar' }));
    expect(onClose).toHaveBeenCalledOnce(); expect(saveClinicalDictationNote).not.toHaveBeenCalled();
  });
  it('releases a microphone granted after the dialog has unmounted', async () => {
    let grant!: (stream: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
    getUserMedia.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const { unmount } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar grabación' }));
    unmount();
    await act(async () => grant({ getTracks: () => [{ stop: stopTrack }] }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeClinicalDictation).not.toHaveBeenCalled();
  });
});
