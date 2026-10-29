import React from 'react';
import { CompanySummary } from '../../types';
import { logAudit } from '../../services/auditLog';

interface CompanyOverviewCardProps {
  comp: (CompanySummary & { esGlobal?: boolean });
  conductoresRecurrentes: number;
  pctRecurrentes: string;
  selectedYear?: string;
  availableYears?: string[];
  operadoresConHistorialPrevio?: { count: number; pct: string };
}

export const CompanyOverviewCard: React.FC<CompanyOverviewCardProps> = ({
  comp,
  conductoresRecurrentes,
  pctRecurrentes,
  selectedYear,
  availableYears = [],
  operadoresConHistorialPrevio
}) => {
  // Texto descriptivo del periodo / años contemplados
  const periodText = React.useMemo(() => {
    if (selectedYear && selectedYear !== 'all') {
      return `Año ${selectedYear}`;
    }
    // Ordenar años ascendentes
    const sorted = [...availableYears].sort();
    if (sorted.length === 0) return 'Histórico general';
    if (sorted.length === 1) return `Año ${sorted[0]}`;
    return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
  }, [selectedYear, availableYears]);

  const periodSubtitle = React.useMemo(() => {
    if (selectedYear && selectedYear !== 'all') {
      return 'Filtro específico activo';
    }
    const sorted = [...availableYears].sort();
    if (sorted.length > 1) {
      return `(${sorted.length} años registrados)`;
    }
    return '(1 año registrado)';
  }, [selectedYear, availableYears]);
  return (
    <div
      className="glass-card company-executive-card"
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
      <div className="company-executive-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.1))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: 'var(--primary)',
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
              <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                {comp.nombre}
              </h2>
              {comp.esGlobal && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--border-glow)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
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
                  color: 'var(--primary)',
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
            className="btn btn-secondary btn-sm company-export-btn"
            onClick={() => {
              const prevTitle = document.title;
              const safeCompany = (comp.nombre || 'Flota').trim();
              const safeYears = periodText.replace(/\s*[–—]\s*/g, '-').replace(/\s+/g, '_');
              const printFileName = `TrackSIM Cloud_${safeCompany}_${safeYears}`;

              document.title = printFileName;

              void logAudit({
                categoria: 'datos',
                accion: 'imprimir',
                empresas: [comp.nombre],
                detalle: `Impresión / PDF del resumen de ${comp.nombre}${selectedYear && selectedYear !== 'all' ? ` (Año ${selectedYear})` : ''}`
              });

              try {
                window.print();
              } finally {
                // Restaurar el título original de la pestaña luego de disparar el diálogo de impresión
                setTimeout(() => {
                  document.title = prevTitle;
                }, 1000);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.95rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: '1px solid var(--border-glow)',
              color: 'var(--primary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--shadow-card)'
            }}
            title="Imprimir o guardar como PDF la ficha ejecutiva de la flota"
          >
            <span>🖨️</span>
            <span>Exportar PDF / Imprimir</span>
          </button>
        </div>
      </div>

      {/* Tercer Nivel: Periodo de Años, Número de Operadores, Conductores Recurrentes (> 1 vez), Promedio de Flota, Tasa de Aprobación */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
        {/* 3.0 Periodo / Años Contemplados (Primero) */}
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
            📅
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
              Periodo
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.1rem' }}>
              {periodText}
            </div>
          </div>
        </div>
        {/* 3.1 Número de Operadores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: 'var(--primary)',
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.1rem' }}>
              {comp.totalConductores} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({comp.totalEvaluaciones} reportes)</span>
            </div>
          </div>
        </div>

        {/* 3.2 Conductores Recurrentes (> 1 vez / Años Anteriores al filtrar) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: 'var(--accent-purple)',
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
              {selectedYear && selectedYear !== 'all' ? 'Con Evaluaciones Previas' : 'Participación > 1 Vez'}
            </span>
            {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio ? (
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '0.1rem' }}>
                {operadoresConHistorialPrevio.count}{' '}
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  ({operadoresConHistorialPrevio.pct}% en años anteriores)
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '0.1rem' }}>
                {conductoresRecurrentes}{' '}
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  ({pctRecurrentes}% de flota)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3.3 Promedio de Flota */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              color: comp.promedioFinal >= 8.0 ? 'var(--success)' : comp.promedioFinal >= 6.0 ? 'var(--primary)' : 'var(--danger)',
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.promedioFinal >= 8.0 ? 'var(--success)' : comp.promedioFinal >= 6.0 ? 'var(--primary)' : 'var(--danger)', marginTop: '0.1rem' }}>
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
              color: comp.tasaAprobacion >= 80 ? 'var(--success)' : comp.tasaAprobacion >= 60 ? 'var(--warning)' : 'var(--danger)',
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
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.tasaAprobacion >= 80 ? 'var(--success)' : comp.tasaAprobacion >= 60 ? 'var(--warning)' : 'var(--danger)', marginTop: '0.1rem' }}>
              {comp.tasaAprobacion.toFixed(1)}% <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>(calif. ≥ 6.0)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
