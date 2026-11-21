import { CompanySummary, Evaluation } from '../types';
import { logAudit } from './auditLog';
import type { CompanyAiStructuredReport } from './companyAiInsights';
import type { AiResponseQuality } from './companyAiInsights';
import { findCatalogExercise } from './exerciseCatalog';
import { getCriticalMistakes, getEvaluationIncidentCounts } from './incidentMetrics';

export interface ExerciseStatSummary {
  key: string;
  nombre: string;
  numero?: number;
  promedio: number;
  totalEvaluaciones: number;
}

export interface CompanyPresentationInput {
  comp: CompanySummary & { esGlobal?: boolean };
  selectedYear: string;
  periodText: string;
  conductoresRecurrentes: number;
  pctRecurrentes: string;
  operadoresConHistorialPrevio?: { count: number; pct: string };
  exerciseStats: ExerciseStatSummary[];
  allEvaluations: Evaluation[];
  aiReport?: CompanyAiStructuredReport;
  aiSourceLabel?: string;
  aiQuality?: AiResponseQuality;
  aiCached?: boolean;
  aiWarning?: string;
}

export interface DriverRowSummary {
  rank: number;
  nombre: string;
  sede: string;
  sesiones: number;
  promedioScore: number;
  incidentes: number;
  estado: string;
}

export interface CompanyPresentationData {
  companyName: string;
  periodText: string;
  sedesText: string;
  fechaGeneracion: string;
  totalConductores: number;
  totalEvaluaciones: number;
  promedioFinal: number;
  tasaAprobacion: number;
  recurrenceTitle: string;
  recurrenceValue: string;
  recurrenceSubtext: string;
  aptitude: {
    sobresalientes: number;
    pctSobresalientes: number;
    aprobados: number;
    pctAprobados: number;
    refuerzo: number;
    pctRefuerzo: number;
  };
  exercises: Array<{
    nombre: string;
    descripcion: string;
    totalEvaluaciones: number;
    promedio: number;
    nivel: string;
  }>;
  exercisesByYear: Array<{
    year: string;
    exercises: Array<{
      nombre: string;
      totalEvaluaciones: number;
      promedio: number;
      nivel: string;
    }>;
  }>;
  criticalSummary: {
    hasV2Data: boolean;
    totalIncidentes: number;
    incidentRate: string;
    items: Array<{ error: string; repeticiones: number }>;
  };
  topMistakes: Array<{ error: string; repeticiones: number }>;
  top10Best: DriverRowSummary[];
  top10Worst: DriverRowSummary[];
  annualEvolution: {
    hasMultiYear: boolean;
    years: Array<{
      year: string;
      operadores: number;
      sesiones: number;
      promedio: number;
      tasaAprobacion: number;
      totalAccidentes: number;
      tasaAccidentes: number;
    }>;
    scoreDeltaFirstToLast: number;
    accidentRateDeltaFirstToLast: number;
    recurrentImpact: {
      count: number;
      firstAvg: number;
      latestAvg: number;
      improvedCount: number;
    };
  };
  actionPlan: string;
}

