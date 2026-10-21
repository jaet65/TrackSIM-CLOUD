import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const PAGE_SIZE = 30;

type SortKey = 'promedioScore' | 'nombre' | 'totalEvaluaciones' | 'ultimaFecha' | 'incidentes' | 'estado';

export const CompanyTab: React.FC = () => {
  const {
    companies,
    selectedCompany,
    setSelectedCompany,
    selectedCompanySummary
  } = useData();

  const [driverSearch, setDriverSearch] = useState('');
  const [rankingPage, setRankingPage] = useState(1);
  const [driversPage, setDriversPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('promedioScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const comp = selectedCompanySummary;

  // Filtrado de operadores por búsqueda
  const filteredConductores = useMemo(() => {
    if (!comp?.conductores) return [];
    let list = [...comp.conductores];
    const q = driverSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.nombre.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'nombre':
          cmp = (a.nombre || '').localeCompare(b.nombre || '', 'es', { numeric: true });
          break;
        case 'totalEvaluaciones':
          cmp = (a.totalEvaluaciones || 0) - (b.totalEvaluaciones || 0);
          break;
        case 'ultimaFecha':
          cmp = (a.ultimaFecha || '').localeCompare(b.ultimaFecha || '');
          break;
        case 'incidentes': {
          const totA = (a.colisiones || 0) + (a.fatalidades || 0) + (a.totalFueraVia || 0);
          const totB = (b.colisiones || 0) + (b.fatalidades || 0) + (b.totalFueraVia || 0);
          cmp = totA - totB;
          break;
        }
        case 'estado': {
          const rankMap: Record<string, number> = {
            'Sobresaliente': 4,
            'Aprobado': 3,
            'Reforzar': 2,
            'Requiere Refuerzo': 2,
            'No Aprobado': 1
          };
          const rA = rankMap[a.estado || ''] || 0;
          const rB = rankMap[b.estado || ''] || 0;
          cmp = rA - rB;
          break;
        }
        case 'promedioScore':
        default:
          cmp = (a.promedioScore || 0) - (b.promedioScore || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [comp, driverSearch, sortKey, sortDir]);

  // Paginación del Ranking (Top 30 por página ordenado estrictamente por score)
  const rankingList = useMemo(() => {
    if (!comp?.conductores) return [];
    let list = [...comp.conductores].sort((a, b) => b.promedioScore - a.promedioScore);
    const q = driverSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.nombre.toLowerCase().includes(q));
    }
    return list;
  }, [comp, driverSearch]);

  const totalRankingPages = Math.max(1, Math.ceil(rankingList.length / PAGE_SIZE));
  const currentRankingPage = Math.min(Math.max(1, rankingPage), totalRankingPages);
  const pagedRanking = rankingList.slice((currentRankingPage - 1) * PAGE_SIZE, currentRankingPage * PAGE_SIZE);

  // Paginación de la Tabla de Operadores (30 por página)
  const totalDriversPages = Math.max(1, Math.ceil(filteredConductores.length / PAGE_SIZE));
  const currentDriversPage = Math.min(Math.max(1, driversPage), totalDriversPages);
  const pagedDrivers = filteredConductores.slice((currentDriversPage - 1) * PAGE_SIZE, currentDriversPage * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'nombre' ? 'asc' : 'desc');
    }
  };

  if (!comp) {
    return (
      <div className="view-section active">
        <div className="empty-state">
          <p>No hay información disponible para la empresa seleccionada.</p>
        </div>
      </div>
    );
  }

  // Configuración del gráfico de ranking horizontal
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const chartLabels = pagedRanking.map((item, idx) => {
    const globalRank = (currentRankingPage - 1) * PAGE_SIZE + idx + 1;
    const prefix = medals[globalRank] || `#${globalRank}`;
    return `${prefix} ${item.nombre}`;
  });

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Calificación Promedio',
        data: pagedRanking.map((item) => parseFloat(item.promedioScore.toFixed(2))),
        backgroundColor: pagedRanking.map((item) => {
          if (item.promedioScore >= 8.0) return 'rgba(34, 197, 94, 0.75)';
          if (item.promedioScore >= 6.0) return 'rgba(56, 189, 248, 0.75)';
          return 'rgba(239, 68, 68, 0.75)';
        }),
        borderRadius: 4
      }
    ]
  };

  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` Promedio: ${ctx.raw} / 10`
        }
      }
    },
    scales: {
      x: {
        min: 0,
        max: 10,
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#f8fafc', font: { size: 11 } }
      }
    }
  };

  return (
    <div className="view-section active">
      {/* Selector de Empresa */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>🏢 Estadísticas de Flota</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {comp.esGlobal
              ? '🌐 Vista Consolidada Global: Todas las flotas y empresas registradas'
              : comp.sedes.length > 0
              ? `📍 Sede de Evaluación: ${comp.sedes.join(', ')}`
              : 'Flota Oficial de Autotransporte TrackSIM'}
          </p>
        </div>
        <div>
          <select
            className="filter-select"
            value={selectedCompany}
            onChange={(e) => {
              setSelectedCompany(e.target.value);
              setRankingPage(1);
              setDriversPage(1);
            }}
            style={{ minWidth: '240px', padding: '0.55rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: '#fff', borderRadius: '8px' }}
          >
            <option value="all">🏢 Todas las Empresas (Consolidado)</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Operadores</div>
          <div className="stat-value" style={{ color: '#38bdf8' }}>{comp.totalConductores}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reportes de Evaluación</div>
          <div className="stat-value">{comp.totalEvaluaciones}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Calificación Promedio</div>
          <div className="stat-value" style={{ color: '#22c55e' }}>{comp.promedioFinal.toFixed(2)} / 10</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tasa de Aprobación</div>
          <div className="stat-value" style={{ color: '#a855f7' }}>{comp.tasaAprobacion.toFixed(1)}%</div>
        </div>
      </div>

      {/* Ranking de Operadores (Colapsable con Paginación de 30) */}
      <details className="card" open style={{ marginBottom: '2rem' }}>
        <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', fontWeight: 700, fontSize: '1.05rem' }}>
          <span>🏆 Ranking de Operadores (Top 30 por página)</span>
          <span className="badge badge-info">▼ Mostrar / ocultar</span>
        </summary>
        <div style={{ padding: '1.25rem' }}>
          <div style={{ height: Math.max(250, pagedRanking.length * 28 + 40) + 'px', width: '100%' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>

          {/* Barra de paginación del Ranking */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Mostrando top {(currentRankingPage - 1) * PAGE_SIZE + 1}-{Math.min(currentRankingPage * PAGE_SIZE, rankingList.length)} de {rankingList.length} operadores
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRankingPage(1)}
                disabled={currentRankingPage === 1}
              >
                ««
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRankingPage((p) => p - 1)}
                disabled={currentRankingPage === 1}
              >
                « Ant
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8', padding: '0 0.5rem' }}>
                Página {currentRankingPage} de {totalRankingPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRankingPage((p) => p + 1)}
                disabled={currentRankingPage === totalRankingPages}
              >
                Sig »
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRankingPage(totalRankingPages)}
                disabled={currentRankingPage === totalRankingPages}
              >
                »»
              </button>
            </div>
          </div>
        </div>
      </details>

      {/* Roster de Operadores de la Flota (Paginación de 30) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>👨‍✈️ Operadores Pertenecientes a esta Flota</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {filteredConductores.length} operadores registrados
            </span>
          </div>
          <div>
            <input
              type="text"
              placeholder="Buscar operador por nombre..."
              value={driverSearch}
              onChange={(e) => {
                setDriverSearch(e.target.value);
                setDriversPage(1);
                setRankingPage(1);
              }}
              style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', minWidth: '220px' }}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('nombre')} style={{ cursor: 'pointer' }}>
                  Operador {sortKey === 'nombre' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('totalEvaluaciones')} style={{ cursor: 'pointer' }}>
                  Evaluaciones {sortKey === 'totalEvaluaciones' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('ultimaFecha')} style={{ cursor: 'pointer' }}>
                  Última Fecha {sortKey === 'ultimaFecha' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('promedioScore')} style={{ cursor: 'pointer' }}>
                  Score Promedio {sortKey === 'promedioScore' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th>Simulaciones / Ejercicios</th>
                <th onClick={() => handleSort('incidentes')} style={{ cursor: 'pointer' }}>
                  Incidentes {sortKey === 'incidentes' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('estado')} style={{ cursor: 'pointer' }}>
                  Estado {sortKey === 'estado' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedDrivers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No se encontraron operadores que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                pagedDrivers.map((c, idx) => {
                  const globalIdx = (currentDriversPage - 1) * PAGE_SIZE + idx + 1;
                  const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                  return (
                    <tr key={c.nombre + idx}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '28px', height: '28px', minWidth: '28px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                            {globalIdx}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.nombre}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {comp.esGlobal && c.empresa && <strong style={{ color: '#38bdf8' }}>🏢 {c.empresa} • </strong>}
                              {c.sede ? `📍 ${c.sede}` : 'ID: ' + (c.latestEvalId?.substring(0, 12) || 'N/A')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{c.totalEvaluaciones}</strong> <small style={{ color: 'var(--text-muted)' }}>sesión(es)</small>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.ultimaFecha}</td>
                      <td>
                        <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '1rem' }}>
                          {c.promedioScore.toFixed(2)}
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Último: {c.ultimoScore.toFixed(2)}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                          {c.ejercicios && c.ejercicios.length > 0 ? (
                            c.ejercicios.slice(0, 3).map((e, i) => (
                              <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                                ● {e.nombre}
                              </div>
                            ))
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Simulación estándar</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: totalIncidentes > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                          {totalIncidentes}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${c.badgeColor || 'info'}`}>{c.estado}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de paginación de la tabla */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Mostrando operadores {(currentDriversPage - 1) * PAGE_SIZE + 1}-{Math.min(currentDriversPage * PAGE_SIZE, filteredConductores.length)} de {filteredConductores.length}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage(1)}
              disabled={currentDriversPage === 1}
            >
              ««
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage((p) => p - 1)}
              disabled={currentDriversPage === 1}
            >
              « Ant
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8', padding: '0 0.5rem' }}>
              Página {currentDriversPage} de {totalDriversPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage((p) => p + 1)}
              disabled={currentDriversPage === totalDriversPages}
            >
              Sig »
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage(totalDriversPages)}
              disabled={currentDriversPage === totalDriversPages}
            >
              »»
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
