import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { BrandLogo } from './BrandLogo';
import { ThemeToggleButton } from './ThemeToggleButton';
import { TabType } from '../types';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, userRole, allowedCompanies, profile, logout, isDemo } = useAuth();
  const { companies, selectedCompany, setSelectedCompany } = useData();
  const { theme } = useTheme();

  // Calcular el texto y estilo del badge de empresa/rol
  const renderStatusBadge = () => {
    if (userRole === 'admin') {
      const activeCompanyName = selectedCompany === 'all' ? 'Todas las Empresas' : selectedCompany;
      return (
        <div
          className="badge"
          title={`Sesión de Administrador Global • Viendo: ${activeCompanyName}`}
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.2))',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: '#fbbf24',
            padding: '0.4rem 0.85rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.15)'
          }}
        >
          <span>👑</span>
          <span>Admin</span>
          <select
            aria-label="Filtrar por empresa"
            value={selectedCompany}
            onChange={(event) => setSelectedCompany(event.target.value)}
            style={{
              maxWidth: '190px',
              minWidth: '130px',
              padding: '0.25rem 1.5rem 0.25rem 0.5rem',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '9999px',
              background: 'var(--bg-surface)',
              color: 'var(--text-main)',
              colorScheme: theme,
              fontSize: '0.75rem',
              fontWeight: 600
            }}
          >
            <option value="all">Todas las empresas</option>
            {companies.map((company) => (
              <option key={company} value={company}>{company}</option>
            ))}
          </select>
        </div>
      );
    }

    // Usuario Lector (limitado a una empresa o sus empresas permitidas)
    const limitedCompany =
      profile?.empresaPermitida ||
      (allowedCompanies && allowedCompanies.length > 0 && allowedCompanies[0] !== 'all' ? allowedCompanies[0] : null) ||
      (selectedCompany !== 'all' ? selectedCompany : 'Flota Asignada');

    return (
      <div
        className="badge"
        title={`Flota asignada: ${limitedCompany}`}
        style={{
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          color: '#38bdf8',
          padding: '0.4rem 0.85rem',
          borderRadius: '9999px',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          boxShadow: '0 0 12px rgba(56, 189, 248, 0.15)'
        }}
      >
        <span>🏢</span>
        <span>{limitedCompany}</span>
      </div>
    );
  };

  return (
    <header className="navbar no-print">
      <div className="nav-left">
        <div className="brand-badge">
          <div className="brand-icon">
            <BrandLogo />
          </div>
          <div className="brand-text" style={{ textAlign: 'center' }}>
            <h1>TrackSIM</h1>
            <span>Cloud Analytics</span>
          </div>
        </div>

        <nav>
          <ul className="nav-links">
            <li
              className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => onTabChange('dashboard')}
            >
              <span>📊</span> Dashboard
            </li>
            <li
              className={`nav-item ${currentTab === 'evolucion' ? 'active' : ''}`}
              onClick={() => onTabChange('evolucion')}
            >
              <span>📈</span> Evolución
            </li>
            <li
              className={`nav-item ${currentTab === 'empresas' ? 'active' : ''}`}
              onClick={() => onTabChange('empresas')}
            >
              <span>📐</span> Métricas
            </li>
            {userRole === 'admin' && !isDemo && (
              <>
                <li
                  className={`nav-item ${currentTab === 'directorio' ? 'active' : ''}`}
                  onClick={() => onTabChange('directorio')}
                >
                  <span>📋</span> Directorio
                </li>
                <li
                  className={`nav-item ${currentTab === 'ingesta' ? 'active' : ''}`}
                  onClick={() => onTabChange('ingesta')}
                >
                  <span>📥</span> Ingesta PDF
                </li>
                <li
                  className={`nav-item ${currentTab === 'usuarios' ? 'active' : ''}`}
                  onClick={() => onTabChange('usuarios')}
                >
                  <span>👥</span> Usuarios
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>

      <div className="nav-right">
        {/* Badge contextual de Empresa o Administrador */}
        {!isDemo && renderStatusBadge()}

        <ThemeToggleButton />

        <div className="user-profile">
          <div className="user-info">
            <div className="user-name">{isDemo ? 'Sesión de demostración' : user?.displayName || user?.email?.split('@')[0]}</div>
            <div className="user-role" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {isDemo ? 'Datos simulados' : user?.email}
            </div>
          </div>
        </div>

        <button className="auth-btn" onClick={() => logout()} title="Cerrar sesión">
          <span>🚪</span> {isDemo ? 'Salir de demo' : 'Salir'}
        </button>
      </div>
    </header>
  );
};
