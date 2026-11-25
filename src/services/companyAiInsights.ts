import type { CompanySummary, Evaluation } from '../types';
import { getEvaluationYear } from './analytics';
import { app } from './firebaseApp';
import { getHybridEvaluationIncidents, getIncidentModes } from './incidentMetrics';
import { addDoc, collection, db, serverTimestamp } from './firebaseFirestore';

export interface AiExerciseInput {
  nombre: string;
  promedio: number;
  totalEvaluaciones: number;
}

export interface CompanyAiInsightRequest {
  comp: CompanySummary & { esGlobal?: boolean };
  periodText: string;
  selectedYear: string;
  conductoresRecurrentes: number;
  pctRecurrentes: string;
  exerciseStats: AiExerciseInput[];
  allEvaluations: Evaluation[];
  forceRefresh?: boolean;
}

export interface CompanyAiStructuredReport {
  estadoGeneral: {
    nivel: 'sobresaliente' | 'bueno' | 'atencion' | 'critico';
    titulo: string;
    resumenSimple: string;
  };
  loQueVaBien: Array<{
    titulo: string;
    detalle: string;
  }>;
  focosDeAtencion: Array<{
    titulo: string;
    porqueImporta: string;
    nivel: 'alto' | 'medio';
  }>;
  planDeAccion: Array<{
    plazo: string;
    accion: string;
    impacto: string;
  }>;
  metasSimples: Array<{
    indicador: string;
    actual: string;
    meta: string;
  }>;
}

export interface CompanyAiInsightResult {
  summary: string;
  structured?: CompanyAiStructuredReport;
  source: 'gemini' | 'fallback';
  model: string;
  generatedAt: string;
  createdAtMs?: number;
  fromCache?: boolean;
  warning?: string;
  quality?: AiResponseQuality;
}

export interface AiResponseQuality {
  score: number;
  issues: string[];
}

export function isUsableCompanyAiResult(
  result: CompanyAiInsightResult | null | undefined
): result is CompanyAiInsightResult & { structured: CompanyAiStructuredReport } {
  if (!result?.structured) return false;
  if (result.source === 'fallback') return true;
  return (result.quality?.score ?? 70) >= 70;
}

export interface AiQuickAnswerResult {
  answer: string;
  source: 'gemini' | 'fallback';
  model: string;
  generatedAt: string;
  createdAtMs?: number;
  fromCache?: boolean;
  warning?: string;
  quality?: AiResponseQuality;
}

const GEMINI_MODEL_CANDIDATES = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'] as const;
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'tracksim_ai_insight_v8:';
const TEXT_STORAGE_KEY_PREFIX = 'tracksim_ai_qa_v3:';
const AI_PROMPT_VERSION = 'v5-hybrid';

export const TRACKY_AI_QUALITY_COLLECTION = 'tracky_ai_quality';

export function isAlcoholAwarenessExercise(nombre: string): boolean {
  return /alcohol/i.test(nombre);
}
const insightCache = new Map<string, CompanyAiInsightResult>();
const textAnswerCache = new Map<string, AiQuickAnswerResult>();

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Acceso bloqueado a localStorage
  }
  return null;
}

function isCacheValid(item: CompanyAiInsightResult | null | undefined): item is CompanyAiInsightResult {
  if (!item || item.source !== 'gemini' || !item.createdAtMs) return false;
  return Date.now() - item.createdAtMs < CACHE_TTL_MS;
}

function isTextCacheValid(item: AiQuickAnswerResult | null | undefined): item is AiQuickAnswerResult {
  if (!item || item.source !== 'gemini' || !item.createdAtMs) return false;
  return Date.now() - item.createdAtMs < CACHE_TTL_MS;
}

function readCachedValue<T>(
  memoryMap: Map<string, T>,
  storagePrefix: string,
  isValid: (item: T | null | undefined) => item is T,
  cacheKey: string
): (T & { fromCache?: boolean }) | null {
  const mem = memoryMap.get(cacheKey);
  if (isValid(mem)) {
    return { ...mem, fromCache: true };
  }
  if (mem) {
    memoryMap.delete(cacheKey);
  }

  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${storagePrefix}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (isValid(parsed)) {
      memoryMap.set(cacheKey, parsed);
      return { ...parsed, fromCache: true };
    }
    storage.removeItem(`${storagePrefix}${cacheKey}`);
  } catch {
    // Caché corrupta o inaccesible
  }
  return null;
}

function writeCachedValue<T>(
  memoryMap: Map<string, T>,
  storagePrefix: string,
  cacheKey: string,
  result: T
): void {
  memoryMap.set(cacheKey, result);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(`${storagePrefix}${cacheKey}`, JSON.stringify(result));
  } catch {
    // Cuota de almacenamiento llena o bloqueada
  }
}

function readCachedInsight(cacheKey: string): CompanyAiInsightResult | null {
  return readCachedValue(insightCache, STORAGE_KEY_PREFIX, isCacheValid, cacheKey);
}

function writeCachedInsight(cacheKey: string, result: CompanyAiInsightResult): void {
  writeCachedValue(insightCache, STORAGE_KEY_PREFIX, cacheKey, result);
}

function readCachedTextAnswer(cacheKey: string): AiQuickAnswerResult | null {
  return readCachedValue(textAnswerCache, TEXT_STORAGE_KEY_PREFIX, isTextCacheValid, cacheKey);
}

function writeCachedTextAnswer(cacheKey: string, result: AiQuickAnswerResult): void {
  writeCachedValue(textAnswerCache, TEXT_STORAGE_KEY_PREFIX, cacheKey, result);
}

function getEvalScore(ev: Evaluation): number {
  return ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
}

function calcMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function buildCompanyAiMetricsContext(input: CompanyAiInsightRequest) {
  const { comp, periodText, conductoresRecurrentes, pctRecurrentes, exerciseStats, allEvaluations } = input;
  const conductores = comp.conductores || [];
  const totalConductores = conductores.length;
  const sobresalientes = conductores.filter((c) => c.promedioScore >= 8.0).length;
  const aprobados = conductores.filter((c) => c.promedioScore >= 6.0 && c.promedioScore < 8.0).length;
  const refuerzo = conductores.filter((c) => c.promedioScore < 6.0).length;
  const criticosBajo5 = conductores.filter((c) => c.promedioScore < 5.0).length;

  const scores = allEvaluations.map(getEvalScore).filter((s) => s > 0);
  const meanScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : comp.promedioFinal || 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const medianScore = calcMedian(scores);
  const stdDevScore = calcStdDev(scores, meanScore);

  const hasV2Data = allEvaluations.some((ev) => ev.origen === 'TrackSIM-ZERO-V2');
  const incidentModes = getIncidentModes(allEvaluations);
  const critMap = new Map<string, number>();
  const mistakesMap = new Map<string, { reps: number; evalsWithMistake: number; eje?: string }>();
  const ejeMap = new Map<string, number>();
  const sedeMap = new Map<string, { count: number; scoreSum: number; approved: number; accidents: number; incomplete: boolean }>();
  const yearMap = new Map<string, { count: number; scoreSum: number; approved: number; accidents: number; incomplete: boolean }>();
  const driversWithIncidents = new Set<string>();
  let incidentDataIncomplete = allEvaluations.length === 0;

  let evalsWithCritical = 0;
  let scoreSumWithCrit = 0;
  let evalsWithoutCritical = 0;
  let scoreSumWithoutCrit = 0;
  let habilidadesPctSum = 0;
  let habilidadesCount = 0;
  let practicaPctSum = 0;
  let practicaCount = 0;
  let destrezaPctSum = 0;
  let destrezaCount = 0;
  let ecoPctSum = 0;
  let ecoCount = 0;

  allEvaluations.forEach((ev) => {
    const score = getEvalScore(ev);
    const incidents = getHybridEvaluationIncidents(ev, incidentModes);
    const evAccidents = incidents.total;
    if (!incidents.complete || evAccidents === null) incidentDataIncomplete = true;
    incidents.details.forEach((item) => {
      if (item.count > 0) critMap.set(item.name, (critMap.get(item.name) || 0) + item.count);
    });

    if (evAccidents !== null && evAccidents > 0) {
      evalsWithCritical += 1;
      scoreSumWithCrit += score;
      const driver = (ev.conductor || ev.operador || '').trim().toLowerCase();
      if (driver) driversWithIncidents.add(driver);
    } else if (incidents.complete && evAccidents === 0) {
      evalsWithoutCritical += 1;
      scoreSumWithoutCrit += score;
    }

    if (typeof ev.habilidadesManejoPct === 'number' && ev.habilidadesManejoPct > 0) {
      habilidadesPctSum += ev.habilidadesManejoPct;
      habilidadesCount += 1;
    }
    if (typeof ev.practicaSimuladorPct === 'number' && ev.practicaSimuladorPct > 0) {
      practicaPctSum += ev.practicaSimuladorPct;
      practicaCount += 1;
    }
    if (typeof ev.destrezaPuntos === 'number' && typeof ev.destrezaMax === 'number' && ev.destrezaMax > 0) {
      destrezaPctSum += (ev.destrezaPuntos / ev.destrezaMax) * 100;
      destrezaCount += 1;
    }
    if (typeof ev.ecoDrivingPuntos === 'number' && typeof ev.ecoDrivingMax === 'number' && ev.ecoDrivingMax > 0) {
      ecoPctSum += (ev.ecoDrivingPuntos / ev.ecoDrivingMax) * 100;
      ecoCount += 1;
    }

    const seenMistakesInEval = new Set<string>();
    if (Array.isArray(ev.erroresFrecuentes)) {
      ev.erroresFrecuentes.forEach((m) => {
        const name = (m.error || m.errorRaw || '').trim();
        if (!name) return;
        const reps = m.repeticiones || 1;
        const prev = mistakesMap.get(name) || { reps: 0, evalsWithMistake: 0, eje: m.ejeNombre || m.ejeShortName };
        prev.reps += reps;
        if (!seenMistakesInEval.has(name)) {
          prev.evalsWithMistake += 1;
          seenMistakesInEval.add(name);
        }
        mistakesMap.set(name, prev);

        const ejeName = (m.ejeNombre || m.ejeShortName || '').trim();
        if (ejeName) {
          ejeMap.set(ejeName, (ejeMap.get(ejeName) || 0) + reps);
        }
      });
    }

    const sedeName = (ev.sede || ev.ciudad || 'Principal').trim() || 'Principal';
    const sedeCurr = sedeMap.get(sedeName) || { count: 0, scoreSum: 0, approved: 0, accidents: 0, incomplete: false };
    sedeCurr.count += 1;
    sedeCurr.scoreSum += score;
    if (score >= 6.0) sedeCurr.approved += 1;
    if (evAccidents !== null) sedeCurr.accidents += evAccidents;
    if (!incidents.complete || evAccidents === null) sedeCurr.incomplete = true;
    sedeMap.set(sedeName, sedeCurr);

    const yr = getEvaluationYear(ev);
    if (yr) {
      const curr = yearMap.get(yr) || { count: 0, scoreSum: 0, approved: 0, accidents: 0, incomplete: false };
      curr.count += 1;
      curr.scoreSum += score;
      if (score >= 6.0) curr.approved += 1;
      if (evAccidents !== null) curr.accidents += evAccidents;
      if (!incidents.complete || evAccidents === null) curr.incomplete = true;
      yearMap.set(yr, curr);
    }
  });

  const criticalBreakdown = Array.from(critMap.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);
  const totalCriticalEvents = incidentDataIncomplete ? null : criticalBreakdown.reduce((sum, item) => sum + item.total, 0);

  const totalEvalsCount = Math.max(allEvaluations.length, 1);
  const topMistakes = Array.from(mistakesMap.entries())
    .map(([nombre, data]) => ({
      nombre,
      repeticiones: data.reps,
      presenciaPct: Number(((data.evalsWithMistake / totalEvalsCount) * 100).toFixed(1)),
      eje: data.eje || undefined
    }))
    .sort((a, b) => b.repeticiones - a.repeticiones)
    .slice(0, 10);

  const telemetryAxes = Array.from(ejeMap.entries())
    .map(([eje, repeticiones]) => ({ eje, repeticiones }))
    .sort((a, b) => b.repeticiones - a.repeticiones);

  const sedeBreakdown = Array.from(sedeMap.entries())
    .map(([sede, d]) => ({
      sede,
      evaluaciones: d.count,
      promedio: Number((d.scoreSum / d.count).toFixed(2)),
      aprobacionPct: Number(((d.approved / d.count) * 100).toFixed(1)),
      incidentes: d.incomplete ? null : d.accidents
    }))
    .sort((a, b) => b.evaluaciones - a.evaluaciones);

  const annualTrend = Array.from(yearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, d]) => ({
      year,
      evaluaciones: d.count,
      promedio: Number((d.scoreSum / d.count).toFixed(2)),
      aprobacionPct: Number(((d.approved / d.count) * 100).toFixed(1)),
      accidentes: d.incomplete ? null : d.accidents
    }));

  const operadoresConIncidentes = driversWithIncidents.size;

  return {
    empresa: comp.nombre,
    periodo: periodText,
    filtroAnioActivo: input.selectedYear === 'all' ? 'Todos los años' : input.selectedYear,
    sedes: comp.sedes?.length ? comp.sedes : ['Principal'],
    totalOperadores: totalConductores,
    totalEvaluaciones: comp.totalEvaluaciones || allEvaluations.length,
    promedioGlobal: Number((comp.promedioFinal || 0).toFixed(2)),
    tasaAprobacionPct: Number((comp.tasaAprobacion || 0).toFixed(1)),
    estadisticaCalificaciones: {
      minimo: Number(minScore.toFixed(2)),
      mediana: Number(medianScore.toFixed(2)),
      maximo: Number(maxScore.toFixed(2)),
      desviacionEstandar: Number(stdDevScore.toFixed(2))
    },
    dimensionesEvaluacionPct: {
      habilidadesManejoPct: habilidadesCount > 0 ? Number((habilidadesPctSum / habilidadesCount).toFixed(1)) : null,
      practicaSimuladorPct: practicaCount > 0 ? Number((practicaPctSum / practicaCount).toFixed(1)) : null,
      destrezaPct: destrezaCount > 0 ? Number((destrezaPctSum / destrezaCount).toFixed(1)) : null,
      ecoDrivingPct: ecoCount > 0 ? Number((ecoPctSum / ecoCount).toFixed(1)) : null
    },
    conductoresRecurrentes,
    pctRecurrentes,
    distribucionAptitud: {
      sobresalientes,
      sobresalientesPct: totalConductores > 0 ? Number(((sobresalientes / totalConductores) * 100).toFixed(1)) : 0,
      aprobados,
      aprobadosPct: totalConductores > 0 ? Number(((aprobados / totalConductores) * 100).toFixed(1)) : 0,
      requiereRefuerzo: refuerzo,
      requiereRefuerzoPct: totalConductores > 0 ? Number(((refuerzo / totalConductores) * 100).toFixed(1)) : 0,
      criticosBajo5
    },
    hasV2Data,
    totalCriticalEvents,
    incidentDataIncomplete,
    operadoresConIncidentes,
    correlacionIncidentes: {
      evaluacionesConIncidentes: evalsWithCritical,
      promedioConIncidentes: evalsWithCritical > 0 ? Number((scoreSumWithCrit / evalsWithCritical).toFixed(2)) : null,
      evaluacionesSinIncidentes: evalsWithoutCritical,
      promedioSinIncidentes: evalsWithoutCritical > 0 ? Number((scoreSumWithoutCrit / evalsWithoutCritical).toFixed(2)) : null
    },
    criticalBreakdown,
    topMistakes,
    telemetryAxes,
    ejercicios: exerciseStats.slice(0, 14).map((ex) => ({
      nombre: ex.nombre,
      promedio: ex.promedio,
      evaluaciones: ex.totalEvaluaciones,
      esConcientizacionIntencional: isAlcoholAwarenessExercise(ex.nombre)
    })),
    sedeBreakdown,
    annualTrend
  };
}

