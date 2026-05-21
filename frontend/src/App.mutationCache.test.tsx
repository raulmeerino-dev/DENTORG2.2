import { MutationCache, QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const error = vi.fn();
  const success = vi.fn();
  return {
    toast: { error, success },
    Toaster: () => null,
  };
});

const { toast } = await import('sonner');
const { getApiErrorMessage } = await import('./lib/api');

function buildClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError) return;
        toast.error(getApiErrorMessage(error, 'No se pudo completar la operación.'));
      },
    }),
  });
}

function MutationProbe({ withLocalHandler }: { withLocalHandler: boolean }) {
  const localOnError = vi.fn();
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error('Recurso no encontrado en el servidor.');
    },
    ...(withLocalHandler ? { onError: localOnError } : {}),
  });
  return (
    <div>
      <button type="button" onClick={() => mutation.mutate(undefined)}>fire</button>
      {mutation.isError && <span data-testid="status">errored</span>}
    </div>
  );
}

describe('global MutationCache.onError', () => {
  beforeEach(() => {
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });

  it('muestra toast accionable cuando la mutation falla y NO tiene onError local', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={buildClient()}>
        <MutationProbe withLocalHandler={false} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /fire/i }));
    await waitFor(() => expect(screen.getByTestId('status')).toBeInTheDocument());

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/Recurso no encontrado en el servidor/i);
  });

  it('NO muestra toast global cuando la mutation define onError local', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={buildClient()}>
        <MutationProbe withLocalHandler={true} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /fire/i }));
    await waitFor(() => expect(screen.getByTestId('status')).toBeInTheDocument());

    expect(toast.error).not.toHaveBeenCalled();
  });
});
