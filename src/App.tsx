import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { LoginScreen } from './components/LoginScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { CompanyTab } from './components/CompanyTab';
import { DirectoryTab } from './components/DirectoryTab';
import { EvolutionTab } from './components/EvolutionTab';
import { IngestaTab } from './components/IngestaTab';
import { UserManagementTab } from './components/UserManagementTab';
import { TabType } from './types';

const MainLayout: React.FC = () => {
  const { userRole, allowedCompanies, profile } = useAuth();
  const { roleAllowedEvaluations, companies, loading: dataLoading, initialLoaded } = useData();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  // Si un usuario no admin intenta entrar a una pestaña restringida, redirigir a dashboard
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

  // Validación de Lobby para usuarios "viewer"
  if (userRole !== 'admin') {
    const rawCompany =
      (allowedCompanies.length > 0 && !allowedCompanies.includes('all') ? allowedCompanies[0] : null) ||
      (profile?.empresaPermitida && profile.empresaPermitida !== 'all' ? profile.empresaPermitida : null) ||
      '';

    const hasNoCompany = !rawCompany || rawCompany.trim() === '';

    if (hasNoCompany) {
      return <LobbyScreen reason="no_company" />;
    }

    // Si aún no termina la primera verificación con Firestore, no mostrar el dashboard viejo
    if (!initialLoaded) {
      return (
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
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Verificando estado de la empresa...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    // Una vez confirmados los datos en Firestore:
    const companyExistsInCatalog = companies.includes(rawCompany);
    const companyHasEvaluations = (roleAllowedEvaluations || []).length > 0;

    if (!companyExistsInCatalog && !companyHasEvaluations) {
      return <LobbyScreen reason="company_not_found" assignedCompany={rawCompany} />;
    }

    if (companyExistsInCatalog && !companyHasEvaluations) {
      return <LobbyScreen reason="no_data" assignedCompany={rawCompany} />;
    }
  }

  return (
    <div id="appContainer">
      <Navbar currentTab={currentTab} onTabChange={handleTabChange} />
      <main
        className="main-content"
        style={currentTab === 'directorio' || currentTab === 'usuarios' || currentTab === 'ingesta' ? { maxWidth: '100%', padding: '1.5rem 2rem' } : undefined}
      >
        {currentTab === 'dashboard' && <DashboardTab onNavigate={handleTabChange} />}
        {currentTab === 'evolucion' && <EvolutionTab />}
        {currentTab === 'empresas' && <CompanyTab onNavigate={handleTabChange} />}
        {currentTab === 'directorio' && (userRole === 'admin' ? <DirectoryTab /> : <DashboardTab onNavigate={handleTabChange} />)}
        {currentTab === 'ingesta' && (userRole === 'admin' ? <IngestaTab /> : <DashboardTab onNavigate={handleTabChange} />)}
        {currentTab === 'usuarios' && (userRole === 'admin' ? <UserManagementTab /> : <DashboardTab onNavigate={handleTabChange} />)}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
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
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <DataProvider>
      <MainLayout />
    </DataProvider>
  );
};