export function formatStructuredReportAsText(report: CompanyAiStructuredReport): string {
  const lines: string[] = [
    `RESUMEN GENERAL: ${report.estadoGeneral.titulo}`,
    report.estadoGeneral.resumenSimple,
    '',
    'LO QUE VA BIEN:',
    ...report.loQueVaBien.map((item) => `- ${item.titulo}: ${item.detalle}`),
    '',
    'PUNTOS A MEJORAR:',
    ...report.focosDeAtencion.map((item) => `- ${item.titulo}: ${item.porqueImporta}`),
    '',
    'PLAN DE ACCIÓN:',
    ...report.planDeAccion.map((step, i) => `${i + 1}. [${step.plazo}] ${step.accion} (${step.impacto})`),
    '',
    'METAS SUGERIDAS:',
    ...report.metasSimples.map((kpi) => `- ${kpi.indicador}: ${kpi.actual} → ${kpi.meta}`)
  ];
  return lines.join('\n');
}

export function parseStructuredAiResponse(rawText: string): CompanyAiStructuredReport | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<CompanyAiStructuredReport>;
    if (!parsed?.estadoGeneral?.titulo || !parsed.estadoGeneral.resumenSimple) {
      return null;
    }
    const nivel = parsed.estadoGeneral.nivel;
    const validNivel =
      nivel === 'sobresaliente' || nivel === 'bueno' || nivel === 'atencion' || nivel === 'critico'
        ? nivel
        : 'atencion';

    return {
      estadoGeneral: {
        nivel: validNivel,
        titulo: String(parsed.estadoGeneral.titulo),
        resumenSimple: String(parsed.estadoGeneral.resumenSimple)
      },
      loQueVaBien: Array.isArray(parsed.loQueVaBien)
        ? parsed.loQueVaBien.slice(0, 4).map((x) => ({
            titulo: String(x?.titulo || 'Fortaleza'),
            detalle: String(x?.detalle || '')
          }))
        : [],
      focosDeAtencion: Array.isArray(parsed.focosDeAtencion)
        ? parsed.focosDeAtencion.slice(0, 4).map((x) => ({
            titulo: String(x?.titulo || 'Área de mejora'),
            porqueImporta: String(x?.porqueImporta || ''),
            nivel: x?.nivel === 'alto' ? 'alto' : 'medio'
          }))
        : [],
      planDeAccion: Array.isArray(parsed.planDeAccion)
        ? parsed.planDeAccion.slice(0, 4).map((x) => ({
            plazo: 'Próximas capacitaciones',
            accion: String(x?.accion || ''),
            impacto: String(x?.impacto || '')
          }))
        : [],
      metasSimples: Array.isArray(parsed.metasSimples)
        ? parsed.metasSimples.slice(0, 4).map((x) => ({
            indicador: String(x?.indicador || ''),
            actual: String(x?.actual || ''),
            meta: String(x?.meta || '')
          }))
        : []
    };
  } catch {
    return null;
  }
}

