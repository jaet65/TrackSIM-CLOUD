import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { TabType } from '../types';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, userRole, allowedCompanies, profile, logout } = useAuth();
  const { selectedCompany, reloadEvaluations, isSyncing, lastSyncTime } = useData();

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
          {selectedCompany && selectedCompany !== 'all' && (
            <span style={{ color: '#fff', fontWeight: 500, opacity: 0.9 }}>
              • {selectedCompany}
            </span>
          )}
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
    <header className="navbar">
      <div className="nav-left">
        <div className="brand-badge">
          <div className="brand-icon">
            <img src="/Logo.png" alt="TrackSIM Logo" className="brand-logo-img" />
          </div>
          <div className="brand-text">
            <h1>TrackSIM</h1>
            <span>Analytics CLOUD</span>
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
            {userRole === 'admin' && (
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
              </>
            )}
          </ul>
        </nav>
      </div>

      <div className="nav-right">
        {userRole === 'admin' && (
          <button
            type="button"
            className="nav-mgmt-btn"
            onClick={() => onTabChange('usuarios')}
          >
            <span>👥</span> Gestión de Usuarios
          </button>
        )}

        {/* Botón de Sincronización Inteligente de Datos */}
        <button
          type="button"
          onClick={() => reloadEvaluations(false)}
          disabled={isSyncing}
          title={lastSyncTime ? `Última sincronización: ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nHaz clic para buscar cambios recientes` : 'Sincronizar datos con Cloud Firestore'}
          style={{
            background: 'rgba(255, 255, 255, 0)',
            color: isSyncing ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
            padding: '0.45rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!isSyncing) e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            if (!isSyncing) e.currentTarget.style.color = 'var(--text-muted, #94a3b8)';
          }}
        >
          <span style={{ display: 'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
          <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
        </button>

        {/* Badge contextual de Empresa o Administrador */}
        {renderStatusBadge()}

        <div className="user-profile">
          <div className="user-info">
            <div className="user-name">{user?.displayName || user?.email?.split('@')[0]}</div>
            <div className="user-role" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {user?.email}
            </div>
          </div>
        </div>

        <button className="auth-btn" onClick={() => logout()} title="Cerrar sesión">
          <span>🚪</span> Salir
        </button>
      </div>
    </header>
  );
};
