import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/pacientes" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password, otp || undefined);
    } catch {
      setError('Usuario, contraseña o código 2FA incorrectos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">DentOrg2</p>
          <h1>Acceso clínica</h1>
        </div>
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Código 2FA
          <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Solo si está activado" inputMode="numeric" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={loading || !username || !password}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