export function validateStructuredAiResponse(
  report: CompanyAiStructuredReport,
  metrics: ReturnType<typeof buildCompanyAiMetricsContext>
): CompanyAiStructuredReport {
  const fallback = buildLocalFallbackStructured(metrics);
  const fallbackLevel = fallback.estadoGeneral.nivel;
  const forbiddenText = /desviaci[oó]n est[aá]ndar|mediana|sigma|telemetr[ií]a agregada|V2/i;
  const alcoholText = /efectos del alcohol|alcohol/i;
  const cleanText = (value: string, fallbackValue = ''): string => {
    const cleaned = String(value || fallbackValue).replace(/\s+/g, ' ').trim();
    return forbiddenText.test(cleaned) ? fallbackValue : cleaned;
  };

  const loQueVaBien = report.loQueVaBien
    .filter((item) => !alcoholText.test(`${item.titulo} ${item.detalle}`))
    .slice(0, 3)
    .map((item) => ({
      titulo: cleanText(item.titulo, 'Fortaleza detectada'),
      detalle: cleanText(item.detalle, 'Sin detalle disponible.')
    }));

  const focosDeAtencion = report.focosDeAtencion
    .filter((item) => !alcoholText.test(`${item.titulo} ${item.porqueImporta}`))
    .slice(0, 3)
    .map((item) => ({
      titulo: cleanText(item.titulo, 'Área de mejora'),
      porqueImporta: cleanText(item.porqueImporta, 'Conviene reforzar este punto en el siguiente ciclo.'),
      nivel: item.nivel === 'alto' ? 'alto' as const : 'medio' as const
    }));

  const splitRecommendationText = (value: string): string[] =>
    value
      .split(/\s+(?:Además|También)[,.]?\s+/i)
      .map((part) => part.replace(/^\s*(?:Además|También)[,.]?\s*/i, '').replace(/\s+/g, ' ').trim())
      .filter((part, index, parts) => part.length > 0 && parts.indexOf(part) === index);

  const normalizedPlanActions = report.planDeAccion
    .slice(0, 3)
    .flatMap((item) => splitRecommendationText(cleanText(item.accion, 'Mantener el seguimiento preventivo.')))
    .filter((action, index, actions) => actions.indexOf(action) === index)
    .slice(0, 3);
  const normalizedPlanImpacts = report.planDeAccion
    .slice(0, 3)
    .flatMap((item) => splitRecommendationText(cleanText(item.impacto, 'Reducir riesgos y mejorar la continuidad operativa.')))
    .filter((impact, index, impacts) => impacts.indexOf(impact) === index)
    .slice(0, 3);
  const planDeAccion = normalizedPlanActions.map((action, index) => ({
    plazo: 'Próximas capacitaciones',
    accion: action,
    impacto: normalizedPlanImpacts[index] || 'Reducir riesgos y mejorar la seguridad operativa.'
  }));

  const metasSimples = report.metasSimples
    .filter((item) => !alcoholText.test(`${item.indicador} ${item.actual} ${item.meta}`))
    .slice(0, 3)
    .map((item) => ({
      indicador: cleanText(item.indicador, 'Rendimiento general'),
      actual: cleanText(item.actual, 'Sin dato disponible'),
      meta: cleanText(item.meta, 'Mantener mejora en el próximo año')
    }));

  return {
    estadoGeneral: {
      nivel: fallbackLevel,
      titulo: cleanText(report.estadoGeneral.titulo, fallback.estadoGeneral.titulo).slice(0, 100),
      resumenSimple: cleanText(report.estadoGeneral.resumenSimple, fallback.estadoGeneral.resumenSimple)
    },
    loQueVaBien: loQueVaBien.length > 0 ? loQueVaBien : fallback.loQueVaBien,
    focosDeAtencion: focosDeAtencion.length > 0 ? focosDeAtencion : fallback.focosDeAtencion,
    planDeAccion: planDeAccion.length > 0 ? planDeAccion : fallback.planDeAccion,
    metasSimples: metasSimples.length > 0 ? metasSimples : fallback.metasSimples
  };
}

export function assessStructuredAiQuality(
  report: CompanyAiStructuredReport,
  metrics: ReturnType<typeof buildCompanyAiMetricsContext>
): AiResponseQuality {
  const issues: string[] = [];
  const fullText = [
    report.estadoGeneral.titulo,
    report.estadoGeneral.resumenSimple,
    ...report.loQueVaBien.map((item) => `${item.titulo} ${item.detalle}`),
    ...report.focosDeAtencion.map((item) => `${item.titulo} ${item.porqueImporta}`),
    ...report.planDeAccion.map((item) => `${item.plazo} ${item.accion} ${item.impacto}`),
    ...report.metasSimples.map((item) => `${item.indicador} ${item.actual} ${item.meta}`)
  ].join(' ');

  if (/desviaci[oó]n est[aá]ndar|mediana|sigma|telemetr[ií]a agregada|V2/i.test(fullText)) {
    issues.push('Incluyó jerga técnica prohibida');
  }
  if (/efectos del alcohol|alcohol/i.test(fullText)) {
    issues.push('Incluyó el ejercicio de concientización');
  }
  if (report.planDeAccion.some((item) => !/pr[oó]ximas capacitaciones/i.test(item.plazo))) {
    issues.push('Incluyó un plazo distinto al horizonte anual');
  }

  const fallbackLevel = buildLocalFallbackStructured(metrics).estadoGeneral.nivel;
  if (report.estadoGeneral.nivel !== fallbackLevel) {
    issues.push('El nivel general no coincide con las métricas locales');
  }

  const emptySections = [
    report.loQueVaBien,
    report.focosDeAtencion,
    report.planDeAccion,
    report.metasSimples
  ].filter((section) => section.length === 0).length;
  if (emptySections > 0) {
    issues.push('Una o más secciones quedaron vacías');
  }

  return {
    score: Math.max(0, 100 - issues.length * 15),
    issues
  };
}

