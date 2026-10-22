import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { LoginScreen } from './components/LoginScreen';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { CompanyTab } from './components/CompanyTab';
import { DirectoryTab } from './components/DirectoryTab';
import { EvolutionTab } from './components/EvolutionTab';
import { IngestaTab } from './components/IngestaTab';
import { UserManagementTab } from './components/UserManagementTab';
import { TabType } from './types';

export const App: React.FC = () => {
  const { user, userRole, loading } = useAuth();
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
      <div id="appContainer">
        <Navbar currentTab={currentTab} onTabChange={handleTabChange} />
        <main className="main-content">
          {currentTab === 'dashboard' && <DashboardTab onNavigate={handleTabChange} />}
          {currentTab === 'evolucion' && <EvolutionTab />}
          {currentTab === 'empresas' && <CompanyTab onNavigate={handleTabChange} />}
          {currentTab === 'directorio' && (userRole === 'admin' ? <DirectoryTab /> : <DashboardTab onNavigate={handleTabChange} />)}
          {currentTab === 'ingesta' && (userRole === 'admin' ? <IngestaTab /> : <DashboardTab onNavigate={handleTabChange} />)}
          {currentTab === 'usuarios' && (userRole === 'admin' ? <UserManagementTab /> : <DashboardTab onNavigate={handleTabChange} />)}
        </main>
      </div>
    </DataProvider>
  );
};
