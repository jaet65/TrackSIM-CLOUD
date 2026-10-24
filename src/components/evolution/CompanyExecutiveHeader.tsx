import React from 'react';
import { CompanySummary } from '../../types';

interface CompanyExecutiveHeaderProps {
  currentCompany: (CompanySummary & { esGlobal?: boolean }) | null;
  companyYearsStats: string;
}

export const CompanyExecutiveHeader: React.FC<CompanyExecutiveHeaderProps> = ({
  currentCompany,
  companyYearsStats
}) => {
  if (!currentCompany) return null;

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
      {/* Nivel 1: Empresa & Nivel 2: Sedes */}
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
            🏢
          </div>
          <div>
            {/* Prioridad 1: Nombre de la Empresa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                {currentCompany.nombre}
              </h2>
            </div>

            {/* Prioridad 2: Sedes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
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
                  {currentCompany.sedes && currentCompany.sedes.length > 0
                    ? currentCompany.sedes.join(', ')
                    : 'Sede Principal de Operaciones'}
                </span>
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                • Total de {currentCompany.sedes ? currentCompany.sedes.length : 1} {currentCompany.sedes && currentCompany.sedes.length === 1 ? 'ubicación' : 'ciudades'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Prioridad 3: Todo lo demás (Años, Operadores, Promedio Histórico, Tasa Aprobación) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
        {/* 3.1 Años Evaluados */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0
            }}
          >
            📅
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Años Evaluados
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '0.1rem' }}>
              {companyYearsStats}
            </div>
          </div>
        </div>

        {/* 3.2 Operadores Evaluados */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0
            }}
          >
            👥
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Operadores Evaluados
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.1rem' }}>
              {currentCompany.totalConductores} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>conductores</span>
            </div>
          </div>
        </div>

        {/* 3.3 Promedio Histórico */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: currentCompany.promedioFinal >= 8.0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              color: currentCompany.promedioFinal >= 8.0 ? '#22c55e' : '#38bdf8',
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
              Promedio Histórico
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentCompany.promedioFinal >= 6.0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.1rem' }}>
              {currentCompany.promedioFinal.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ 10</span>
            </div>
          </div>
        </div>

        {/* 3.4 Tasa de Aprobación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: currentCompany.tasaAprobacion >= 80 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: currentCompany.tasaAprobacion >= 80 ? '#22c55e' : '#fbbf24',
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
              Tasa de Aprobación
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentCompany.tasaAprobacion >= 70 ? 'var(--success)' : 'var(--warning)', marginTop: '0.1rem' }}>
              {currentCompany.tasaAprobacion.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