export function buildCompanyAiPrompt(metrics: ReturnType<typeof buildCompanyAiMetricsContext>): string {
  return [
    'Eres un asesor de seguridad vial y capacitación de conductores que explica resultados a gerentes y público general.',
    'Tu objetivo es que CUALQUIER persona entienda en segundos cómo está la flota, qué va bien, qué riesgos hay en la vida diaria (accidentes, gasto de diésel, desgaste de frenos) y qué hacer.',
    'REGLAS ESTRICTAS:',
    '- Usa un español claro, cercano y natural. PROHIBIDO usar jerga estadística (nada de "desviación estándar", "mediana", "sigma", "V2", "telemetría agregada").',
    '- Si incidentDataIncomplete es true o algún total es null, explica que hay datos incompletos; no inventes totales ni afirmes ausencia de incidencias.',
    '- La categoría "Atropello de peatón y vuelcos" puede incluir fatalidades históricas sin subtipo; no atribuyas sus registros a peatones o vuelcos por separado.',
    '- Los cursos en simulador se toman 1 o 2 veces al año. Devuelve 2 o 3 elementos independientes en planDeAccion bajo el plazo "Próximas capacitaciones". NUNCA uses "Además" para unir varias acciones dentro de un mismo elemento.',
    '- REGLA SOBRE "Efectos del alcohol" (esConcientizacionIntencional: true): es un ejercicio de CONCIENTIZACIÓN planeado intencionalmente para salir mal y mostrar el riesgo de manejar alcoholizado. Es completamente natural tener calificación baja y accidentes en ese ejercicio; NO lo marques como falla técnica ni recomiendes reforzar o mejorar su calificación.',
    '- Si filtroAnioActivo es un año específico (por ejemplo "2026"), analiza únicamente ese año sin mencionar tendencias de varios años; si es "Todos los años", incluye la evolución anual cuando haya 2 o más años.',
    '- No inventes números ni nombres; usa solo los datos del JSON.',
    '- Frases cortas y directas (máximo 2 líneas por punto).',
    '- Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin markdown ni texto extra):',
    '{',
    '  "estadoGeneral": {',
    '    "nivel": "sobresaliente | bueno | atencion | critico",',
    '    "titulo": "Frase corta de máximo 8 palabras que resuma cómo está la flota",',
    '    "resumenSimple": "2 oraciones claras explicando la calificación promedio, cuántos aprobaron y la tendencia si hay varios años."',
    '  },',
    '  "loQueVaBien": [',
    '    { "titulo": "Ej. Buen manejo en...", "detalle": "Explicación simple con el dato real." }',
    '  ],',
    '  "focosDeAtencion": [',
    '    { "titulo": "Ej. Exceso de aceleración o choques", "porqueImporta": "Qué riesgo real provoca (más diésel, desgaste o accidentes) y el dato.", "nivel": "alto | medio" }',
    '  ],',
    '  "planDeAccion": [',
    '    { "plazo": "Próximas capacitaciones", "accion": "Qué enfoque dar a las próximas jornadas de simulador", "impacto": "Beneficio esperado" }',
    '  ],',
    '  "metasSimples": [',
    '    { "indicador": "Nombre corto", "actual": "Valor actual", "meta": "Meta para el próximo año" }',
    '  ]',
    '}',
    '',
    'Incluye 2-3 elementos en loQueVaBien, 2-3 en focosDeAtencion, 3 en planDeAccion y 3 en metasSimples.',
    '',
    'Datos de la flota (JSON):',
    JSON.stringify(metrics)
  ].join('\n');
}

