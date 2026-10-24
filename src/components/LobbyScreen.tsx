import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BrandLogo } from './BrandLogo';

interface LobbyScreenProps {
  reason: 'no_company' | 'no_data' | 'company_not_found';
  assignedCompany?: string;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ reason, assignedCompany }) => {
  const { user, profile, logout } = useAuth();
  const { reloadEvaluations, isSyncing } = useData();

  const handleRefresh = async () => {
    await reloadEvaluations(false);
  };

  return (
    <div className="login-screen-wrapper" style={{ zIndex: 900 }}>
      <div
        className="login-card"
        style={{
          maxWidth: '520px',
          textAlign: 'center',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          background: 'rgba(14, 20, 34, 0.95)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.2)'
        }}
      >
        <div className="login-header" style={{ marginBottom: '1.5rem' }}>
          <div className="login-logo" style={{ width: '64px', height: '64px', margin: '0 auto 1rem' }}>
            <BrandLogo />
          </div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>Sala de Espera</h2>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.88rem' }}>
            Acceso en espera de asignación o sincronización
          </p>
        </div>

        {/* Badge descriptivo de estado */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 600,
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            marginBottom: '1.5rem'
          }}
        >
          <span style={{ fontSize: '1rem' }}>⏳</span>
          <span>
            {reason === 'no_company' && 'Sin Empresa Asignada'}
            {reason === 'company_not_found' && 'Empresa No Encontrada'}
            {reason === 'no_data' && 'Sin Evaluaciones Disponibles'}
          </span>
        </div>

        {/* Explicación y detalles */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            textAlign: 'left',
            marginBottom: '1.5rem',
            fontSize: '0.88rem',
            color: '#cbd5e1',
            lineHeight: 1.6
          }}
        >
          {reason === 'no_company' && (
            <p style={{ margin: 0 }}>
              Tu cuenta se encuentra registrada exitosamente, pero <strong>aún no tiene una empresa asignada</strong> por el administrador de TrackSIM.
              <br /><br />
              Por favor ponte en contacto con tu administrador para que asigne tu empresa a través del módulo de gestión de usuarios.
            </p>
          )}

          {reason === 'company_not_found' && (
            <p style={{ margin: 0 }}>
              Tienes asignada la empresa <strong>"{assignedCompany}"</strong>, pero actualmente no existe en el catálogo o no cuenta con registros en la base de datos de la plataforma.
              <br /><br />
              Si fue editada o renombrada recientemente, solicita a tu administrador que actualice tu asignación.
            </p>
          )}

          {reason === 'no_data' && (
            <p style={{ margin: 0 }}>
              Tu empresa <strong>"{assignedCompany}"</strong> no cuenta con evaluaciones registradas en este momento.
              <br /><br />
              En cuanto el equipo de operaciones ingeste evaluaciones para tu empresa, tendrás acceso automático a tus paneles y estadísticas.
            </p>
          )}

          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '0.78rem',
              color: '#94a3b8'
            }}
          >
            <div><strong>Usuario:</strong> {user?.displayName || profile?.displayName || user?.email}</div>
            <div><strong>Correo:</strong> {user?.email}</div>
            {assignedCompany && (
              <div><strong>Empresa configurada:</strong> {assignedCompany}</div>
            )}
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRefresh}
            disabled={isSyncing}
            style={{ flex: 1, justifyContent: 'center', padding: '0.65rem 1rem' }}
          >
            <span style={{ display: 'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            <span>{isSyncing ? 'Comprobando...' : 'Revisar Actualización'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={logout}
            style={{ padding: '0.65rem 1.25rem' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};
