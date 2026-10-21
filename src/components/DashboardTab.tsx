import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export const DashboardTab: React.FC = () => {
  const {
    filteredEvaluations,
    companies,
    selectedCompany,
    setSelectedCompany,
    searchFilter,
    setSearchFilter,
    loading
  } = useData();

  const metrics = useMemo(() => {
    const total = filteredEvaluations.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: 0,
        totalColisiones: 0,
        totalFatalidades: 0,
        totalFueraVia: 0,
        passingRate: 0,
        sobresalientes: 0,
        aprobados: 0,
        refuerzo: 0,
        noAprobados: 0
      };
    }

    let sumScore = 0;
    let sumCol = 0;
    let sumFat = 0;
    let sumOff = 0;
    let passing = 0;
    let sobresalientes = 0;
    let aprobados = 0;
    let refuerzo = 0;
    let noAprobados = 0;

    filteredEvaluations.forEach((e) => {
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      sumScore += score;
      sumCol += e.colisiones || e.totalColisiones || 0;
      sumFat += e.fatalidades || 0;
      sumOff += e.vehiculoFueraVia || 0;

      if (score >= 8.0) {
        sobresalientes++;
        passing++;
      } else if (score >= 6.0) {
        aprobados++;
        passing++;
      } else if (score >= 5.0) {
        refuerzo++;
      } else {
        noAprobados++;
      }
    });

    return {
      total,
      avgScore: parseFloat((sumScore / total).toFixed(2)),
      totalColisiones: sumCol,
      totalFatalidades: sumFat,
      totalFueraVia: sumOff,
      passingRate: parseFloat(((passing / total) * 100).toFixed(1)),
      sobresalientes,
      aprobados,
      refuerzo,
      noAprobados
    };
  }, [filteredEvaluations]);

  const doughnutData = {
    labels: ['Sobresaliente (8-10)', 'Aprobado (6-7.9)', 'Reforzar (5-5.9)', 'No Aprobado (<5)'],
    datasets: [
      {
        data: [
          metrics.sobresalientes,
          metrics.aprobados,
          metrics.refuerzo,
          metrics.noAprobados
        ],
        backgroundColor: ['#10b981', '#38bdf8', '#f59e0b', '#ef4444'],
        borderColor: '#0f172a',
        borderWidth: 2
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8',
          boxWidth: 12,
          font: { family: 'Plus Jakarta Sans', size: 11 }
        }
      }
    },
    cutout: '68%'
  };

  return (
    <div className="view-section active">
      <div className="section-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>📊 Panel de Control y Métricas</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Trazabilidad consolidada del rendimiento de operadores y simuladores
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1', minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Buscar por operador, folio o instructor..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
          />
        </div>

        <div>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            style={{ minWidth: '240px', padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
          >
            <option value="all">Todas las empresas ({companies.length})</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid de KPIs */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-label">Evaluaciones Registradas</div>
          <div className="stat-value" style={{ color: '#38bdf8' }}>{metrics.total}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Reportes procesados</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Calificación Promedio</div>
          <div className="stat-value" style={{ color: '#22c55e' }}>{metrics.avgScore} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 10</small></div>
          <div style={{ fontSize: '0.72rem', color: metrics.avgScore >= 6.0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.25rem' }}>
            {metrics.avgScore >= 8.0 ? 'Dominio Sobresaliente' : metrics.avgScore >= 6.0 ? 'Aprobatorio' : 'Requiere Refuerzo'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Tasa de Aprobación</div>
          <div className="stat-value" style={{ color: '#a855f7' }}>{metrics.passingRate}%</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Score ≥ 6.0 pts</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Colisiones Registradas</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{metrics.totalColisiones}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Impactos en simulaciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Fatalidades / Salidas Vía</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{metrics.totalFatalidades + metrics.totalFueraVia}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Eventos de alto riesgo</div>
        </div>
      </div>

      {/* Gráfico Donut de Distribución */}
      <div className="card" style={{ padding: '1.5rem', maxWidth: '540px', margin: '0 auto' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, textAlign: 'center' }}>
          🎯 Distribución de Desempeño
        </h3>
        <div style={{ height: '260px', width: '100%' }}>
          <Doughnut data={doughnutData} options={doughnutOptions} />
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Sincronizando con Firestore...</div>}
    </div>
  );
};