export function buildLocalFallbackStructured(metrics: ReturnType<typeof buildCompanyAiMetricsContext>): CompanyAiStructuredReport {
  const nivel: CompanyAiStructuredReport['estadoGeneral']['nivel'] =
    metrics.promedioGlobal >= 8.0
      ? 'sobresaliente'
      : metrics.promedioGlobal >= 7.0
        ? 'bueno'
        : metrics.promedioGlobal >= 6.0
          ? 'atencion'
          : 'critico';

  const titulo =
    nivel === 'sobresaliente'
      ? 'Flota con desempeño sobresaliente y seguro'
      : nivel === 'bueno'
        ? 'Buen desempeño general con puntos por pulir'
        : nivel === 'atencion'
          ? 'Desempeño regular: requiere refuerzo preventivo'
          : 'Situación crítica: necesita capacitación urgente';

  const operationalExercises = metrics.ejercicios.filter((ex) => !ex.esConcientizacionIntencional);
  const sortedEx = [...operationalExercises].sort((a, b) => b.promedio - a.promedio);
  const bestEx = sortedEx[0];
  const worstEx = sortedEx[sortedEx.length - 1];
  const topCrit = metrics.criticalBreakdown[0];
  const topErrs = metrics.topMistakes.slice(0, 2);

  const trendPhrase =
    metrics.annualTrend.length >= 2
      ? ` Entre ${metrics.annualTrend[0].year} y ${metrics.annualTrend[metrics.annualTrend.length - 1].year}, el promedio cambió de ${metrics.annualTrend[0].promedio.toFixed(1)} a ${metrics.annualTrend[metrics.annualTrend.length - 1].promedio.toFixed(1)}.`
      : '';

  const loQueVaBien: CompanyAiStructuredReport['loQueVaBien'] = [
    {
      titulo: `${metrics.distribucionAptitud.sobresalientes + metrics.distribucionAptitud.aprobados} de ${metrics.totalOperadores} operadores aprobaron`,
      detalle: `El ${metrics.tasaAprobacionPct}% de los evaluados alcanzó al menos 6.0 puntos, y ${metrics.distribucionAptitud.sobresalientes} destacan con nivel sobresaliente (≥ 8.0).`
    }
  ];

  if (bestEx) {
    loQueVaBien.push({
      titulo: `Mejor resultado en "${bestEx.nombre}"`,
      detalle: `En esta prueba la flota logró ${bestEx.promedio.toFixed(1)} de 10 en ${bestEx.evaluaciones} evaluaciones.`
    });
  } else if (metrics.conductoresRecurrentes > 0) {
    loQueVaBien.push({
      titulo: 'Seguimiento continuo',
      detalle: `${metrics.conductoresRecurrentes} operadores (${metrics.pctRecurrentes}%) ya tienen más de una evaluación registrada.`
    });
  }

  const focosDeAtencion: CompanyAiStructuredReport['focosDeAtencion'] = [];
  if (metrics.distribucionAptitud.requiereRefuerzo > 0) {
    focosDeAtencion.push({
      titulo: `${metrics.distribucionAptitud.requiereRefuerzo} operadores requieren refuerzo`,
      porqueImporta: `Obtuvieron menos de 6.0 puntos (${metrics.distribucionAptitud.requiereRefuerzoPct}% del grupo) y tienen mayor riesgo de cometer errores en ruta.`,
      nivel: metrics.distribucionAptitud.requiereRefuerzoPct >= 25 ? 'alto' : 'medio'
    });
  }

  if (topCrit) {
    focosDeAtencion.push({
      titulo: metrics.totalCriticalEvents === null ? 'Incidencias conocidas con datos incompletos' : `${metrics.totalCriticalEvents} incidencias registradas`,
      porqueImporta: `El problema más repetido fue "${topCrit.nombre}" (${topCrit.total} veces), lo que representa riesgo directo de accidente en carretera.`,
      nivel: 'alto'
    });
  }

  if (topErrs[0]) {
    focosDeAtencion.push({
      titulo: `Hábito repetido: "${topErrs[0].nombre}"`,
      porqueImporta: `Se detectó ${topErrs[0].repeticiones} veces (en ${topErrs[0].presenciaPct}% de las pruebas), lo que suele aumentar el desgaste mecánico o el consumo de combustible.`,
      nivel: 'medio'
    });
  } else if (worstEx && worstEx.nombre !== bestEx?.nombre) {
    focosDeAtencion.push({
      titulo: `Prueba más baja: "${worstEx.nombre}"`,
      porqueImporta: `Promedió ${worstEx.promedio.toFixed(1)} de 10, por lo que conviene reforzar estas maniobras antes de salir a ruta.`,
      nivel: 'medio'
    });
  }

  if (focosDeAtencion.length === 0) {
    focosDeAtencion.push({
      titulo: 'Mantener la prevención en ruta',
      porqueImporta: 'Aunque no hay alertas graves, conviene practicar escenarios de lluvia, montaña y frenado de emergencia para no perder nivel.',
      nivel: 'medio'
    });
  }

  const metaAprobacion = Math.min(98, Math.max(85, Math.ceil(metrics.tasaAprobacionPct + 10)));
  const metaPromedio = Math.min(9.2, Number((metrics.promedioGlobal + 0.6).toFixed(1)));

  return {
    estadoGeneral: {
      nivel,
      titulo,
      resumenSimple: `${metrics.empresa} tiene una calificación promedio de ${metrics.promedioGlobal.toFixed(2)} sobre 10 y una aprobación del ${metrics.tasaAprobacionPct}% en ${metrics.totalEvaluaciones} evaluaciones.${trendPhrase}`
    },
    loQueVaBien,
    focosDeAtencion,
    planDeAccion: [
      {
        plazo: 'Próximas capacitaciones',
        accion:
          metrics.distribucionAptitud.requiereRefuerzo > 0
            ? `Priorizar en las próximas capacitaciones a los ${metrics.distribucionAptitud.requiereRefuerzo} operadores con menos de 6.0 para reforzar sus maniobras base.`
            : worstEx
              ? `Incluir en las próximas capacitaciones un repaso de "${worstEx.nombre}"${topErrs[0] ? ` y corregir "${topErrs[0].nombre}"` : ''}.`
              : 'Incluir en las próximas capacitaciones escenarios de conducción defensiva, frenado preventivo y ahorro de combustible.',
        impacto: 'Reduce accidentes evitables, mejora la técnica de manejo y baja el gasto de diésel y frenos.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: topErrs[0]
          ? `Reforzar de forma práctica el hábito "${topErrs[0].nombre}" con ejercicios guiados.`
          : 'Practicar anticipación visual, modulación de freno y distancia de seguimiento.',
        impacto: 'Consolida hábitos seguros y disminuye el desgaste de frenos y componentes.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: 'Reevaluar los avances y confirmar las metas antes de cerrar el próximo ciclo de capacitación.',
        impacto: 'Permite medir el progreso y ajustar el plan de seguimiento.'
      }
    ],
    metasSimples: [
      {
        indicador: 'Aprobación',
        actual: `${metrics.tasaAprobacionPct}%`,
        meta: metrics.tasaAprobacionPct >= 95 ? '≥ 95% próximo año' : `≥ ${metaAprobacion}% próximo año`
      },
      {
        indicador: 'Calificación promedio',
        actual: `${metrics.promedioGlobal.toFixed(1)} / 10`,
        meta: `≥ ${metaPromedio.toFixed(1)} próximo año`
      },
      {
        indicador: topErrs[0] ? 'Error principal' : 'Incidentes graves',
        actual: topErrs[0] ? `${topErrs[0].repeticiones} veces` : metrics.totalCriticalEvents === null ? 'Datos incompletos' : `${metrics.totalCriticalEvents}`,
        meta: '-30% próximo año'
      }
    ]
  };
}

export function buildLocalFallbackInsight(metrics: ReturnType<typeof buildCompanyAiMetricsContext>): string {
  return formatStructuredReportAsText(buildLocalFallbackStructured(metrics));
}

