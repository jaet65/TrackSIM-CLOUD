import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Error al autenticar con Google. Intente nuevamente.');
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoadingForm(true);
    try {
      if (activeTab === 'signin') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo ya está registrado. Inicie sesión.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setError(err.message || 'Error de autenticación.');
      }
    } finally {
      setLoadingForm(false);
    }
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src="/Logo.png" alt="TrackSIM Logo" className="brand-logo-img" />
          </div>
          <h2>TrackSIM CLOUD</h2>
          <p>Trazabilidad y Evaluación de Operadores</p>
        </div>

        {error && <div className="login-alert" style={{ display: 'block' }}>{error}</div>}

        <div style={{ marginBottom: '0.5rem' }}>
          <button
            className="login-btn-google"
            type="button"
            onClick={handleGoogleLogin}
            disabled={loadingGoogle}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>{loadingGoogle ? 'Conectando con Google...' : 'Acceso con Google'}</span>
          </button>
          <div className="domain-hint">
            * Cuentas <strong>@corporativomaf.com</strong> ingresan automáticamente como Administrador.
          </div>
        </div>

        <div className="login-divider">
          <span>O con tu correo</span>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => setActiveTab('signin')}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => setActiveTab('signup')}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleFormSubmit}>
          <div className="form-group">
            <label>Correo Electrónico:</label>
            <input
              type="email"
              className="form-control"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña:</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-login-submit" disabled={loadingForm}>
            {loadingForm
              ? 'Procesando...'
              : activeTab === 'signin'
              ? 'Entrar a la Plataforma'
              : 'Completar Registro'}
          </button>
        </form>
      </div>
    </div>
  );
};
