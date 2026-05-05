import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

const authState = {
  isAuthenticated: false,
  login: vi.fn<() => Promise<void>>(),
};

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.login = vi.fn().mockResolvedValue(undefined);
  });

  it('renders the clinical login form and keeps submit disabled until credentials are present', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    const submit = screen.getByRole('button', { name: /entrar/i });
    expect(screen.getByRole('heading', { name: /acceso/i })).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contrase/i), 'admin1234');

    expect(submit).toBeEnabled();
  });

  it('submits username, password and optional 2FA code', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    await userEvent.type(screen.getByLabelText(/usuario/i), 'admin');
    await userEvent.type(screen.getByLabelText(/contrase/i), 'admin1234');
    await userEvent.type(screen.getByLabelText(/2fa/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(authState.login).toHaveBeenCalledWith('admin', 'admin1234', '123456');
  });
});