function buildCacheKey(
  input: CompanyAiInsightRequest,
  metrics: ReturnType<typeof buildCompanyAiMetricsContext>
): string {
  const metricsFingerprint = JSON.stringify({
    totalEvaluaciones: metrics.totalEvaluaciones,
    promedioGlobal: metrics.promedioGlobal,
    tasaAprobacionPct: metrics.tasaAprobacionPct,
    totalCriticalEvents: metrics.totalCriticalEvents,
    operadoresConIncidentes: metrics.operadoresConIncidentes,
    distribucionAptitud: metrics.distribucionAptitud,
    ejercicios: metrics.ejercicios,
    sedeBreakdown: metrics.sedeBreakdown,
    annualTrend: metrics.annualTrend,
    criticalBreakdown: metrics.criticalBreakdown,
    topMistakes: metrics.topMistakes
  });
  let hash = 2166136261;
  for (let i = 0; i < metricsFingerprint.length; i += 1) {
    hash ^= metricsFingerprint.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${AI_PROMPT_VERSION}|${input.comp.nombre}|${input.selectedYear}|${hash >>> 0}`;
}

export function readCachedAiInsight(cacheKey: string): CompanyAiInsightResult | null {
  return readCachedInsight(cacheKey);
}

export function readCachedAiTextAnswer(cacheKey: string): AiQuickAnswerResult | null {
  return readCachedTextAnswer(cacheKey);
}

export function getCachedCompanyAiInsight(input: CompanyAiInsightRequest): CompanyAiInsightResult | null {
  const metrics = buildCompanyAiMetricsContext(input);
  const cacheKey = buildCacheKey(input, metrics);
  return readCachedInsight(cacheKey);
}

export interface GeminiStructuredInsightOptions {
  cacheKey: string;
  prompt: string;
  buildFallback: () => CompanyAiStructuredReport;
  validateResult?: (structured: CompanyAiStructuredReport) => CompanyAiStructuredReport;
  assessResult?: (structured: CompanyAiStructuredReport) => AiResponseQuality;
  forceRefresh?: boolean;
}

export interface GeminiTextAnswerOptions {
  cacheKey: string;
  prompt: string;
  buildFallback: () => string;
  validateAnswer?: (answer: string) => string;
  forceRefresh?: boolean;
  maxOutputTokens?: number;
}

async function runGeminiPromptWithFallback({
  prompt,
  maxOutputTokens = 4096,
  responseMimeType,
  responseJsonSchema
}: {
  prompt: string;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
}): Promise<{ text: string; model: string }> {
  const { getAI, getGenerativeModel, GoogleAIBackend, ThinkingLevel } = await import('firebase/ai');
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  const nowMs = Date.now();
  const activeModels = GEMINI_MODEL_CANDIDATES.filter((id) => (modelCooldownUntil.get(id) ?? 0) <= nowMs);
  const candidates = activeModels.length > 0 ? activeModels : GEMINI_MODEL_CANDIDATES;

  let lastError: unknown;
  for (const modelId of candidates) {
    try {
      const model = getGenerativeModel(ai, {
        model: modelId,
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens,
          temperature: 0.35,
          ...(responseMimeType ? { responseMimeType } : {}),
          ...(responseJsonSchema ? { responseJsonSchema } : {}),
          thinkingConfig: {
            thinkingLevel: modelId === 'gemini-3.5-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW
          }
        }
      });

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const response = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Tiempo de espera agotado al consultar Gemini.')), 25000);
        })
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      const text = response.response.text().trim();

      if (!text) {
        throw new Error('La respuesta de Gemini llegó vacía.');
      }

      return { text, model: modelId };
    } catch (modelErr) {
      lastError = modelErr;
      const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
      if (/429|quota|resource.*exhausted|503|unavailable|overloaded/i.test(msg)) {
        modelCooldownUntil.set(modelId, Date.now() + MODEL_COOLDOWN_MS);
      }
      const shouldRetryNextModel = /503|unavailable|overloaded|429|quota|resource.*exhausted|not found|404|timeout|tiempo de espera/i.test(msg);
      if (!shouldRetryNextModel) {
        throw modelErr;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Todos los modelos de Gemini fallaron temporalmente.');
}

function buildGeminiFallbackWarning(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const isQuotaOrSetup =
    /quota|429|503|unavailable|overloaded|permission|403|api.*not.*enabled|ai logic|ailogic/i.test(message);
  return isQuotaOrSetup
    ? 'Gemini Developer API está temporalmente saturado (503/429) o aún no está habilitado; se generó el análisis visual con el motor analítico local.'
    : 'No se pudo conectar con Gemini Developer API; se generó el análisis visual con el motor analítico local.';
}

function buildStructuredResponseJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['estadoGeneral', 'loQueVaBien', 'focosDeAtencion', 'planDeAccion', 'metasSimples'],
    properties: {
      estadoGeneral: {
        type: 'object',
        additionalProperties: false,
        required: ['nivel', 'titulo', 'resumenSimple'],
        properties: {
          nivel: { type: 'string', enum: ['sobresaliente', 'bueno', 'atencion', 'critico'] },
          titulo: { type: 'string', minLength: 1, maxLength: 100 },
          resumenSimple: { type: 'string', minLength: 1, maxLength: 500 }
        }
      },
      loQueVaBien: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titulo', 'detalle'],
          properties: {
            titulo: { type: 'string', maxLength: 100 },
            detalle: { type: 'string', maxLength: 300 }
          }
        }
      },
      focosDeAtencion: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titulo', 'porqueImporta', 'nivel'],
          properties: {
            titulo: { type: 'string', maxLength: 100 },
            porqueImporta: { type: 'string', maxLength: 300 },
            nivel: { type: 'string', enum: ['alto', 'medio'] }
          }
        }
      },
      planDeAccion: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['plazo', 'accion', 'impacto'],
          properties: {
            plazo: { type: 'string', enum: ['Próximas capacitaciones'] },
            accion: { type: 'string', maxLength: 300 },
            impacto: { type: 'string', maxLength: 300 }
          }
        }
      },
      metasSimples: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['indicador', 'actual', 'meta'],
          properties: {
            indicador: { type: 'string', maxLength: 100 },
            actual: { type: 'string', maxLength: 100 },
            meta: { type: 'string', maxLength: 150 }
          }
        }
      }
    }
  };
}

export interface TrackyAiQualityMetricInput {
  kind: 'analysis' | 'quick_answer';
  source: 'gemini' | 'fallback';
  model: string;
  score: number;
  issues: string[];
  cacheHit: boolean;
}

export async function persistTrackyAiQualityMetric(input: TrackyAiQualityMetricInput): Promise<void> {
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const issues = input.issues
    .map((issue) => issue.trim())
    .filter(Boolean)
    .slice(0, 10);

  try {
    await addDoc(collection(db, TRACKY_AI_QUALITY_COLLECTION), {
      kind: input.kind,
      source: input.source,
      model: input.model.slice(0, 80),
      score,
      issues,
      cacheHit: input.cacheHit,
      promptVersion: AI_PROMPT_VERSION,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('[Tracky IA][Calidad] No se pudo guardar la métrica:', error);
  }
}

function logTrackyAiQuality(result: CompanyAiInsightResult): void {
  const quality = result.quality ?? { score: result.source === 'gemini' ? 70 : 100, issues: [] };
  const metric = {
    puntuacion: `${quality.score}/100`,
    fuente: result.source,
    modelo: result.model,
    cache: result.fromCache ? 'sí' : 'no',
    incidencias: quality.issues.length,
    detalle: quality.issues,
    advertencia: result.warning ?? null
  };
  console.info('[Tracky IA][Calidad]', metric);
  void persistTrackyAiQualityMetric({
    kind: 'analysis',
    source: result.source,
    model: result.model,
    score: quality.score,
    issues: quality.issues,
    cacheHit: Boolean(result.fromCache)
  });
}

function assessAndLogTrackyQuickAnswer(result: AiQuickAnswerResult): void {
  const forbidden = /desviaci[oó]n est[aá]ndar|mediana|sigma|telemetr[ií]a agregada|V2/i;
  const alcohol = /efectos del alcohol|alcohol/i;
  const issues: string[] = [];

  if (forbidden.test(result.answer)) issues.push('Incluyó jerga técnica prohibida');
  if (alcohol.test(result.answer)) issues.push('Incluyó el ejercicio de concientización');
  if (result.answer.trim().length < 30) issues.push('La respuesta quedó demasiado corta');

  const quality: AiResponseQuality = {
    score: Math.max(0, 100 - issues.length * 20),
    issues
  };
  result.quality = quality;

  console.info('[Tracky IA][Respuesta rápida][Calidad]', {
    puntuacion: `${quality.score}/100`,
    fuente: result.source,
    modelo: result.model,
    cache: result.fromCache ? 'sí' : 'no',
    incidencias: issues.length,
    detalle: issues
  });
  void persistTrackyAiQualityMetric({
    kind: 'quick_answer',
    source: result.source,
    model: result.model,
    score: quality.score,
    issues,
    cacheHit: Boolean(result.fromCache)
  });
}

export async function invokeGeminiStructuredInsight({
  cacheKey,
  prompt,
  buildFallback,
  validateResult,
  assessResult,
  forceRefresh
}: GeminiStructuredInsightOptions): Promise<CompanyAiInsightResult> {
  if (!forceRefresh) {
    const cached = readCachedInsight(cacheKey);
    if (cached) {
      logTrackyAiQuality(cached);
      return cached;
    }
  }

  try {
    const { text, model: modelId } = await runGeminiPromptWithFallback({
      prompt,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseJsonSchema: buildStructuredResponseJsonSchema()
    });

    const parsed = parseStructuredAiResponse(text);
    const structured = parsed
      ? validateResult
        ? validateResult(parsed)
        : parsed
      : undefined;
    const quality = parsed && assessResult
      ? assessResult(parsed)
      : { score: 0, issues: ['No se pudo interpretar la respuesta estructurada'] };
    const formattedSummary = structured ? formatStructuredReportAsText(structured) : text;
    const now = new Date();
    const result: CompanyAiInsightResult = {
      summary: formattedSummary,
      structured,
      source: 'gemini',
      model: modelId,
      generatedAt: now.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      createdAtMs: now.getTime(),
      fromCache: false,
      quality,
      ...(quality.score < 70
        ? { warning: 'La respuesta fue corregida parcialmente con las métricas locales antes de mostrarse.' }
        : {})
    };
    writeCachedInsight(cacheKey, result);
    logTrackyAiQuality(result);
    return result;
  } catch (err) {
    const structuredFallback = buildFallback();
    const fallback: CompanyAiInsightResult = {
      summary: formatStructuredReportAsText(structuredFallback),
      structured: structuredFallback,
      source: 'fallback',
      model: 'Motor Local (Respaldo)',
      generatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      warning: buildGeminiFallbackWarning(err),
      quality: { score: 100, issues: ['Síntesis generada con métricas locales verificadas'] }
    };
    logTrackyAiQuality(fallback);
    return fallback;
  }
}

export async function invokeGeminiTextAnswer({
  cacheKey,
  prompt,
  buildFallback,
  validateAnswer,
  forceRefresh,
  maxOutputTokens = 1024
}: GeminiTextAnswerOptions): Promise<AiQuickAnswerResult> {
  if (!forceRefresh) {
    const cached = readCachedTextAnswer(cacheKey);
    if (cached) {
      assessAndLogTrackyQuickAnswer(cached);
      return cached;
    }
  }

  try {
    const { text, model: modelId } = await runGeminiPromptWithFallback({
      prompt,
      maxOutputTokens
    });

    const now = new Date();
    const validatedAnswer = validateAnswer ? validateAnswer(text) : text;
    const result: AiQuickAnswerResult = {
      answer: validatedAnswer,
      source: 'gemini',
      model: modelId,
      generatedAt: now.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      createdAtMs: now.getTime(),
      fromCache: false
    };
    writeCachedTextAnswer(cacheKey, result);
    assessAndLogTrackyQuickAnswer(result);
    return result;
  } catch (err) {
    const fallback: AiQuickAnswerResult = {
      answer: buildFallback(),
      source: 'fallback',
      model: 'Motor Local (Respaldo)',
      generatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      warning: buildGeminiFallbackWarning(err)
    };
    assessAndLogTrackyQuickAnswer(fallback);
    return fallback;
  }
}

export async function generateCompanyAiInsight(input: CompanyAiInsightRequest): Promise<CompanyAiInsightResult> {
  const metrics = buildCompanyAiMetricsContext(input);
  const cacheKey = buildCacheKey(input, metrics);
  const prompt = buildCompanyAiPrompt(metrics);

  return invokeGeminiStructuredInsight({
    cacheKey,
    prompt,
    buildFallback: () => buildLocalFallbackStructured(metrics),
    validateResult: (structured) => validateStructuredAiResponse(structured, metrics),
    assessResult: (structured) => assessStructuredAiQuality(structured, metrics),
    forceRefresh: input.forceRefresh
  });
}
