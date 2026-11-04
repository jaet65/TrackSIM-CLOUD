import React from 'react';
import {
  Building2,
  ClipboardList,
  FileText,
  FileUp,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  TrendingUp,
  UsersRound,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BrandLogo } from './BrandLogo';
import { ThemeToggleButton } from './ThemeToggleButton';
import { TabType } from '../types';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
}

interface NavigationItem {
  id: TabType;
  icon: LucideIcon;
  label: string;
}

const getNavigationItems = (userRole: string | null, isDemo: boolean): NavigationItem[] => {
  const items: NavigationItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'evolucion', icon: TrendingUp, label: 'Evolución' },
    { id: 'empresas', icon: Building2, label: 'Métricas' }
  ];

  if (userRole === 'admin' && !isDemo) {
    items.push(
      { id: 'directorio', icon: ClipboardList, label: 'Directorio' },
      { id: 'ingesta', icon: FileUp, label: 'Ingesta PDF' },
      { id: 'usuarios', icon: UsersRound, label: 'Usuarios' }
    );
  }

  return items;
};

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, isCollapsed, onCollapsedChange }) => {
  const { userRole, isDemo } = useAuth();
  const navigationItems = getNavigationItems(userRole, isDemo);

  const handleNavigation = (tab: TabType) => {
    onTabChange(tab);
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches) {
      onCollapsedChange(true);
    }
  };

  return (
    <aside className={`navbar no-print ${isCollapsed ? 'is-collapsed' : 'is-expanded'}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">
          <BrandLogo />
        </div>
        {!isCollapsed && (
          <div className="brand-text">
            <h1>TrackSIM</h1>
            <span>Cloud Analytics</span>
          </div>
        )}
      </div>

      <nav aria-label="Navegación principal">
        <ul className="nav-links">
          {navigationItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
                onClick={() => handleNavigation(item.id)}
                aria-label={item.label}
                title={isCollapsed ? item.label : undefined}
                aria-current={currentTab === item.id ? 'page' : undefined}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <item.icon size={18} strokeWidth={1.8} />
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            </li>
          ))}
          <li className="nav-links-separator">
            <a
              className="nav-item"
              href="https://tracksim-zero.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TrackSIM PRO"
              title={isCollapsed ? 'TrackSIM PRO' : undefined}
            >
              <span className="nav-item-icon" aria-hidden="true">
                <FileText size={18} strokeWidth={1.8} />
              </span>
              <span className="nav-label">TrackSIM PRO</span>
            </a>
          </li>
        </ul>
      </nav>

      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => onCollapsedChange(!isCollapsed)}
        aria-label={isCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
        title={isCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
      >
        {isCollapsed ? <Menu size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
        {!isCollapsed && <span className="nav-label">Contraer</span>}
      </button>
    </aside>
  );
};

export const AppHeader: React.FC<{ isCollapsed: boolean }> = ({ isCollapsed }) => {
  const { user, userRole, allowedCompanies, profile, logout, isDemo } = useAuth();
  const { companies, selectedCompany, setSelectedCompany } = useData();
  const limitedCompany =
    profile?.empresaPermitida ||
    (allowedCompanies && allowedCompanies.length > 0 && allowedCompanies[0] !== 'all' ? allowedCompanies[0] : null) ||
    (selectedCompany !== 'all' ? selectedCompany : 'Flota Asignada');

  return (
    <header className="app-topbar no-print">
      {isCollapsed && (
        <div className="brand-badge">
          <div className="brand-text">
            <h1>TrackSIM</h1>
            <span>Cloud Analytics</span>
          </div>
        </div>
      )}

      <div className="topbar-actions">
        {!isDemo && (userRole === 'admin' ? (
          <div
            className="badge admin-status-badge"
            title={`Sesión de Administrador Global • Viendo: ${selectedCompany === 'all' ? 'Todas las Empresas' : selectedCompany}`}
          >
            <span aria-hidden="true">👑</span>
            <span>Admin</span>
            <select
              aria-label="Filtrar por empresa"
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
            >
              <option value="all">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="badge viewer-status-badge" title={`Flota asignada: ${limitedCompany}`}>
            <span aria-hidden="true">🏢</span>
            <span>{limitedCompany}</span>
          </div>
        ))}

        <ThemeToggleButton />

        <div className="user-profile">
          <div className="user-info">
            <div className="user-name">{isDemo ? 'Sesión de demostración' : user?.displayName || user?.email?.split('@')[0]}</div>
            <div className="user-role">{isDemo ? 'Datos simulados' : user?.email}</div>
          </div>
        </div>

        <button
          type="button"
          className="auth-btn"
          onClick={() => logout()}
          title="Cerrar sesión"
          aria-label={isDemo ? 'Salir de demo' : 'Cerrar sesión'}
        >
          <span aria-hidden="true">🚪</span> {isDemo ? 'Salir de demo' : 'Salir'}
        </button>
      </div>
    </header>
  );
};
