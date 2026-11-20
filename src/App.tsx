import React, { lazy, Suspense } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { TrackyLoadingScreen } from './components/TrackyLoadingScreen';
import { useAuth } from './context/AuthContext';
import { SystemDialogProvider } from './context/SystemDialogContext';

const AuthenticatedApp = lazy(() =>
  import('./AuthenticatedApp').then((module) => ({ default: module.AuthenticatedApp }))
);

const AppLoadingFallback: React.FC = () => <TrackyLoadingScreen message="Conectando con TrackSIM CLOUD..." />;

export const App: React.FC = () => {
  const { user, isDemo, loading } = useAuth();

  if (loading) {
    return <AppLoadingFallback />;
  }

  if (!user && !isDemo) {
    return <LoginScreen />;
  }

  return (
    <SystemDialogProvider>
      <Suspense fallback={<AppLoadingFallback />}>
        <AuthenticatedApp />
      </Suspense>
    </SystemDialogProvider>
  );
};
