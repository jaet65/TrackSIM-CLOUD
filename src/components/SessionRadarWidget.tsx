import React, { useMemo, useState } from 'react';
import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Evaluation } from '../types';
import { calculateSingleSessionRadar } from '../services/sessionRadar';
import { MISTAKE_DIMENSIONS } from '../services/mistakeCatalog';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface SessionRadarProps {
  evaluation: Evaluation;
}

export const SessionRadarWidget: React.FC<SessionRadarProps> = ({ evaluation }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAxisId, setSelectedAxisId] = useState<number | 'all'>('all');

  const radarStats = useMemo(() => {
    return calculateSingleSessionRadar(evaluation);
  }, [evaluation]);

  const filteredMistakes = useMemo(() => {
    if (selectedAxisId === 'all') return radarStats.mistakeDetails;
    return radarStats.mistakeDetails.filter(m => m.ejeId === selectedAxisId);
  }, [radarStats.mistakeDetails, selectedAxisId]);

  const radarData = useMemo(() => {
    return {
      labels: radarStats.radarDimensions.map(d => `${d.icono} ${d.shortName}`),
      datasets: [
        {
          label: evaluation.conductor || evaluation.operador || 'Sesión',
          data: radarStats.scores,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.22)',
          borderWidth: 2,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#38bdf8',
          pointRadius: 3.5,
          pointHoverRadius: 5
        }
      ]
    };
  }, [evaluation, radarStats]);

  const radarOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: (ctx: any) => {
              const dimIndex = ctx.dataIndex;
              const dim = radarStats.radarDimensions[dimIndex];
              const score = ctx.raw;
              const count = radarStats.errorCounts[dim.id] || 0;
              const lines = [`Rendimiento: ${score} / 10 pts`];
              if (radarStats.hasMistakeData) {
                lines.push(`Errores en esta sesión: ${count} incidencia${count === 1 ? '' : 's'}`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: 10,
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: {
            color: '#cbd5e1',
            font: { size: 10, weight: 'bold' as const }
          },
          ticks: { backdropColor: 'transparent', color: '#64748b', stepSize: 2 }
        }
      }
    };
  }, [radarStats]);

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1.25rem',
        transition: 'all 0.25s ease'
      }}
    >
      {/* Header con título y botón de colapso */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div
            style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}
            onClick={() => setIsExpanded(prev => !prev)}
            title={isExpanded ? 'Clic para colapsar desglose' : 'Clic para expandir desglose'}
          >
            <span>🕸️</span> Radar de Competencias (Sesión Específica)
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 500 }}>
              {isExpanded ? '▾ (Colapsar desglose)' : '🔍 (Clic en gráfico para desglosar)'}
            </span>
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Calculado exclusivamente a partir de los errores e incidencias cometidos en esta prueba
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {radarStats.hasMistakeData && (
            <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
              {radarStats.mistakeDetails.length} {radarStats.mistakeDetails.length === 1 ? 'tipo de error' : 'tipos de error'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsExpanded(prev => !prev)}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            {isExpanded ? '▲ Ocultar' : '▼ Desglosar Errores'}
          </button>
        </div>
      </div>

      {/* Área del Gráfico Radar y Lista de Dimensiones (Clickeable para expandir/colapsar) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', alignItems: 'center' }}>
        {/* Gráfico Radar */}
        <div
          style={{
            height: '250px',
            width: '100%',
            position: 'relative',
            cursor: 'pointer',
            borderRadius: '10px',
            transition: 'transform 0.2s ease, background 0.2s ease',
            background: 'rgba(255, 255, 255, 0.01)'
          }}
          onClick={() => setIsExpanded(prev => !prev)}
          title={isExpanded ? 'Clic para colapsar desglose de errores' : 'Clic para expandir y desglosar errores de esta sesión'}
        >
          <Radar data={radarData} options={radarOptions} />
        </div>

        {/* Lista de Dimensiones y Puntuaciones de esta sesión */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {radarStats.radarDimensions.map((dim, idx) => {
            const score = radarStats.scores[idx] || 0;
            const count = radarStats.errorCounts[dim.id] || 0;
            const isDimSelected = selectedAxisId === dim.id;

            return (
              <div
                key={dim.id}
                onClick={() => {
                  if (!isExpanded) setIsExpanded(true);
                  setSelectedAxisId(isDimSelected ? 'all' : dim.id);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.45rem 0.75rem',
                  background: isDimSelected && isExpanded ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${isDimSelected && isExpanded ? dim.color : 'rgba(255, 255, 255, 0.05)'}`,
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={count > 0 ? `Filtrar errores de ${dim.shortName}` : 'Sin incidencias'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span>{dim.icono}</span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{dim.shortName}</span>
                  {radarStats.hasMistakeData && (
                    <span style={{ fontSize: '0.7rem', color: count > 0 ? '#f87171' : '#10b981' }}>
                      ({count} {count === 1 ? 'error' : 'errores'})
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 800, color: dim.color, fontSize: '0.85rem' }}>
                  {score.toFixed(1)} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>/ 10</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sección Expandida: Desglose Detallado de Errores Específicos de la Sesión */}
      {isExpanded && (
        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            animation: 'fadeIn 0.25s ease'
          }}
        >
          {/* Barra de filtros por dimensión */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📋</span> Errores Detectados en Esta Sesión
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                ({filteredMistakes.length} {filteredMistakes.length === 1 ? 'registro' : 'registros'})
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${selectedAxisId === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.72rem', padding: '0.18rem 0.5rem' }}
                onClick={() => setSelectedAxisId('all')}
              >
                Todos ({radarStats.mistakeDetails.length})
              </button>
              {radarStats.radarDimensions.map(dim => {
                const count = radarStats.errorCounts[dim.id] || 0;
                return (
                  <button
                    key={dim.id}
                    type="button"
                    className={`btn btn-sm ${selectedAxisId === dim.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.18rem 0.5rem',
                      borderColor: selectedAxisId === dim.id ? dim.color : undefined
                    }}
                    onClick={() => setSelectedAxisId(dim.id)}
                  >
                    {dim.icono} {dim.shortName} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabla o mensaje de errores */}
          {filteredMistakes.length > 0 ? (
            <div className="table-responsive" style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px' }}>
              <table className="custom-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th>Error en Simulación</th>
                    <th style={{ width: '180px' }}>Eje / Competencia</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>Ocurrencias</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMistakes.map((m, idx) => {
                    const dim = radarStats.radarDimensions.find(d => d.id === m.ejeId) || MISTAKE_DIMENSIONS.EJE_1;
                    return (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600, color: '#f8fafc' }}>{m.error}</td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              background: `${dim.color}18`,
                              color: dim.color,
                              border: `1px solid ${dim.color}35`,
                              fontWeight: 600
                            }}
                          >
                            <span>{dim.icono}</span>
                            <span>{dim.shortName}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background: m.repeticiones >= 5 ? 'rgba(239, 68, 68, 0.2)' : m.repeticiones >= 2 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                              color: m.repeticiones >= 5 ? '#ef4444' : m.repeticiones >= 2 ? '#f59e0b' : '#38bdf8',
                              border: `1px solid ${m.repeticiones >= 5 ? 'rgba(239, 68, 68, 0.4)' : m.repeticiones >= 2 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem'
                            }}
                          >
                            {m.repeticiones} {m.repeticiones === 1 ? 'vez' : 'veces'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.25rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {radarStats.hasMistakeData
                ? 'No se registraron errores en esta dimensión para esta prueba.'
                : 'Esta evaluación no cuenta con desglose de telemetría de errores individuales.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
