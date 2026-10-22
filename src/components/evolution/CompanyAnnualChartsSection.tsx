import React from 'react';
import { Line } from 'react-chartjs-2';

interface ActiveAccidentTrend {
  isPositive: boolean;
  isNegative: boolean;
  percent: number | string;
  diff: number | string;
  unit: string;
}

interface CompanyAnnualChartsSectionProps {
  currentCompany: any;
  companyAnnualEvolution: any;
  fleetAnnualChartData: any;
  fleetAccidentsChartData: any;
  chartOptions: any;
  accidentViewMode: 'counts' | 'rate';
  onToggleAccidentViewMode: (mode: 'counts' | 'rate') => void;
  activeAccidentTrend: ActiveAccidentTrend;
}

export const CompanyAnnualChartsSection: React.FC<CompanyAnnualChartsSectionProps> = ({
  currentCompany,
  companyAnnualEvolution,
  fleetAnnualChartData,
  fleetAccidentsChartData,
  chartOptions,
  accidentViewMode,
  onToggleAccidentViewMode,
  activeAccidentTrend
}) => {
  if (!currentCompany) return null;

  const isTrendPositive = companyAnnualEvolution.trendDirection === 'mejora';
  const isTrendNegative = companyAnnualEvolution.trendDirection === 'descenso';

  return (
    <>
      {/* Gráfico: Curva de Evolución Anual de la Flota */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              📈 Curva de Evolución Anual de la Flota
            </h3>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Comportamiento histórico de la calificación promedio final obtenida año tras año.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.88rem',
                fontWeight: 800,
                background: isTrendPositive
                  ? 'rgba(34, 197, 94, 0.15)'
                  : isTrendNegative
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(56, 189, 248, 0.15)',
                border: `1px solid ${isTrendPositive
                  ? 'rgba(34, 197, 94, 0.4)'
                  : isTrendNegative
                    ? 'rgba(239, 68, 68, 0.4)'
                    : 'rgba(56, 189, 248, 0.4)'
                  }`,
                color: isTrendPositive ? '#22c55e' : isTrendNegative ? '#ef4444' : '#38bdf8',
                boxShadow: `0 0 15px ${isTrendPositive
                  ? 'rgba(34, 197, 94, 0.2)'
                  : isTrendNegative
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(56, 189, 248, 0.2)'
                  }`
              }}
            >
              <span>{isTrendPositive ? '📈' : isTrendNegative ? '📉' : '➡️'}</span>
              <span>
                {isTrendPositive
                  ? `Tendencia en Mejora (+${companyAnnualEvolution.percentChange}%)`
                  : isTrendNegative
                    ? `Tendencia en Descenso (${companyAnnualEvolution.percentChange}%)`
                    : 'Tendencia Estable'}
              </span>
              {companyAnnualEvolution.difference !== 0 && (
                <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
                  ({companyAnnualEvolution.difference > 0 ? `+${companyAnnualEvolution.difference}` : companyAnnualEvolution.difference} pts)
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: '340px', width: '100%' }}>
          <Line
            data={fleetAnnualChartData}
            options={{
              ...chartOptions,
              scales: {
                y: {
                  min: 0,
                  max: 10,
                  grid: { color: 'rgba(255, 255, 255, 0.05)' },
                  ticks: { color: '#64748b' }
                },
                x: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#94a3b8', font: { weight: 'bold' } }
                }
              }
            }}
          />
        </div>
      </div>

      {/* Gráfico: Curva de Siniestralidad y Accidentabilidad con Selector */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🚨</span> {accidentViewMode === 'counts' ? 'Conteo Anual de Siniestros' : 'Tasa de Accidentes por Conductor'}
            </h3>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {accidentViewMode === 'counts'
                ? 'Historial y desglose anual de siniestros: total, colisiones, salidas de vía y fatalidades.'
                : 'Promedio de incidentes por operador evaluado a lo largo de los años.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                background: 'rgba(15, 23, 42, 0.65)',
                padding: '3px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <button
                type="button"
                onClick={() => onToggleAccidentViewMode('counts')}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: accidentViewMode === 'counts' ? '#f43f5e' : 'transparent',
                  color: accidentViewMode === 'counts' ? '#ffffff' : '#94a3b8',
                  boxShadow: accidentViewMode === 'counts' ? '0 2px 8px rgba(244, 63, 94, 0.35)' : 'none'
                }}
              >
                💥 Conteo de Siniestros
              </button>
              <button
                type="button"
                onClick={() => onToggleAccidentViewMode('rate')}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: accidentViewMode === 'rate' ? '#38bdf8' : 'transparent',
                  color: accidentViewMode === 'rate' ? '#0f172a' : '#94a3b8',
                  boxShadow: accidentViewMode === 'rate' ? '0 2px 8px rgba(56, 189, 248, 0.35)' : 'none'
                }}
              >
                📊 Tasa por Conductor
              </button>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.88rem',
                fontWeight: 800,
                background: activeAccidentTrend.isPositive
                  ? 'rgba(34, 197, 94, 0.15)'
                  : activeAccidentTrend.isNegative
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(148, 163, 184, 0.15)',
                border: `1px solid ${activeAccidentTrend.isPositive
                  ? 'rgba(34, 197, 94, 0.4)'
                  : activeAccidentTrend.isNegative
                    ? 'rgba(239, 68, 68, 0.4)'
                    : 'rgba(148, 163, 184, 0.4)'
                  }`,
                color: activeAccidentTrend.isPositive ? '#22c55e' : activeAccidentTrend.isNegative ? '#ef4444' : '#94a3b8',
                boxShadow: `0 0 15px ${activeAccidentTrend.isPositive
                  ? 'rgba(34, 197, 94, 0.2)'
                  : activeAccidentTrend.isNegative
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(148, 163, 184, 0.2)'
                  }`
              }}
            >
              <span>{activeAccidentTrend.isPositive ? '📉' : activeAccidentTrend.isNegative ? '📈' : '➡️'}</span>
              <span>
                {activeAccidentTrend.isPositive
                  ? `Tendencia Favorable (${activeAccidentTrend.percent}%)`
                  : activeAccidentTrend.isNegative
                    ? `Tendencia en Aumento (+${activeAccidentTrend.percent}%)`
                    : 'Tendencia Estable'}
              </span>
              {Number(activeAccidentTrend.diff) !== 0 && (
                <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
                  ({Number(activeAccidentTrend.diff) > 0 ? `+${activeAccidentTrend.diff}` : activeAccidentTrend.diff} {activeAccidentTrend.unit})
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: '340px', width: '100%' }}>
          <Line
            data={fleetAccidentsChartData}
            options={{
              ...chartOptions,
              scales: {
                y: {
                  min: 0,
                  title: {
                    display: true,
                    text: accidentViewMode === 'rate' ? 'Tasa de Incidentes / Conductor' : 'Total de Siniestros',
                    color: accidentViewMode === 'rate' ? '#38bdf8' : '#94a3b8',
                    font: { size: 11, weight: 'bold' }
                  },
                  ticks: {
                    stepSize: accidentViewMode === 'rate' ? 0.5 : 1,
                    color: '#64748b'
                  },
                  grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#94a3b8', font: { weight: 'bold' } }
                }
              }
            }}
          />
        </div>
      </div>
    </>
  );
};
