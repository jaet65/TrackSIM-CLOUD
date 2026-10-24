import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ReportDetailModal } from './ReportDetailModal';
import { CompanyOverviewCard } from './company/CompanyOverviewCard';
import { CompanyRankingChartCard } from './company/CompanyRankingChartCard';
import { CompanyDriversTable, CompanySortKey } from './company/CompanyDriversTable';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const DRIVERS_PAGE_SIZE = 30;
const RANKING_PAGE_SIZE = 10;

type SortKey = CompanySortKey;

interface CompanyTabProps {
  onNavigate?: (tab: 'dashboard' | 'evolucion' | 'empresas' | 'directorio' | 'ingesta' | 'usuarios') => void;
}

export const CompanyTab: React.FC<CompanyTabProps> = ({ onNavigate }) => {
  const { userRole } = useAuth();
  const { theme } = useTheme();
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

  // Paginación del Ranking (Top 10 por página ordenado estrictamente por score)
  const rankingList = useMemo(() => {
    if (!comp?.conductores) return [];
    let list = [...comp.conductores].sort((a, b) => b.promedioScore - a.promedioScore);
    const q = driverSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.nombre.toLowerCase().includes(q));
    }
    return list;
  }, [comp, driverSearch]);

  const totalRankingPages = Math.max(1, Math.ceil(rankingList.length / RANKING_PAGE_SIZE));
  const currentRankingPage = Math.min(Math.max(1, rankingPage), totalRankingPages);
  const pagedRanking = rankingList.slice((currentRankingPage - 1) * RANKING_PAGE_SIZE, currentRankingPage * RANKING_PAGE_SIZE);

  // Paginación de la Tabla de Operadores (30 por página)
  const totalDriversPages = Math.max(1, Math.ceil(filteredConductores.length / DRIVERS_PAGE_SIZE));
  const currentDriversPage = Math.min(Math.max(1, driversPage), totalDriversPages);
  const pagedDrivers = filteredConductores.slice((currentDriversPage - 1) * DRIVERS_PAGE_SIZE, currentDriversPage * DRIVERS_PAGE_SIZE);

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
          maxBarThickness: 75,
          barPercentage: 0.7,
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
          ctx.fillStyle = theme === 'light' ? '#172033' : '#ffffff';
          ctx.fillText(`${Number(val).toFixed(2)}`, x, y - 6);

          // 2. Dibujar el nombre del ejercicio verticalmente a lo largo de la columna
          if (rawLabel) {
            ctx.save();
            ctx.translate(x, base - 12);
            ctx.rotate(-Math.PI / 2); // 90 grados hacia arriba

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px sans-serif';

            if (barHeight > 55) {
              ctx.fillStyle = theme === 'light' ? '#172033' : 'rgba(255, 255, 255, 0.95)';
              ctx.shadowColor = theme === 'light' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
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
  }, [theme]);

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
        backgroundColor: theme === 'light' ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
        titleColor: theme === 'light' ? '#172033' : '#f8fafc',
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
        grid: { color: theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: theme === 'light' ? '#526179' : 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
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
    const globalRank = (currentRankingPage - 1) * RANKING_PAGE_SIZE + idx + 1;
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

          const globalRank = (currentRankingPage - 1) * RANKING_PAGE_SIZE + idx + 1;
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
          const globalRank = (currentRankingPage - 1) * RANKING_PAGE_SIZE + idx + 1;

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
        backgroundColor: theme === 'light' ? '#ffffff' : 'rgba(15, 23, 42, 0.92)',
        titleColor: theme === 'light' ? '#172033' : '#f8fafc',
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
        grid: { color: theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: theme === 'light' ? '#526179' : 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
      },
      y: {
        grid: { display: false },
        ticks: { color: theme === 'light' ? '#172033' : '#f8fafc', font: { size: 12, weight: 'bold' as const } }
      }
    }
  };

  // Cálculo de Tasa de Accidentes por Conductor (Anual e Histórica) para Pantalla y PDF
  const accidentRateAnnual = useMemo(() => {
    if (!filteredEvaluations || filteredEvaluations.length === 0) {
      return { labels: [], accidentRates: [], totalIncidentes: [], operatorsCount: [] };
    }

    const yearDataMap = new Map<string, { colisiones: number; fatalidades: number; fueraVia: number; operators: Set<string> }>();

    filteredEvaluations.forEach((e) => {
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      const year = match ? match[1] : (dateStr ? dateStr.substring(0, 4) : '');
      if (!year) return;

      const col = e.colisiones || e.totalColisiones || 0;
      const fat = e.fatalidades || 0;
      const off = e.vehiculoFueraVia || 0;
      const op = (e.conductor || e.operador || 'Sin Asignar').trim();

      const current = yearDataMap.get(year) || { colisiones: 0, fatalidades: 0, fueraVia: 0, operators: new Set<string>() };
      current.colisiones += col;
      current.fatalidades += fat;
      current.fueraVia += off;
      current.operators.add(op);
      yearDataMap.set(year, current);
    });

    const sortedYears = Array.from(yearDataMap.keys()).sort();
    const labels = sortedYears.map((yr) => `Año ${yr}`);
    const totalIncidentes = sortedYears.map((yr) => {
      const d = yearDataMap.get(yr)!;
      return d.colisiones + d.fatalidades + d.fueraVia;
    });
    const operatorsCount = sortedYears.map((yr) => yearDataMap.get(yr)!.operators.size);
    const accidentRates = sortedYears.map((_, i) => {
      const ops = operatorsCount[i];
      return ops > 0 ? Number((totalIncidentes[i] / ops).toFixed(2)) : 0;
    });

    return {
      labels,
      accidentRates,
      totalIncidentes,
      operatorsCount
    };
  }, [filteredEvaluations]);

  const accidentRateChartData = useMemo(() => {
    return {
      labels: accidentRateAnnual.labels,
      datasets: [
        {
          label: 'Tasa de Incidentes por Operador',
          data: accidentRateAnnual.accidentRates,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        }
      ]
    };
  }, [accidentRateAnnual]);

  const accidentRateChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: theme === 'light' ? '#172033' : '#f8fafc',
            font: { size: 12, weight: 'bold' as const }
          }
        },
        tooltip: {
          backgroundColor: theme === 'light' ? '#ffffff' : 'rgba(15, 23, 42, 0.95)',
          titleColor: theme === 'light' ? '#172033' : '#f8fafc',
          bodyColor: '#38bdf8',
          padding: 10,
          callbacks: {
            label: (ctx: any) => ` Tasa: ${ctx.raw} incidentes / operador`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          title: {
            display: true,
            text: 'Incidentes / Operador',
            color: '#38bdf8',
            font: { size: 11, weight: 'bold' as const }
          },
          grid: { color: theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: theme === 'light' ? '#526179' : 'rgba(255, 255, 255, 0.7)' }
        },
        x: {
          grid: { color: theme === 'light' ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: theme === 'light' ? '#172033' : '#f8fafc', font: { weight: 'bold' as const } }
        }
      }
    };
  }, [theme]);

  return (
    <div className="view-section active">
      {/* Selector de Empresa / Flota (Visible si es admin o si el usuario tiene más de 1 empresa) */}
      {(userRole === 'admin' || companies.length > 1) && (
        <div
          className="glass-card no-print metrics-filter-bar"
          style={{
            padding: '0.9rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
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
              style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-main)', colorScheme: theme, fontWeight: 600, fontSize: '0.9rem' }}
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
      <CompanyOverviewCard
        comp={comp}
        conductoresRecurrentes={conductoresRecurrentes}
        pctRecurrentes={pctRecurrentes}
      />

      {/* Rendimiento Promedio en Ejercicios (Solo ejercicios realizados por la empresa) */}
      {exerciseStats.length > 0 && (
        <div className="card print-avoid-break" style={{ marginBottom: '2rem' }}>
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
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Rendimiento Promedio en Ejercicios
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Evaluación de destrezas para los {exerciseStats.length} ejercicios realizados por la flota
                </span>
              </div>
            </div>
            <div className="badge badge-info no-print" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {exerciseStats.length} ejercicios registrados
            </div>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div className="chart-canvas-container" style={{ height: '320px', width: '100%', position: 'relative' }}>
              <Bar data={exerciseChartData} options={exerciseChartOptions} plugins={[exerciseLabelPlugin]} />
            </div>

            {/* Resumen tabular exclusivo para PDF / Impresión que garantiza que ninguna columna quede truncada */}
            <div className="print-only" style={{ display: 'none', marginTop: '1rem' }}>
              <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'center', width: '40px' }}>#</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Nombre del Ejercicio</th>
                    <th style={{ padding: '4px 8px', textAlign: 'center', width: '100px' }}>Evaluaciones</th>
                    <th style={{ padding: '4px 8px', textAlign: 'center', width: '110px' }}>Calificación Promedio</th>
                    <th style={{ padding: '4px 8px', textAlign: 'center', width: '120px' }}>Nivel de Destreza</th>
                  </tr>
                </thead>
                <tbody>
                  {exerciseStats.map((ex, idx) => {
                    const isTop = ex.promedio >= 8.0;
                    const isPass = ex.promedio >= 6.0;
                    const scoreColor = isTop ? '#15803d' : isPass ? '#0369a1' : '#b91c1c';
                    const levelLabel = isTop ? 'Sobresaliente' : isPass ? 'Aprobado' : 'Requiere Refuerzo';

                    return (
                      <tr key={ex.key} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '4px 6px', fontWeight: 700 }}>{ex.nombre}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{ex.totalEvaluaciones}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                          {ex.promedio.toFixed(2)} / 10 pts
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, fontSize: '8pt' }}>
                          {levelLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Ranking de Operadores (Colapsable con Paginación de 10 y Vista de Impresión Completa) */}
      <CompanyRankingChartCard
        chartData={chartData}
        chartOptions={chartOptions}
        rankingListLength={rankingList.length}
        pagedRankingLength={pagedRanking.length}
        currentRankingPage={currentRankingPage}
        totalRankingPages={totalRankingPages}
        pageSize={RANKING_PAGE_SIZE}
        onSetRankingPage={setRankingPage}
        fullRankingList={rankingList}
      />

      {/* Gráfico: Tasa de Accidentes por Conductor (Visible en Pantalla y en el PDF/Impresión) */}
      {accidentRateAnnual.labels.length > 0 && (
        <div className="card print-avoid-break" style={{ marginBottom: '2rem' }}>
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
              <span style={{ fontSize: '1.25rem' }}>🚨</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Tasa de Accidentes por Conductor
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Promedio de siniestros (colisiones, salidas de vía y fatalidades) por operador evaluado
                </span>
              </div>
            </div>
            <div className="badge badge-info" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {accidentRateAnnual.labels.length} {accidentRateAnnual.labels.length === 1 ? 'año registrado' : 'años registrados'}
            </div>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ height: '300px', width: '100%' }}>
              <Line data={accidentRateChartData} options={accidentRateChartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Roster de Operadores de la Flota (Paginación de 30) */}
      <CompanyDriversTable
        filteredConductores={filteredConductores}
        pagedDrivers={pagedDrivers}
        driverSearch={driverSearch}
        onSetDriverSearch={(val) => {
          setDriverSearch(val);
          setDriversPage(1);
        }}
        driversPage={currentDriversPage}
        totalDriversPages={totalDriversPages}
        pageSize={DRIVERS_PAGE_SIZE}
        onSetDriversPage={setDriversPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        expandedExercises={expandedExercises}
        onToggleExpandExercises={toggleExpandExercises}
        onViewReport={setViewReport}
        filteredEvaluations={filteredEvaluations}
        comp={comp}
        onSelectDriverName={setSelectedDriverName}
        onNavigate={onNavigate}
      />

      {/* Modal de Detalle de Reporte Unificado */}
      <ReportDetailModal
        evaluation={viewReport}
        onClose={() => setViewReport(null)}
      />
    </div>
  );
};
