import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppStatus from './AppStatus';

describe('AppStatus', () => {
  it('shows a calm ready state when there is no network activity', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AppStatus />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/sistema listo/i)).toBeInTheDocument();
  });
});
