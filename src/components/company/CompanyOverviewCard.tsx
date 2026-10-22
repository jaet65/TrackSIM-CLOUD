import React from 'react';
import { CompanySummary } from '../../types';

interface CompanyOverviewCardProps {
  comp: (CompanySummary & { esGlobal?: boolean });
  conductoresRecurrentes: number;
  pctRecurrentes: string;
}

export const CompanyOverviewCard: React.FC<CompanyOverviewCardProps> = ({
  comp,
  conductoresRecurrentes,
  pctRecurrentes
}) => {
  return (
    <div
      className="glass-card"
      style={{
        padding: '1.5rem 2rem',
        marginBottom: '1.75rem',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.75) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '16px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
    >
      {/* Nivel 1: Empresa & Nivel 2: Sedes */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1.25rem' }}>
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
            {comp.esGlobal ? '🌐' : '🏢'}
          </div>
          <div>
            {/* Primer Nivel: Empresa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {comp.nombre}
              </h2>
              {comp.esGlobal && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                  Consolidado Global
                </span>
              )}
            </div>

            {/* Segundo Nivel: Sedes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <span>📍</span>
                <span>
                  {comp.esGlobal
                    ? 'Todas las Sedes y Flotas Registradas'
                    : comp.sedes && comp.sedes.length > 0
                      ? comp.sedes.join(', ')
                      : 'Sede Principal de Operaciones'}
                </span>
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                • Total de {comp.sedes ? comp.sedes.length : 1} {comp.sedes && comp.sedes.length === 1 ? 'ubicación' : 'ciudades'}
              </span>
            </div>
          </div>
        </div>

        {/* Acciones Ejecutivas: Imprimir / Generar PDF */}
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.95rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}
            title="Imprimir o guardar como PDF la ficha ejecutiva de la flota"
          >
            <span>🖨️</span>
            <span>Exportar PDF / Imprimir</span>
          </button>
        </div>
      </div>

      {/* Tercer Nivel: Número de Operadores, Conductores Recurrentes (> 1 vez), Promedio de Flota, Tasa de Aprobación */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
        {/* 3.1 Número de Operadores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              flexShrink: 0
            }}
          >
            👥
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Número de Operadores
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.1rem' }}>
              {comp.totalConductores} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({comp.totalEvaluaciones} reportes)</span>
            </div>
          </div>
        </div>

        {/* 3.2 Conductores Recurrentes (> 1 vez) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: '#a855f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              flexShrink: 0
            }}
          >
            🔁
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Participación &gt; 1 Vez
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c084fc', marginTop: '0.1rem' }}>
              {conductoresRecurrentes} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({pctRecurrentes}% de flota)</span>
            </div>
          </div>
        </div>

        {/* 3.3 Promedio de Flota */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: comp.promedioFinal >= 8.0 ? '#22c55e' : comp.promedioFinal >= 6.0 ? '#38bdf8' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              flexShrink: 0
            }}
          >
            🎯
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Promedio de Flota
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.promedioFinal >= 8.0 ? '#22c55e' : comp.promedioFinal >= 6.0 ? '#38bdf8' : '#ef4444', marginTop: '0.1rem' }}>
              {comp.promedioFinal.toFixed(2)} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ 10 pts</span>
            </div>
          </div>
        </div>

        {/* 3.4 Tasa de Aprobación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: comp.tasaAprobacion >= 80 ? '#22c55e' : comp.tasaAprobacion >= 60 ? '#fbbf24' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              flexShrink: 0
            }}
          >
            📈
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Tasa de Aprobación
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.tasaAprobacion >= 80 ? '#22c55e' : comp.tasaAprobacion >= 60 ? '#fbbf24' : '#ef4444', marginTop: '0.1rem' }}>
              {comp.tasaAprobacion.toFixed(1)}% <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>(calif. ≥ 6.0)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