const COLORS = {
  navy: '0F172A',
  slateDark: '1E293B',
  slate: '334155',
  muted: '64748B',
  lightBg: 'F8FAFC',
  border: 'CBD5E1',
  white: 'FFFFFF',
  sky: '0284C7',
  skyLight: 'E0F2FE',
  green: '16A34A',
  greenLight: 'DCFCE7',
  red: 'DC2626',
  redLight: 'FEE2E2',
  amber: 'D97706',
  amberLight: 'FEF3C7',
  purple: '7C3AED'
};

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s*[–—]\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const SLIDE_COVER_BG_PATH = '/template/Slides.jpg';
const LINKTREE_QR_PATH = '/template/Linktree.svg';
const TRACKSIM_CLOUD_URL = 'https://tracksim-cloud.web.app';
const LINKTREE_URL = 'https://linktr.ee/TrackSIM_ANTP';

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  if (typeof fetch === 'undefined' || typeof FileReader === 'undefined') return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadSvgAsPngDataUrl(url: string, size = 512): Promise<string | null> {
  if (typeof fetch === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    try {
      return await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function generateQrDataUrl(text: string): Promise<string | null> {
  try {
    const QRCode = await import('qrcode');
    return await QRCode.toDataURL(text, {
      width: 512,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });
  } catch {
    return null;
  }
}

function getDriverIncidents(c: any): number {
  return (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);
}

function getEvalYear(ev: Evaluation): string | null {
  const dateStr = ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || '';
  const match = String(dateStr).match(/\b(20\d{2}|19\d{2})\b/);
  return match ? match[1] : (String(dateStr).match(/\b\d{4}\b/)?.[0] || null);
}

function getEvalScore(ev: Evaluation): number {
  return ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
}

function getEvalTime(ev: Evaluation): number {
  const raw = ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildActionPlan(
  topMistakes: Array<{ error: string; repeticiones: number }>,
  totalIncidentes: number,
  promedioFinal: number
): string {
  if (topMistakes.length > 0) {
    const errText = topMistakes
      .slice(0, 3)
      .map((m) => m.error.toLowerCase())
      .join(' ');
    const actions: string[] = [];

    if (/velocidad|aceleraci|l[ií]mite|r[aá]pido|frenad|distancia|freno/.test(errText)) {
      actions.push('gestión de velocidad regulada y calibración de distancias de frenado');
    }
    if (/curva|derrap|peralte|giro|viraje/.test(errText)) {
      actions.push('control de transferencia de masas y trazado seguro en curvas');
    }
    if (/carril|inva|l[ií]nea|orilla|salida|v[ií]a/.test(errText)) {
      actions.push('mantenimiento de carril y prevención de salidas de vía');
    }
    if (/intersecci|sem[aá]foro|alto|pare|cruce|prioridad|ceda/.test(errText)) {
      actions.push('respeto a señalización y lectura preventiva en intersecciones');
    }
    if (/impacto|choque|colisi|alcance|peat[oó]n|vuelco/.test(errText)) {
      actions.push('frenado de emergencia y maniobras evasivas controladas');
    }
    if (/embrague|clutch|marcha|cambio|revoluci|motor|transmisi/.test(errText)) {
      actions.push('optimización de transmisión y conducción técnica eficiente');
    }

    if (actions.length > 0) {
      const unique = Array.from(new Set(actions));
      return `Priorizar módulos de refuerzo en simulador enfocados en: ${unique.join(', ')}.`;
    }

    const names = topMistakes
      .slice(0, 3)
      .map((m) => m.error)
      .join(', ');
    return `Estructurar clínicas correctivas enfocadas en mitigar: ${names}.`;
  }

  if (totalIncidentes > 0) {
    return 'Implementar talleres de conducción defensiva orientados a control de colisiones y prevención de incidentes críticos.';
  }

  if (promedioFinal < 7.0) {
    return 'Programar seguimiento técnico focalizado para los operadores con menor desempeño (Red Flags).';
  }

  return 'Continuar con el programa preventivo anual incorporando escenarios de complejidad climática y maniobras de precisión.';
}

export function buildCompanyPresentationData(input: CompanyPresentationInput): CompanyPresentationData {
  const {
    comp,
    selectedYear,
    periodText,
    conductoresRecurrentes,
    pctRecurrentes,
    operadoresConHistorialPrevio,
    exerciseStats,
    allEvaluations
  } = input;

  const conductores = comp.conductores || [];
  const totalConductores = conductores.length;

  const sobresalientes = conductores.filter((c) => c.promedioScore >= 8.0).length;
  const aprobados = conductores.filter((c) => c.promedioScore >= 6.0 && c.promedioScore < 8.0).length;
  const refuerzo = conductores.filter((c) => c.promedioScore < 6.0).length;

  const pctSobresalientes = totalConductores > 0 ? Math.round((sobresalientes / totalConductores) * 100) : 0;
  const pctAprobados = totalConductores > 0 ? Math.round((aprobados / totalConductores) * 100) : 0;
  const pctRefuerzo = totalConductores > 0 ? Math.round((refuerzo / totalConductores) * 100) : 0;

  // Incidentes críticos reales (Zero / V2) o acumulados (legacy)
  const hasV2Data = allEvaluations.some((ev) => ev.origen === 'TrackSIM-ZERO-V2');
  let criticalItems: Array<{ error: string; repeticiones: number }> = [];
  let totalIncidentes = 0;

  if (hasV2Data) {
    const critMap = new Map<string, { error: string; repeticiones: number }>();
    const addCrit = (name: string, count: number) => {
      if (count <= 0) return;
      const key = name.toLowerCase();
      const current = critMap.get(key) || { error: name, repeticiones: 0 };
      current.repeticiones += count;
      critMap.set(key, current);
    };

    allEvaluations.forEach((ev) => {
      if (ev.origen === 'TrackSIM-ZERO-V2') {
        const criticos = getCriticalMistakes(ev.erroresFrecuentes || []);
        if (criticos.length > 0) {
          criticos.forEach((c) => addCrit(c.error, c.repeticiones));
        } else if ((ev.accidentesCriticos || 0) > 0) {
          addCrit('Incidencias Críticas', ev.accidentesCriticos || 0);
        }
      } else {
        const inc = getEvaluationIncidentCounts(ev);
        addCrit('Colisiones', inc.colisiones);
        addCrit('Salidas de Vía', inc.vehiculoFueraVia);
        addCrit('Fatalidades', inc.fatalidades);
      }
    });

    criticalItems = Array.from(critMap.values()).sort((a, b) => b.repeticiones - a.repeticiones);
    totalIncidentes = criticalItems.reduce((sum, item) => sum + item.repeticiones, 0);
  } else {
    const col = comp.totalColisiones || 0;
    const out = comp.totalFueraVia || 0;
    const fat = comp.totalFatalidades || 0;
    totalIncidentes = col + out + fat;
    if (col > 0) criticalItems.push({ error: 'Colisiones', repeticiones: col });
    if (out > 0) criticalItems.push({ error: 'Salidas de Vía', repeticiones: out });
    if (fat > 0) criticalItems.push({ error: 'Fatalidades', repeticiones: fat });
  }

  const incidentRate = totalConductores > 0 ? (totalIncidentes / totalConductores).toFixed(2) : '0.00';

  // Top errores recurrentes (erroresFrecuentes)
  const mistakesMap = new Map<string, { error: string; repeticiones: number }>();
  allEvaluations.forEach((ev) => {
    if (Array.isArray(ev.erroresFrecuentes)) {
      ev.erroresFrecuentes.forEach((m) => {
        const raw = (m.error || m.errorRaw || '').trim();
        if (!raw) return;
        const key = raw.toLowerCase();
        const curr = mistakesMap.get(key) || { error: raw, repeticiones: 0 };
        curr.repeticiones += m.repeticiones || 1;
        mistakesMap.set(key, curr);
      });
    }
  });
  const topMistakes = Array.from(mistakesMap.values())
    .sort((a, b) => b.repeticiones - a.repeticiones)
    .slice(0, 8);

  // Top 10 mejores conductores
  const sortedBest = [...conductores].sort((a, b) => {
    if (b.promedioScore !== a.promedioScore) return b.promedioScore - a.promedioScore;
    return getDriverIncidents(a) - getDriverIncidents(b);
  });
  const top10Best: DriverRowSummary[] = sortedBest.slice(0, 10).map((c, idx) => ({
    rank: idx + 1,
    nombre: c.nombre,
    sede: c.sede || 'Principal',
    sesiones: c.totalEvaluaciones || 1,
    promedioScore: c.promedioScore,
    incidentes: getDriverIncidents(c),
    estado: c.estado || (c.promedioScore >= 8 ? 'Sobresaliente' : c.promedioScore >= 6 ? 'Aprobado' : 'Reforzar')
  }));

  // Top 10 peores conductores (atención prioritaria)
  const sortedWorst = [...conductores].sort((a, b) => {
    if (a.promedioScore !== b.promedioScore) return a.promedioScore - b.promedioScore;
    return getDriverIncidents(b) - getDriverIncidents(a);
  });
  const top10Worst: DriverRowSummary[] = sortedWorst.slice(0, 10).map((c, idx) => ({
    rank: idx + 1,
    nombre: c.nombre,
    sede: c.sede || 'Principal',
    sesiones: c.totalEvaluaciones || 1,
    promedioScore: c.promedioScore,
    incidentes: getDriverIncidents(c),
    estado: c.estado || (c.promedioScore >= 8 ? 'Sobresaliente' : c.promedioScore >= 6 ? 'Aprobado' : 'Reforzar')
  }));

  const exercises = exerciseStats.map((ex) => {
    const catalogItem = findCatalogExercise(ex.nombre);
    return {
      nombre: ex.nombre,
      descripcion: catalogItem?.descripcion?.trim() || 'Escenario de evaluación práctica en simulador TrackSIM.',
      totalEvaluaciones: ex.totalEvaluaciones,
      promedio: ex.promedio,
      nivel: ex.promedio >= 8.0 ? 'Sobresaliente' : ex.promedio >= 6.0 ? 'Aprobado' : 'Requiere Refuerzo'
    };
  });

  // Agrupación de ejercicios por año para identificar qué escenarios se realizaron cada año
  const exByYearMap = new Map<string, Map<string, { nombre: string; numero?: number; sum: number; count: number }>>();
  allEvaluations.forEach((ev) => {
    const yr = getEvalYear(ev);
    if (!yr) return;

    if (!exByYearMap.has(yr)) {
      exByYearMap.set(yr, new Map());
    }
    const yearExMap = exByYearMap.get(yr)!;

    if (Array.isArray(ev.ejercicios) && ev.ejercicios.length > 0) {
      ev.ejercicios.forEach((ex) => {
        if (!ex || ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado') return;
        const rawName = (ex.nombre || (ex.numero ? `Ejercicio ${ex.numero}` : '')).trim();
        if (!rawName) return;
        const score =
          typeof ex.calificacion === 'number' ? ex.calificacion : parseFloat(String(ex.calificacion ?? ex.score ?? ''));
        if (Number.isNaN(score)) return;
        const key = rawName.toLowerCase();
        const curr = yearExMap.get(key) || { nombre: rawName, numero: ex.numero, sum: 0, count: 0 };
        curr.sum += score;
        curr.count += 1;
        yearExMap.set(key, curr);
      });
    } else if (ev.simulacionesDetalle) {
      Object.entries(ev.simulacionesDetalle).forEach(([simKey, val]) => {
        if (typeof val !== 'number' || Number.isNaN(val)) return;
        const numMatch = simKey.match(/\d+/);
        const num = numMatch ? Number(numMatch[0]) : undefined;
        const rawName =
          (num && ev.nombresSimulaciones?.[num]) ||
          ev.nombresSimulaciones?.[simKey] ||
          (num ? `Ejercicio ${num}` : simKey);
        const key = rawName.trim().toLowerCase();
        const curr = yearExMap.get(key) || { nombre: rawName.trim(), numero: num, sum: 0, count: 0 };
        curr.sum += val;
        curr.count += 1;
        yearExMap.set(key, curr);
      });
    }
  });

  const exercisesByYear = Array.from(exByYearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, exMap]) => {
      const list = Array.from(exMap.values())
        .filter((item) => item.count > 0)
        .sort((a, b) => {
          if (a.numero && b.numero) return a.numero - b.numero;
          if (a.numero) return -1;
          if (b.numero) return 1;
          return b.sum / b.count - a.sum / a.count;
        })
        .map((item) => {
          const avg = Number((item.sum / item.count).toFixed(2));
          return {
            nombre: item.nombre,
            totalEvaluaciones: item.count,
            promedio: avg,
            nivel: avg >= 8.0 ? 'Sobresaliente' : avg >= 6.0 ? 'Aprobado' : 'Requiere Refuerzo'
          };
        });
      return { year, exercises: list };
    })
    .filter((entry) => entry.exercises.length > 0);

  const sedesText = comp.esGlobal
    ? 'Todas las Sedes y Flotas'
    : comp.sedes && comp.sedes.length > 0
      ? comp.sedes.join(', ')
      : 'Sede Principal';

  const isYearFiltered = Boolean(selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio);
  const recurrenceTitle = isYearFiltered ? 'CON HISTORIAL PREVIO' : 'RECURRENTES (> 1 EVAL)';
  const recurrenceValue = isYearFiltered && operadoresConHistorialPrevio ? `${operadoresConHistorialPrevio.pct}%` : `${pctRecurrentes}%`;
  const recurrenceSubtext =
    isYearFiltered && operadoresConHistorialPrevio
      ? `${operadoresConHistorialPrevio.count} operadores previos`
      : `${conductoresRecurrentes} con >1 evaluación`;

  const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Evolución multianual e impacto post-capacitación (cuando hay >= 2 años)
  const yearMap = new Map<
    string,
    {
      operators: Set<string>;
      sesiones: number;
      scoreSum: number;
      approved: number;
      accidentes: number;
    }
  >();
  const driverHistoryMap = new Map<string, Array<{ time: number; score: number }>>();

  allEvaluations.forEach((ev) => {
    const score = getEvalScore(ev);
    const opName = (ev.conductor || ev.operador || '').trim();
    const opKey = opName.toLowerCase();
    if (opKey) {
      const list = driverHistoryMap.get(opKey) || [];
      list.push({ time: getEvalTime(ev), score });
      driverHistoryMap.set(opKey, list);
    }

    const yr = getEvalYear(ev);
    if (!yr) return;
    const bucket = yearMap.get(yr) || {
      operators: new Set<string>(),
      sesiones: 0,
      scoreSum: 0,
      approved: 0,
      accidentes: 0
    };
    if (opName) bucket.operators.add(opKey);
    bucket.sesiones += 1;
    bucket.scoreSum += score;
    if (score >= 6.0) bucket.approved += 1;

    if (ev.origen === 'TrackSIM-ZERO-V2') {
      const crits = getCriticalMistakes(ev.erroresFrecuentes || []);
      const evCrits = crits.length > 0 ? crits.reduce((s, c) => s + c.repeticiones, 0) : (ev.accidentesCriticos || 0);
      bucket.accidentes += evCrits;
    } else {
      const inc = getEvaluationIncidentCounts(ev);
      bucket.accidentes += inc.colisiones + inc.fatalidades + inc.vehiculoFueraVia;
    }
    yearMap.set(yr, bucket);
  });

  const sortedYears = Array.from(yearMap.keys()).sort();
  const yearsData = sortedYears.map((yr) => {
    const b = yearMap.get(yr)!;
    const opsCount = b.operators.size || b.sesiones;
    return {
      year: yr,
      operadores: b.operators.size,
      sesiones: b.sesiones,
      promedio: Number((b.scoreSum / b.sesiones).toFixed(2)),
      tasaAprobacion: Number(((b.approved / b.sesiones) * 100).toFixed(1)),
      totalAccidentes: b.accidentes,
      tasaAccidentes: opsCount > 0 ? Number((b.accidentes / opsCount).toFixed(2)) : 0
    };
  });

  let recurrentCount = 0;
  let firstSum = 0;
  let latestSum = 0;
  let improvedCount = 0;
  driverHistoryMap.forEach((entries) => {
    if (entries.length < 2) return;
    const ordered = [...entries].sort((a, b) => a.time - b.time);
    const first = ordered[0].score;
    const latest = ordered[ordered.length - 1].score;
    recurrentCount += 1;
    firstSum += first;
    latestSum += latest;
    if (latest >= first) improvedCount += 1;
  });

  const hasMultiYear = yearsData.length >= 2;
  const scoreDeltaFirstToLast = hasMultiYear
    ? Number((yearsData[yearsData.length - 1].promedio - yearsData[0].promedio).toFixed(2))
    : 0;
  const accidentRateDeltaFirstToLast = hasMultiYear
    ? Number((yearsData[yearsData.length - 1].tasaAccidentes - yearsData[0].tasaAccidentes).toFixed(2))
    : 0;

  return {
    companyName: comp.nombre || 'Flota',
    periodText,
    sedesText,
    fechaGeneracion,
    totalConductores,
    totalEvaluaciones: comp.totalEvaluaciones || allEvaluations.length,
    promedioFinal: comp.promedioFinal || 0,
    tasaAprobacion: comp.tasaAprobacion || 0,
    recurrenceTitle,
    recurrenceValue,
    recurrenceSubtext,
    aptitude: {
      sobresalientes,
      pctSobresalientes,
      aprobados,
      pctAprobados,
      refuerzo,
      pctRefuerzo
    },
    exercises,
    exercisesByYear,
    criticalSummary: {
      hasV2Data,
      totalIncidentes,
      incidentRate,
      items: criticalItems
    },
    topMistakes,
    top10Best,
    top10Worst,
    annualEvolution: {
      hasMultiYear,
      years: yearsData,
      scoreDeltaFirstToLast,
      accidentRateDeltaFirstToLast,
      recurrentImpact: {
        count: recurrentCount,
        firstAvg: recurrentCount > 0 ? Number((firstSum / recurrentCount).toFixed(2)) : 0,
        latestAvg: recurrentCount > 0 ? Number((latestSum / recurrentCount).toFixed(2)) : 0,
        improvedCount
      }
    },
    actionPlan: buildActionPlan(topMistakes, totalIncidentes, comp.promedioFinal || 0)
  };
}

function addSlideHeader(slide: any, title: string, subtitle: string, pageNum: number, totalPages: number) {
  slide.background = { color: COLORS.lightBg };

  // Barra superior de marca
  slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.1, fill: { color: COLORS.sky } });

  slide.addText(title, {
    x: 0.6,
    y: 0.28,
    w: 9.5,
    h: 0.42,
    fontSize: 21,
    bold: true,
    color: COLORS.navy,
    fontFace: 'Segoe UI'
  });

  slide.addText(subtitle, {
    x: 0.6,
    y: 0.68,
    w: 9.5,
    h: 0.28,
    fontSize: 10.5,
    color: COLORS.muted,
    fontFace: 'Segoe UI'
  });

  slide.addText('TRACKSIM CLOUD', {
    x: 10.3,
    y: 0.34,
    w: 2.45,
    h: 0.32,
    align: 'right',
    fontSize: 10,
    bold: true,
    color: COLORS.sky,
    fontFace: 'Segoe UI'
  });

  slide.addShape('line', {
    x: 0.6,
    y: 1.03,
    w: 12.133,
    h: 0,
    line: { color: COLORS.border, width: 1 }
  });

  // Pie de página
  slide.addText(`TrackSIM Cloud Analytics  •  Informe Ejecutivo  •  Diapositiva ${pageNum} de ${totalPages}`, {
    x: 0.6,
    y: 7.12,
    w: 12.133,
    h: 0.25,
    align: 'right',
    fontSize: 8.5,
    color: COLORS.muted,
    fontFace: 'Segoe UI'
  });
}

function buildDriverTableRows(rows: DriverRowSummary[], isWorst: boolean): any[][] {
  const headerStyle = {
    bold: true,
    fontSize: 9.5,
    color: COLORS.white,
    fill: { color: isWorst ? '991B1B' : COLORS.navy },
    align: 'center' as const,
    valign: 'middle' as const
  };

  const tableRows: any[][] = [
    [
      { text: '#', options: headerStyle },
      { text: 'Operador', options: { ...headerStyle, align: 'left' } },
      { text: 'Sede', options: { ...headerStyle, align: 'left' } },
      { text: 'Sesiones', options: headerStyle },
      { text: 'Promedio', options: headerStyle },
      { text: 'Incidentes', options: headerStyle },
      { text: 'Estado', options: headerStyle }
    ]
  ];

  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? COLORS.white : 'F1F5F9';
    const scoreColor = r.promedioScore >= 8.0 ? COLORS.green : r.promedioScore >= 6.0 ? COLORS.sky : COLORS.red;
    const incColor = r.incidentes > 0 ? COLORS.red : COLORS.green;

    tableRows.push([
      { text: String(r.rank), options: { fill: { color: bg }, align: 'center', fontSize: 9, bold: true, color: COLORS.slate } },
      { text: r.nombre, options: { fill: { color: bg }, align: 'left', fontSize: 9, bold: true, color: COLORS.navy } },
      { text: r.sede, options: { fill: { color: bg }, align: 'left', fontSize: 8.5, color: COLORS.slate } },
      { text: String(r.sesiones), options: { fill: { color: bg }, align: 'center', fontSize: 9, color: COLORS.slate } },
      {
        text: `${r.promedioScore.toFixed(2)} pts`,
        options: { fill: { color: bg }, align: 'center', fontSize: 9, bold: true, color: scoreColor }
      },
      {
        text: String(r.incidentes),
        options: { fill: { color: bg }, align: 'center', fontSize: 9, bold: true, color: incColor }
      },
      { text: r.estado, options: { fill: { color: bg }, align: 'center', fontSize: 8.5, bold: true, color: scoreColor } }
    ]);
  });

  return tableRows;
}

