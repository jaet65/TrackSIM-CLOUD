import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Evaluation } from '../types';
import { MISTAKE_DIMENSIONS, findCatalogMistake } from '../services/mistakeCatalog';
import { ReportDetailModal } from './ReportDetailModal';
import { DriverRadarModal } from './evolution/DriverRadarModal';
import { DriverExecutiveHeader } from './evolution/DriverExecutiveHeader';
import { DriverChartsSection } from './evolution/DriverChartsSection';
import { DriverSessionHistoryTable } from './evolution/DriverSessionHistoryTable';
import { CompanyExecutiveHeader } from './evolution/CompanyExecutiveHeader';
import { CompanyAnnualChartsSection } from './evolution/CompanyAnnualChartsSection';
import { CompanyExerciseEvolutionSection } from './evolution/CompanyExerciseEvolutionSection';
import { CompanyAnnualBreakdownTable } from './evolution/CompanyAnnualBreakdownTable';
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
  const { userRole } = useAuth();
  const { driverSummaries, companiesSummaries, filteredEvaluations, selectedDriverName, setSelectedDriverName } = useData();

  const [activeSubtab, setActiveSubtab] = useState<'driver' | 'company'>('driver');
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>('');
  const [accidentViewMode, setAccidentViewMode] = useState<'counts' | 'rate'>('counts');
  const [viewReport, setViewReport] = useState<Evaluation | null>(null);
  const [isRadarModalOpen, setIsRadarModalOpen] = useState(false);
  const [selectedRadarAxisId, setSelectedRadarAxisId] = useState<number | 'all'>('all');

  // Asegurar que al entrar a la pestaña o al cambiar de operador, se active la vista de conductor y la página suba al inicio
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
    if (selectedDriverName) {
      setActiveSubtab('driver');
    }
  }, [selectedDriverName]);

  // Resumen Consolidado Global "Todas las empresas" para administradores
  const allCompaniesSummary = useMemo(() => {
    if (userRole !== 'admin' || !companiesSummaries || companiesSummaries.length === 0) return null;

    const allSedes = new Set<string>();
    let totalEvals = 0;
    const allConductoresMap = new Map<string, any>();
    let totalScoreSum = 0;
    let approvedCount = 0;
    let totalCol = 0;
    let totalFat = 0;
    let totalOff = 0;

    companiesSummaries.forEach((c) => {
      (c.sedes || []).forEach((s) => allSedes.add(s));
      (c.conductores || []).forEach((cond) => {
        if (!allConductoresMap.has(cond.nombre)) {
          allConductoresMap.set(cond.nombre, cond);
        }
      });
    });

    filteredEvaluations.forEach((e) => {
      totalEvals += 1;
      const score = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      totalScoreSum += score;
      if (score >= 6.0) approvedCount += 1;
      totalCol += (e.colisiones || e.totalColisiones || 0);
      totalFat += (e.fatalidades || 0);
      totalOff += (e.vehiculoFueraVia || 0);
    });

    const avgScore = totalEvals > 0 ? Number((totalScoreSum / totalEvals).toFixed(2)) : 0;
    const passRate = totalEvals > 0 ? Number(((approvedCount / totalEvals) * 100).toFixed(1)) : 0;

    return {
      nombre: 'Todas las empresas',
      slug: 'todas-las-empresas',
      esGlobal: true,
      totalEvaluaciones: totalEvals,
      totalConductores: allConductoresMap.size,
      promedioFinal: avgScore,
      promedioHabilidades: 0,
      promedioSimulador: 0,
      tasaAprobacion: passRate,
      totalColisiones: totalCol,
      totalFatalidades: totalFat,
      totalFueraVia: totalOff,
      sedes: Array.from(allSedes),
      conductores: Array.from(allConductoresMap.values()),
      simulacionesPromedio: {
        simulacion_2: 0,
        simulacion_3: 0,
        simulacion_4: 0
      },
      nombresSimulaciones: {}
    };
  }, [userRole, companiesSummaries, filteredEvaluations]);

  // Lista disponible de flotas / empresas en el selector
  const availableCompanies = useMemo(() => {
    const list = [...(companiesSummaries || [])];
    if (userRole === 'admin' && allCompaniesSummary) {
      return [allCompaniesSummary, ...list];
    }
    return list;
  }, [userRole, allCompaniesSummary, companiesSummaries]);

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
    if (!availableCompanies || availableCompanies.length === 0) return null;
    if (!selectedCompanyName) return availableCompanies[0];
    return availableCompanies.find((c) => c.nombre.trim().toLowerCase() === selectedCompanyName.trim().toLowerCase()) || availableCompanies[0];
  }, [availableCompanies, selectedCompanyName]);

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
        operatorCountsByYear: [] as number[],
        accidentRatesByYear: [] as number[],
        // Tendencia en Conteo Absoluto de Siniestros
        incidentCountTrendDirection: 'estable' as 'mejora' | 'deterioro' | 'estable',
        incidentCountPercentChange: 0,
        incidentCountDifference: 0,
        // Tendencia en Tasa de Accidentes por Conductor
        rateTrendDirection: 'estable' as 'mejora' | 'deterioro' | 'estable',
        ratePercentChange: 0,
        rateDifference: 0
      };
    }

    const yearDataMap = new Map<
      string,
      { totalScore: number; count: number; colisiones: number; fatalidades: number; fueraVia: number; operators: Set<string> }
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
      const op = (e.conductor || e.operador || 'Sin Asignar').trim();

      const current = yearDataMap.get(year) || { totalScore: 0, count: 0, colisiones: 0, fatalidades: 0, fueraVia: 0, operators: new Set<string>() };
      current.totalScore += score;
      current.count += 1;
      current.colisiones += col;
      current.fatalidades += fat;
      current.fueraVia += off;
      current.operators.add(op);
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
    const operatorCountsByYear = labels.map((yr) => yearDataMap.get(yr)?.operators.size || 0);
    const accidentRatesByYear = labels.map((_, i) => {
      const ops = operatorCountsByYear[i];
      return ops > 0 ? Number((totalIncidentesByYear[i] / ops).toFixed(2)) : 0;
    });

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

    // 1. Tendencia en Conteo Absoluto de Siniestros (Menos siniestros = Favorable)
    let incidentCountTrendDirection: 'mejora' | 'deterioro' | 'estable' = 'estable';
    let incidentCountPercentChange = 0;
    let incidentCountDifference = 0;

    if (n >= 2) {
      const initialIncidents = totalIncidentesByYear[0];
      const finalIncidents = totalIncidentesByYear[n - 1];
      incidentCountDifference = finalIncidents - initialIncidents;
      incidentCountPercentChange = initialIncidents > 0
        ? Number(((incidentCountDifference / initialIncidents) * 100).toFixed(1))
        : (finalIncidents > 0 ? 100 : 0);

      if (incidentCountDifference < 0) {
        incidentCountTrendDirection = 'mejora';
      } else if (incidentCountDifference > 0) {
        incidentCountTrendDirection = 'deterioro';
      } else {
        incidentCountTrendDirection = 'estable';
      }
    }

    // 2. Tendencia en Tasa de Accidentes por Conductor (Menor tasa = Favorable)
    let rateTrendDirection: 'mejora' | 'deterioro' | 'estable' = 'estable';
    let ratePercentChange = 0;
    let rateDifference = 0;

    if (n >= 2) {
      const initialRate = accidentRatesByYear[0];
      const finalRate = accidentRatesByYear[n - 1];
      rateDifference = Number((finalRate - initialRate).toFixed(2));
      ratePercentChange = initialRate > 0
        ? Number(((rateDifference / initialRate) * 100).toFixed(1))
        : (finalRate > 0 ? 100 : 0);

      if (rateDifference < -0.05) {
        rateTrendDirection = 'mejora';
      } else if (rateDifference > 0.05) {
        rateTrendDirection = 'deterioro';
      } else {
        rateTrendDirection = 'estable';
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
      operatorCountsByYear,
      accidentRatesByYear,
      incidentCountTrendDirection,
      incidentCountPercentChange,
      incidentCountDifference,
      rateTrendDirection,
      ratePercentChange,
      rateDifference
    };
  }, [currentCompany, companyEvaluations]);

  // Datos para Gráfico de Siniestralidad según el modo seleccionado ('counts' o 'rate')
  const fleetAccidentsChartData = useMemo(() => {
    const labels = companyAnnualEvolution.labels.map((y) => `Año ${y}`);

    if (accidentViewMode === 'rate') {
      return {
        labels,
        datasets: [
          {
            type: 'line' as const,
            label: '📊 Tasa de Accidentes por Conductor',
            data: companyAnnualEvolution.accidentRatesByYear,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
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
    }

    // Modo 'counts': Conteo Absoluto de Siniestros (Total, Colisiones, Fuera de Vía, Fatalidades)
    return {
      labels,
      datasets: [
        {
          type: 'line' as const,
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
          type: 'line' as const,
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
          type: 'line' as const,
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
          type: 'line' as const,
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
        }
      ]
    };
  }, [accidentViewMode, companyAnnualEvolution]);

  // Indicadores de Tendencia de Siniestralidad según el modo activo
  const activeAccidentTrend = useMemo(() => {
    if (accidentViewMode === 'rate') {
      const isPositive = companyAnnualEvolution.rateTrendDirection === 'mejora';
      const isNegative = companyAnnualEvolution.rateTrendDirection === 'deterioro';
      return {
        direction: companyAnnualEvolution.rateTrendDirection,
        isPositive,
        isNegative,
        percent: companyAnnualEvolution.ratePercentChange,
        diff: companyAnnualEvolution.rateDifference,
        unit: '/ operador'
      };
    }
    const isPositive = companyAnnualEvolution.incidentCountTrendDirection === 'mejora';
    const isNegative = companyAnnualEvolution.incidentCountTrendDirection === 'deterioro';
    return {
      direction: companyAnnualEvolution.incidentCountTrendDirection,
      isPositive,
      isNegative,
      percent: companyAnnualEvolution.incidentCountPercentChange,
      diff: companyAnnualEvolution.incidentCountDifference,
      unit: 'siniestros'
    };
  }, [accidentViewMode, companyAnnualEvolution]);

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

  // Radar de Competencias basado en los 5 Ejes del Catálogo de Errores
  const radarDimensions = [
    MISTAKE_DIMENSIONS.EJE_1, // Normas de Tráfico
    MISTAKE_DIMENSIONS.EJE_2, // Dinámica y Seguridad
    MISTAKE_DIMENSIONS.EJE_3, // Eficiencia de Motor
    MISTAKE_DIMENSIONS.EJE_4, // Transmisión y Embrague
    MISTAKE_DIMENSIONS.EJE_5  // Arranque y Preparación
  ];

  // Acumular errores por eje a través de todas las evaluaciones del conductor (o de la última evaluación)
  const axisStats = useMemo(() => {
    const errorCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const mistakeMap = new Map<string, { error: string; repeticiones: number; ejeId: number; fecha?: string }>();
    let hasMistakeData = false;

    // Recorremos las evaluaciones del conductor
    driverEvaluations.forEach(ev => {
      if (Array.isArray(ev.erroresFrecuentes) && ev.erroresFrecuentes.length > 0) {
        hasMistakeData = true;
        ev.erroresFrecuentes.forEach(item => {
          let ejeId = item.ejeId;
          const match = findCatalogMistake(item.error || item.errorRaw || '');
          if (!ejeId && match) ejeId = match.ejeId;
          const finalEjeId = ejeId || 1;
          const errorName = match ? match.nombre : (item.error || item.errorRaw || 'Error no clasificado');

          if (errorCounts[finalEjeId] != null) {
            errorCounts[finalEjeId] += (item.repeticiones || 1);
          }

          const existing = mistakeMap.get(errorName);
          if (existing) {
            existing.repeticiones += (item.repeticiones || 1);
          } else {
            mistakeMap.set(errorName, {
              error: errorName,
              repeticiones: item.repeticiones || 1,
              ejeId: finalEjeId
            });
          }
        });
      }
    });

    const mistakeDetails = Array.from(mistakeMap.values()).sort((a, b) => b.repeticiones - a.repeticiones);
    const numEvals = Math.max(1, driverEvaluations.length);

    // Si hay datos reales de errores extraídos:
    // Puntuación sobre 10 donde 0 errores = 10, y se penaliza proporcionalmente según frecuencia promedio
    // Penalizaciones equilibradas:
    // Eje 1 (Normas): -0.4 por error promedio por sesión
    // Eje 2 (Dinámica/Seguridad): -1.2 por error (colisiones, derrapes son críticos)
    // Eje 3 (Eficiencia Motor): -0.3 por error (zonas de RPM)
    // Eje 4 (Transmisión/Embrague): -0.6 por error
    // Eje 5 (Arranque): -0.8 por error
    const penalties: Record<number, number> = {
      1: 0.4,
      2: 1.2,
      3: 0.3,
      4: 0.6,
      5: 0.8
    };

    const scores = radarDimensions.map(dim => {
      if (hasMistakeData) {
        const count = errorCounts[dim.id] || 0;
        const avgErrors = count / numEvals;
        const score = Math.max(1.0, Math.min(10.0, 10.0 - (avgErrors * (penalties[dim.id] || 0.5))));
        return parseFloat(score.toFixed(1));
      } else {
        // Fallback armonioso si la evaluación es histórica sin lista de errores
        const latest = driverEvaluations[driverEvaluations.length - 1];
        if (!latest) return 7.0;
        const finalScore = latest.evaluacionFinalPuntos ?? latest.calificacionExacta ?? 7.0;
        const colFactor = Math.max(0, 10 - ((latest.colisiones || 0) * 2.5) - ((latest.fatalidades || 0) * 4));
        if (dim.id === 1) return parseFloat(Math.min(10, Math.max(2, (latest.habilidadesManejoPct ? latest.habilidadesManejoPct / 10 : finalScore))).toFixed(1));
        if (dim.id === 2) return parseFloat(Math.min(10, Math.max(1, colFactor)).toFixed(1));
        if (dim.id === 3) return parseFloat(Math.min(10, Math.max(2, (latest.practicaSimuladorPct ? latest.practicaSimuladorPct / 10 : finalScore))).toFixed(1));
        if (dim.id === 4) return parseFloat(Math.min(10, Math.max(2, finalScore * 0.95)).toFixed(1));
        return parseFloat(Math.min(10, Math.max(2, finalScore)).toFixed(1));
      }
    });

    return { errorCounts, hasMistakeData, scores, mistakeDetails };
  }, [driverEvaluations, radarDimensions]);

  const radarData = {
    labels: radarDimensions.map(d => `${d.icono} ${d.shortName}`),
    datasets: [
      {
        label: currentDriver ? currentDriver.nombre : 'Operador',
        data: axisStats.scores,
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
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx: any) => {
            const dimIndex = ctx.dataIndex;
            const dim = radarDimensions[dimIndex];
            const score = ctx.raw;
            const count = axisStats.errorCounts[dim.id] || 0;
            const lines = [`Rendimiento: ${score} / 10 pts`];
            if (axisStats.hasMistakeData) {
              lines.push(`Errores registrados: ${count} incidencia${count === 1 ? '' : 's'}`);
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
        pointLabels: { color: '#cbd5e1', font: { size: 10, weight: 'bold' as const } },
        ticks: { backdropColor: 'transparent', color: '#64748b', stepSize: 2 }
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
          <DriverExecutiveHeader currentDriver={currentDriver} />

          {/* Gráficos de Evolución de Operador */}
          <DriverChartsSection
            evolutionChartData={evolutionChartData}
            accidentChartData={accidentChartData}
            radarData={radarData}
            chartOptions={chartOptions}
            radarOptions={radarOptions}
            onOpenRadarModal={() => {
              setSelectedRadarAxisId('all');
              setIsRadarModalOpen(true);
            }}
          />

          {/* Historial Cronológico de Sesiones del Conductor */}
          <DriverSessionHistoryTable
            driverEvaluations={driverEvaluations}
            onViewReport={(ev) => setViewReport(ev)}
          />

          {/* Modal Detalle de Reporte de Sesión Unificado */}
          <ReportDetailModal
            evaluation={viewReport}
            onClose={() => setViewReport(null)}
          />

          {/* Modal Detalle de Radar Ampliado y Desglose de Errores */}
          <DriverRadarModal
            isOpen={isRadarModalOpen}
            onClose={() => setIsRadarModalOpen(false)}
            driver={currentDriver}
            radarData={radarData}
            radarOptions={radarOptions}
            radarDimensions={radarDimensions}
            axisStats={axisStats}
            selectedRadarAxisId={selectedRadarAxisId}
            onSelectRadarAxisId={setSelectedRadarAxisId}
          />
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
                  {availableCompanies.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {c.esGlobal ? '🌐 ' : ''}{c.nombre} ({c.totalConductores} operadores evaluados)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Tarjeta Ejecutiva de Evolución de la Flota (3 Niveles de Prioridad) */}
          <CompanyExecutiveHeader
            currentCompany={currentCompany}
            companyYearsStats={companyYearsStats}
          />

          {/* Gráficos Anuales de Flota (Evolución y Siniestralidad) */}
          <CompanyAnnualChartsSection
            currentCompany={currentCompany}
            companyAnnualEvolution={companyAnnualEvolution}
            fleetAnnualChartData={fleetAnnualChartData}
            fleetAccidentsChartData={fleetAccidentsChartData}
            chartOptions={chartOptions}
            accidentViewMode={accidentViewMode}
            onToggleAccidentViewMode={setAccidentViewMode}
            activeAccidentTrend={activeAccidentTrend}
          />

          {/* Gráfico: Evolución Anual por Ejercicio y Escenario */}
          <CompanyExerciseEvolutionSection
            currentCompany={currentCompany}
            companyExerciseEvolution={companyExerciseEvolution}
            exerciseBarOptions={exerciseBarOptions}
            barTextPlugin={barTextPlugin}
          />

          {/* Tabla de Desglose Anual Consolidado (Resumen de Métricas Globales) */}
          <CompanyAnnualBreakdownTable
            consolidatedAnnualRows={consolidatedAnnualRows}
          />
        </div>
      )}
    </div>
  );
};
