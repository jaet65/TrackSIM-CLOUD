import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Evaluation } from '../types';
import { Line, Radar, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  BarElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const EvolutionTab: React.FC = () => {
  const { driverSummaries, companiesSummaries, filteredEvaluations } = useData();

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
    return companiesSummaries.find((c) => c.nombre.trim().toLowerCase() === selectedCompanyName.trim().toLowerCase()) || companiesSummaries[0];
  }, [companiesSummaries, selectedCompanyName]);

  // Evaluaciones exclusivas de la empresa seleccionada
  const companyEvaluations = useMemo(() => {
    if (!currentCompany) return [];
    const targetName = currentCompany.nombre.trim().toLowerCase();
    return filteredEvaluations.filter((e) => {
      if (currentCompany.esGlobal) return true;
      return (e.empresa || '').trim().toLowerCase() === targetName;
    });
  }, [currentCompany, filteredEvaluations]);

  // Años evaluados para la empresa seleccionada
  const companyYearsStats = useMemo(() => {
    if (!currentCompany) return '1 año (En curso)';
    const yearsSet = new Set<string>();
    companyEvaluations.forEach((e) => {
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      if (match) {
        yearsSet.add(match[1]);
      }
    });
    const sorted = Array.from(yearsSet).sort();
    if (sorted.length === 0) return '1 año (En curso)';
    if (sorted.length === 1) return `1 año (${sorted[0]})`;
    return `${sorted.length} años (${sorted[0]} - ${sorted[sorted.length - 1]})`;
  }, [currentCompany, companyEvaluations]);

  // Datos para Curva de Evolución Anual y Siniestralidad de la Flota
  const companyAnnualEvolution = useMemo(() => {
    if (!currentCompany) {
      return {
        labels: [] as string[],
        averages: [] as number[],
        trendDirection: 'estable' as 'mejora' | 'descenso' | 'estable',
        percentChange: 0,
        difference: 0,
        totalEvalsByYear: [] as number[],
        colisionesByYear: [] as number[],
        fueraViaByYear: [] as number[],
        fatalidadesByYear: [] as number[],
        totalIncidentesByYear: [] as number[],
        accidentTrendDirection: 'estable' as 'mejora' | 'deterioro' | 'estable',
        accidentPercentChange: 0,
        accidentDifference: 0,
        accidentTrendLine: [] as number[]
      };
    }

    const yearDataMap = new Map<
      string,
      { totalScore: number; count: number; colisiones: number; fatalidades: number; fueraVia: number }
    >();

    companyEvaluations.forEach((e) => {
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      const year = match ? match[1] : (dateStr ? dateStr.substring(0, 4) : '');
      if (!year) return;
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      const col = e.colisiones || e.totalColisiones || 0;
      const fat = e.fatalidades || 0;
      const off = e.vehiculoFueraVia || 0;

      const current = yearDataMap.get(year) || { totalScore: 0, count: 0, colisiones: 0, fatalidades: 0, fueraVia: 0 };
      current.totalScore += score;
      current.count += 1;
      current.colisiones += col;
      current.fatalidades += fat;
      current.fueraVia += off;
      yearDataMap.set(year, current);
    });

    const sortedYears = Array.from(yearDataMap.keys()).sort();
    const labels = sortedYears;
    const averages = labels.map((yr) => {
      const data = yearDataMap.get(yr);
      if (!data || data.count === 0) return currentCompany.promedioFinal;
      return Number((data.totalScore / data.count).toFixed(2));
    });
    const totalEvalsByYear = labels.map((yr) => yearDataMap.get(yr)?.count || 0);
    const colisionesByYear = labels.map((yr) => yearDataMap.get(yr)?.colisiones || 0);
    const fatalidadesByYear = labels.map((yr) => yearDataMap.get(yr)?.fatalidades || 0);
    const fueraViaByYear = labels.map((yr) => yearDataMap.get(yr)?.fueraVia || 0);
    const totalIncidentesByYear = labels.map((_, i) => colisionesByYear[i] + fatalidadesByYear[i] + fueraViaByYear[i]);

    // Calcular Dirección de Tendencia y Cambio en Calificación
    const n = averages.length;
    let trendDirection: 'mejora' | 'descenso' | 'estable' = 'estable';
    let percentChange = 0;
    let difference = 0;

    if (n >= 2) {
      const initialScore = averages[0];
      const finalScore = averages[n - 1];
      difference = Number((finalScore - initialScore).toFixed(2));
      percentChange = initialScore > 0 ? Number(((difference / initialScore) * 100).toFixed(1)) : 0;

      if (difference > 0.1) {
        trendDirection = 'mejora';
      } else if (difference < -0.1) {
        trendDirection = 'descenso';
      } else {
        trendDirection = 'estable';
      }
    }

    // Calcular Tendencia de Siniestralidad (basada en el Total de Siniestros)
    let accidentTrendDirection: 'mejora' | 'deterioro' | 'estable' = 'estable';
    let accidentPercentChange = 0;
    let accidentDifference = 0;
    const accidentTrendLine: number[] = [];

    if (n >= 2) {
      const initialAccidents = totalIncidentesByYear[0];
      const finalAccidents = totalIncidentesByYear[n - 1];
      accidentDifference = finalAccidents - initialAccidents;
      accidentPercentChange = initialAccidents > 0
        ? Number(((accidentDifference / initialAccidents) * 100).toFixed(1))
        : (finalAccidents > 0 ? 100 : 0);

      // Regresión lineal simple para la línea de tendencia de siniestros
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += totalIncidentesByYear[i];
        sumXY += i * totalIncidentesByYear[i];
        sumXX += i * i;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
      const intercept = (sumY - slope * sumX) / n;
      for (let i = 0; i < n; i++) {
        accidentTrendLine.push(Number(Math.max(0, slope * i + intercept).toFixed(2)));
      }

      if (accidentDifference < 0) {
        accidentTrendDirection = 'mejora';
      } else if (accidentDifference > 0) {
        accidentTrendDirection = 'deterioro';
      } else {
        accidentTrendDirection = 'estable';
      }
    }

    return {
      labels,
      averages,
      trendDirection,
      percentChange,
      difference,
      totalEvalsByYear,
      colisionesByYear,
      fatalidadesByYear,
      fueraViaByYear,
      totalIncidentesByYear,
      accidentTrendDirection,
      accidentPercentChange,
      accidentDifference,
      accidentTrendLine
    };
  }, [currentCompany, companyEvaluations]);

  // Datos para Gráfico de Siniestralidad Anual de la Flota (Múltiples curvas: Colisiones, Fuera de Vía, Fatalidades)
  const fleetAccidentsChartData = {
    labels: companyAnnualEvolution.labels.map((y) => `Año ${y}`),
    datasets: [
      {
        label: 'Total Siniestros (Suma)',
        data: companyAnnualEvolution.totalIncidentesByYear,
        borderColor: '#f43f5e',
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
        data: companyAnnualEvolution.colisionesByYear,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#0e1422',
        pointRadius: 5
      },
      {
        label: '🛑 Vehículos Fuera de la Vía',
        data: companyAnnualEvolution.fueraViaByYear,
        borderColor: '#06b6d4',
        backgroundColor: 'transparent',
        borderDash: [3, 3],
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#0e1422',
        pointRadius: 5
      },
      {
        label: '💀 Fatalidades',
        data: companyAnnualEvolution.fatalidadesByYear,
        borderColor: '#a855f7',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#0e1422',
        pointRadius: 5
      },
      ...((companyAnnualEvolution.accidentTrendLine?.length || 0) > 0
        ? [
          {
            label: '📈 Línea de Tendencia (Siniestros)',
            data: companyAnnualEvolution.accidentTrendLine || [],
            borderColor: '#94a3b8',
            backgroundColor: 'transparent',
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0
          }
        ]
        : [])
    ]
  };

  // Indicadores de Tendencia de Siniestralidad
  const isAccidentTrendPositive = companyAnnualEvolution.accidentTrendDirection === 'mejora'; // menos siniestros
  const isAccidentTrendNegative = companyAnnualEvolution.accidentTrendDirection === 'deterioro'; // más siniestros

  // Datos para Gráfico de Líneas de Evolución Anual de Flota
  const isTrendPositive = companyAnnualEvolution.trendDirection === 'mejora';
  const isTrendNegative = companyAnnualEvolution.trendDirection === 'descenso';
  const mainLineColor = isTrendPositive ? '#22c55e' : isTrendNegative ? '#ef4444' : '#38bdf8';
  const mainBgColor = isTrendPositive ? 'rgba(34, 197, 94, 0.15)' : isTrendNegative ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)';

  const fleetAnnualChartData = {
    labels: companyAnnualEvolution.labels.map((y) => `Año ${y}`),
    datasets: [
      {
        label: 'Promedio Calificación Final (0 - 10)',
        data: companyAnnualEvolution.averages,
        borderColor: mainLineColor,
        backgroundColor: mainBgColor,
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: mainLineColor,
        pointBorderColor: '#ffffff',
        pointRadius: 6,
        pointHoverRadius: 8
      }
    ]
  };

  // Desglose Anual Consolidado (Métricas Globales por Año)
  const consolidatedAnnualRows = useMemo(() => {
    if (!currentCompany) return [];
    const map = new Map<string, {
      evalCount: number;
      operatorsSet: Set<string>;
      totalScore: number;
      approvedCount: number;
      collisions: number;
      offRoad: number;
      fatalities: number;
    }>();

    companyEvaluations.forEach((e) => {
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      const yr = match ? match[1] : (dateStr ? dateStr.substring(0, 4) : '');
      if (!yr) return;

      if (!map.has(yr)) {
        map.set(yr, {
          evalCount: 0,
          operatorsSet: new Set(),
          totalScore: 0,
          approvedCount: 0,
          collisions: 0,
          offRoad: 0,
          fatalities: 0
        });
      }
      const data = map.get(yr)!;
      data.evalCount += 1;
      const op = (e.conductor || e.operador || 'Sin Asignar').trim();
      data.operatorsSet.add(op);
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      data.totalScore += score;
      if (score >= 6.0) data.approvedCount += 1;
      data.collisions += (e.colisiones || e.totalColisiones || 0);
      data.offRoad += (e.vehiculoFueraVia || 0);
      data.fatalities += (e.fatalidades || 0);
    });

    const sortedYears = Array.from(map.keys()).sort();
    return sortedYears.map((yr, idx) => {
      const d = map.get(yr)!;
      const operatorCount = d.operatorsSet.size;
      const avgScore = d.evalCount > 0 ? Number((d.totalScore / d.evalCount).toFixed(2)) : 0;
      const passRate = d.evalCount > 0 ? Number(((d.approvedCount / d.evalCount) * 100).toFixed(1)) : 0;
      const totalIncidents = d.collisions + d.offRoad + d.fatalities;
      const accidentRate = operatorCount > 0 ? Number((totalIncidents / operatorCount).toFixed(2)) : 0;

      let scoreTrend: { type: 'mejora' | 'descenso' | 'estable'; diff: number; percent: number } | null = null;
      let accidentTrend: { type: 'mejora' | 'descenso' | 'estable'; diff: number; percent: number } | null = null;

      if (idx > 0) {
        const prevYr = sortedYears[idx - 1];
        const prevD = map.get(prevYr)!;
        const prevAvg = prevD.evalCount > 0 ? prevD.totalScore / prevD.evalCount : 0;
        const prevOpCount = prevD.operatorsSet.size;
        const prevTotalIncidents = prevD.collisions + prevD.offRoad + prevD.fatalities;
        const prevAccidentRate = prevOpCount > 0 ? prevTotalIncidents / prevOpCount : 0;

        // Comparativo Calificación Promedio (Más puntaje = mejora)
        const sDiff = Number((avgScore - prevAvg).toFixed(2));
        const sPct = prevAvg > 0 ? Number(((sDiff / prevAvg) * 100).toFixed(1)) : 0;
        const sType = sDiff > 0.05 ? 'mejora' : sDiff < -0.05 ? 'descenso' : 'estable';
        scoreTrend = { type: sType, diff: sDiff, percent: sPct };

        // Comparativo Tasa de Accidentes (Menos accidentes = mejora)
        const aDiff = Number((accidentRate - prevAccidentRate).toFixed(2));
        const aPct = prevAccidentRate > 0 ? Number(((aDiff / prevAccidentRate) * 100).toFixed(1)) : 0;
        const aType = aDiff < -0.05 ? 'mejora' : aDiff > 0.05 ? 'descenso' : 'estable';
        accidentTrend = { type: aType, diff: aDiff, percent: aPct };
      }

      return {
        year: yr,
        evalCount: d.evalCount,
        operatorCount,
        avgScore,
        passRate,
        collisions: d.collisions,
        offRoad: d.offRoad,
        fatalities: d.fatalities,
        totalIncidents,
        accidentRate,
        scoreTrend,
        accidentTrend
      };
    });
  }, [currentCompany, companyEvaluations]);

  // Evolución de Rendimiento por Ejercicio agrupando por años
  const companyExerciseEvolution = useMemo(() => {
    if (!currentCompany) return { years: [], exercises: [], datasets: [] };

    const years = companyAnnualEvolution.labels; // Años evaluados reales para esta empresa

    // Mapeo: year -> exerciseName -> { totalScore: number, count: number }
    const matrix = new Map<string, Map<string, { totalScore: number; count: number }>>();
    const allExercisesSet = new Set<string>();

    years.forEach((yr) => matrix.set(yr, new Map()));

    companyEvaluations.forEach((e) => {
      const dateStr = e.fechaCapacitacion || e.fechaReporte || e.fecha || '';
      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
      const year = match ? match[1] : (dateStr ? dateStr.substring(0, 4) : '');
      if (!year || !matrix.has(year)) return;

      const yearMap = matrix.get(year)!;

      // Extraer ejercicios sin duplicar:
      // Si la evaluación ya contiene e.ejercicios estructurados, se toman como fuente oficial.
      if (Array.isArray(e.ejercicios) && e.ejercicios.length > 0) {
        e.ejercicios.forEach((ex, idx) => {
          const rawName = (
            ex.nombre ||
            (ex.numero && e.nombresSimulaciones && e.nombresSimulaciones[ex.numero]) ||
            (ex.numero ? `Simulación ${ex.numero}` : `Módulo ${idx + 1}`)
          ).trim();
          if (!rawName) return;

          const score = typeof ex.calificacion === 'number'
            ? ex.calificacion
            : typeof ex.score === 'number'
              ? ex.score
              : parseFloat(String(ex.calificacion || ex.score || ''));

          if (!isNaN(score) && score >= 0) {
            allExercisesSet.add(rawName);
            const cur = yearMap.get(rawName) || { totalScore: 0, count: 0 };
            cur.totalScore += score;
            cur.count += 1;
            yearMap.set(rawName, cur);
          }
        });
      } else if (e.simulacionesDetalle) {
        // Solo como fallback si la evaluación NO tiene e.ejercicios
        Object.entries(e.simulacionesDetalle).forEach(([key, val]) => {
          if (typeof val === 'number' && !isNaN(val)) {
            // Extraer el número de simulación si la clave es p. ej. "simulacion_2"
            const numMatch = key.match(/\d+/);
            const num = numMatch ? numMatch[0] : null;
            const simName = (num && e.nombresSimulaciones && e.nombresSimulaciones[num])
              || (e.nombresSimulaciones && e.nombresSimulaciones[key])
              || key.replace(/_/g, ' ').toUpperCase();

            allExercisesSet.add(simName);
            const cur = yearMap.get(simName) || { totalScore: 0, count: 0 };
            cur.totalScore += val;
            cur.count += 1;
            yearMap.set(simName, cur);
          }
        });
      }
    });

    // Lista de años evaluados
    const evaluatedYears = Array.from(matrix.keys()).filter((yr) => {
      const map = matrix.get(yr);
      return map && map.size > 0;
    }).sort();

    // Paleta visual distintiva y profesional
    const palette = [
      { bg: 'rgba(56, 189, 248, 0.85)', border: '#38bdf8' },  // Cian
      { bg: 'rgba(168, 85, 247, 0.85)', border: '#a855f7' },  // Púrpura
      { bg: 'rgba(34, 197, 94, 0.85)', border: '#22c55e' },   // Verde
      { bg: 'rgba(245, 158, 11, 0.85)', border: '#f59e0b' },  // Ámbar
      { bg: 'rgba(244, 63, 94, 0.85)', border: '#f43f5e' },   // Rosa coral
      { bg: 'rgba(99, 102, 241, 0.85)', border: '#6366f1' },  // Índigo
      { bg: 'rgba(20, 184, 166, 0.85)', border: '#14b8a6' },  // Teal
      { bg: 'rgba(234, 179, 8, 0.85)', border: '#eab308' }    // Amarillo
    ];

    // Asignar un color consistente por nombre de ejercicio
    const allExercisesList = Array.from(allExercisesSet).sort();
    const colorMap = new Map<string, { bg: string; border: string }>();
    allExercisesList.forEach((exName, idx) => {
      colorMap.set(exName, palette[idx % palette.length]);
    });

    // Construir elementos ordenados por año con separación entre grupos de años
    // Para no dejar amontonados los grupos de años, insertamos un espaciador entre años consecutivos.
    type BarItem = {
      year: string;
      exerciseName: string;
      score: number | null;
      bg: string;
      border: string;
      isSpacer?: boolean;
    };

    const items: BarItem[] = [];
    const yearRanges = new Map<string, { start: number; count: number }>();

    evaluatedYears.forEach((yr, yrIdx) => {
      // Espaciador entre grupos de años (a partir del segundo año)
      if (yrIdx > 0) {
        items.push({
          year: '',
          exerciseName: '',
          score: null,
          bg: 'transparent',
          border: 'transparent',
          isSpacer: true
        });
      }

      const startIndex = items.length;
      const yearMap = matrix.get(yr)!;
      const sortedYearExercises = Array.from(yearMap.keys()).sort();

      sortedYearExercises.forEach((exName) => {
        const stats = yearMap.get(exName)!;
        const avg = Number((stats.totalScore / stats.count).toFixed(2));
        const color = colorMap.get(exName) || palette[0];
        items.push({
          year: yr,
          exerciseName: exName,
          score: avg,
          bg: color.bg,
          border: color.border
        });
      });

      yearRanges.set(yr, { start: startIndex, count: sortedYearExercises.length });
    });

    // Centrar la etiqueta del año exactamente al centro del grupo de barras de ese año
    const labels = items.map((it, idx) => {
      if (it.isSpacer || !it.year) return '';
      const range = yearRanges.get(it.year);
      if (!range) return '';
      // Índice central del grupo de ese año
      const centerIndex = range.start + Math.floor(range.count / 2);
      if (idx === centerIndex) {
        return `Año ${it.year}`;
      }
      return '';
    });

    const data = items.map((it) => it.score);
    const bgColors = items.map((it) => it.bg);
    const borderColors = items.map((it) => it.border);

    const singleDataset = {
      label: 'Módulo Evaluado',
      data,
      backgroundColor: bgColors,
      borderColor: borderColors,
      borderWidth: 1,
      borderRadius: 6,
      barPercentage: 0.88,
      categoryPercentage: 0.94,
      itemsMetadata: items
    };

    // Calcular Tendencia Apreciable en el rendimiento por ejercicios a lo largo de los años
    let trendDirection: 'mejora' | 'descenso' | 'estable' = 'estable';
    let percentChange = 0;
    let difference = 0;

    if (evaluatedYears.length >= 2) {
      const yearAvgs = evaluatedYears.map((yr) => {
        const yearMap = matrix.get(yr)!;
        let sum = 0;
        let cnt = 0;
        yearMap.forEach((v) => {
          sum += v.totalScore;
          cnt += v.count;
        });
        return cnt > 0 ? sum / cnt : 0;
      });

      const firstAvg = yearAvgs[0];
      const lastAvg = yearAvgs[yearAvgs.length - 1];
      difference = Number((lastAvg - firstAvg).toFixed(2));
      percentChange = firstAvg > 0 ? Number(((difference / firstAvg) * 100).toFixed(1)) : 0;

      if (difference > 0.1) {
        trendDirection = 'mejora';
      } else if (difference < -0.1) {
        trendDirection = 'descenso';
      } else {
        trendDirection = 'estable';
      }
    }

    return {
      years: evaluatedYears,
      exercises: allExercisesList,
      datasets: items.length > 0 ? [singleDataset] : [],
      items,
      labels,
      trendDirection,
      percentChange,
      difference
    };
  }, [currentCompany, companyAnnualEvolution, companyEvaluations]);

  // Plugin personalizado de ChartJS para pintar el título del ejercicio y la calificación dentro de la barra
  const barTextPlugin = useMemo(() => {
    return {
      id: 'barTextPlugin',
      afterDatasetsDraw: (chart: any) => {
        const { ctx } = chart;
        const currentItems = companyExerciseEvolution.items || [];

        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;

          meta.data.forEach((element: any, index: number) => {
            const val = dataset.data[index];
            if (val === null || val === undefined || isNaN(val)) return;

            const item = currentItems[index] || dataset.itemsMetadata?.[index];
            if (item?.isSpacer) return;

            const title = item?.exerciseName || '';
            // Formato exacto: "Titulo de ejercicio X.XX" (ej. "Montaña 8.15")
            const fullText = title ? `${title}  (${val})` : `${val}`;

            ctx.save();
            ctx.beginPath();

            const { x, y, base } = element;
            const barHeight = Math.abs(base - y);

            if (barHeight > 50) {
              ctx.translate(x, base - 14);
              ctx.rotate(-Math.PI / 2);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';

              ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;

              let displayText = fullText;
              if (ctx.measureText(displayText).width > barHeight - 20) {
                displayText = `${title.slice(0, 16)}.. ${val}`;
              }
              ctx.fillText(displayText, 0, 0);
            } else {
              ctx.fillStyle = '#e2e8f0';
              ctx.font = 'bold 9.5px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(`${val}`, x, y - 3);
            }

            ctx.restore();
          });
        });
      }
    };
  }, [companyExerciseEvolution]);

  // Opciones del gráfico de barras por ejercicio
  const exerciseBarOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#fff',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          filter: (tooltipItem: any) => {
            const it = tooltipItem.dataset?.itemsMetadata?.[tooltipItem.dataIndex];
            return !it?.isSpacer && tooltipItem.raw !== null;
          },
          callbacks: {
            title: (items: any[]) => {
              if (!items.length) return '';
              const it = items[0].dataset?.itemsMetadata?.[items[0].dataIndex];
              return it ? `Año ${it.year}` : items[0].label;
            },
            label: (context: any) => {
              const it = context.dataset?.itemsMetadata?.[context.dataIndex];
              const title = it ? it.exerciseName : (context.dataset.label || 'Ejercicio');
              const score = context.parsed.y;
              return ` ${title} ${score}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: {
            stepSize: 2,
            color: '#64748b'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: {
            color: '#38bdf8',
            font: { weight: 'bold' as const, size: 13 },
            maxRotation: 0,
            autoSkip: false
          }
        }
      }
    };
  }, []);

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
            🏢 Flota / Empresa
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
        <div>
          {/* Selector de Flota / Empresa */}
          {companiesSummaries.length > 1 && (
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
                  value={currentCompany?.nombre || ''}
                  onChange={(e) => setSelectedCompanyName(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.85rem', background: '#0e1422', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#38bdf8', fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {companiesSummaries.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {c.nombre} ({c.totalConductores} operadores evaluados)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Tarjeta Ejecutiva de Evolución de la Flota (3 Niveles de Prioridad) */}
          {currentCompany && (
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
                    🏢
                  </div>
                  <div>
                    {/* Prioridad 1: Nombre de la Empresa */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                        {currentCompany.nombre}
                      </h2>
                    </div>

                    {/* Prioridad 2: Sedes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
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
                          {currentCompany.sedes && currentCompany.sedes.length > 0
                            ? currentCompany.sedes.join(', ')
                            : 'Sede Principal de Operaciones'}
                        </span>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        • Total de {currentCompany.sedes ? currentCompany.sedes.length : 1} {currentCompany.sedes && currentCompany.sedes.length === 1 ? 'ubicación' : 'ciudades'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prioridad 3: Todo lo demás (Años, Operadores, Promedio Histórico, Tasa Aprobación) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
                {/* 3.1 Años Evaluados */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: '#c084fc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      flexShrink: 0
                    }}
                  >
                    📅
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                      Años Evaluados
                    </span>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#c084fc', marginTop: '0.1rem' }}>
                      {companyYearsStats}
                    </div>
                  </div>
                </div>

                {/* 3.2 Operadores Evaluados */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      flexShrink: 0
                    }}
                  >
                    👥
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                      Operadores Evaluados
                    </span>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.1rem' }}>
                      {currentCompany.totalConductores} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>conductores</span>
                    </div>
                  </div>
                </div>

                {/* 3.3 Promedio Histórico */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: currentCompany.promedioFinal >= 8.0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: currentCompany.promedioFinal >= 8.0 ? '#22c55e' : '#38bdf8',
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
                      Promedio Histórico
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentCompany.promedioFinal >= 6.0 ? '#22c55e' : '#ef4444', marginTop: '0.1rem' }}>
                      {currentCompany.promedioFinal.toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ 10</span>
                    </div>
                  </div>
                </div>

                {/* 3.4 Tasa de Aprobación */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: currentCompany.tasaAprobacion >= 80 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: currentCompany.tasaAprobacion >= 80 ? '#22c55e' : '#fbbf24',
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
                      Tasa de Aprobación
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: currentCompany.tasaAprobacion >= 70 ? '#22c55e' : '#fbbf24', marginTop: '0.1rem' }}>
                      {currentCompany.tasaAprobacion.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gráfico: Curva de Evolución Anual de la Flota */}
          {currentCompany && (
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
                  {/* Badge Destacado de Tendencia */}
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
          )}

          {/* Gráfico: Curva de Siniestralidad y Accidentabilidad de la Flota */}
          {currentCompany && (
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🚨</span> Curva de Siniestralidad y Accidentabilidad Anual
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Evolución histórica y desglose anual de siniestros: colisiones, salidas de vía y fatalidades registradas en el simulador.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  {/* Badge de Tendencia de Siniestralidad (Menos siniestros = Positivo / Verde) */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 1rem',
                      borderRadius: '9999px',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      background: isAccidentTrendPositive
                        ? 'rgba(34, 197, 94, 0.15)'
                        : isAccidentTrendNegative
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(148, 163, 184, 0.15)',
                      border: `1px solid ${isAccidentTrendPositive
                        ? 'rgba(34, 197, 94, 0.4)'
                        : isAccidentTrendNegative
                          ? 'rgba(239, 68, 68, 0.4)'
                          : 'rgba(148, 163, 184, 0.4)'
                        }`,
                      color: isAccidentTrendPositive ? '#22c55e' : isAccidentTrendNegative ? '#ef4444' : '#94a3b8',
                      boxShadow: `0 0 15px ${isAccidentTrendPositive
                        ? 'rgba(34, 197, 94, 0.2)'
                        : isAccidentTrendNegative
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(148, 163, 184, 0.2)'
                        }`
                    }}
                  >
                    <span>{isAccidentTrendPositive ? '📉' : isAccidentTrendNegative ? '📈' : '➡️'}</span>
                    <span>
                      {isAccidentTrendPositive
                        ? `Tendencia Favorable (${companyAnnualEvolution.accidentPercentChange}%)`
                        : isAccidentTrendNegative
                          ? `Tendencia en Aumento (+${companyAnnualEvolution.accidentPercentChange}%)`
                          : 'Tendencia Estable'}
                    </span>
                    {companyAnnualEvolution.accidentDifference !== 0 && (
                      <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
                        ({companyAnnualEvolution.accidentDifference > 0 ? `+${companyAnnualEvolution.accidentDifference}` : companyAnnualEvolution.accidentDifference} siniestros)
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
                        ticks: {
                          stepSize: 1,
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
          )}

          {/* Gráfico de Barras: Evolución de Rendimiento por Ejercicio */}
          {currentCompany && (
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📊</span> Evolución de Rendimiento por Ejercicio
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Calificación promedio (0 a 10 pts) agrupada por años para cada módulo y ejercicio evaluado en simulador.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  {/* Badge de Tendencia Apreciable en Rendimiento de Ejercicios */}
                  {(() => {
                    const isExTrendPositive = companyExerciseEvolution.trendDirection === 'mejora';
                    const isExTrendNegative = companyExerciseEvolution.trendDirection === 'descenso';
                    return (
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
                    );
                  })()}
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
          )}

          {/* Tabla de Desglose Anual Consolidado (Resumen de Métricas Globales) */}
          {currentCompany && consolidatedAnnualRows.length > 0 && (
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📑</span> Desglose Anual Consolidado • Métricas Globales
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Historial consolidado por año de evaluaciones, calificaciones, tasa de aprobación, desglose vertical de siniestros y evolución interanual.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px'
                    }}
                  >
                    🏢 {currentCompany.nombre}
                  </span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Año</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center' }}>Operadores Evaluados</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '180px' }}>Calificación Promedio</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center' }}>Tasa Aprobación</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '220px' }}>
                        Incidentes Totales
                      </th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '180px' }}>Tasa de Accidentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedAnnualRows.map((row) => (
                      <tr
                        key={row.year}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {/* 1. Año */}
                        <td style={{ padding: '1rem', fontWeight: 800, color: '#38bdf8', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                          📅 Año {row.year}
                        </td>

                        {/* 2. Operadores Evaluados */}
                        <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                          <span style={{ fontSize: '1.05rem' }}>{row.operatorCount}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            ({row.evalCount} eval)
                          </span>
                        </td>

                        {/* 3. Calificación Promedio con comparativo vs año anterior */}
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '0.92rem',
                                color: row.avgScore >= 8.0 ? '#22c55e' : row.avgScore >= 6.0 ? '#38bdf8' : '#ef4444',
                              }}
                            >
                              {row.avgScore.toFixed(2)} / 10
                            </span>

                            {/* Comparativo vs año anterior */}
                            {row.scoreTrend ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: row.scoreTrend.type === 'mejora'
                                    ? '#22c55e'
                                    : row.scoreTrend.type === 'descenso'
                                      ? '#ef4444'
                                      : '#94a3b8',
                                }}
                                title="Tendencia de calificación respecto al año anterior"
                              >
                                <span>
                                  {row.scoreTrend.type === 'mejora'
                                    ? `+${row.scoreTrend.diff} (${row.scoreTrend.percent > 0 ? `+${row.scoreTrend.percent}%` : `${row.scoreTrend.percent}%`})`
                                    : row.scoreTrend.type === 'descenso'
                                      ? `${row.scoreTrend.diff} (${row.scoreTrend.percent}%)`
                                      : 'Sin cambio'}
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontStyle: 'italic' }}>
                                Año Base
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Tasa de Aprobación */}
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: row.passRate >= 80 ? '#22c55e' : row.passRate >= 60 ? '#fbbf24' : '#ef4444'
                            }}
                          >
                            {row.passRate.toFixed(1)}%
                          </span>
                        </td>

                        {/* 5. Incidentes Totales a modo de Suma Vertical (Colisiones + Fuera de vía + Fatalidades = Total) */}
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span title="Colisiones">💥 {row.collisions}</span>
                              <span style={{ color: 'var(--text-muted)' }}>+</span>
                              <span title="Vehículos Fuera de la Vía">🛑 {row.offRoad}</span>
                              <span style={{ color: 'var(--text-muted)' }}>+</span>
                              <span title="Fatalidades">💀 {row.fatalities}</span>
                            </div>
                            <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.15)', width: '100%', marginTop: '4px', paddingTop: '3px', fontWeight: 800, fontSize: '0.95rem', color: row.totalIncidents > 0 ? '#f43f5e' : '#22c55e' }}>
                              = {row.totalIncidents} siniestros
                            </div>
                          </div>
                        </td>

                        {/* 6. Tasa de Accidentes con comparativo vs año anterior */}
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <span
                              style={{
                                fontWeight: 700,
                                color: row.accidentRate === 0 ? '#22c55e' : row.accidentRate <= 1.0 ? '#fbbf24' : '#f43f5e'
                              }}
                            >
                              {row.accidentRate.toFixed(2)}
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '3px' }}>
                                / operador
                              </span>
                            </span>

                            {/* Comparativo de accidentalidad vs año anterior */}
                            {row.accidentTrend ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: row.accidentTrend.type === 'mejora'
                                    ? '#22c55e'
                                    : row.accidentTrend.type === 'descenso'
                                      ? '#ef4444'
                                      : '#94a3b8',
                                }}
                                title="Tendencia de accidentalidad respecto al año anterior (reducción es positivo)"
                              >
                                <span>
                                  {row.accidentTrend.type === 'mejora'
                                    ? `${row.accidentTrend.diff} (${row.accidentTrend.percent}%)`
                                    : row.accidentTrend.type === 'descenso'
                                      ? `+${row.accidentTrend.diff} (+${row.accidentTrend.percent}%)`
                                      : 'Sin cambio'}
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontStyle: 'italic' }}>
                                Año Base
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
