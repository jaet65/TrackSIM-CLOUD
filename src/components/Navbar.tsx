import React from 'react';
import { useAuth } from '../context/AuthContext';
import { TabType } from '../types';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, userRole, logout } = useAuth();

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
              <span>🏢</span> Empresas
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

        <div className="cloud-status">
          <span className="status-dot"></span>
          <span>Online</span>
        </div>

        <div className="user-profile">
          <div className="user-info">
            <div className="user-name">{user?.displayName || user?.email?.split('@')[0]}</div>
            <div className="user-role">
              <span className={`role-badge ${userRole}`}>{userRole === 'admin' ? 'Administrador' : 'Lector'}</span>
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
