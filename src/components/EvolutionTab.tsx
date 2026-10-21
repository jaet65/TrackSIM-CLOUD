import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const EvolutionTab: React.FC = () => {
  const { driverSummaries, companiesSummaries } = useData();

  const [activeSubtab, setActiveSubtab] = useState<'driver' | 'company'>('driver');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>('');

  // Operador seleccionado (por defecto el primero disponible)
  const currentDriver = useMemo(() => {
    if (!driverSummaries || driverSummaries.length === 0) return null;
    if (!selectedDriverName) return driverSummaries[0];
    return driverSummaries.find((d) => d.nombre === selectedDriverName) || driverSummaries[0];
  }, [driverSummaries, selectedDriverName]);

  // Empresa seleccionada (por defecto la primera disponible)
  const currentCompany = useMemo(() => {
    if (!companiesSummaries || companiesSummaries.length === 0) return null;
    if (!selectedCompanyName) return companiesSummaries[0];
    return companiesSummaries.find((c) => c.nombre === selectedCompanyName) || companiesSummaries[0];
  }, [companiesSummaries, selectedCompanyName]);

  // Evaluaciones ordenadas cronológicamente para el conductor seleccionado
  const driverEvaluations = useMemo(() => {
    if (!currentDriver?.evaluaciones) return [];
    return [...currentDriver.evaluaciones].sort((a, b) => {
      const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
      const db = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
      return da.localeCompare(db);
    });
  }, [currentDriver]);

  // Datos para Gráfico de Evolución de Puntaje del Conductor
  const scoreLabels = driverEvaluations.map((e, idx) => e.fechaCapacitacionFormato || e.fechaCapacitacion || `Sesión ${idx + 1}`);
  const evolutionChartData = {
    labels: scoreLabels,
    datasets: [
      {
        label: 'Evaluación Final (0 - 10)',
        data: driverEvaluations.map((e) => e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: '#38bdf8',
        pointBorderColor: '#ffffff',
        pointRadius: 6
      },
      {
        label: 'Práctica Simulador (0 - 7 ptos)',
        data: driverEvaluations.map((e) => e.practicaSimuladorPuntos || 0),
        borderColor: '#a855f7',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.35,
        borderWidth: 2,
        pointBackgroundColor: '#a855f7',
        pointRadius: 4
      },
      {
        label: 'Habilidades Manejo (0 - 3 ptos)',
        data: driverEvaluations.map((e) => e.habilidadesManejoPuntos || 0),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderDash: [3, 3],
        tension: 0.35,
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointRadius: 4
      }
    ]
  };

  // Datos para Curva de Accidentes e Incidentes
  const accidentChartData = {
    labels: scoreLabels,
    datasets: [
      {
        label: 'Total Incidentes (Suma)',
        data: driverEvaluations.map((e) => (e.colisiones || e.totalColisiones || 0) + (e.fatalidades || 0) + (e.vehiculoFueraVia || 0)),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        fill: true,
        tension: 0.3,
        borderWidth: 3,
        pointBackgroundColor: '#ef4444',
        pointRadius: 6
      },
      {
        label: '💥 Colisiones',
        data: driverEvaluations.map((e) => e.colisiones || e.totalColisiones || 0),
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#f59e0b',
        pointRadius: 4
      },
      {
        label: '💀 Fatalidades',
        data: driverEvaluations.map((e) => e.fatalidades || 0),
        borderColor: '#dc2626',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#dc2626',
        pointRadius: 4
      },
      {
        label: '🛑 Fuera de Vía',
        data: driverEvaluations.map((e) => e.vehiculoFueraVia || 0),
        borderColor: '#e11d48',
        backgroundColor: 'transparent',
        borderDash: [2, 2],
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#e11d48',
        pointRadius: 4
      }
    ]
  };

  // Datos para Radar de Competencias
  const latestEval = driverEvaluations[driverEvaluations.length - 1];
  const radarData = {
    labels: [
      'Evaluación Final',
      'Habilidades Manejo',
      'Simulador',
      'Seguridad Vial (0 Incid.)',
      'Sierra / S3',
      'Críticas / S4'
    ],
    datasets: [
      {
        label: currentDriver ? currentDriver.nombre : 'Operador',
        data: latestEval
          ? [
              latestEval.evaluacionFinalPuntos ?? latestEval.calificacionExacta ?? 0,
              (latestEval.habilidadesManejoPct || 50) / 10,
              (latestEval.practicaSimuladorPct || 50) / 10,
              Math.max(0, 10 - ((latestEval.colisiones || 0) * 2) - ((latestEval.fatalidades || 0) * 3)),
              latestEval.simulacionesDetalle?.simulacion_3 || 5,
              latestEval.simulacionesDetalle?.simulacion_4 || 5
            ]
          : [5, 5, 5, 5, 5, 5],
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.25)',
        borderWidth: 2,
        pointBackgroundColor: '#38bdf8',
        pointRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
      }
    },
    scales: {
      y: {
        min: 0,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748b' }
      },
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
      }
    },
    scales: {
      r: {
        min: 0,
        max: 10,
        angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        pointLabels: { color: '#cbd5e1', font: { size: 11 } },
        ticks: { backdropColor: 'transparent', color: '#64748b' }
      }
    }
  };

  return (
    <div className="view-section active">
      {/* Selector de Sub-tab: Operador o Empresa */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>📈 Evolución y Trazabilidad Histórica</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Curvas de aprendizaje temporal, radar de competencias y evolución de accidentabilidad
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeSubtab === 'driver' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveSubtab('driver')}
          >
            👤 Conductor Individual
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeSubtab === 'company' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveSubtab('company')}
          >
            🏢 Flota de la Empresa
          </button>
        </div>
      </div>

      {activeSubtab === 'driver' ? (
        <>
          {/* Selector de Conductor */}
          <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '1.2rem' }}>👨‍✈️</span>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Seleccionar Operador</label>
                <select
                  value={currentDriver?.nombre || ''}
                  onChange={(e) => setSelectedDriverName(e.target.value)}
                  style={{ minWidth: '260px', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
                >
                  {driverSummaries.map((d) => (
                    <option key={d.nombre} value={d.nombre}>
                      {d.nombre} ({d.totalEvaluaciones} eval{d.totalEvaluaciones > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {currentDriver && (
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Calificación Última</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>{currentDriver.ultimaCalificacion.toFixed(2)} / 10</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tendencia</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: currentDriver.tendencia === 'mejora' ? 'var(--success)' : currentDriver.tendencia === 'retroceso' ? 'var(--danger)' : '#94a3b8' }}>
                    {currentDriver.tendencia === 'mejora' ? '↗ Mejora' : currentDriver.tendencia === 'retroceso' ? '↘ Retroceso' : '→ Estable'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Estado</div>
                  <span className={`badge badge-${currentDriver.badgeColor || 'info'}`}>{currentDriver.estadoGeneral}</span>
                </div>
              </div>
            )}
          </div>

          {/* Gráficos de Evolución de Operador */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Curva de Puntajes */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>📈 Curva de Aprendizaje y Puntaje</h3>
              <div style={{ height: '300px', width: '100%' }}>
                <Line data={evolutionChartData} options={chartOptions} />
              </div>
            </div>

            {/* Radar de Competencias */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>🕸️ Radar Multidimensional de Competencias</h3>
              <div style={{ height: '300px', width: '100%' }}>
                <Radar data={radarData} options={radarOptions} />
              </div>
            </div>
          </div>

          {/* Curva de Accidentes e Incidentes */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>🚨 Historial y Tendencia de Incidentes</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Comportamiento de colisiones, fatalidades y salidas de vía registradas en el simulador a lo largo del tiempo.
            </p>
            <div style={{ height: '280px', width: '100%' }}>
              <Line data={accidentChartData} options={chartOptions} />
            </div>
          </div>
        </>
      ) : (
        /* Vista Flota Empresa */
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🏢</span>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Seleccionar Flota / Empresa</label>
              <select
                value={currentCompany?.nombre || ''}
                onChange={(e) => setSelectedCompanyName(e.target.value)}
                style={{ minWidth: '260px', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
              >
                {companiesSummaries.map((c) => (
                  <option key={c.nombre} value={c.nombre}>
                    {c.nombre} ({c.totalConductores} operadores)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentCompany && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-label">Total Operadores</div>
                <div className="stat-value" style={{ color: '#38bdf8' }}>{currentCompany.totalConductores}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Promedio de Flota</div>
                <div className="stat-value" style={{ color: '#22c55e' }}>{currentCompany.promedioFinal.toFixed(2)} / 10</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Tasa de Aprobación</div>
                <div className="stat-value" style={{ color: '#a855f7' }}>{currentCompany.tasaAprobacion.toFixed(1)}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Incidentes Totales</div>
                <div className="stat-value" style={{ color: '#ef4444' }}>
                  {currentCompany.totalColisiones + currentCompany.totalFatalidades + currentCompany.totalFueraVia}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
