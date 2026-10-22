import React from 'react';
import { Bar } from 'react-chartjs-2';

interface CompanyExerciseEvolutionSectionProps {
  currentCompany: any;
  companyExerciseEvolution: any;
  exerciseBarOptions: any;
  barTextPlugin: any;
}

export const CompanyExerciseEvolutionSection: React.FC<CompanyExerciseEvolutionSectionProps> = ({
  currentCompany,
  companyExerciseEvolution,
  exerciseBarOptions,
  barTextPlugin
}) => {
  if (!currentCompany) return null;

  const isExTrendPositive = companyExerciseEvolution.trendDirection === 'mejora';
  const isExTrendNegative = companyExerciseEvolution.trendDirection === 'descenso';

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🎯</span> Evolución Anual por Ejercicio y Escenario
          </h3>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Comparativa histórica de calificaciones promedio obtenidas en cada ejercicio de simulación a lo largo de los años.
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
              background: isExTrendPositive
                ? 'rgba(34, 197, 94, 0.15)'
                : isExTrendNegative
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(56, 189, 248, 0.15)',
              border: `1px solid ${isExTrendPositive
                ? 'rgba(34, 197, 94, 0.4)'
                : isExTrendNegative
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(56, 189, 248, 0.4)'
                }`,
              color: isExTrendPositive ? '#22c55e' : isExTrendNegative ? '#ef4444' : '#38bdf8',
              boxShadow: `0 0 15px ${isExTrendPositive
                ? 'rgba(34, 197, 94, 0.2)'
                : isExTrendNegative
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(56, 189, 248, 0.2)'
                }`
            }}
          >
            <span>{isExTrendPositive ? '📈' : isExTrendNegative ? '📉' : '➡️'}</span>
            <span>
              {isExTrendPositive
                ? `Tendencia en Mejora (+${companyExerciseEvolution.percentChange}%)`
                : isExTrendNegative
                  ? `Tendencia en Descenso (${companyExerciseEvolution.percentChange}%)`
                  : 'Tendencia Estable'}
            </span>
            {companyExerciseEvolution.difference !== 0 && (
              <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
                ({companyExerciseEvolution.difference > 0 ? `+${companyExerciseEvolution.difference}` : companyExerciseEvolution.difference} pts)
              </span>
            )}
          </div>
        </div>
      </div>

      {companyExerciseEvolution.datasets.length > 0 && companyExerciseEvolution.years.length > 0 ? (
        <div style={{ height: '420px', width: '100%' }}>
          <Bar
            data={{
              labels: companyExerciseEvolution.labels,
              datasets: companyExerciseEvolution.datasets
            }}
            options={exerciseBarOptions}
            plugins={[barTextPlugin]}
          />
        </div>
      ) : (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
          No se registran módulos ni ejercicios detallados evaluados para esta empresa.
        </div>
      )}
    </div>
  );
};
