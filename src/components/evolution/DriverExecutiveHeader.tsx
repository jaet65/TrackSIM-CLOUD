import React from 'react';
import { DriverSummary } from '../../types';

interface DriverExecutiveHeaderProps {
  currentDriver: DriverSummary | null;
}

export const DriverExecutiveHeader: React.FC<DriverExecutiveHeaderProps> = ({ currentDriver }) => {
  if (!currentDriver) return null;

  return (
    <div
      className="glass-card evolution-executive-card"
      style={{
        padding: '1.5rem 2rem',
        marginBottom: '1.75rem',
        background: 'var(--bg-evolution-executive)',
        border: '1px solid var(--border-glow)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
    >
      {/* Nivel 1 (Nombre) & Nivel 2 (Empresa) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.1))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              flexShrink: 0,
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)'
            }}
          >
            👨‍✈️
          </div>
          <div>
            {/* Prioridad 1: Nombre */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                {currentDriver.nombre}
              </h2>
            </div>

            {/* Prioridad 2: Empresa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem' }}>
              <span
                style={{
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  color: '#c084fc',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <span>🏢</span>
                <span>{currentDriver.empresa || 'TrackSIM'}</span>
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                • Historial de {currentDriver.totalEvaluaciones} sesión{currentDriver.totalEvaluaciones > 1 ? 'es' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prioridad 3: Todo lo demás (Métricas operativas sin recuadro individual) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
        {/* 3.1 Última Calificación */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: currentDriver.ultimaCalificacion >= 8.0 ? 'rgba(34, 197, 94, 0.15)' : currentDriver.ultimaCalificacion >= 6.0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: currentDriver.ultimaCalificacion >= 8.0 ? 'var(--success)' : currentDriver.ultimaCalificacion >= 6.0 ? 'var(--primary)' : 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0
            }}
          >
            🎯
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Última Calificación
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentDriver.ultimaCalificacion >= 6.0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.1rem' }}>
              {currentDriver.ultimaCalificacion.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ 10</span>
            </div>
          </div>
        </div>

        {/* 3.2 Tendencia */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: currentDriver.tendencia === 'mejora' ? 'rgba(34, 197, 94, 0.15)' : currentDriver.tendencia === 'retroceso' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              color: currentDriver.tendencia === 'mejora' ? '#22c55e' : currentDriver.tendencia === 'retroceso' ? '#ef4444' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0
            }}
          >
            {currentDriver.tendencia === 'mejora' ? '📈' : currentDriver.tendencia === 'retroceso' ? '📉' : '➡️'}
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Tendencia
            </span>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                marginTop: '0.1rem',
                color: currentDriver.tendencia === 'mejora' ? '#22c55e' : currentDriver.tendencia === 'retroceso' ? '#ef4444' : '#94a3b8'
              }}
            >
              {currentDriver.tendencia === 'mejora' ? '↗ En Mejora' : currentDriver.tendencia === 'retroceso' ? '↘ En Descenso' : '→ Estable'}
            </div>
          </div>
        </div>

        {/* 3.3 Estado */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: currentDriver.estadoGeneral === 'Sobresaliente' ? 'rgba(34, 197, 94, 0.15)' : currentDriver.estadoGeneral === 'Aprobado' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: currentDriver.estadoGeneral === 'Sobresaliente' ? '#22c55e' : currentDriver.estadoGeneral === 'Aprobado' ? '#38bdf8' : '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0
            }}
          >
            🛡️
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Estado
            </span>
            <div style={{ marginTop: '0.15rem' }}>
              <span className={`badge badge-${currentDriver.badgeColor || 'info'}`} style={{ fontSize: '0.85rem', padding: '0.28rem 0.75rem', fontWeight: 700 }}>
                {currentDriver.estadoGeneral}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