export async function generateCompanyPresentationPptx(input: CompanyPresentationInput): Promise<string> {
  const data = buildCompanyPresentationData(input);
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();

  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'TrackSIM Cloud Analytics';
  pres.company = data.companyName;
  pres.subject = `Informe Ejecutivo de Rendimiento - ${data.companyName} (${data.periodText})`;
  pres.title = `Informe Ejecutivo - ${data.companyName}`;

  const hasEvolutionSlide = data.annualEvolution.hasMultiYear;
  const hasAiSlide = Boolean(input.aiReport);
  const totalSlides = (hasEvolutionSlide ? 9 : 8) + (hasAiSlide ? 1 : 0);
  let slidePage = 2;
  const [coverBgDataUrl, cloudQrDataUrl, linktreeQrDataUrl] = await Promise.all([
    loadImageAsDataUrl(SLIDE_COVER_BG_PATH),
    generateQrDataUrl(TRACKSIM_CLOUD_URL),
    loadSvgAsPngDataUrl(LINKTREE_QR_PATH)
  ]);

  // =========================================================================
  // SLIDE 1: PORTADA EJECUTIVA
  // =========================================================================
  const s1 = pres.addSlide();
  if (coverBgDataUrl) {
    s1.background = { data: coverBgDataUrl };
  } else {
    s1.background = { color: COLORS.navy };
    s1.addShape('rect', { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: COLORS.sky } });
  }

  s1.addText('TrackSIM', {
    x: 1.95,
    y: 0.52,
    w: 6.5,
    h: 0.32,
    fontSize: 12,
    bold: true,
    color: 'FB923C',
    charSpacing: 1.5,
    fontFace: 'Segoe UI'
  });

  s1.addText('INFORME EJECUTIVO DE\nRENDIMIENTO DE FLOTA', {
    x: 1.95,
    y: 0.88,
    w: 6.5,
    h: 1.05,
    fontSize: 27,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });

  s1.addText(data.companyName, {
    x: 0.65,
    y: 2.7,
    w: 5.75,
    h: 0.65,
    fontSize: 25,
    bold: true,
    color: '38BDF8',
    fontFace: 'Segoe UI'
  });

  s1.addShape('roundRect', {
    x: 0.65,
    y: 3.4,
    w: 1.45,
    h: 0.06,
    rectRadius: 0.03,
    fill: { color: 'F97316' }
  });

  const metaCards = [
    { label: 'PERIODO EVALUADO', value: data.periodText },
    { label: 'COBERTURA / SEDES', value: data.sedesText },
    { label: 'OPERADORES', value: `${data.totalConductores} (${data.totalEvaluaciones} sesiones)` },
    { label: 'FECHA DE EMISIÓN', value: data.fechaGeneracion }
  ];

  metaCards.forEach((mc, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 0.65 + col * 2.95;
    const y = 3.82 + row * 0.96;
    s1.addShape('roundRect', {
      x,
      y,
      w: 2.8,
      h: 0.82,
      rectRadius: 0.06,
      fill: { color: '1E293B', transparency: 90 },
      line: { color: '475569', width: 0.75 }
    });
    s1.addText(mc.label, {
      x: x + 0.14,
      y: y + 0.09,
      w: 2.52,
      h: 0.2,
      fontSize: 7.5,
      bold: true,
      color: '94A3B8',
      fontFace: 'Segoe UI'
    });
    s1.addText(mc.value, {
      x: x + 0.14,
      y: y + 0.32,
      w: 2.52,
      h: 0.42,
      fontSize: 10,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI',
      valign: 'top'
    });
  });

  // =========================================================================
  // SLIDE 2: CATÁLOGO DE EJERCICIOS REALIZADOS Y DESCRIPCIÓN
  // =========================================================================
  const sDesc = pres.addSlide();
  addSlideHeader(
    sDesc,
    'Catálogo de Ejercicios Realizados',
    `Escenarios evaluados y su descripción oficial en ${data.companyName} (${data.periodText})`,
    slidePage++,
    totalSlides
  );

  if (data.exercises.length > 0) {
    const visibleExercises = data.exercises.slice(0, 12);
    const exDescRows: any[][] = [
      [
        {
          text: '#',
          options: { bold: true, fontSize: 9.5, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' }
        },
        {
          text: 'Ejercicio Realizado',
          options: { bold: true, fontSize: 9.5, color: COLORS.white, fill: { color: COLORS.navy }, align: 'left' }
        },
        {
          text: 'Descripción Oficial del Escenario',
          options: { bold: true, fontSize: 9.5, color: COLORS.white, fill: { color: COLORS.navy }, align: 'left' }
        },
        {
          text: 'Evs.',
          options: { bold: true, fontSize: 9.5, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' }
        }
      ]
    ];

    visibleExercises.forEach((ex, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : 'F1F5F9';
      exDescRows.push([
        { text: String(idx + 1), options: { fill: { color: bg }, fontSize: 9, bold: true, color: COLORS.slate, align: 'center' } },
        { text: ex.nombre, options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: COLORS.navy, align: 'left' } },
        { text: ex.descripcion, options: { fill: { color: bg }, fontSize: 9, color: COLORS.slate, align: 'left' } },
        { text: String(ex.totalEvaluaciones), options: { fill: { color: bg }, fontSize: 9, bold: true, color: COLORS.sky, align: 'center' } }
      ]);
    });

    const rowHeight = visibleExercises.length <= 6 ? 0.72 : visibleExercises.length <= 9 ? 0.54 : 0.42;
    sDesc.addTable(exDescRows, {
      x: 0.6,
      y: 1.25,
      w: 12.133,
      colW: [0.55, 3.25, 7.433, 0.9],
      rowH: rowHeight,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });
  } else {
    sDesc.addText('No hay ejercicios registrados para los filtros seleccionados.', {
      x: 0.6,
      y: 3.5,
      w: 12.1,
      h: 0.5,
      align: 'center',
      fontSize: 13,
      color: COLORS.muted
    });
  }

  // =========================================================================
  // SLIDE 3: RESUMEN DE KPIs Y DISTRIBUCIÓN DE APTITUD
  // =========================================================================
  const s2 = pres.addSlide();
  addSlideHeader(
    s2,
    'Resumen Ejecutivo y Calificaciones',
    `${data.companyName}  •  ${data.periodText}  •  ${data.sedesText}`,
    slidePage++,
    totalSlides
  );

  const kpis = [
    {
      label: 'OPERADORES',
      value: String(data.totalConductores),
      sub: `${data.totalEvaluaciones} evaluaciones`,
      color: COLORS.sky
    },
    {
      label: 'PROMEDIO GLOBAL',
      value: data.promedioFinal.toFixed(2),
      sub: 'Escala 0 - 10 pts',
      color: data.promedioFinal >= 8 ? COLORS.green : data.promedioFinal >= 6 ? COLORS.sky : COLORS.red
    },
    {
      label: 'TASA APROBACIÓN',
      value: `${data.tasaAprobacion.toFixed(1)}%`,
      sub: 'Calificación ≥ 6.0 pts',
      color: data.tasaAprobacion >= 80 ? COLORS.green : data.tasaAprobacion >= 60 ? COLORS.amber : COLORS.red
    },
    {
      label: data.recurrenceTitle,
      value: data.recurrenceValue,
      sub: data.recurrenceSubtext,
      color: COLORS.purple
    },
    {
      label: 'TASA DE ACCIDENTES',
      value: data.criticalSummary.incidentRate,
      sub: `${data.criticalSummary.totalIncidentes} eventos / op.`,
      color: Number(data.criticalSummary.incidentRate) > 1 ? COLORS.red : Number(data.criticalSummary.incidentRate) > 0 ? COLORS.amber : COLORS.green
    }
  ];

  kpis.forEach((k, idx) => {
    const x = 0.6 + idx * 2.46;
    s2.addShape('roundRect', {
      x,
      y: 1.3,
      w: 2.3,
      h: 1.55,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 }
    });
    s2.addShape('roundRect', {
      x: x + 0.16,
      y: 1.4,
      w: 1.98,
      h: 0.05,
      rectRadius: 0.02,
      fill: { color: k.color }
    });
    s2.addText(k.label, {
      x: x + 0.12,
      y: 1.54,
      w: 2.06,
      h: 0.25,
      align: 'center',
      fontSize: 8.5,
      bold: true,
      color: COLORS.muted,
      fontFace: 'Segoe UI'
    });
    s2.addText(k.value, {
      x: x + 0.12,
      y: 1.82,
      w: 2.06,
      h: 0.55,
      align: 'center',
      fontSize: 26,
      bold: true,
      color: k.color,
      fontFace: 'Segoe UI'
    });
    s2.addText(k.sub, {
      x: x + 0.12,
      y: 2.45,
      w: 2.06,
      h: 0.28,
      align: 'center',
      fontSize: 8.5,
      color: COLORS.muted,
      fontFace: 'Segoe UI'
    });
  });

  // Panel Distribución de Aptitud
  s2.addShape('roundRect', {
    x: 0.6,
    y: 3.15,
    w: 7.4,
    h: 3.65,
    rectRadius: 0.08,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 }
  });
  s2.addText('Distribución de Aptitud de la Flota', {
    x: 0.85,
    y: 3.3,
    w: 6.8,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: COLORS.navy,
    fontFace: 'Segoe UI'
  });

  if (data.totalConductores > 0) {
    s2.addChart(
      pres.ChartType.doughnut,
      [
        {
          name: 'Aptitud',
          labels: [
            `Sobresaliente (≥8.0): ${data.aptitude.sobresalientes}`,
            `Aprobado (6.0-7.9): ${data.aptitude.aprobados}`,
            `Requiere Refuerzo (<6.0): ${data.aptitude.refuerzo}`
          ],
          values: [data.aptitude.sobresalientes, data.aptitude.aprobados, data.aptitude.refuerzo]
        }
      ],
      {
        x: 0.85,
        y: 3.75,
        w: 6.9,
        h: 2.9,
        chartColors: [COLORS.green, COLORS.sky, COLORS.red],
        showLegend: true,
        legendPos: 'r',
        legendFontSize: 10,
        showPercent: true,
        dataLabelColor: COLORS.white,
        dataLabelFontBold: true
      }
    );
  } else {
    s2.addText('Sin operadores calificados en el periodo seleccionado.', {
      x: 0.85,
      y: 4.6,
      w: 6.8,
      h: 0.4,
      align: 'center',
      fontSize: 11,
      color: COLORS.muted
    });
  }

  // Panel de desglose rápido a la derecha
  s2.addShape('roundRect', {
    x: 8.25,
    y: 3.15,
    w: 4.48,
    h: 3.65,
    rectRadius: 0.08,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 }
  });
  s2.addText('Indicadores por Nivel', {
    x: 8.5,
    y: 3.3,
    w: 4.0,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: COLORS.navy,
    fontFace: 'Segoe UI'
  });

  const levels = [
    {
      title: 'Sobresaliente (≥ 8.0)',
      count: data.aptitude.sobresalientes,
      pct: data.aptitude.pctSobresalientes,
      bg: COLORS.greenLight,
      fg: COLORS.green
    },
    {
      title: 'Aprobado (6.0 - 7.9)',
      count: data.aptitude.aprobados,
      pct: data.aptitude.pctAprobados,
      bg: COLORS.skyLight,
      fg: COLORS.sky
    },
    {
      title: 'Requiere Refuerzo (< 6.0)',
      count: data.aptitude.refuerzo,
      pct: data.aptitude.pctRefuerzo,
      bg: COLORS.redLight,
      fg: COLORS.red
    }
  ];

  levels.forEach((lv, idx) => {
    const y = 3.82 + idx * 0.95;
    s2.addShape('roundRect', {
      x: 8.5,
      y,
      w: 3.98,
      h: 0.8,
      rectRadius: 0.06,
      fill: { color: lv.bg },
      line: { color: lv.fg, width: 0.75 }
    });
    s2.addText(lv.title, {
      x: 8.68,
      y: y + 0.12,
      w: 2.5,
      h: 0.25,
      fontSize: 10,
      bold: true,
      color: COLORS.navy,
      fontFace: 'Segoe UI'
    });
    s2.addText(`${lv.count} operadores`, {
      x: 8.68,
      y: y + 0.4,
      w: 2.5,
      h: 0.25,
      fontSize: 9,
      color: COLORS.slate,
      fontFace: 'Segoe UI'
    });
    s2.addText(`${lv.pct}%`, {
      x: 11.2,
      y: y + 0.18,
      w: 1.15,
      h: 0.45,
      align: 'right',
      fontSize: 18,
      bold: true,
      color: lv.fg,
      fontFace: 'Segoe UI'
    });
  });

  // =========================================================================
  // SLIDE EXTRA (MULTIANUAL): EVOLUCIÓN HISTÓRICA POST-CAPACITACIÓN
  // =========================================================================
  if (hasEvolutionSlide) {
    const sEvo = pres.addSlide();
    const yrs = data.annualEvolution.years;
    const firstYear = yrs[0];
    const lastYear = yrs[yrs.length - 1];

    addSlideHeader(
      sEvo,
      'Evolución Histórica Post-Capacitación',
      `Comparativa anual ${firstYear.year} – ${lastYear.year} e impacto de seguimiento en ${data.companyName}`,
      slidePage++,
      totalSlides
    );

    // Gráfica 1 (arriba izquierda): Tendencia Anual de Calificación Promedio
    sEvo.addShape('roundRect', {
      x: 0.6,
      y: 1.25,
      w: 6.15,
      h: 2.68,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 }
    });
    sEvo.addText('Tendencia Anual: Calificación Promedio (0 - 10 pts)', {
      x: 0.82,
      y: 1.34,
      w: 5.7,
      h: 0.28,
      fontSize: 11,
      bold: true,
      color: COLORS.navy,
      fontFace: 'Segoe UI'
    });

    sEvo.addChart(
      pres.ChartType.line,
      [
        {
          name: 'Promedio Global',
          labels: yrs.map((y) => y.year),
          values: yrs.map((y) => y.promedio)
        }
      ],
      {
        x: 0.78,
        y: 1.66,
        w: 5.8,
        h: 2.18,
        chartColors: [COLORS.sky],
        lineSize: 3,
        lineSmooth: true,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 7,
        showLegend: false,
        valAxisMinVal: 0,
        valAxisMaxVal: 10,
        showValue: true,
        dataLabelFormatCode: '0.00',
        dataLabelPosition: 't',
        dataLabelFontSize: 9,
        dataLabelColor: COLORS.sky
      }
    );

    // Gráfica 2 (abajo izquierda): Tendencia Anual de Tasa de Accidentes
    sEvo.addShape('roundRect', {
      x: 0.6,
      y: 4.1,
      w: 6.15,
      h: 2.7,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 }
    });
    sEvo.addText('Tendencia Anual: Tasa de Accidentes (eventos / operador)', {
      x: 0.82,
      y: 4.19,
      w: 5.7,
      h: 0.28,
      fontSize: 11,
      bold: true,
      color: COLORS.navy,
      fontFace: 'Segoe UI'
    });

    sEvo.addChart(
      pres.ChartType.line,
      [
        {
          name: 'Tasa de Accidentes',
          labels: yrs.map((y) => y.year),
          values: yrs.map((y) => y.tasaAccidentes)
        }
      ],
      {
        x: 0.78,
        y: 4.51,
        w: 5.8,
        h: 2.2,
        chartColors: [COLORS.red],
        lineSize: 3,
        lineSmooth: true,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 7,
        showLegend: false,
        valAxisMinVal: 0,
        showValue: true,
        dataLabelFormatCode: '0.00',
        dataLabelPosition: 't',
        dataLabelFontSize: 9,
        dataLabelColor: COLORS.red
      }
    );

    // Tabla derecha superior: Comparativa Año con Año
    const evoRows: any[][] = [
      [
        { text: 'Año', options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' } },
        { text: 'Ops.', options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' } },
        { text: 'Promedio', options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' } },
        { text: 'Aprob.', options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' } },
        { text: 'Tasa Acc.', options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' } }
      ]
    ];

    yrs.slice(-7).forEach((y, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : 'F1F5F9';
      const pColor = y.promedio >= 8 ? COLORS.green : y.promedio >= 6 ? COLORS.sky : COLORS.red;
      const aColor = y.tasaAccidentes > 1 ? COLORS.red : y.tasaAccidentes > 0 ? COLORS.amber : COLORS.green;
      evoRows.push([
        { text: y.year, options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: COLORS.navy, align: 'center' } },
        { text: String(y.operadores), options: { fill: { color: bg }, fontSize: 9, color: COLORS.slate, align: 'center' } },
        { text: y.promedio.toFixed(2), options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: pColor, align: 'center' } },
        { text: `${y.tasaAprobacion.toFixed(1)}%`, options: { fill: { color: bg }, fontSize: 9, color: COLORS.slate, align: 'center' } },
        { text: y.tasaAccidentes.toFixed(2), options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: aColor, align: 'center' } }
      ]);
    });

    sEvo.addTable(evoRows, {
      x: 6.95,
      y: 1.25,
      w: 5.78,
      colW: [1.0, 0.9, 1.35, 1.25, 1.28],
      rowH: 0.36,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });

    // Tarjeta derecha inferior: Impacto tras las capacitaciones
    sEvo.addShape('roundRect', {
      x: 6.95,
      y: 4.5,
      w: 5.78,
      h: 2.3,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.sky, width: 1.25 }
    });
    sEvo.addShape('roundRect', {
      x: 7.11,
      y: 4.62,
      w: 5.46,
      h: 0.38,
      rectRadius: 0.05,
      fill: { color: COLORS.skyLight }
    });
    sEvo.addText('Impacto Medido Tras Capacitaciones', {
      x: 7.22,
      y: 4.66,
      w: 5.24,
      h: 0.3,
      fontSize: 11.5,
      bold: true,
      color: COLORS.sky,
      fontFace: 'Segoe UI'
    });

    const scoreDelta = data.annualEvolution.scoreDeltaFirstToLast;
    const accDelta = data.annualEvolution.accidentRateDeltaFirstToLast;
    const scoreSign = scoreDelta >= 0 ? '+' : '';
    const accSign = accDelta > 0 ? '+' : '';

    const rec = data.annualEvolution.recurrentImpact;
    const recurrentLine =
      rec.count > 0
        ? `• Operadores recurrentes (${rec.count}): pasaron de ${rec.firstAvg.toFixed(2)} a ${rec.latestAvg.toFixed(2)} pts (${rec.improvedCount} mejoraron o mantuvieron nivel).`
        : '• Aún no se registran operadores evaluados en más de una ocasión dentro del periodo.';

    sEvo.addText(
      [
        {
          text: `• Variación en Promedio (${firstYear.year} → ${lastYear.year}): `,
          options: { bold: true, color: COLORS.navy }
        },
        {
          text: `${scoreSign}${scoreDelta.toFixed(2)} pts\n`,
          options: { bold: true, color: scoreDelta >= 0 ? COLORS.green : COLORS.red }
        },
        {
          text: `• Variación en Tasa de Accidentes (${firstYear.year} → ${lastYear.year}): `,
          options: { bold: true, color: COLORS.navy }
        },
        {
          text: `${accSign}${accDelta.toFixed(2)} eventos/op.\n`,
          options: { bold: true, color: accDelta <= 0 ? COLORS.green : COLORS.red }
        },
        {
          text: recurrentLine,
          options: { color: COLORS.slate }
        }
      ],
      {
        x: 7.15,
        y: 5.05,
        w: 5.38,
        h: 1.65,
        fontSize: 10,
        fontFace: 'Segoe UI',
        valign: 'top',
        paraSpaceAfter: 6
      }
    );
  }

  // =========================================================================
  // SLIDE: RENDIMIENTO POR EJERCICIOS REALIZADOS
  // =========================================================================
  const s3 = pres.addSlide();
  addSlideHeader(
    s3,
    'Rendimiento en Ejercicios Realizados',
    `${data.exercises.length} ejercicios evaluados en ${data.companyName} (${data.periodText})`,
    slidePage++,
    totalSlides
  );

  if (data.exercises.length > 0) {
    const chartExercises = data.exercises.slice(0, 12);
    s3.addChart(
      pres.ChartType.bar,
      [
        {
          name: 'Promedio',
          labels: chartExercises.map((e) => (e.nombre.length > 22 ? `${e.nombre.slice(0, 20)}...` : e.nombre)),
          values: chartExercises.map((e) => e.promedio)
        }
      ],
      {
        x: 0.6,
        y: 1.25,
        w: 6.45,
        h: 5.55,
        barDir: 'bar',
        chartColors: [COLORS.sky],
        showLegend: false,
        valAxisMinVal: 0,
        valAxisMaxVal: 10,
        showValue: true,
        dataLabelFormatCode: '0.00',
        dataLabelFontSize: 9,
        dataLabelColor: COLORS.navy,
        catAxisLabelFontSize: 8.5
      }
    );

    const exRows: any[][] = [
      [
        {
          text: 'Ejercicio',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'left' }
        },
        {
          text: 'Evs.',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' }
        },
        {
          text: 'Promedio',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' }
        },
        {
          text: 'Nivel',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.navy }, align: 'center' }
        }
      ]
    ];

    if (data.exercisesByYear.length >= 2) {
      data.exercisesByYear.forEach((group) => {
        if (exRows.length >= 20) return;
        exRows.push([
          {
            text: `Año ${group.year} (${group.exercises.length} ejercicios)`,
            options: {
              colspan: 4,
              bold: true,
              fontSize: 8.5,
              color: COLORS.sky,
              fill: { color: COLORS.skyLight },
              align: 'left'
            }
          }
        ]);

        group.exercises.forEach((ex, idx) => {
          if (exRows.length >= 20) return;
          const bg = idx % 2 === 0 ? COLORS.white : 'F8FAFC';
          const color = ex.promedio >= 8 ? COLORS.green : ex.promedio >= 6 ? COLORS.sky : COLORS.red;
          exRows.push([
            { text: ex.nombre, options: { fill: { color: bg }, fontSize: 8, bold: true, color: COLORS.navy, align: 'left' } },
            { text: String(ex.totalEvaluaciones), options: { fill: { color: bg }, fontSize: 8, color: COLORS.slate, align: 'center' } },
            { text: `${ex.promedio.toFixed(2)}`, options: { fill: { color: bg }, fontSize: 8, bold: true, color, align: 'center' } },
            { text: ex.nivel, options: { fill: { color: bg }, fontSize: 7.5, bold: true, color, align: 'center' } }
          ]);
        });
      });
    } else {
      data.exercises.slice(0, 14).forEach((ex, idx) => {
        const bg = idx % 2 === 0 ? COLORS.white : 'F1F5F9';
        const color = ex.promedio >= 8 ? COLORS.green : ex.promedio >= 6 ? COLORS.sky : COLORS.red;
        exRows.push([
          { text: ex.nombre, options: { fill: { color: bg }, fontSize: 8.5, bold: true, color: COLORS.navy, align: 'left' } },
          { text: String(ex.totalEvaluaciones), options: { fill: { color: bg }, fontSize: 8.5, color: COLORS.slate, align: 'center' } },
          { text: `${ex.promedio.toFixed(2)}`, options: { fill: { color: bg }, fontSize: 8.5, bold: true, color, align: 'center' } },
          { text: ex.nivel, options: { fill: { color: bg }, fontSize: 8, bold: true, color, align: 'center' } }
        ]);
      });
    }

    const exRowH = exRows.length > 15 ? 0.27 : exRows.length > 10 ? 0.31 : 0.34;
    s3.addTable(exRows, {
      x: 7.2,
      y: 1.25,
      w: 5.53,
      colW: [2.73, 0.65, 0.85, 1.3],
      rowH: exRowH,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });
  } else {
    s3.addText('No hay ejercicios registrados para los filtros seleccionados.', {
      x: 0.6,
      y: 3.5,
      w: 12.1,
      h: 0.5,
      align: 'center',
      fontSize: 13,
      color: COLORS.muted
    });
  }

  // =========================================================================
  // SLIDE 5: SEGURIDAD VIAL, ERRORES CRÍTICOS Y PUNTOS DÉBILES
  // =========================================================================
  const s4 = pres.addSlide();
  addSlideHeader(
    s4,
    'Seguridad Vial y Errores Críticos',
    `Incidencias críticas y patrones frecuentes detectados en ${data.companyName}`,
    slidePage++,
    totalSlides
  );

  // Panel izquierdo: Incidencias Críticas
  const hasCriticals = data.criticalSummary.totalIncidentes > 0;
  s4.addShape('roundRect', {
    x: 0.6,
    y: 1.25,
    w: 5.9,
    h: 5.55,
    rectRadius: 0.08,
    fill: { color: COLORS.white },
    line: { color: hasCriticals ? 'FCA5A5' : '86EFAC', width: 1.25 }
  });

  s4.addShape('roundRect', {
    x: 0.78,
    y: 1.4,
    w: 5.54,
    h: 0.44,
    rectRadius: 0.06,
    fill: { color: hasCriticals ? COLORS.redLight : COLORS.greenLight }
  });
  s4.addText(
    hasCriticals
      ? `Incidencias Críticas Acumuladas (${data.criticalSummary.totalIncidentes} en total)`
      : 'Conducción Segura sin Incidentes Críticos',
    {
      x: 0.9,
      y: 1.45,
      w: 5.3,
      h: 0.34,
      fontSize: 11.5,
      bold: true,
      color: hasCriticals ? COLORS.red : COLORS.green,
      fontFace: 'Segoe UI'
    }
  );

  if (hasCriticals) {
    const critRows: any[][] = [
      [
        {
          text: 'Tipo de Incidencia Crítica',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: '991B1B' }, align: 'left' }
        },
        {
          text: 'Conteo',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: '991B1B' }, align: 'center' }
        }
      ]
    ];
    data.criticalSummary.items.slice(0, 11).forEach((item, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : 'FEF2F2';
      critRows.push([
        { text: item.error, options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: COLORS.navy, align: 'left' } },
        { text: String(item.repeticiones), options: { fill: { color: bg }, fontSize: 10, bold: true, color: COLORS.red, align: 'center' } }
      ]);
    });
    s4.addTable(critRows, {
      x: 0.78,
      y: 2.0,
      w: 5.54,
      colW: [4.34, 1.2],
      rowH: 0.38,
      border: { pt: 0.5, color: 'FECACA' },
      valign: 'middle'
    });
  } else {
    s4.addText('La flota no registró incidencias críticas durante el periodo evaluado.', {
      x: 0.9,
      y: 3.4,
      w: 5.3,
      h: 0.8,
      align: 'center',
      fontSize: 12,
      color: COLORS.green,
      bold: true
    });
  }

  // Panel derecho: Errores Frecuentes en Simulador
  s4.addShape('roundRect', {
    x: 6.8,
    y: 1.25,
    w: 5.93,
    h: 5.55,
    rectRadius: 0.08,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 }
  });
  s4.addShape('roundRect', {
    x: 6.98,
    y: 1.4,
    w: 5.57,
    h: 0.44,
    rectRadius: 0.06,
    fill: { color: COLORS.slateDark }
  });
  s4.addText('Top Errores Frecuentes en Telemetría', {
    x: 7.1,
    y: 1.45,
    w: 5.33,
    h: 0.34,
    fontSize: 11.5,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });

  if (data.topMistakes.length > 0) {
    const errRows: any[][] = [
      [
        {
          text: 'Error Detectado',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.sky }, align: 'left' }
        },
        {
          text: 'Repeticiones',
          options: { bold: true, fontSize: 9, color: COLORS.white, fill: { color: COLORS.sky }, align: 'center' }
        }
      ]
    ];
    data.topMistakes.forEach((m, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : 'F1F5F9';
      errRows.push([
        { text: m.error, options: { fill: { color: bg }, fontSize: 9, color: COLORS.navy, align: 'left' } },
        { text: `${m.repeticiones}×`, options: { fill: { color: bg }, fontSize: 9.5, bold: true, color: COLORS.sky, align: 'center' } }
      ]);
    });
    s4.addTable(errRows, {
      x: 6.98,
      y: 2.0,
      w: 5.57,
      colW: [4.27, 1.3],
      rowH: 0.42,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });
  } else {
    s4.addText('Sin desglose de errores frecuentes registrado en estas sesiones.', {
      x: 7.1,
      y: 3.4,
      w: 5.3,
      h: 0.8,
      align: 'center',
      fontSize: 11,
      color: COLORS.muted
    });
  }

  // =========================================================================
  // SLIDE 6: CUADRO DE HONOR - TOP 10 MEJORES CONDUCTORES
  // =========================================================================
  const s5 = pres.addSlide();
  addSlideHeader(
    s5,
    'Cuadro de Honor: Top 10 Mejores Conductores',
    `Operadores con mejor desempeño promedio en ${data.companyName} (${data.periodText})`,
    slidePage++,
    totalSlides
  );

  if (data.top10Best.length > 0) {
    s5.addTable(buildDriverTableRows(data.top10Best, false), {
      x: 0.6,
      y: 1.25,
      w: 12.133,
      colW: [0.55, 4.183, 2.2, 1.0, 1.35, 1.15, 1.7],
      rowH: 0.48,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });
  } else {
    s5.addText('No hay conductores registrados.', {
      x: 0.6,
      y: 3.5,
      w: 12.1,
      h: 0.4,
      align: 'center',
      color: COLORS.muted
    });
  }

  // =========================================================================
  // SLIDE 7: ATENCIÓN PRIORITARIA - TOP 10 PEORES CONDUCTORES Y PLAN DE ACCIÓN
  // =========================================================================
  const s6 = pres.addSlide();
  addSlideHeader(
    s6,
    'Atención Prioritaria: Top 10 Conductores con Menor Desempeño',
    `Operadores prioritarios para refuerzo técnico y plan de acción en ${data.companyName}`,
    slidePage++,
    totalSlides
  );

  if (data.top10Worst.length > 0) {
    s6.addTable(buildDriverTableRows(data.top10Worst, true), {
      x: 0.6,
      y: 1.22,
      w: 12.133,
      colW: [0.55, 4.183, 2.2, 1.0, 1.35, 1.15, 1.7],
      rowH: 0.42,
      border: { pt: 0.5, color: COLORS.border },
      valign: 'middle'
    });
  }

  // Plan de Acción Recomendado al pie de la diapositiva
  s6.addShape('roundRect', {
    x: 0.6,
    y: 6.08,
    w: 12.133,
    h: 0.85,
    rectRadius: 0.06,
    fill: { color: COLORS.skyLight },
    line: { color: COLORS.sky, width: 1 }
  });
  s6.addText('PLAN DE ACCIÓN RECOMENDADO:', {
    x: 0.8,
    y: 6.15,
    w: 11.7,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: COLORS.sky,
    fontFace: 'Segoe UI'
  });
  s6.addText(data.actionPlan, {
    x: 0.8,
    y: 6.38,
    w: 11.7,
    h: 0.48,
    fontSize: 9.5,
    color: COLORS.navy,
    fontFace: 'Segoe UI',
    valign: 'top'
  });

  // =========================================================================
  // SLIDE OPCIONAL: CONCLUSIONES EJECUTIVAS Y PLAN ANUAL (IA)
  // =========================================================================
  if (input.aiReport) {
    const ai = input.aiReport;
    const qualityLabel =
      typeof input.aiQuality?.score === 'number'
        ? ` • Calidad ${input.aiQuality.score}/100`
        : '';
    const cacheLabel = input.aiCached ? ' • Caché' : '';
    const warningLabel = input.aiWarning ? ' • Motor local / Corrección aplicada' : '';
    const sAi = pres.addSlide();
    addSlideHeader(
      sAi,
      'Conclusiones Ejecutivas y Plan Anual',
      `${input.aiSourceLabel || 'Síntesis Ejecutiva con IA'}${qualityLabel}${cacheLabel}${warningLabel} • ${data.companyName} (${data.periodText})`,
      slidePage++,
      totalSlides
    );

    const nivelPalette: Record<
      CompanyAiStructuredReport['estadoGeneral']['nivel'],
      { label: string; accent: string; bg: string; border: string }
    > = {
      sobresaliente: { label: 'NIVEL SOBRESALIENTE', accent: COLORS.green, bg: 'F0FDF4', border: '86EFAC' },
      bueno: { label: 'BUEN DESEMPEÑO', accent: COLORS.sky, bg: 'F0F9FF', border: '7DD3FC' },
      atencion: { label: 'REQUIERE ATENCIÓN', accent: COLORS.amber, bg: 'FFFBEB', border: 'FCD34D' },
      critico: { label: 'ATENCIÓN PRIORITARIA', accent: COLORS.red, bg: 'FEF2F2', border: 'FCA5A5' }
    };
    const pal = nivelPalette[ai.estadoGeneral.nivel] || nivelPalette.atencion;

    // Fila superior izquierda: Semáforo de Estado General
    sAi.addShape('roundRect', {
      x: 0.6,
      y: 1.15,
      w: 7.45,
      h: 1.14,
      rectRadius: 0.08,
      fill: { color: pal.bg },
      line: { color: pal.border, width: 1 }
    });
    sAi.addShape('roundRect', {
      x: 0.72,
      y: 1.27,
      w: 0.08,
      h: 0.9,
      rectRadius: 0.04,
      fill: { color: pal.accent }
    });
    sAi.addText(pal.label, {
      x: 0.9,
      y: 1.22,
      w: 6.95,
      h: 0.2,
      fontSize: 7.5,
      bold: true,
      color: pal.accent,
      fontFace: 'Segoe UI'
    });
    sAi.addText(ai.estadoGeneral.titulo, {
      x: 0.9,
      y: 1.42,
      w: 6.95,
      h: 0.28,
      fontSize: 12,
      bold: true,
      color: COLORS.navy,
      fontFace: 'Segoe UI'
    });
    sAi.addText(ai.estadoGeneral.resumenSimple, {
      x: 0.9,
      y: 1.7,
      w: 6.95,
      h: 0.54,
      fontSize: 9,
      color: COLORS.slateDark,
      fontFace: 'Segoe UI',
      valign: 'top'
    });

    // Fila superior derecha: Metas para el Próximo Año
    sAi.addShape('roundRect', {
      x: 8.23,
      y: 1.15,
      w: 4.5,
      h: 1.14,
      rectRadius: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 }
    });
    sAi.addText('METAS PARA EL PRÓXIMO AÑO', {
      x: 8.38,
      y: 1.22,
      w: 4.2,
      h: 0.2,
      fontSize: 8,
      bold: true,
      color: COLORS.purple,
      fontFace: 'Segoe UI'
    });
    const metaRuns: any[] = [];
    ai.metasSimples.slice(0, 3).forEach((m, idx) => {
      if (idx > 0) metaRuns.push({ text: '\n' });
      metaRuns.push({ text: `${m.indicador}: `, options: { bold: true, color: COLORS.navy, fontSize: 8.5 } });
      metaRuns.push({ text: `${m.actual} → `, options: { color: COLORS.slate, fontSize: 8.5 } });
      metaRuns.push({ text: m.meta, options: { bold: true, color: COLORS.green, fontSize: 8.5 } });
    });
    if (metaRuns.length > 0) {
      sAi.addText(metaRuns, {
        x: 8.38,
        y: 1.44,
        w: 4.2,
        h: 0.8,
        fontFace: 'Segoe UI',
        valign: 'top',
        paraSpaceAfter: 2
      });
    }

    // Fila media izquierda: Lo que está funcionando bien
    sAi.addShape('roundRect', {
      x: 0.6,
      y: 2.42,
      w: 5.95,
      h: 2.38,
      rectRadius: 0.08,
      fill: { color: 'F0FDF4' },
      line: { color: '86EFAC', width: 1 }
    });
    sAi.addShape('roundRect', {
      x: 0.74,
      y: 2.52,
      w: 5.67,
      h: 0.3,
      rectRadius: 0.06,
      fill: { color: COLORS.green }
    });
    sAi.addText('LO QUE ESTÁ FUNCIONANDO BIEN', {
      x: 0.86,
      y: 2.55,
      w: 5.43,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI'
    });
    const goodRuns: any[] = [];
    ai.loQueVaBien.slice(0, 3).forEach((item, idx) => {
      if (idx > 0) goodRuns.push({ text: '\n' });
      goodRuns.push({ text: `• ${item.titulo}: `, options: { bold: true, color: COLORS.navy, fontSize: 8.8 } });
      goodRuns.push({ text: item.detalle, options: { color: COLORS.slateDark, fontSize: 8.5 } });
    });
    if (goodRuns.length > 0) {
      sAi.addText(goodRuns, {
        x: 0.76,
        y: 2.9,
        w: 5.63,
        h: 1.82,
        fontFace: 'Segoe UI',
        valign: 'top',
        paraSpaceAfter: 4
      });
    }

    // Fila media derecha: Puntos a mejorar y riesgos
    sAi.addShape('roundRect', {
      x: 6.78,
      y: 2.42,
      w: 5.95,
      h: 2.38,
      rectRadius: 0.08,
      fill: { color: 'FFFBEB' },
      line: { color: 'FCD34D', width: 1 }
    });
    sAi.addShape('roundRect', {
      x: 6.92,
      y: 2.52,
      w: 5.67,
      h: 0.3,
      rectRadius: 0.06,
      fill: { color: COLORS.amber }
    });
    sAi.addText('PUNTOS A MEJORAR Y RIESGOS', {
      x: 7.04,
      y: 2.55,
      w: 5.43,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI'
    });
    const riskRuns: any[] = [];
    ai.focosDeAtencion.slice(0, 3).forEach((item, idx) => {
      if (idx > 0) riskRuns.push({ text: '\n' });
      if (item.nivel === 'alto') {
        riskRuns.push({ text: '[PRIORIDAD ALTA] ', options: { bold: true, color: COLORS.red, fontSize: 8 } });
      }
      riskRuns.push({ text: `${item.titulo}: `, options: { bold: true, color: COLORS.navy, fontSize: 8.8 } });
      riskRuns.push({ text: item.porqueImporta, options: { color: COLORS.slateDark, fontSize: 8.5 } });
    });
    const priorityDrivers = data.top10Worst.slice(0, 3).map((driver) => driver.nombre);
    const worstExercise = data.exercises.find((exercise) => exercise.nivel === 'Reforzar') || data.exercises[0];
    if (priorityDrivers.length > 0 || worstExercise) {
      riskRuns.push({ text: '\nPrioridad operativa: ', options: { bold: true, color: COLORS.red, fontSize: 8 } });
      if (priorityDrivers.length > 0) {
        riskRuns.push({
          text: priorityDrivers.join(', '),
          options: { bold: true, color: COLORS.navy, fontSize: 8.2 }
        });
      }
      if (worstExercise) {
        riskRuns.push({
          text: `${priorityDrivers.length > 0 ? ' • ' : ''}Reforzar ${worstExercise.nombre} (${worstExercise.promedio.toFixed(1)}/10)`,
          options: { color: COLORS.slateDark, fontSize: 8.2 }
        });
      }
    }
    if (riskRuns.length > 0) {
      sAi.addText(riskRuns, {
        x: 6.94,
        y: 2.9,
        w: 5.63,
        h: 1.82,
        fontFace: 'Segoe UI',
        valign: 'top',
        paraSpaceAfter: 4
      });
    }

    // Fila inferior: Plan de Capacitación Sugerido para el Próximo Año
    sAi.addShape('roundRect', {
      x: 0.6,
      y: 4.94,
      w: 12.133,
      h: 2.02,
      rectRadius: 0.08,
      fill: { color: 'F0F9FF' },
      line: { color: '7DD3FC', width: 1 }
    });
    sAi.addShape('roundRect', {
      x: 0.76,
      y: 5.04,
      w: 11.813,
      h: 0.3,
      rectRadius: 0.06,
      fill: { color: COLORS.sky }
    });
    sAi.addText('PLAN DE CAPACITACIÓN SUGERIDO PARA EL PRÓXIMO AÑO', {
      x: 0.9,
      y: 5.07,
      w: 11.5,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI'
    });

    const recommendations = ai.planDeAccion
      .filter((step) => step.accion.trim().length > 0)
      .filter((step, index, steps) => steps.findIndex((candidate) => candidate.accion.trim() === step.accion.trim()) === index)
      .slice(0, 3);
    recommendations.forEach((step, idx) => {
      const cardX = 0.76 + idx * 4.01;
      sAi.addShape('roundRect', {
        x: cardX,
        y: 5.44,
        w: 3.78,
        h: 1.42,
        rectRadius: 0.07,
        fill: { color: COLORS.white },
        line: { color: 'BAE6FD', width: 0.75 }
      });
      sAi.addText(`Recomendación ${idx + 1}`, {
        x: cardX + 0.12,
        y: 5.54,
        w: 3.54,
        h: 0.22,
        fontSize: 8,
        bold: true,
        color: COLORS.sky,
        fontFace: 'Segoe UI'
      });
      sAi.addText(step.accion, {
        x: cardX + 0.12,
        y: 5.82,
        w: 3.54,
        h: 0.58,
        fontSize: 8.5,
        bold: true,
        color: COLORS.navy,
        fontFace: 'Segoe UI',
        valign: 'top'
      });
      sAi.addText(`Impacto: ${step.impacto}`, {
        x: cardX + 0.12,
        y: 6.42,
        w: 3.54,
        h: 0.34,
        fontSize: 7.8,
        color: COLORS.muted,
        fontFace: 'Segoe UI',
        valign: 'top'
      });
    });
  }

  // =========================================================================
  // SLIDE FINAL: CIERRE, ACCESO A PLATAFORMA Y CONTACTO
  // =========================================================================
  const sClose = pres.addSlide();
  sClose.background = { color: COLORS.navy };
  sClose.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.1, fill: { color: 'F97316' } });

  sClose.addText('¡Gracias por su atención!', {
    x: 0.8,
    y: 0.35,
    w: 11.733,
    h: 0.5,
    align: 'center',
    fontSize: 26,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });
  sClose.addText('Acceso a la plataforma y canales oficiales de contacto', {
    x: 0.8,
    y: 0.88,
    w: 11.733,
    h: 0.3,
    align: 'center',
    fontSize: 11.5,
    color: '94A3B8',
    fontFace: 'Segoe UI'
  });

  // Tarjeta izquierda: Acceso a TrackSIM Cloud Analytics
  sClose.addShape('roundRect', {
    x: 0.95,
    y: 1.38,
    w: 5.45,
    h: 3.55,
    rectRadius: 0.08,
    fill: { color: COLORS.slateDark },
    line: { color: COLORS.sky, width: 1.25 }
  });
  sClose.addShape('roundRect', {
    x: 1.15,
    y: 1.54,
    w: 5.05,
    h: 0.38,
    rectRadius: 0.06,
    fill: { color: COLORS.sky }
  });
  sClose.addText('PLATAFORMA TRACKSIM CLOUD', {
    x: 1.25,
    y: 1.58,
    w: 4.85,
    h: 0.3,
    align: 'center',
    fontSize: 11,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });

  sClose.addShape('roundRect', {
    x: 2.6,
    y: 2.06,
    w: 2.15,
    h: 2.15,
    rectRadius: 0.06,
    fill: { color: COLORS.white }
  });
  if (cloudQrDataUrl) {
    sClose.addImage({
      data: cloudQrDataUrl,
      x: 2.7,
      y: 2.16,
      w: 1.95,
      h: 1.95
    });
  }

  sClose.addText(TRACKSIM_CLOUD_URL, {
    x: 1.15,
    y: 4.32,
    w: 5.05,
    h: 0.3,
    align: 'center',
    fontSize: 12,
    bold: true,
    color: '38BDF8',
    underline: { style: 'sng' },
    hyperlink: { url: TRACKSIM_CLOUD_URL },
    fontFace: 'Segoe UI'
  });
  sClose.addText('Consulta métricas, expedientes y evolución en línea', {
    x: 1.25,
    y: 4.62,
    w: 4.85,
    h: 0.25,
    align: 'center',
    fontSize: 9,
    color: 'CBD5E1',
    fontFace: 'Segoe UI'
  });

  // Tarjeta derecha: QR Linktree
  sClose.addShape('roundRect', {
    x: 6.93,
    y: 1.38,
    w: 5.45,
    h: 3.55,
    rectRadius: 0.08,
    fill: { color: COLORS.slateDark },
    line: { color: 'F97316', width: 1.25 }
  });
  sClose.addShape('roundRect', {
    x: 7.13,
    y: 1.54,
    w: 5.05,
    h: 0.38,
    rectRadius: 0.06,
    fill: { color: 'EA580C' }
  });
  sClose.addText('CANALES Y REDES (LINKTREE)', {
    x: 7.23,
    y: 1.58,
    w: 4.85,
    h: 0.3,
    align: 'center',
    fontSize: 11,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });

  sClose.addShape('roundRect', {
    x: 8.58,
    y: 2.06,
    w: 2.15,
    h: 2.15,
    rectRadius: 0.06,
    fill: { color: COLORS.white }
  });
  if (linktreeQrDataUrl) {
    sClose.addImage({
      data: linktreeQrDataUrl,
      x: 8.68,
      y: 2.16,
      w: 1.95,
      h: 1.95
    });
  }

  sClose.addText(LINKTREE_URL, {
    x: 7.13,
    y: 4.32,
    w: 5.05,
    h: 0.3,
    align: 'center',
    fontSize: 12,
    bold: true,
    color: 'FB923C',
    underline: { style: 'sng' },
    hyperlink: { url: LINKTREE_URL },
    fontFace: 'Segoe UI'
  });
  sClose.addText('Escanea para acceder a todos nuestros enlaces de contacto', {
    x: 7.23,
    y: 4.62,
    w: 4.85,
    h: 0.25,
    align: 'center',
    fontSize: 9,
    color: 'CBD5E1',
    fontFace: 'Segoe UI'
  });

  // Tarjeta inferior (ancho completo debajo de los 2 QR): Firma Ejecutiva
  sClose.addShape('roundRect', {
    x: 0.95,
    y: 5.15,
    w: 11.43,
    h: 1.72,
    rectRadius: 0.08,
    fill: { color: COLORS.slateDark },
    line: { color: '475569', width: 1 }
  });
  sClose.addShape('roundRect', {
    x: 1.15,
    y: 5.38,
    w: 0.08,
    h: 1.25,
    rectRadius: 0.04,
    fill: { color: 'F97316' }
  });

  sClose.addText('Mario Alberto Agraz Martínez', {
    x: 1.4,
    y: 5.45,
    w: 4.3,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: COLORS.white,
    fontFace: 'Segoe UI'
  });
  sClose.addText('Gerente de operaciones', {
    x: 1.4,
    y: 5.88,
    w: 4.3,
    h: 0.32,
    fontSize: 11.5,
    italic: true,
    color: 'FB923C',
    fontFace: 'Segoe UI'
  });
  sClose.addText('TrackSIM • Simulador de Manejo', {
    x: 1.4,
    y: 6.24,
    w: 4.3,
    h: 0.28,
    fontSize: 9.5,
    color: '94A3B8',
    fontFace: 'Segoe UI'
  });

  sClose.addShape('line', {
    x: 5.85,
    y: 5.38,
    w: 0,
    h: 1.25,
    line: { color: '475569', width: 0.75 }
  });

  sClose.addText(
    [
      { text: '📍  Av. Isaac Newton 232, Polanco V Sección, 11560\n', options: { color: 'E2E8F0', fontSize: 10.5 } },
      {
        text: '📞  +52 1 55 3656 2504\n',
        options: { color: '38BDF8', fontSize: 10.5, underline: { style: 'sng' }, hyperlink: { url: 'tel:+5215536562504' } }
      },
      {
        text: '✉️  magraz@corporativomaf.com\n',
        options: {
          color: '38BDF8',
          fontSize: 10.5,
          underline: { style: 'sng' },
          hyperlink: { url: 'mailto:magraz@corporativomaf.com' }
        }
      },
      {
        text: '🌐  www.tracksim.mx',
        options: {
          color: '38BDF8',
          fontSize: 10.5,
          underline: { style: 'sng' },
          hyperlink: { url: 'https://www.tracksim.mx' }
        }
      }
    ],
    {
      x: 6.15,
      y: 5.38,
      w: 6.0,
      h: 1.3,
      fontFace: 'Segoe UI',
      valign: 'middle',
      paraSpaceAfter: 5
    }
  );

  sClose.addText(`TrackSIM Cloud Analytics  •  Informe Ejecutivo  •  Diapositiva ${slidePage++} de ${totalSlides}`, {
    x: 0.6,
    y: 7.12,
    w: 12.133,
    h: 0.25,
    align: 'right',
    fontSize: 8.5,
    color: '94A3B8',
    fontFace: 'Segoe UI'
  });

  const safeCompany = sanitizeFileSegment(data.companyName) || 'Flota';
  const safePeriod = sanitizeFileSegment(data.periodText) || 'Historico';
  const fileName = `Resultado TrackSIM - ${safeCompany} - ${safePeriod}.pptx`;

  await pres.writeFile({ fileName });

  void logAudit({
    categoria: 'datos',
    accion: 'exportar',
    cantidad: data.totalEvaluaciones,
    empresas: [data.companyName],
    metodo: 'PPTX',
    detalle: `Presentación PowerPoint de ${data.companyName} (${data.periodText})`
  });

  return fileName;
}
