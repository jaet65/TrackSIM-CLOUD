import React, { lazy, Suspense, useState } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { useAuth } from './context/AuthContext';
import { LobbyScreen } from './components/LobbyScreen';
import { TrackyLoadingScreen } from './components/TrackyLoadingScreen';
import { FloatingAiInsightsButton } from './components/company/FloatingAiInsightsButton';
import { AppHeader, Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { TabType } from './types';

const EvolutionTab = lazy(() => import('./components/EvolutionTab').then((m) => ({ default: m.EvolutionTab })));
const CompanyTab = lazy(() => import('./components/CompanyTab').then((m) => ({ default: m.CompanyTab })));
const DirectoryTab = lazy(() => import('./components/DirectoryTab').then((m) => ({ default: m.DirectoryTab })));
const IngestaTab = lazy(() => import('./components/IngestaTab').then((m) => ({ default: m.IngestaTab })));
const UserManagementTab = lazy(() => import('./components/UserManagementTab').then((m) => ({ default: m.UserManagementTab })));

const TabLoadingFallback: React.FC = () => <TrackyLoadingScreen message="Cargando módulo..." compact />;

const InitialLoadingScreen: React.FC<{ message: string }> = ({ message }) => <TrackyLoadingScreen message={message} />;

const MainLayout: React.FC = () => {
  const { userRole, allowedCompanies, profile, isDemo } = useAuth();
  const { roleAllowedEvaluations, companies, initialLoaded } = useData();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const handleTabChange = (tab: TabType) => {
    if ((isDemo || userRole !== 'admin') && (tab === 'directorio' || tab === 'ingesta' || tab === 'usuarios')) {
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

  if (!isDemo && userRole !== 'admin') {
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
    <div id="appContainer" className={isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}>
      <Navbar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
      />
      <div className="app-content">
        <AppHeader isCollapsed={isSidebarCollapsed} />
        <main
          className="main-content"
          style={currentTab === 'directorio' || currentTab === 'usuarios' || currentTab === 'ingesta' ? { maxWidth: '100%', padding: '1.5rem 2rem' } : undefined}
        >
          <Suspense fallback={<TabLoadingFallback />}>
            {currentTab === 'dashboard' && <DashboardTab onNavigate={handleTabChange} />}
            {currentTab === 'evolucion' && <EvolutionTab />}
            {currentTab === 'empresas' && <CompanyTab onNavigate={handleTabChange} />}
            {currentTab === 'directorio' && (userRole === 'admin' && !isDemo ? <DirectoryTab /> : <DashboardTab onNavigate={handleTabChange} />)}
            {currentTab === 'ingesta' && (userRole === 'admin' && !isDemo ? <IngestaTab /> : <DashboardTab onNavigate={handleTabChange} />)}
            {currentTab === 'usuarios' && (userRole === 'admin' && !isDemo ? <UserManagementTab /> : <DashboardTab onNavigate={handleTabChange} />)}
          </Suspense>
        </main>
      </div>
      <FloatingAiInsightsButton />
    </div>
  );
};

export const AuthenticatedApp: React.FC = () => (
  <DataProvider>
    <MainLayout />
  </DataProvider>
);
