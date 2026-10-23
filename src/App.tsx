import React, { lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';

const AuthenticatedApp = lazy(() =>
  import('./AuthenticatedApp').then((module) => ({ default: module.AuthenticatedApp }))
);

const AppLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#080c14',
    color: '#38bdf8',
    fontFamily: 'Plus Jakarta Sans, sans-serif'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid rgba(56, 189, 248, 0.2)',
      borderTopColor: '#38bdf8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginBottom: '1rem'
    }} />
    <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Conectando con TrackSIM CLOUD...</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppLoadingFallback />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Suspense fallback={<AppLoadingFallback />}>
      <AuthenticatedApp />
    </Suspense>
  );
};
