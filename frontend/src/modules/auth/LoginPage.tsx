import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import dentcoreLogo from '../../assets/branding/dentcore-clinic-logo-192.png';
import './login.css';

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
      <form className="login-panel" onSubmit={handleSubmit} aria-labelledby="login-title">
        <header className="login-brand">
          <img src={dentcoreLogo} alt="" aria-hidden="true" />
          <span>
            <strong>DentCore Clinic</strong>
            <small>Gestión clínica dental</small>
          </span>
        </header>

        <div className="login-intro">
          <p className="eyebrow">Acceso profesional</p>
          <h1 id="login-title">Entrar en la clínica</h1>
          <p>Usa las credenciales asignadas a tu perfil.</p>
        </div>

        <div className="login-fields">
          <label>
            Usuario
            <input
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            <span className="login-label-row">
              <span>Código 2FA</span>
              <small>Opcional</small>
            </span>
            <input
              name="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Solo si está activado"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={loading || !username || !password}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <footer className="login-security-note">
          <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
          <span>Los accesos y cambios sensibles quedan registrados.</span>
        </footer>
      </form>
    </main>
  );
}
