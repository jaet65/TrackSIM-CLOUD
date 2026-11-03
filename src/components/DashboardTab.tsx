import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { normalizeExerciseName, findCatalogExercise } from '../services/exerciseCatalog';
import { getEvaluationIncidentCounts } from '../services/incidentMetrics';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface DashboardTabProps {
  onNavigate?: (tab: 'evolucion' | 'empresas' | 'directorio' | 'ingesta') => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ onNavigate }) => {
  const { userRole } = useAuth();
  const { theme } = useTheme();
  const {
    filteredEvaluations,
    companies,
    selectedCompany,
    companiesSummaries,
    loading
  } = useData();

  // Cálculo de Métricas Clave
  const metrics = useMemo(() => {
    const total = filteredEvaluations.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: 0,
        totalColisiones: 0,
        totalFatalidades: 0,
        totalFueraVia: 0,
        totalIncidentes: 0,
        passingRate: 0,
        sobresalientes: 0,
        aprobados: 0,
        refuerzo: 0,
        noAprobados: 0,
        totalDrivers: 0
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
    const uniqueDrivers = new Set<string>();

    filteredEvaluations.forEach((e) => {
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      const incidents = getEvaluationIncidentCounts(e);
      sumScore += score;
      sumCol += incidents.colisiones;
      sumFat += incidents.fatalidades;
      sumOff += incidents.vehiculoFueraVia;

      const driverName = (e.conductor || e.operador || '').trim();
      if (driverName) uniqueDrivers.add(driverName);

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
      totalDrivers: uniqueDrivers.size,
      avgScore: parseFloat((sumScore / total).toFixed(2)),
      totalColisiones: sumCol,
      totalFatalidades: sumFat,
      totalFueraVia: sumOff,
      totalIncidentes: sumCol + sumFat + sumOff,
      passingRate: parseFloat(((passing / total) * 100).toFixed(1)),
      sobresalientes,
      aprobados,
      refuerzo,
      noAprobados
    };
  }, [filteredEvaluations]);

  // Evaluaciones Recientes (Top 5 más recientes)
  const recentEvaluations = useMemo(() => {
    return filteredEvaluations.slice(0, 5);
  }, [filteredEvaluations]);

  // Empresas con mejor desempeño (hasta 30, adaptándose al total disponible)
  const topCompanies = useMemo(() => {
    return [...companiesSummaries]
      .filter((c) => !c.esGlobal)
      .sort((a, b) => b.promedioFinal - a.promedioFinal)
      .slice(0, 30);
  }, [companiesSummaries]);

  // Desempeño Comparativo por Sedes / Ciudades (hasta 30)
  const sedesComparison = useMemo(() => {
    const sedeMap = new Map<string, { totalPuntos: number; count: number }>();
    filteredEvaluations.forEach((e) => {
      const sedeName = (e.sede && e.sede.trim() !== '') ? e.sede.trim() : (e.ciudad && e.ciudad.trim() !== '') ? e.ciudad.trim() : 'Sede Principal';
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      const current = sedeMap.get(sedeName) || { totalPuntos: 0, count: 0 };
      current.totalPuntos += score;
      current.count += 1;
      sedeMap.set(sedeName, current);
    });

    return Array.from(sedeMap.entries())
      .map(([nombre, data]) => ({
        nombre,
        count: data.count,
        promedio: Number((data.totalPuntos / (data.count || 1)).toFixed(1))
      }))
      .sort((a, b) => b.promedio - a.promedio)
      .slice(0, 30);
  }, [filteredEvaluations]);

  // Resumen ejecutivo de la empresa/flota activa (Años, Operadores, Ejercicios)
  const companyOverviewStats = useMemo(() => {
    const yearsSet = new Set<string>();
    const sedesSet = new Set<string>();
    const exercisesSet = new Set<string>();
    const companiesSet = new Set<string>();

    filteredEvaluations.forEach((e) => {
      if (e.empresa) companiesSet.add(e.empresa);

      const sName = (e.sede || e.ciudad || '').trim();
      if (sName) sedesSet.add(sName);

      // Extraer años de fecha
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      if (match) {
        yearsSet.add(match[1]);
      } else if (dateStr) {
        const parts = dateStr.split(/[-/]/);
        if (parts.length >= 3) {
          const yr = parts.find((p) => p.length === 4 && (p.startsWith('20') || p.startsWith('19')));
          if (yr) yearsSet.add(yr);
        }
      }

      // Variantes de ejercicio realizadas
      if (Array.isArray(e.ejercicios) && e.ejercicios.length > 0) {
        e.ejercicios.forEach((ex) => {
          const rawName = (ex.nombre || (ex.numero ? (e.nombresSimulaciones?.[ex.numero] || `Ejercicio ${ex.numero}`) : '')).trim();
          if (rawName) {
            const matched = findCatalogExercise(rawName);
            const normKey = matched ? normalizeExerciseName(matched.nombre) : normalizeExerciseName(rawName);
            if (normKey) exercisesSet.add(normKey);
          }
        });
      } else if (e.nombresSimulaciones && Object.keys(e.nombresSimulaciones).length > 0) {
        Object.values(e.nombresSimulaciones).forEach((simName) => {
          if (simName && typeof simName === 'string') {
            const matched = findCatalogExercise(simName);
            const normKey = matched ? normalizeExerciseName(matched.nombre) : normalizeExerciseName(simName);
            if (normKey) exercisesSet.add(normKey);
          }
        });
      } else if (e.simulacionesDetalle) {
        Object.keys(e.simulacionesDetalle).forEach((key) => {
          const clean = key.replace(/_/g, ' ').trim();
          const matched = findCatalogExercise(clean);
          const normKey = matched ? normalizeExerciseName(matched.nombre) : normalizeExerciseName(clean);
          if (normKey) exercisesSet.add(normKey);
        });
      }
    });

    const totalEvals = filteredEvaluations.length;

    if (totalEvals === 0) {
      const activeCompanyName = selectedCompany === 'all'
        ? (companies.length === 1 ? companies[0] : `Todas las Empresas (${companiesSet.size})`)
        : selectedCompany;

      return {
        nombreEmpresa: activeCompanyName,
        aniosEvaluados: '0 años',
        totalAnios: 0,
        totalSedes: 0,
        listaSedes: 'Ninguna',
        totalEjercicios: 0
      };
    }

    const sortedYears = Array.from(yearsSet).sort();
    let yearsLabel = '1 año (En curso)';
    if (sortedYears.length === 1) {
      yearsLabel = `1 año (${sortedYears[0]})`;
    } else if (sortedYears.length > 1) {
      const initialYear = sortedYears[0];
      const finalYear = sortedYears[sortedYears.length - 1];
      yearsLabel = `${sortedYears.length} años (${initialYear} - ${finalYear})`;
    }

    const activeCompanyName = selectedCompany === 'all'
      ? (companies.length === 1 ? companies[0] : `Todas las Empresas (${companiesSet.size})`)
      : selectedCompany;

    return {
      nombreEmpresa: activeCompanyName,
      aniosEvaluados: yearsLabel,
      totalAnios: sortedYears.length || 1,
      totalSedes: sedesSet.size,
      listaSedes: Array.from(sedesSet).slice(0, 3).join(', '),
      totalEjercicios: exercisesSet.size
    };
  }, [filteredEvaluations, selectedCompany, companies]);

  // Determinar si mostramos comparativa de Flotas o de Ciudades/Sedes
  const isCityComparison = companies.length <= 1 || selectedCompany !== 'all';

  // Donut de Desempeño
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
        borderColor: theme === 'light' ? '#ffffff' : '#0f172a',
        borderWidth: 3
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
          color: theme === 'light' ? '#526179' : '#94a3b8',
          boxWidth: 10,
          font: { family: 'Plus Jakarta Sans', size: 11 },
          padding: 12
        }
      }
    },
    cutout: '72%'
  };

  const barCount = isCityComparison ? sedesComparison.length : topCompanies.length;
  // Grosor adaptativo: si son pocas (<= 6) barras gruesas (34px); si son 10 (24px); si son 25-30 barras compactas (14px)
  const dynamicBarThickness = barCount <= 6 ? 34 : barCount <= 12 ? 24 : barCount <= 20 ? 18 : 14;

  // Gráfico de Barras: Comparativa Top Flotas o Desempeño por Ciudades / Sedes
  const barData = isCityComparison
    ? {
      labels: sedesComparison.map((s) => s.nombre),
      datasets: [
        {
          label: 'Promedio Sede/Ciudad',
          data: sedesComparison.map((s) => s.promedio),
          backgroundColor: sedesComparison.map((s) =>
            s.promedio >= 8.0 ? 'rgba(34, 197, 94, 0.75)' : 'rgba(56, 189, 248, 0.75)'
          ),
          borderRadius: 5,
          maxBarThickness: dynamicBarThickness
        }
      ]
    }
    : {
      labels: topCompanies.map((c) => c.nombre),
      datasets: [
        {
          label: 'Promedio Flota',
          data: topCompanies.map((c) => c.promedioFinal),
          backgroundColor: topCompanies.map((c) =>
            c.promedioFinal >= 8.0 ? 'rgba(34, 197, 94, 0.75)' : 'rgba(56, 189, 248, 0.75)'
          ),
          borderRadius: 5,
          maxBarThickness: dynamicBarThickness
        }
      ]
    };

  const barOptions = {
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
      y: {
        min: 0,
        max: 10,
        grid: { color: theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: theme === 'light' ? '#526179' : '#64748b' }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: theme === 'light' ? '#526179' : '#94a3b8',
          font: { size: barCount > 15 ? 9 : 11 },
          maxRotation: barCount > 5 ? 45 : 0,
          minRotation: barCount > 8 ? 25 : 0,
          autoSkip: false
        }
      }
    }
  };

  return (
    <div className="view-section active">
      {/* 1. Header con Bienvenida y Acciones Rápidas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            📊 Panel Ejecutivo de Telemetría
          </h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            {selectedCompany === 'all'
              ? 'Consolidado global de flotas, operadores evaluados e indicadores de seguridad vial.'
              : `Flota activa: ${selectedCompany} • Indicadores de desempeño e incidencias.`}
          </p>
        </div>

        {userRole === 'admin' && onNavigate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('ingesta')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 18px rgba(56, 189, 248, 0.3)' }}
          >
            <span>📥</span> Nueva Evaluación PDF
          </button>
        )}
      </div>

      {/* 2.5. Tarjeta Resumen Ejecutivo de la Flota */}
      <div
        className="glass-card company-overview-card"
        style={{
          padding: '1.25rem 1.75rem',
          marginBottom: '2rem',
          borderRadius: '14px'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
          {/* Nombre de la Empresa */}
          <div className="company-overview-item">
            <div className="company-overview-icon blue">
              🏢
            </div>
            <div>
              <span className="company-overview-label">
                Empresa / Flota
              </span>
              <div className="company-overview-value">
                {companyOverviewStats.nombreEmpresa}
              </div>
            </div>
          </div>

          {/* Años Evaluados */}
          <div className="company-overview-item">
            <div className="company-overview-icon purple">
              📅
            </div>
            <div>
              <span className="company-overview-label">
                Años Evaluados
              </span>
              <div className="company-overview-value purple">
                {companyOverviewStats.aniosEvaluados}
              </div>
            </div>
          </div>

          {/* Sedes */}
          <div className="company-overview-item">
            <div className="company-overview-icon emerald">
              📍
            </div>
            <div>
              <span className="company-overview-label">
                Sedes
              </span>
              <div className="company-overview-value emerald">
                {companyOverviewStats.totalSedes} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>{companyOverviewStats.totalSedes === 1 ? 'ubicación' : 'ciudades'}</span>
              </div>
            </div>
          </div>

          {/* Cantidad de Variantes de Ejercicio */}
          <div className="company-overview-item">
            <div className="company-overview-icon amber">
              🚛
            </div>
            <div>
              <span className="company-overview-label">
                Variantes de Ejercicio
              </span>
              <div className="company-overview-value amber">
                {companyOverviewStats.totalEjercicios} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>modalidades aplicadas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Grid de KPIs de Alto Impacto */}
      <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
        {/* KPI 1: Evaluaciones */}
        <div className="glass-card kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Reportes Procesados</span>
            <div className="kpi-icon blue">📁</div>
          </div>
          <div className="kpi-value">{metrics.total}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{metrics.totalDrivers}</span> operadores únicos
          </div>
        </div>

        {/* KPI 2: Calificación Promedio */}
        <div className="glass-card kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Calificación Promedio</span>
            <div className="kpi-icon emerald">⭐</div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            {metrics.avgScore} <small style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ 10</small>
          </div>
          <div className="kpi-footer">
            <span style={{ color: metrics.avgScore >= 6.0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
              {metrics.avgScore >= 8.0 ? 'Dominio Sobresaliente' : metrics.avgScore >= 6.0 ? 'Nivel Aprobatorio' : 'Requiere Refuerzo'}
            </span>
          </div>
        </div>

        {/* KPI 3: Tasa de Aprobación */}
        <div className="glass-card kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Tasa de Aprobación</span>
            <div className="kpi-icon purple">🎯</div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--accent-purple)' }}>{metrics.passingRate}%</div>
          <div className="kpi-footer">Criterio aprobatorio ≥ 6.0 pts</div>
        </div>

        {/* KPI 4: Total Incidentes */}
        <div className="glass-card kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Incidentes en Simulador</span>
            <div className="kpi-icon rose">⚠️</div>
          </div>
          <div className="kpi-value" style={{ color: metrics.totalIncidentes > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {metrics.totalIncidentes}
          </div>
          <div className="kpi-footer" style={{ fontSize: '0.74rem', lineHeight: 1.35 }}>
            <span>💥 {metrics.totalColisiones} Colisiones</span> •{' '}
            <span>💀 {metrics.totalFatalidades} Fatalidades</span> •{' '}
            <span>🛑 {metrics.totalFueraVia} Fuera de Vía</span>
          </div>
        </div>
      </div>

      {/* 4. Sección Visual Central: Gráficos de Distribución y Comparativa */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Donut de Distribución */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🎯 Distribución de Rendimiento</h3>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Clasificación de operadores por estado de aprobación
            </p>
          </div>

          <div style={{ height: '240px', width: '100%', position: 'relative' }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sobresaliente</div>
              <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>{metrics.sobresalientes}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Aprobado</div>
              <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>{metrics.aprobados}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Reforzar</div>
              <div style={{ fontWeight: 800, color: 'var(--warning)', fontSize: '1.1rem' }}>{metrics.refuerzo}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Aprobado</div>
              <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '1.1rem' }}>{metrics.noAprobados}</div>
            </div>
          </div>
        </div>

        {/* Comparativa: Top Flotas (si hay múltiples empresas) o Desempeño entre Ciudades (si es 1 sola empresa) */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {isCityComparison ? '📍 Desempeño entre Ciudades / Sedes' : '🏆 Desempeño Comparativo de Flotas'}
              </h3>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {isCityComparison
                  ? 'Promedio de calificación obtenido por ciudad o sede de evaluación'
                  : 'Promedio general de calificación por empresa'}
              </p>
            </div>
            {onNavigate && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate('empresas')}
              >
                Ver Metricas »
              </button>
            )}
          </div>

          <div style={{ height: '260px', width: '100%' }}>
            {(isCityComparison ? sedesComparison.length > 0 : topCompanies.length > 0) ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                {isCityComparison ? 'No hay registros de sedes o ciudades disponibles' : 'Información de flota cargada'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Tabla de Evaluaciones Recientes (Solo visible para administradores) */}
      {userRole === 'admin' && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🕒 Últimas Evaluaciones Procesadas</h3>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Sesiones más recientes registradas en la plataforma
              </p>
            </div>
            {onNavigate && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate('directorio')}
              >
                Ver Directorio Completo ({metrics.total}) »
              </button>
            )}
          </div>

          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Operador</th>
                  <th>Empresa</th>
                  <th>Fecha de Sesión</th>
                  <th>Calificación</th>
                  <th>Incidentes</th>
                  <th>Estado</th>
                  {onNavigate && <th style={{ textAlign: 'right' }}>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {recentEvaluations.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No se encontraron evaluaciones registradas.
                    </td>
                  </tr>
                ) : (
                  recentEvaluations.map((ev) => {
                    const score = ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
                    const incidents = getEvaluationIncidentCounts(ev);
                    const incidentes = incidents.colisiones + incidents.fatalidades + incidents.vehiculoFueraVia;

                    return (
                      <tr key={ev.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{ev.conductor || ev.operador}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            ID: {ev.id.substring(0, 14)}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: '#38bdf8' }}>🏢 {ev.empresa}</strong>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || 'N/A'}
                        </td>
                        <td>
                          <span className="score-pill" style={{ color: score >= 6.0 ? '#22c55e' : '#ef4444' }}>
                            {score.toFixed(2)}
                            <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                          </span>
                        </td>
                        <td>
                          <span style={{ color: incidentes > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                            {incidentes}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${score >= 8.0 ? 'success' : score >= 6.0 ? 'info' : score >= 5.0 ? 'warning' : 'danger'}`}>
                            {ev.estado || (score >= 6.0 ? 'Aprobado' : 'No Aprobado')}
                          </span>
                        </td>
                        {onNavigate && (
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onNavigate('directorio')}
                              title="Ver en Directorio"
                            >
                              Detalle ➔
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
          Sincronizando información en tiempo real...
        </div>
      )}
    </div>
  );
};
