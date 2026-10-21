import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Evaluation } from '../types';
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
  const [viewReport, setViewReport] = useState<Evaluation | null>(null);

  // Filtrar únicamente conductores con historial comparable (al menos 2 sesiones)
  const eligibleDrivers = useMemo(() => {
    return (driverSummaries || []).filter((d) => d.totalEvaluaciones >= 2);
  }, [driverSummaries]);

  // Operador seleccionado (por defecto el primero disponible con al menos 2 sesiones)
  const currentDriver = useMemo(() => {
    if (!eligibleDrivers || eligibleDrivers.length === 0) return null;
    if (!selectedDriverName) return eligibleDrivers[0];
    return eligibleDrivers.find((d) => d.nombre === selectedDriverName) || eligibleDrivers[0];
  }, [eligibleDrivers, selectedDriverName]);

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
        borderColor: '#f43f5e', // Rosa/Rojo Coral intenso
        backgroundColor: 'rgba(244, 63, 94, 0.12)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: '#f43f5e',
        pointBorderColor: '#ffffff',
        pointRadius: 6
      },
      {
        label: '💥 Colisiones',
        data: driverEvaluations.map((e) => e.colisiones || e.totalColisiones || 0),
        borderColor: '#f59e0b', // Ámbar / Amarillo vibrante
        backgroundColor: 'transparent',
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#0e1422',
        pointRadius: 5
      },
      {
        label: '💀 Fatalidades',
        data: driverEvaluations.map((e) => e.fatalidades || 0),
        borderColor: '#a855f7', // Púrpura eléctrico distintivo
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#0e1422',
        pointRadius: 5
      },
      {
        label: '🛑 Fuera de Vía',
        data: driverEvaluations.map((e) => e.vehiculoFueraVia || 0),
        borderColor: '#06b6d4', // Cyan / Turquesa neón
        backgroundColor: 'transparent',
        borderDash: [3, 3],
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#0e1422',
        pointRadius: 5
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
          <div className="glass-card" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.8))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '260px' }}>
              <span style={{ fontSize: '1.3rem' }}>👨‍✈️</span>
              <div style={{ width: '100%', maxWidth: '380px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                  Seleccionar Conductor / Operador (Mín. 2 sesiones)
                </label>
                {eligibleDrivers.length === 0 ? (
                  <div style={{ padding: '0.55rem 0.85rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem' }}>
                    No hay operadores con 2 o más evaluaciones registradas
                  </div>
                ) : (
                  <select
                    value={currentDriver?.nombre || ''}
                    onChange={(e) => setSelectedDriverName(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.85rem', background: '#0e1422', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#38bdf8', fontWeight: 600, fontSize: '0.9rem' }}
                  >
                    {eligibleDrivers.map((d) => (
                      <option key={d.nombre} value={d.nombre}>
                        {d.nombre} ({d.empresa}) • {d.totalEvaluaciones} evaluaciones
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {currentDriver && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Historial del Operador: </span>
                <strong style={{ color: '#38bdf8' }}>{currentDriver.totalEvaluaciones} sesiones completadas</strong>
              </div>
            )}
          </div>

          {/* Tarjeta Ejecutiva de Información del Conductor (3 Niveles de Prioridad) */}
          {currentDriver && (
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
              {/* Nivel 1 (Nombre) & Nivel 2 (Empresa) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem' }}>
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
                      <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
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
                      color: currentDriver.ultimaCalificacion >= 8.0 ? '#22c55e' : currentDriver.ultimaCalificacion >= 6.0 ? '#38bdf8' : '#ef4444',
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
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentDriver.ultimaCalificacion >= 6.0 ? '#22c55e' : '#ef4444', marginTop: '0.1rem' }}>
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
          )}

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

          {/* Historial Cronológico de Sesiones del Conductor */}
          <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🕒 Historial Cronológico de Sesiones</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Resumen cronológico detallado de las evaluaciones y pruebas en simulador a lo largo del tiempo ({driverEvaluations.length} sesiones registradas).
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Sesión #</th>
                    <th>Fecha de Sesión</th>
                    <th>Sede / Ubicación</th>
                    <th>Calificación Final</th>
                    <th>Práctica Simulador</th>
                    <th>Habilidades Manejo</th>
                    <th>Incidentes</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {driverEvaluations.map((ev, idx) => {
                    const score = ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
                    const colisiones = ev.colisiones || ev.totalColisiones || 0;
                    const fatalidades = ev.fatalidades || 0;
                    const fueraVia = ev.vehiculoFueraVia || 0;
                    const totalIncidentes = colisiones + fatalidades + fueraVia;
                    const dateFormatted = ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || 'N/A';

                    return (
                      <tr key={ev.id || idx}>
                        <td>
                          <span
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              color: '#38bdf8',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '0.82rem'
                            }}
                          >
                            Sesión #{idx + 1}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.86rem', color: '#fff', fontWeight: 600 }}>
                          📅 {dateFormatted}
                        </td>
                        <td style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                          📍 {ev.sede || ev.ciudad || 'Sede Principal'}
                        </td>
                        <td>
                          <span className="score-pill" style={{ color: score >= 6.0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                            {score.toFixed(2)}
                            <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> / 10</small>
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>
                          {(ev.practicaSimuladorPuntos || 0).toFixed(2)} <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>/ 7 ptos</small>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
                          {(ev.habilidadesManejoPuntos || 0).toFixed(2)} <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>/ 3 ptos</small>
                        </td>
                        <td>
                          {totalIncidentes === 0 ? (
                            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.85rem' }}>
                              0 (Limpio)
                            </span>
                          ) : (
                            <span
                              style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}
                              title={`💥 ${colisiones} colisiones • 💀 ${fatalidades} fatalidades • 🛑 ${fueraVia} salidas`}
                            >
                              ⚠️ {totalIncidentes} {totalIncidentes === 1 ? 'incidente' : 'incidentes'}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${score >= 8.0 ? 'success' : score >= 6.0 ? 'info' : score >= 5.0 ? 'warning' : 'danger'}`}>
                            {ev.estado || (score >= 6.0 ? 'Aprobado' : 'No Aprobado')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setViewReport(ev)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              background: 'rgba(56, 189, 248, 0.12)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)'
                            }}
                          >
                            <span>📄</span> Ver Reporte
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Detalle de Reporte de Sesión */}
          {viewReport && (
            <div
              className="modal-backdrop active"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem'
              }}
              onClick={() => setViewReport(null)}
            >
              <div
                className="glass-card"
                style={{
                  maxWidth: '680px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  background: '#0e1422',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '16px',
                  padding: '1.75rem',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header del Modal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.06em' }}>
                      Reporte de Evaluación Individual
                    </span>
                    <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                      {viewReport.conductor || viewReport.operador}
                    </h2>
                    <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      🏢 {viewReport.empresa} {viewReport.sede ? `• 📍 ${viewReport.sede}` : ''} • Folio: {viewReport.folio || viewReport.id?.substring(0, 10)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewReport(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#94a3b8',
                      fontSize: '1.2rem',
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Resumen Principal de Métricas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '0.85rem', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fecha Sesión</div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                      {viewReport.fechaCapacitacionFormato || viewReport.fechaCapacitacion || viewReport.fechaReporte || viewReport.fecha || 'N/A'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '0.85rem', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Calificación Final</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: (viewReport.evaluacionFinalPuntos ?? viewReport.calificacionExacta ?? 0) >= 6.0 ? '#22c55e' : '#ef4444', marginTop: '0.2rem' }}>
                      {(viewReport.evaluacionFinalPuntos ?? viewReport.calificacionExacta ?? viewReport.promedioScore ?? 0).toFixed(2)} / 10
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '0.85rem', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Práctica Simulador</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#c084fc', marginTop: '0.2rem' }}>
                      {(viewReport.practicaSimuladorPuntos || 0).toFixed(2)} / 7 ptos
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '0.85rem', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Habilidades Manejo</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
                      {(viewReport.habilidadesManejoPuntos || 0).toFixed(2)} / 3 ptos
                    </div>
                  </div>
                </div>

                {/* Bloque de Incidentes y Seguridad Vial */}
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    🚨 Incidentes y Seguridad en Simulador
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.6rem', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💥 Colisiones</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (viewReport.colisiones || viewReport.totalColisiones || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                        {viewReport.colisiones || viewReport.totalColisiones || 0}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.6rem', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💀 Fatalidades</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (viewReport.fatalidades || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                        {viewReport.fatalidades || 0}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.6rem', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>🛑 Fuera de Vía</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (viewReport.vehiculoFueraVia || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                        {viewReport.vehiculoFueraVia || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Variantes y Ejercicios Aplicados en la Sesión */}
                {Array.isArray(viewReport.ejercicios) && viewReport.ejercicios.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      🎮 Ejercicios y Simulaciones Realizadas
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {viewReport.ejercicios.map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.55rem 0.85rem',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '8px',
                            fontSize: '0.84rem'
                          }}
                        >
                          <span style={{ color: '#fff', fontWeight: 600 }}>
                            {ex.numero ? `#${ex.numero} • ` : ''}{ex.nombre || `Ejercicio ${exIdx + 1}`}
                          </span>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                            {typeof ex.calificacion === 'number'
                              ? `${ex.calificacion.toFixed(1)} pts`
                              : typeof ex.score === 'number'
                              ? `${ex.score.toFixed(1)} pts`
                              : 'Realizado'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observaciones e Instructor */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Instructor a cargo: </span>
                    <strong style={{ color: '#fff' }}>{viewReport.instructor || 'Instructor Oficial TrackSIM'}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setViewReport(null)}
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Vista Flota Empresa */
        <div className="card" style={{ padding: '1.5rem' }}>
          {companiesSummaries.length > 1 && (
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
          )}

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
