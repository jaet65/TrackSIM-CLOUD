import React, { lazy, Suspense, useState } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { useAuth } from './context/AuthContext';
import { LobbyScreen } from './components/LobbyScreen';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { TabType } from './types';

const EvolutionTab = lazy(() => import('./components/EvolutionTab').then((m) => ({ default: m.EvolutionTab })));
const CompanyTab = lazy(() => import('./components/CompanyTab').then((m) => ({ default: m.CompanyTab })));
const DirectoryTab = lazy(() => import('./components/DirectoryTab').then((m) => ({ default: m.DirectoryTab })));
const IngestaTab = lazy(() => import('./components/IngestaTab').then((m) => ({ default: m.IngestaTab })));
const UserManagementTab = lazy(() => import('./components/UserManagementTab').then((m) => ({ default: m.UserManagementTab })));

const TabLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    color: 'var(--primary)',
    fontFamily: 'Plus Jakarta Sans, sans-serif'
  }}>
    <div style={{
      width: '36px',
      height: '36px',
      border: '3px solid rgba(56, 189, 248, 0.2)',
      borderTopColor: '#38bdf8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginBottom: '0.85rem'
    }} />
    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Cargando módulo...</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const InitialLoadingScreen: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-app)',
      color: 'var(--primary)',
      fontFamily: 'Plus Jakarta Sans, sans-serif'
    }}
  >
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid rgba(56, 189, 248, 0.2)',
      borderTopColor: '#38bdf8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginBottom: '1rem'
    }} />
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const MainLayout: React.FC = () => {
  const { userRole, allowedCompanies, profile } = useAuth();
  const { roleAllowedEvaluations, companies, initialLoaded } = useData();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  const handleTabChange = (tab: TabType) => {
    if (userRole !== 'admin' && (tab === 'directorio' || tab === 'ingesta' || tab === 'usuarios')) {
      setCurrentTab('dashboard');
      window.scrollTo(0, 0);
      return;
    }
    setCurrentTab(tab);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
  };

  if (userRole !== 'admin') {
    const rawCompany =
      (allowedCompanies.length > 0 && !allowedCompanies.includes('all') ? allowedCompanies[0] : null) ||
      (profile?.empresaPermitida && profile.empresaPermitida !== 'all' ? profile.empresaPermitida : null) ||
      '';

    const hasNoCompany = !rawCompany || rawCompany.trim() === '';
    if (hasNoCompany) {
      return <LobbyScreen reason="no_company" />;
    }

    if (!initialLoaded) {
      return <InitialLoadingScreen message="Verificando estado de la empresa..." />;
    }

    const companyExistsInCatalog = companies.includes(rawCompany);
    const companyHasEvaluations = (roleAllowedEvaluations || []).length > 0;
    if (!companyExistsInCatalog && !companyHasEvaluations) {
      return <LobbyScreen reason="company_not_found" assignedCompany={rawCompany} />;
    }
    if (companyExistsInCatalog && !companyHasEvaluations) {
      return <LobbyScreen reason="no_data" assignedCompany={rawCompany} />;
    }
  }

  if (!initialLoaded) {
    return <InitialLoadingScreen message="Cargando registros..." />;
  }

  return (
    <div id="appContainer">
      <Navbar currentTab={currentTab} onTabChange={handleTabChange} />
      <main
        className="main-content"
        style={currentTab === 'directorio' || currentTab === 'usuarios' || currentTab === 'ingesta' ? { maxWidth: '100%', padding: '1.5rem 2rem' } : undefined}
      >
        <Suspense fallback={<TabLoadingFallback />}>
          {currentTab === 'dashboard' && <DashboardTab onNavigate={handleTabChange} />}
          {currentTab === 'evolucion' && <EvolutionTab />}
          {currentTab === 'empresas' && <CompanyTab onNavigate={handleTabChange} />}
          {currentTab === 'directorio' && (userRole === 'admin' ? <DirectoryTab /> : <DashboardTab onNavigate={handleTabChange} />)}
          {currentTab === 'ingesta' && (userRole === 'admin' ? <IngestaTab /> : <DashboardTab onNavigate={handleTabChange} />)}
          {currentTab === 'usuarios' && (userRole === 'admin' ? <UserManagementTab /> : <DashboardTab onNavigate={handleTabChange} />)}
        </Suspense>
      </main>
    </div>
  );
};

export const AuthenticatedApp: React.FC = () => (
  <DataProvider>
    <MainLayout />
  </DataProvider>
);
