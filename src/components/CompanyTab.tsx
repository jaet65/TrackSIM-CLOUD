import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { ReportDetailModal } from './ReportDetailModal';
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

interface CompanyTabProps {
  onNavigate?: (tab: 'dashboard' | 'evolucion' | 'empresas' | 'directorio' | 'ingesta' | 'usuarios') => void;
}

export const CompanyTab: React.FC<CompanyTabProps> = ({ onNavigate }) => {
  const { userRole } = useAuth();
  const {
    companies,
    selectedCompany,
    setSelectedCompany,
    selectedCompanySummary,
    setSelectedDriverName,
    filteredEvaluations
  } = useData();

  const [driverSearch, setDriverSearch] = useState('');
  const [rankingPage, setRankingPage] = useState(1);
  const [driversPage, setDriversPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('promedioScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewReport, setViewReport] = useState<any | null>(null);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());

  const toggleExpandExercises = (driverKey: string) => {
    setExpandedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(driverKey)) {
        next.delete(driverKey);
      } else {
        next.add(driverKey);
      }
      return next;
    });
  };

  const comp = selectedCompanySummary;

  // Cantidad y porcentaje de conductores que han participado más de 1 vez
  const { conductoresRecurrentes, pctRecurrentes } = useMemo(() => {
    if (!comp?.conductores || comp.conductores.length === 0) {
      return { conductoresRecurrentes: 0, pctRecurrentes: '0.0' };
    }
    const recurrentes = comp.conductores.filter((c) => (c.totalEvaluaciones || 0) > 1).length;
    const pct = ((recurrentes / comp.conductores.length) * 100).toFixed(1);
    return { conductoresRecurrentes: recurrentes, pctRecurrentes: pct };
  }, [comp]);

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

  // Cálculo de Rendimiento Promedio por Ejercicio (solo ejercicios realizados por la empresa)
  const exerciseStats = useMemo(() => {
    if (!comp?.conductores) return [];
    const map = new Map<string, { key: string; nombre: string; numero?: number; scores: number[] }>();

    comp.conductores.forEach((c) => {
      // 1. Extraer desde promediosEjercicios (historial acumulado de cada conductor)
      if (c.promediosEjercicios) {
        Object.entries(c.promediosEjercicios).forEach(([key, data]) => {
          if (!data || typeof data.promedio !== 'number' || isNaN(data.promedio)) return;
          if (!map.has(key)) {
            map.set(key, { key, nombre: data.nombre, numero: data.numero, scores: [] });
          }
          // Ponderar por las veces realizadas por el conductor
          const times = data.totalVeces || 1;
          for (let i = 0; i < times; i++) {
            map.get(key)!.scores.push(data.promedio);
          }
        });
      } else if (Array.isArray(c.ejercicios)) {
        // Fallback si no viniera promediosEjercicios
        c.ejercicios.forEach((ex) => {
          if (!ex) return;
          const rawName = (ex.nombre || (ex.numero ? `Ejercicio ${ex.numero}` : '')).trim();
          if (!rawName) return;
          const key = rawName.toLowerCase();
          const score = typeof ex.calificacion === 'number' ? ex.calificacion : parseFloat(String(ex.calificacion || ex.score || ''));
          if (!isNaN(score)) {
            if (!map.has(key)) {
              map.set(key, { key, nombre: rawName, numero: ex.numero, scores: [] });
            }
            map.get(key)!.scores.push(score);
          }
        });
      }
    });

    const result = Array.from(map.values())
      .map((item) => {
        const sum = item.scores.reduce((a, b) => a + b, 0);
        const avg = item.scores.length > 0 ? sum / item.scores.length : 0;
        return {
          key: item.key,
          nombre: item.nombre,
          numero: item.numero,
          promedio: parseFloat(avg.toFixed(2)),
          totalEvaluaciones: item.scores.length
        };
      })
      .filter((item) => item.totalEvaluaciones > 0);

    // Ordenar por número de ejercicio si existe, o por promedio desc
    result.sort((a, b) => {
      if (a.numero && b.numero) return a.numero - b.numero;
      if (a.numero) return -1;
      if (b.numero) return 1;
      return b.promedio - a.promedio;
    });

    return result;
  }, [comp]);

  // Configuración del gráfico de barras de Ejercicios
  const exerciseChartData = useMemo(() => {
    // Paleta variada moderna y vibrante para columnas diferenciadas
    const colorPalette = [
      { start: 'rgba(56, 189, 248, 0.25)', end: 'rgba(14, 165, 233, 0.95)', border: 'rgba(56, 189, 248, 0.95)' }, // Cyan / Sky
      { start: 'rgba(168, 85, 247, 0.25)', end: 'rgba(147, 51, 234, 0.95)', border: 'rgba(168, 85, 247, 0.95)' }, // Purple
      { start: 'rgba(16, 185, 129, 0.25)', end: 'rgba(5, 150, 105, 0.95)', border: 'rgba(52, 211, 153, 0.95)' }, // Emerald
      { start: 'rgba(251, 146, 60, 0.25)', end: 'rgba(234, 88, 12, 0.95)', border: 'rgba(251, 146, 60, 0.95)' }, // Orange
      { start: 'rgba(236, 72, 153, 0.25)', end: 'rgba(219, 39, 119, 0.95)', border: 'rgba(244, 114, 182, 0.95)' }, // Pink / Rose
      { start: 'rgba(250, 204, 21, 0.25)', end: 'rgba(202, 138, 4, 0.95)', border: 'rgba(250, 204, 21, 0.95)' }, // Amber / Yellow
      { start: 'rgba(45, 212, 191, 0.25)', end: 'rgba(13, 148, 136, 0.95)', border: 'rgba(45, 212, 191, 0.95)' }, // Teal
      { start: 'rgba(99, 102, 241, 0.25)', end: 'rgba(79, 70, 229, 0.95)', border: 'rgba(129, 140, 248, 0.95)' }, // Indigo
      { start: 'rgba(244, 63, 94, 0.25)', end: 'rgba(225, 29, 72, 0.95)', border: 'rgba(251, 113, 133, 0.95)' }, // Crimson / Coral
      { start: 'rgba(132, 204, 22, 0.25)', end: 'rgba(101, 163, 13, 0.95)', border: 'rgba(163, 230, 53, 0.95)' } // Lime
    ];

    return {
      labels: exerciseStats.map((e) => e.nombre),
      datasets: [
        {
          label: 'Calificación Promedio',
          data: exerciseStats.map((e) => e.promedio),
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(56, 189, 248, 0.7)';
            const idx = context.dataIndex;
            const palette = colorPalette[idx % colorPalette.length];

            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, palette.start);
            gradient.addColorStop(1, palette.end);
            return gradient;
          },
          borderColor: (context: any) => {
            const idx = context.dataIndex;
            const palette = colorPalette[idx % colorPalette.length];
            return palette.border;
          },
          borderWidth: 1.5,
          borderRadius: 8,
          barPercentage: 0.65,
          categoryPercentage: 0.8
        }
      ]
    };
  }, [exerciseStats]);

  // Plugin personalizado para dibujar el nombre del ejercicio a lo largo de cada columna y su calificación arriba
  const exerciseLabelPlugin = useMemo(() => {
    return {
      id: 'exerciseVerticalLabels',
      afterDatasetsDraw: (chart: any) => {
        const { ctx, data } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;

        ctx.save();
        meta.data.forEach((bar: any, index: number) => {
          const rawLabel = (data.labels[index] || '') as string;
          const val = data.datasets[0].data[index];
          if (!bar) return;

          const x = bar.x;
          const y = bar.y;
          const base = bar.base;
          const barHeight = Math.abs(base - y);

          // 1. Dibujar el puntaje numérico arriba de la barra
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${Number(val).toFixed(2)}`, x, y - 6);

          // 2. Dibujar el nombre del ejercicio verticalmente a lo largo de la columna
          if (rawLabel) {
            ctx.save();
            ctx.translate(x, base - 12);
            ctx.rotate(-Math.PI / 2); // 90 grados hacia arriba

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px sans-serif';

            // Si la barra es suficientemente alta, usar texto blanco con sombra sutil
            // Si la barra es pequeña, usar color cyan legible
            if (barHeight > 55) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
              ctx.shadowBlur = 4;
            } else {
              ctx.fillStyle = '#38bdf8';
            }

            // Truncar si el texto es muy largo
            let displayLabel = rawLabel;
            const maxTextLength = Math.max(30, Math.floor(barHeight - 20));
            if (ctx.measureText(displayLabel).width > maxTextLength) {
              while (displayLabel.length > 4 && ctx.measureText(displayLabel + '...').width > maxTextLength) {
                displayLabel = displayLabel.slice(0, -1);
              }
              displayLabel += '...';
            }

            ctx.fillText(displayLabel, 0, 0);
            ctx.restore();
          }
        });
        ctx.restore();
      }
    };
  }, []);

  const exerciseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 25
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#f8fafc',
        bodyColor: '#38bdf8',
        borderColor: 'rgba(56, 189, 248, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        titleFont: { size: 13, weight: 'bold' as const },
        bodyFont: { size: 12, weight: 'bold' as const },
        callbacks: {
          label: (ctx: any) => {
            const idx = ctx.dataIndex;
            const item = exerciseStats[idx];
            const estado = ctx.raw >= 8.0 ? '🌟 Excelente' : ctx.raw >= 6.0 ? '✅ Aprobado' : '⚠️ Requiere Refuerzo';
            return [
              ` Promedio: ${ctx.raw} / 10 pts (${estado})`,
              ` Evaluaciones registradas: ${item?.totalEvaluaciones || 0}`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 10,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: {
          display: false // Se ocultan del eje X para mostrarse a lo largo de la columna
        }
      }
    }
  };

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
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(56, 189, 248, 0.7)';

          const idx = context.dataIndex;
          const item = pagedRanking[idx];
          if (!item) return 'rgba(56, 189, 248, 0.7)';

          const globalRank = (currentRankingPage - 1) * PAGE_SIZE + idx + 1;
          const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);

          if (globalRank === 1) {
            // Oro / Champion Glow
            gradient.addColorStop(0, 'rgba(234, 179, 8, 0.35)');
            gradient.addColorStop(1, 'rgba(250, 204, 21, 0.95)');
          } else if (globalRank === 2) {
            // Plata
            gradient.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
            gradient.addColorStop(1, 'rgba(226, 232, 240, 0.95)');
          } else if (globalRank === 3) {
            // Bronce
            gradient.addColorStop(0, 'rgba(217, 119, 6, 0.35)');
            gradient.addColorStop(1, 'rgba(251, 146, 60, 0.95)');
          } else if (item.promedioScore >= 8.0) {
            // Emerald - Excelente / Sobresaliente
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
            gradient.addColorStop(0.7, 'rgba(16, 185, 129, 0.85)');
            gradient.addColorStop(1, 'rgba(52, 211, 153, 0.98)');
          } else if (item.promedioScore >= 6.0) {
            // Cyan / Sky - Bueno / Aprobado
            gradient.addColorStop(0, 'rgba(14, 165, 233, 0.25)');
            gradient.addColorStop(0.7, 'rgba(56, 189, 248, 0.85)');
            gradient.addColorStop(1, 'rgba(125, 211, 252, 0.98)');
          } else {
            // Coral / Rose - Requiere Refuerzo
            gradient.addColorStop(0, 'rgba(244, 63, 94, 0.25)');
            gradient.addColorStop(0.7, 'rgba(244, 63, 94, 0.85)');
            gradient.addColorStop(1, 'rgba(251, 113, 133, 0.98)');
          }
          return gradient;
        },
        borderColor: (context: any) => {
          const idx = context.dataIndex;
          const item = pagedRanking[idx];
          if (!item) return 'rgba(56, 189, 248, 0.8)';
          const globalRank = (currentRankingPage - 1) * PAGE_SIZE + idx + 1;

          if (globalRank === 1) return 'rgba(250, 204, 21, 1)';
          if (globalRank === 2) return 'rgba(226, 232, 240, 1)';
          if (globalRank === 3) return 'rgba(251, 146, 60, 1)';
          if (item.promedioScore >= 8.0) return 'rgba(52, 211, 153, 0.9)';
          if (item.promedioScore >= 6.0) return 'rgba(56, 189, 248, 0.9)';
          return 'rgba(251, 113, 133, 0.9)';
        },
        borderWidth: 1.5,
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.85
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
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#f8fafc',
        bodyColor: '#38bdf8',
        borderColor: 'rgba(56, 189, 248, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        titleFont: { size: 13, weight: 'bold' as const },
        bodyFont: { size: 12, weight: 'bold' as const },
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw;
            const estado = val >= 8.0 ? '🌟 Sobresaliente' : val >= 6.0 ? '✅ Aprobado' : '⚠️ Requiere Refuerzo';
            return ` Promedio: ${val} / 10 pts  (${estado})`;
          }
        }
      }
    },
    scales: {
      x: {
        min: 0,
        max: 10,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#f8fafc', font: { size: 12, weight: 'bold' as const } }
      }
    }
  };

  return (
    <div className="view-section active">
      {/* Selector de Empresa / Flota (Visible si es admin o si el usuario tiene más de 1 empresa) */}
      {(userRole === 'admin' || companies.length > 1) && (
        <div
          className="glass-card"
          style={{
            padding: '0.9rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.8))'
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>🏢</span>
          <div style={{ width: '100%', maxWidth: '380px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Seleccionar Flota / Empresa
            </label>
            <select
              className="filter-select"
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setRankingPage(1);
                setDriversPage(1);
              }}
              style={{ width: '100%', padding: '0.55rem 0.85rem', background: '#0e1422', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#38bdf8', fontWeight: 600, fontSize: '0.9rem' }}
            >
              {userRole === 'admin' && (
                <option value="all">🌐 Todas las Empresas (Consolidado)</option>
              )}
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Tarjeta Ejecutiva de 3 Niveles: Empresa -> Sedes -> Métricas (Operadores, Promedio, Aprobación) */}
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
        {/* Nivel 1: Empresa & Nivel 2: Sedes */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1.25rem' }}>
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
              {comp.esGlobal ? '🌐' : '🏢'}
            </div>
            <div>
              {/* Primer Nivel: Empresa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {comp.nombre}
                </h2>
                {comp.esGlobal && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
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
        </div>

        {/* Tercer Nivel: Número de Operadores, Conductores Recurrentes (> 1 vez), Promedio de Flota, Tasa de Aprobación */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
          {/* 3.1 Número de Operadores */}
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
              👥
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                Número de Operadores
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.1rem' }}>
                {comp.totalConductores} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({comp.totalEvaluaciones} reportes)</span>
              </div>
            </div>
          </div>

          {/* 3.2 Conductores Recurrentes (> 1 vez) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                color: '#a855f7',
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
                Participación &gt; 1 Vez
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c084fc', marginTop: '0.1rem' }}>
                {conductoresRecurrentes} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({pctRecurrentes}% de flota)</span>
              </div>
            </div>
          </div>

          {/* 3.3 Promedio de Flota */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                color: comp.promedioFinal >= 8.0 ? '#22c55e' : comp.promedioFinal >= 6.0 ? '#38bdf8' : '#ef4444',
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
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.promedioFinal >= 8.0 ? '#22c55e' : comp.promedioFinal >= 6.0 ? '#38bdf8' : '#ef4444', marginTop: '0.1rem' }}>
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
                color: comp.tasaAprobacion >= 80 ? '#22c55e' : comp.tasaAprobacion >= 60 ? '#fbbf24' : '#ef4444',
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
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: comp.tasaAprobacion >= 80 ? '#22c55e' : comp.tasaAprobacion >= 60 ? '#fbbf24' : '#ef4444', marginTop: '0.1rem' }}>
                {comp.tasaAprobacion.toFixed(1)}% <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>(calif. ≥ 6.0)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rendimiento Promedio en Ejercicios (Solo ejercicios realizados por la empresa) */}
      {exerciseStats.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📊</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                  Rendimiento Promedio en Ejercicios
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Evaluación de destrezas para los {exerciseStats.length} ejercicios realizados por la flota
                </span>
              </div>
            </div>
            <div className="badge badge-info" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {exerciseStats.length} ejercicios registrados
            </div>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ height: '380px', width: '100%' }}>
              <Bar data={exerciseChartData} options={exerciseChartOptions} plugins={[exerciseLabelPlugin]} />
            </div>
          </div>
        </div>
      )}

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
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Header & Barra de Búsqueda */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 41, 59, 0.6))',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>👨‍✈️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Operadores Pertenecientes a esta Flota
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {filteredConductores.length} operadores registrados {driverSearch && `(filtrados por "${driverSearch}")`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: '340px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Buscar operador por nombre..."
                value={driverSearch}
                onChange={(e) => {
                  setDriverSearch(e.target.value);
                  setDriversPage(1);
                  setRankingPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.9rem 0.55rem 2.25rem',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                }}
              />
              {driverSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setDriverSearch('');
                    setDriversPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '0.2rem'
                  }}
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabla Estilizada */}
        <div className="table-responsive">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.95)' }}>
                <th onClick={() => handleSort('nombre')} style={{ cursor: 'pointer', padding: '1rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Operador {sortKey === 'nombre' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('totalEvaluaciones')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Sesiones {sortKey === 'totalEvaluaciones' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('ultimaFecha')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Última Fecha {sortKey === 'ultimaFecha' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('promedioScore')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Score Promedio {sortKey === 'promedioScore' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Ejercicios Realizados
                </th>
                <th onClick={() => handleSort('incidentes')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Incidentes {sortKey === 'incidentes' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('estado')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Estado {sortKey === 'estado' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'right' }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedDrivers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                      No se encontraron operadores
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      Intenta con otro término de búsqueda o limpia el filtro actual.
                    </div>
                  </td>
                </tr>
              ) : (
                pagedDrivers.map((c, idx) => {
                  const globalIdx = (currentDriversPage - 1) * PAGE_SIZE + idx + 1;
                  const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                  // Color scheme del score promedio
                  const isTopScore = c.promedioScore >= 8.0;
                  const isPassScore = c.promedioScore >= 6.0;
                  const scoreColor = isTopScore ? '#22c55e' : isPassScore ? '#38bdf8' : '#ef4444';
                  const scoreBg = isTopScore ? 'rgba(34, 197, 94, 0.12)' : isPassScore ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)';

                  // Avatar monogram
                  const initials = c.nombre
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0].toUpperCase())
                    .join('');

                  // Buscar la evaluación más reciente o por id para abrir reporte
                  const handleOpenReport = () => {
                    const found = filteredEvaluations.find(
                      (e) => e.id === c.latestEvalId || (e.conductor || e.operador) === c.nombre
                    );
                    if (found) {
                      setViewReport(found);
                    } else {
                      // Fallback sintético con datos del conductor
                      setViewReport({
                        id: c.latestEvalId || 'N/A',
                        conductor: c.nombre,
                        empresa: c.empresa || comp.nombre,
                        sede: c.sede,
                        fechaCapacitacionFormato: c.ultimaFecha,
                        evaluacionFinalPuntos: c.ultimoScore,
                        colisiones: c.colisiones || 0,
                        fatalidades: c.fatalidades || 0,
                        vehiculoFueraVia: c.totalFueraVia || 0,
                        ejercicios: c.ejercicios || []
                      });
                    }
                  };

                  const handleGoToEvolution = () => {
                    setSelectedDriverName(c.nombre);
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                    const main = document.querySelector('.main-content');
                    if (main) main.scrollTop = 0;
                    if (onNavigate) {
                      onNavigate('evolucion');
                    }
                  };

                  return (
                    <tr
                      key={c.nombre + idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        transition: 'background 0.15s ease'
                      }}
                      className="driver-row"
                    >
                      {/* Operador con Avatar & Sede */}
                      <td style={{ padding: '0.95rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              minWidth: '38px',
                              borderRadius: '10px',
                              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.1))',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)'
                            }}
                          >
                            {initials || `#${globalIdx}`}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.92rem' }}>
                              {c.nombre}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                              {comp.esGlobal && c.empresa && (
                                <span style={{ color: '#38bdf8', fontWeight: 600 }}>🏢 {c.empresa} •</span>
                              )}
                              <span>📍 {c.sede || 'Sede Principal'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sesiones / Evaluaciones */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: c.totalEvaluaciones > 1 ? 'rgba(168, 85, 247, 0.14)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${c.totalEvaluaciones > 1 ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                            color: c.totalEvaluaciones > 1 ? '#c084fc' : '#cbd5e1',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.85rem'
                          }}
                        >
                          {c.totalEvaluaciones > 1 && <span>🔁</span>}
                          {c.totalEvaluaciones} {c.totalEvaluaciones === 1 ? 'sesión' : 'sesiones'}
                        </span>
                      </td>

                      {/* Última Fecha */}
                      <td style={{ padding: '0.95rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>📅</span>
                          <span>{c.ultimaFecha}</span>
                        </span>
                      </td>

                      {/* Score Promedio con barra de progreso */}
                      <td style={{ padding: '0.95rem 1rem', minWidth: '150px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.25rem' }}>
                          <span style={{ color: scoreColor, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                            {c.promedioScore.toFixed(2)}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/ 10 pts</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            Últ: {c.ultimoScore.toFixed(2)}
                          </span>
                        </div>
                        {/* Mini barra de progreso */}
                        <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, c.promedioScore * 10))}%`,
                              height: '100%',
                              background: scoreColor,
                              borderRadius: '9999px'
                            }}
                          />
                        </div>
                      </td>

                      {/* Ejercicios Realizados */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        {(() => {
                          const driverIdKey = `${c.nombre}_${c.latestEvalId || idx}`;
                          const isExpanded = expandedExercises.has(driverIdKey);
                          const totalEx = c.ejercicios?.length || 0;
                          const visibleCount = isExpanded ? totalEx : 3;
                          const hasExcess = totalEx > 3;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', maxWidth: '260px' }}>
                              {totalEx > 0 ? (
                                c.ejercicios!.slice(0, visibleCount).map((e, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      fontSize: '0.76rem',
                                      color: '#cbd5e1',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem'
                                    }}
                                    title={e.nombre}
                                  >
                                    <span style={{ color: '#38bdf8', fontSize: '0.6rem' }}>●</span>
                                    <span>{e.nombre}</span>
                                  </div>
                                ))
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Simulaciones de rutina</span>
                              )}

                              {hasExcess && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandExercises(driverIdKey)}
                                  style={{
                                    fontSize: '0.72rem',
                                    color: isExpanded ? '#94a3b8' : '#38bdf8',
                                    fontWeight: 700,
                                    background: isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(56, 189, 248, 0.1)',
                                    border: `1px solid ${isExpanded ? 'rgba(255, 255, 255, 0.1)' : 'rgba(56, 189, 248, 0.25)'}`,
                                    borderRadius: '6px',
                                    padding: '0.15rem 0.5rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    width: 'fit-content',
                                    marginTop: '0.15rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={isExpanded ? 'Colapsar lista' : 'Expandir todos los ejercicios'}
                                >
                                  <span>{isExpanded ? '▲ Mostrar menos' : `+${totalEx - 3} ejercicio(s) más`}</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Incidentes */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '8px',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            background: totalIncidentes > 0 ? 'rgba(239, 68, 68, 0.14)' : 'rgba(34, 197, 94, 0.12)',
                            color: totalIncidentes > 0 ? '#f87171' : '#4ade80',
                            border: `1px solid ${totalIncidentes > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                          }}
                          title={`Colisiones: ${c.colisiones || 0} | Fuera de vía: ${c.totalFueraVia || 0} | Fatalidades: ${c.fatalidades || 0}`}
                        >
                          <span>{totalIncidentes > 0 ? '⚠️' : '🛡️'}</span>
                          <span>{totalIncidentes}</span>
                        </span>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.3rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            background: scoreBg,
                            color: scoreColor,
                            border: `1px solid ${scoreColor}40`
                          }}
                        >
                          {c.estado}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', verticalAlign: 'middle', width: '130px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'stretch', justifyContent: 'center' }}>
                          {/* Botón Ver Reporte */}
                          <button
                            type="button"
                            onClick={handleOpenReport}
                            className="btn btn-secondary btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem',
                              padding: '0.32rem 0.6rem',
                              borderRadius: '7px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: 'rgba(56, 189, 248, 0.1)',
                              borderColor: 'rgba(56, 189, 248, 0.3)',
                              color: '#38bdf8',
                              width: '100%'
                            }}
                            title="Ver reporte detallado de evaluación"
                          >
                            <span>📄</span>
                            <span>Reporte</span>
                          </button>

                          {/* Botón Ver Evolución (Solo si tiene > 1 sesión) */}
                          {c.totalEvaluaciones > 1 && (
                            <button
                              type="button"
                              onClick={handleGoToEvolution}
                              className="btn btn-sm"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.35rem',
                                padding: '0.32rem 0.6rem',
                                borderRadius: '7px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.25))',
                                border: '1px solid rgba(168, 85, 247, 0.45)',
                                color: '#c084fc',
                                cursor: 'pointer',
                                width: '100%'
                              }}
                              title="Ver histórico y evolución de conductor individual"
                            >
                              <span>📈</span>
                              <span>Evolución</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de paginación de la tabla */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(15, 23, 42, 0.85)',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Mostrando operadores <strong style={{ color: '#f8fafc' }}>{(currentDriversPage - 1) * PAGE_SIZE + 1}</strong> a <strong style={{ color: '#f8fafc' }}>{Math.min(currentDriversPage * PAGE_SIZE, filteredConductores.length)}</strong> de <strong style={{ color: '#38bdf8' }}>{filteredConductores.length}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage(1)}
              disabled={currentDriversPage === 1}
              style={{ borderRadius: '6px', padding: '0.35rem 0.65rem' }}
              title="Primera página"
            >
              ««
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage((p) => p - 1)}
              disabled={currentDriversPage === 1}
              style={{ borderRadius: '6px', padding: '0.35rem 0.75rem' }}
            >
              « Ant
            </button>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', padding: '0 0.6rem' }}>
              Pág. {currentDriversPage} / {totalDriversPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage((p) => p + 1)}
              disabled={currentDriversPage === totalDriversPages}
              style={{ borderRadius: '6px', padding: '0.35rem 0.75rem' }}
            >
              Sig »
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDriversPage(totalDriversPages)}
              disabled={currentDriversPage === totalDriversPages}
              style={{ borderRadius: '6px', padding: '0.35rem 0.65rem' }}
              title="Última página"
            >
              »»
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Detalle de Reporte Unificado */}
      <ReportDetailModal
        evaluation={viewReport}
        onClose={() => setViewReport(null)}
      />
    </div>
  );
};
