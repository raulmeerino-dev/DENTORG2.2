import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalDictationButton, ClinicalDictationModal } from './ClinicalDictation';
import { saveClinicalDictationNote, transcribeClinicalDictation } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  transcribeClinicalDictation: vi.fn(),
  saveClinicalDictationNote: vi.fn(),
}));

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function stubMicrophone(success = true) {
  const stop = vi.fn();
  const getUserMedia = success
    ? vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    : vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  return { getUserMedia, stop };
}

describe('ClinicalDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMicrophone(true);
    vi.mocked(transcribeClinicalDictation).mockResolvedValue({
      dictado_id: 'dictado-1',
      paciente_id: 'pac-1',
      transcripcion: 'Texto transcrito inicial',
      estado: 'transcrito',
      proveedor: 'test',
      audio_conservado: false,
    });
    vi.mocked(saveClinicalDictationNote).mockResolvedValue({
      dictado_id: 'dictado-1',
      nota_id: 'nota-1',
      paciente_id: 'pac-1',
      texto: 'Texto transcrito inicial',
      fecha: '2026-06-24',
      origen: 'dictado_clinico',
    });
  });

  it('el boton abre el modal en un flujo contenedor', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <ClinicalDictationButton label="Dictar nota" onClick={() => setOpen(true)} />
          {open && (
            <ClinicalDictationModal
              pacienteId="pac-1"
              pacienteNombre="Laura Dictado"
              contexto="ficha"
              onClose={() => setOpen(false)}
              onSaved={vi.fn()}
            />
          )}
        </>
      );
    }

    render(<Wrapper />);
    await user.click(screen.getByRole('button', { name: 'Dictar nota' }));
    expect(screen.getByRole('dialog', { name: 'Dictado clinico' })).toBeInTheDocument();
  });

  it('muestra estado de grabacion y luego transcripcion editable', async () => {
    const user = userEvent.setup();
    render(
      <ClinicalDictationModal
        pacienteId="pac-1"
        pacienteNombre="Laura Dictado"
        contexto="ficha"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Iniciar grabacion/i }));
    expect(screen.getByText('Grabando')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Detener/i }));

    expect(await screen.findByDisplayValue('Texto transcrito inicial')).toBeInTheDocument();
    expect(transcribeClinicalDictation).toHaveBeenCalledWith(
      'pac-1',
      expect.any(Blob),
      expect.objectContaining({ contexto: 'ficha' }),
    );
  });

  it('muestra error si el microfono se deniega', async () => {
    stubMicrophone(false);
    const user = userEvent.setup();
    render(
      <ClinicalDictationModal
        pacienteId="pac-1"
        pacienteNombre="Laura Dictado"
        contexto="ficha"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Iniciar grabacion/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de microfono denegado.');
  });

  it('guardar llama al endpoint correcto con el texto editado', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <ClinicalDictationModal
        pacienteId="pac-1"
        pacienteNombre="Laura Dictado"
        contexto="sesion"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Iniciar grabacion/i }));
    await user.click(screen.getByRole('button', { name: /Detener/i }));
    const textarea = await screen.findByDisplayValue('Texto transcrito inicial');
    await user.clear(textarea);
    await user.type(textarea, 'Texto revisado por doctor');
    await user.click(screen.getByRole('button', { name: /Guardar como nota clinica/i }));

    await waitFor(() => {
      expect(saveClinicalDictationNote).toHaveBeenCalledWith('pac-1', {
        dictado_id: 'dictado-1',
        texto: 'Texto revisado por doctor',
      });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('descartar cierra sin guardar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ClinicalDictationModal
        pacienteId="pac-1"
        pacienteNombre="Laura Dictado"
        contexto="ficha"
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Iniciar grabacion/i }));
    await user.click(screen.getByRole('button', { name: /Detener/i }));
    await screen.findByDisplayValue('Texto transcrito inicial');
    await user.click(screen.getByRole('button', { name: /Descartar/i }));

    expect(saveClinicalDictationNote).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
