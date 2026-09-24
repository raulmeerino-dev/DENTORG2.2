import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocumentosPanel } from './Documentos';

function renderPanel(onSubir = vi.fn()) {
  return render(
    <DocumentosPanel
      pacienteId="pac-1"
      documentos={[]}
      uploadOpen
      onUploadOpenChange={vi.fn()}
      onSubir={onSubir}
      onAbrirDocumento={vi.fn()}
      onContextDocumento={vi.fn()}
    />,
  );
}

describe('DocumentosPanel', () => {
  it('muestra error visible si la API rechaza la subida', async () => {
    const user = userEvent.setup();
    const onSubir = vi.fn().mockRejectedValue(new Error('Tipo MIME no permitido'));
    const { container } = renderPanel(onSubir);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(['%PDF-1.7 contenido'], 'informe.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: /Guardar documento/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Tipo MIME no permitido'));
    expect(onSubir).toHaveBeenCalledTimes(1);
  });

  it('bloquea formatos no permitidos antes de llamar a la API', async () => {
    const user = userEvent.setup();
    const onSubir = vi.fn();
    const { container } = renderPanel(onSubir);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['texto'], 'notas.txt', { type: 'text/plain' })] } });
    await user.click(screen.getByRole('button', { name: /Guardar documento/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Formato no permitido/i);
    expect(onSubir).not.toHaveBeenCalled();
  });
});
