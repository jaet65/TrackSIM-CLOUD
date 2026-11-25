import type { Evaluation } from '../types';
import { getEvaluationYear } from './analytics';
import {
  type CompanyAiInsightResult,
  type CompanyAiStructuredReport,
  formatStructuredReportAsText,
  invokeGeminiStructuredInsight,
  isAlcoholAwarenessExercise,
  readCachedAiInsight
} from './companyAiInsights';
import { getHybridIncidentSummary, getIncidentModes, groupIncidentCollisions } from './incidentMetrics';

export interface AnnualEvolutionRowInput {
  year: string;
  evalCount: number;
  operatorCount: number;
  avgScore: number;
  passRate: number;
  collisions?: number;
  offRoad?: number;
  fatalities?: number;
  incidentDetails?: Array<{ name: string; count: number }>;
  totalIncidents: number | null;
  accidentRate: number | null;
}

export interface FleetEvolutionAiInsightRequest {
  companyName: string;
  scopeLabel?: string;
  evaluations: Evaluation[];
  annualRows: AnnualEvolutionRowInput[];
  forceRefresh?: boolean;
}

function getEvalScore(ev: Evaluation): number {
  return ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
}

function buildAnnualRowsFromEvaluations(evaluations: Evaluation[]): AnnualEvolutionRowInput[] {
  const byYear = new Map<
    string,
    {
      evalCount: number;
      drivers: Set<string>;
      scoreSum: number;
      scoreCount: number;
      passedCount: number;
      evaluations: Evaluation[];
    }
  >();

  evaluations.forEach((ev) => {
    const year = getEvaluationYear(ev);
    if (!year) return;
    const entry = byYear.get(year) || {
      evalCount: 0,
      drivers: new Set<string>(),
      scoreSum: 0,
      scoreCount: 0,
      passedCount: 0,
      evaluations: []
    };

    const score = getEvalScore(ev);
    const driverName = (ev.conductor || ev.operador || '').trim();
    entry.evalCount += 1;
    if (driverName) entry.drivers.add(driverName.toLowerCase());
    if (score > 0) {
      entry.scoreSum += score;
      entry.scoreCount += 1;
      if (score >= 6.0) entry.passedCount += 1;
    }

    entry.evaluations.push(ev);
    byYear.set(year, entry);
  });

  const modes = getIncidentModes(evaluations);
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([year, d]) => {
      const incidents = getHybridIncidentSummary(d.evaluations, modes);
      const totalIncidents = incidents.unavailable || incidents.incomplete ? null : incidents.total;
      return {
        year,
        evalCount: d.evalCount,
        operatorCount: d.drivers.size,
        avgScore: d.scoreCount > 0 ? Number((d.scoreSum / d.scoreCount).toFixed(2)) : 0,
        passRate: d.scoreCount > 0 ? Number(((d.passedCount / d.scoreCount) * 100).toFixed(1)) : 0,
        incidentDetails: incidents.details,
        totalIncidents,
        accidentRate: d.drivers.size > 0 && totalIncidents !== null ? Number((totalIncidents / d.drivers.size).toFixed(2)) : null
      };
    });
}

export function buildFleetEvolutionAiMetricsContext(input: FleetEvolutionAiInsightRequest) {
  const sourceRows =
    input.annualRows && input.annualRows.length > 0
      ? input.annualRows
      : buildAnnualRowsFromEvaluations(input.evaluations || []);

  const orderedRows = [...sourceRows].sort((a, b) =>
    a.year.localeCompare(b.year, undefined, { numeric: true })
  );

  const firstRow = orderedRows[0];
  const lastRow = orderedRows[orderedRows.length - 1];
  const aniosEvaluados = orderedRows.length;
  const totalEvaluaciones =
    orderedRows.length > 0
      ? orderedRows.reduce((sum, row) => sum + row.evalCount, 0)
      : (input.evaluations || []).length;

  const primeraCalificacion = firstRow ? Number(firstRow.avgScore.toFixed(2)) : 0;
  const ultimaCalificacion = lastRow ? Number(lastRow.avgScore.toFixed(2)) : 0;
  const primeraTasaAprobacion = firstRow ? Number(firstRow.passRate.toFixed(1)) : 0;
  const ultimaTasaAprobacion = lastRow ? Number(lastRow.passRate.toFixed(1)) : 0;
  const primeraTasaIncidentes = firstRow?.accidentRate ?? null;
  const ultimaTasaIncidentes = lastRow?.accidentRate ?? null;

  const cambioCalificacionPuntos =
    aniosEvaluados >= 2 ? Number((ultimaCalificacion - primeraCalificacion).toFixed(2)) : 0;
  const cambioTasaAprobacionPts =
    aniosEvaluados >= 2 ? Number((ultimaTasaAprobacion - primeraTasaAprobacion).toFixed(1)) : 0;
  const cambioTasaIncidentes =
    aniosEvaluados >= 2 && ultimaTasaIncidentes !== null && primeraTasaIncidentes !== null
      ? Number((ultimaTasaIncidentes - primeraTasaIncidentes).toFixed(2)) : null;

  const tendenciaCalificacion: 'mejora' | 'descenso' | 'estable' | 'un_anio' =
    aniosEvaluados < 2
      ? 'un_anio'
      : cambioCalificacionPuntos >= 0.25
        ? 'mejora'
        : cambioCalificacionPuntos <= -0.25
          ? 'descenso'
          : 'estable';

  const tendenciaSiniestralidad: 'mejora' | 'deterioro' | 'estable' | 'un_anio' | 'no_disponible' =
    aniosEvaluados < 2
      ? 'un_anio'
      : cambioTasaIncidentes === null
        ? 'no_disponible'
      : cambioTasaIncidentes <= -0.05
        ? 'mejora'
        : cambioTasaIncidentes >= 0.05
          ? 'deterioro'
          : 'estable';

  // Seguimiento de operadores recurrentes (con >= 2 evaluaciones)
  const driverSessionsMap = new Map<string, Array<{ date: string; score: number }>>();
  const exerciseYearMap = new Map<
    string,
    { nombre: string; byYear: Map<string, { sum: number; count: number }> }
  >();
  const mistakesTotalMap = new Map<string, number>();
  const mistakesLatestYearMap = new Map<string, number>();
  const latestYear = lastRow?.year || '';

  (input.evaluations || []).forEach((ev) => {
    const driverKey = (ev.conductor || ev.operador || '').trim().toLowerCase();
    const score = getEvalScore(ev);
    if (driverKey && score > 0) {
      const dateStr = String(ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || '');
      const list = driverSessionsMap.get(driverKey) || [];
      list.push({ date: dateStr, score });
      driverSessionsMap.set(driverKey, list);
    }

    const evYear = getEvaluationYear(ev) || latestYear || 'Actual';
    if (Array.isArray(ev.ejercicios)) {
      ev.ejercicios.forEach((ex) => {
        if (!ex || ex.noRealizado || ex.estado === 'No Realizado') return;
        const exScore = ex.calificacion ?? ex.score;
        if (typeof exScore !== 'number' || Number.isNaN(exScore)) return;
        const rawName = (ex.nombre || (ex.numero ? `Ejercicio ${ex.numero}` : '')).trim();
        if (!rawName) return;
        const key = rawName.toLowerCase();
        const entry = exerciseYearMap.get(key) || {
          nombre: rawName,
          byYear: new Map<string, { sum: number; count: number }>()
        };
        const yearBucket = entry.byYear.get(evYear) || { sum: 0, count: 0 };
        yearBucket.sum += exScore;
        yearBucket.count += 1;
        entry.byYear.set(evYear, yearBucket);
        exerciseYearMap.set(key, entry);
      });
    }

    if (Array.isArray(ev.erroresFrecuentes)) {
      ev.erroresFrecuentes.forEach((m) => {
        const name = (m.error || m.errorRaw || '').trim();
        if (!name) return;
        const reps = m.repeticiones || 1;
        mistakesTotalMap.set(name, (mistakesTotalMap.get(name) || 0) + reps);
        if (latestYear && evYear === latestYear) {
          mistakesLatestYearMap.set(name, (mistakesLatestYearMap.get(name) || 0) + reps);
        }
      });
    }
  });

  let recurrentTotal = 0;
  let recurrentImproved = 0;
  let recurrentWorsened = 0;
  let recurrentStable = 0;
  let recurrentDeltaSum = 0;

  driverSessionsMap.forEach((sessions) => {
    if (sessions.length < 2) return;
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
    const delta = sorted[sorted.length - 1].score - sorted[0].score;
    recurrentTotal += 1;
    recurrentDeltaSum += delta;
    if (delta >= 0.2) recurrentImproved += 1;
    else if (delta <= -0.2) recurrentWorsened += 1;
    else recurrentStable += 1;
  });

  const evolucionEjercicios = Array.from(exerciseYearMap.values())
    .map((entry) => {
      const years = Array.from(entry.byYear.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      const yFirst = years[0];
      const yLast = years[years.length - 1];
      const bFirst = entry.byYear.get(yFirst)!;
      const bLast = entry.byYear.get(yLast)!;
      const primerPromedio = Number((bFirst.sum / bFirst.count).toFixed(2));
      const ultimoPromedio = Number((bLast.sum / bLast.count).toFixed(2));
      const cambioPuntos = years.length >= 2 ? Number((ultimoPromedio - primerPromedio).toFixed(2)) : 0;

      return {
        nombre: entry.nombre,
        primerAnio: yFirst,
        ultimoAnio: yLast,
        primerPromedio,
        ultimoPromedio,
        cambioPuntos,
        aniosComparados: years.length,
        esConcientizacionIntencional: isAlcoholAwarenessExercise(entry.nombre)
      };
    })
    .sort((a, b) => a.cambioPuntos - b.cambioPuntos || a.ultimoPromedio - b.ultimoPromedio);

  const erroresFrecuentesHistoricos = Array.from(mistakesTotalMap.entries())
    .map(([nombre, repeticionesHistoricas]) => ({
      nombre,
      repeticionesHistoricas,
      repeticionesUltimoAnio: mistakesLatestYearMap.get(nombre) || 0
    }))
    .sort(
      (a, b) =>
        b.repeticionesUltimoAnio - a.repeticionesUltimoAnio ||
        b.repeticionesHistoricas - a.repeticionesHistoricas
    )
    .slice(0, 6);

  return {
    empresa: input.companyName,
    alcance: input.scopeLabel || (aniosEvaluados >= 2 ? `${aniosEvaluados} años evaluados` : '1 año (En curso)'),
    aniosEvaluados,
    primerAnio: firstRow?.year || 'N/D',
    ultimoAnio: lastRow?.year || 'N/D',
    totalEvaluaciones,
    primeraCalificacion,
    ultimaCalificacion,
    cambioCalificacionPuntos,
    tendenciaCalificacion,
    primeraTasaAprobacion,
    ultimaTasaAprobacion,
    cambioTasaAprobacionPts,
    primeraTasaIncidentes,
    ultimaTasaIncidentes,
    cambioTasaIncidentes,
    tendenciaSiniestralidad,
    desgloseAnual: orderedRows.map((row) => ({
      anio: row.year,
      evaluaciones: row.evalCount,
      operadores: row.operatorCount,
      calificacionPromedio: Number(row.avgScore.toFixed(2)),
      tasaAprobacionPct: Number(row.passRate.toFixed(1)),
      incidentesTotales: row.totalIncidents,
      desgloseIncidencias: groupIncidentCollisions(row.incidentDetails || []),
      incidenciasPorOperador: row.accidentRate
    })),
    operadoresRecurrentes: {
      total: recurrentTotal,
      mejoraron: recurrentImproved,
      empeoraron: recurrentWorsened,
      estables: recurrentStable,
      cambioPromedioPuntos:
        recurrentTotal > 0 ? Number((recurrentDeltaSum / recurrentTotal).toFixed(2)) : 0
    },
    evolucionEjercicios,
    erroresFrecuentesHistoricos
  };
}

export function buildFleetEvolutionAiPrompt(
  metrics: ReturnType<typeof buildFleetEvolutionAiMetricsContext>
): string {
  return [
    'Eres Tracky, asesor amigable y experto en seguridad vial y capacitación en simuladores de vehículos pesados (TrackSIM).',
    'Analiza la EVOLUCIÓN HISTÓRICA de la flota año contra año y entrega conclusiones ejecutivas claras para dirección y gerencia de flota.',
    'REGLAS ESTRICTAS:',
    '- Usa español sencillo, ejecutivo y accionable, SIN jerga estadística (nada de desviación estándar, mediana, sigma ni percentiles).',
    '- Las tasas son por operador. Si una tasa o total es null, explica que no hay datos completos y no infieras mejoras ni ausencia de incidencias.',
    '- "Atropello de peatón y vuelcos" puede incluir fatalidades históricas sin subtipo; no atribuyas esos registros a un subtipo específico.',
    '- Compara la calificación promedio y la tasa de aprobación entre el primer y el último año; compara las incidencias por operador solo si ambas tasas están disponibles.',
    '- Si existen operadores recurrentes (total > 0), destaca el impacto real de las re-capacitaciones (cuántos mejoraron y su avance promedio).',
    '- Analiza qué ejercicios operativos mejoraron o retrocedieron con el tiempo.',
    '- REGLA CRÍTICA SOBRE "Efectos del alcohol" (esConcientizacionIntencional: true): es un ejercicio de CONCIENTIZACIÓN planeado intencionalmente para obtener mala calificación y choques para sensibilizar al operador. NO lo reportes como retroceso operativo ni recomiendes reentrenar ese escenario.',
    '- En planDeAccion agrupa todas las acciones bajo el plazo "Próximas capacitaciones"; no distingas primera, segunda jornada ni ciclos separados.',
    '- Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin markdown ni texto adicional):',
    '{',
    '  "estadoGeneral": {',
    '    "nivel": "sobresaliente | bueno | atencion | critico",',
    '    "titulo": "Frase ejecutiva corta de máximo 8 palabras sobre la trayectoria",',
    '    "resumenSimple": "2 oraciones claras explicando la tendencia año contra año en calificación, seguridad y aprobación."',
    '  },',
    '  "loQueVaBien": [',
    '    { "titulo": "Avance histórico", "detalle": "Dato concreto del progreso entre años o impacto de re-capacitación." }',
    '  ],',
    '  "focosDeAtencion": [',
    '    { "titulo": "Retroceso o riesgo persistente", "porqueImporta": "Impacto operativo, financiero o de seguridad si continúa.", "nivel": "alto | medio" }',
    '  ],',
    '  "planDeAccion": [',
    '    { "plazo": "Próximas capacitaciones", "accion": "Medida estratégica concreta para la flota", "impacto": "Resultado esperado" }',
    '  ],',
    '  "metasSimples": [',
    '    { "indicador": "Nombre corto", "actual": "Valor último año", "meta": "Meta siguiente ciclo anual" }',
    '  ]',
    '}',
    '',
    'Datos históricos de evolución (JSON):',
    JSON.stringify(metrics)
  ].join('\n');
}

export function buildLocalFleetEvolutionFallbackStructured(
  metrics: ReturnType<typeof buildFleetEvolutionAiMetricsContext>
): CompanyAiStructuredReport {
  const multiYear = metrics.aniosEvaluados >= 2;
  const nivel: CompanyAiStructuredReport['estadoGeneral']['nivel'] =
    metrics.ultimaCalificacion >= 8.0 && metrics.cambioCalificacionPuntos >= 0 && metrics.ultimaTasaIncidentes !== null && metrics.ultimaTasaIncidentes <= 0.35
      ? 'sobresaliente'
      : metrics.tendenciaCalificacion === 'descenso' || metrics.tendenciaSiniestralidad === 'deterioro' || metrics.ultimaCalificacion < 6.0
        ? metrics.ultimaCalificacion < 6.0 || (metrics.cambioCalificacionPuntos <= -0.8 && metrics.cambioTasaIncidentes !== null && metrics.cambioTasaIncidentes > 0.2)
          ? 'critico'
          : 'atencion'
        : metrics.ultimaCalificacion >= 7.0
          ? 'bueno'
          : 'atencion';

  const titulo =
    multiYear && metrics.tendenciaCalificacion === 'mejora'
      ? 'Evolución histórica positiva en desempeño y control'
      : multiYear && metrics.tendenciaCalificacion === 'descenso'
        ? 'Retroceso interanual que requiere ajuste de enfoque'
        : multiYear
          ? 'Desempeño histórico estable con oportunidades puntuales'
          : 'Línea base histórica lista para comparar ciclos';

  const scoreDeltaPhrase = multiYear
    ? `entre ${metrics.primerAnio} y ${metrics.ultimoAnio} el promedio pasó de ${metrics.primeraCalificacion.toFixed(2)} a ${metrics.ultimaCalificacion.toFixed(2)} (${metrics.cambioCalificacionPuntos >= 0 ? '+' : ''}${metrics.cambioCalificacionPuntos.toFixed(2)} pts)`
    : `durante ${metrics.ultimoAnio} se registró un promedio de ${metrics.ultimaCalificacion.toFixed(2)} sobre 10`;
  const incidentPhrase = multiYear && metrics.primeraTasaIncidentes !== null && metrics.ultimaTasaIncidentes !== null
    ? ` La tasa de incidencias por operador pasó de ${metrics.primeraTasaIncidentes.toFixed(2)} a ${metrics.ultimaTasaIncidentes.toFixed(2)}.`
    : !multiYear && metrics.ultimaTasaIncidentes !== null
      ? ` Se registraron ${metrics.ultimaTasaIncidentes.toFixed(2)} incidencias por operador.`
      : ' La comparación de incidencias no está disponible por falta de datos completos.';

  const resumenSimple = `En ${metrics.empresa}, ${scoreDeltaPhrase}.${incidentPhrase} La tasa de aprobación más reciente se ubica en ${metrics.ultimaTasaAprobacion.toFixed(1)}% con ${metrics.totalEvaluaciones} evaluaciones acumuladas.`;

  const operationalExercises = metrics.evolucionEjercicios.filter((ex) => !ex.esConcientizacionIntencional);
  const improvedEx = [...operationalExercises]
    .filter((ex) => ex.aniosComparados >= 2 && ex.cambioPuntos > 0)
    .sort((a, b) => b.cambioPuntos - a.cambioPuntos)[0];
  const regressedEx = [...operationalExercises]
    .filter((ex) => (ex.aniosComparados >= 2 && ex.cambioPuntos < -0.15) || ex.ultimoPromedio < 7.0)
    .sort((a, b) => a.cambioPuntos - b.cambioPuntos || a.ultimoPromedio - b.ultimoPromedio)[0];

  const loQueVaBien: CompanyAiStructuredReport['loQueVaBien'] = [];
  if (multiYear && metrics.cambioCalificacionPuntos > 0) {
    loQueVaBien.push({
      titulo: 'Mejora sostenida en calificación promedio',
      detalle: `Subió +${metrics.cambioCalificacionPuntos.toFixed(2)} puntos de ${metrics.primerAnio} a ${metrics.ultimoAnio}.`
    });
  }
  if (multiYear && metrics.cambioTasaIncidentes !== null && metrics.cambioTasaIncidentes < 0 && metrics.primeraTasaIncidentes !== null && metrics.ultimaTasaIncidentes !== null) {
    loQueVaBien.push({
      titulo: 'Reducción de incidencias por operador',
      detalle: `Bajó de ${metrics.primeraTasaIncidentes.toFixed(2)} a ${metrics.ultimaTasaIncidentes.toFixed(2)} incidencias por operador.`
    });
  }
  if (metrics.operadoresRecurrentes.total > 0 && metrics.operadoresRecurrentes.mejoraron > 0) {
    loQueVaBien.push({
      titulo: 'Impacto positivo en operadores recurrentes',
      detalle: `${metrics.operadoresRecurrentes.mejoraron} de ${metrics.operadoresRecurrentes.total} operadores con múltiples evaluaciones mejoraron su calificación (cambio promedio ${metrics.operadoresRecurrentes.cambioPromedioPuntos >= 0 ? '+' : ''}${metrics.operadoresRecurrentes.cambioPromedioPuntos.toFixed(2)} pts).`
    });
  }
  if (improvedEx) {
    loQueVaBien.push({
      titulo: `Mayor avance en "${improvedEx.nombre}"`,
      detalle: `Pasó de ${improvedEx.primerPromedio.toFixed(1)} (${improvedEx.primerAnio}) a ${improvedEx.ultimoPromedio.toFixed(1)} (${improvedEx.ultimoAnio}).`
    });
  }
  if (loQueVaBien.length === 0) {
    loQueVaBien.push({
      titulo: 'Trazabilidad histórica consolidada',
      detalle: `La flota cuenta con ${metrics.totalEvaluaciones} evaluaciones registradas para dar seguimiento objetivo año contra año.`
    });
  }

  const focosDeAtencion: CompanyAiStructuredReport['focosDeAtencion'] = [];
  if (multiYear && metrics.cambioTasaIncidentes !== null && metrics.cambioTasaIncidentes > 0.05 && metrics.primeraTasaIncidentes !== null && metrics.ultimaTasaIncidentes !== null) {
    focosDeAtencion.push({
      titulo: 'Repunte en tasa de incidencias por operador',
      porqueImporta: `Subió de ${metrics.primeraTasaIncidentes.toFixed(2)} a ${metrics.ultimaTasaIncidentes.toFixed(2)}, aumentando el riesgo de siniestros reales en ruta.`,
      nivel: 'alto'
    });
  }
  if (regressedEx) {
    focosDeAtencion.push({
      titulo: `Brecha operativa en "${regressedEx.nombre}"`,
      porqueImporta:
        regressedEx.aniosComparados >= 2 && regressedEx.cambioPuntos < -0.15
          ? `Retrocedió de ${regressedEx.primerPromedio.toFixed(1)} a ${regressedEx.ultimoPromedio.toFixed(1)} puntos entre ciclos.`
          : `Cerró el último año en ${regressedEx.ultimoPromedio.toFixed(1)} sobre 10, por debajo del nivel esperado.`,
      nivel: regressedEx.ultimoPromedio < 6.0 || regressedEx.cambioPuntos <= -0.8 ? 'alto' : 'medio'
    });
  }
  const topMistake = metrics.erroresFrecuentesHistoricos[0];
  if (topMistake) {
    focosDeAtencion.push({
      titulo: `Error recurrente: "${topMistake.nombre}"`,
      porqueImporta: `Acumula ${topMistake.repeticionesHistoricas} repeticiones históricas (${topMistake.repeticionesUltimoAnio} en ${metrics.ultimoAnio}) con impacto en desgaste y seguridad.`,
      nivel: topMistake.repeticionesUltimoAnio >= 10 ? 'alto' : 'medio'
    });
  }
  if (focosDeAtencion.length === 0) {
    focosDeAtencion.push({
      titulo: 'Prevenir estancamiento entre ciclos anuales',
      porqueImporta: 'Sin metas progresivas por escenario, los hábitos seguros pueden relajarse entre capacitaciones.',
      nivel: 'medio'
    });
  }

  const scoreTarget = Math.min(9.5, Number(Math.max(metrics.ultimaCalificacion + 0.4, 8.0).toFixed(1)));
  const incidentTarget = metrics.ultimaTasaIncidentes === null ? null : Math.max(0, Number((metrics.ultimaTasaIncidentes * 0.75).toFixed(2)));
  const passTarget = Math.min(98, Math.max(85, Math.round(metrics.ultimaTasaAprobacion + 5)));

  return {
    estadoGeneral: {
      nivel,
      titulo,
      resumenSimple
    },
    loQueVaBien: loQueVaBien.slice(0, 3),
    focosDeAtencion: focosDeAtencion.slice(0, 3),
    planDeAccion: [
      {
        plazo: 'Próximas capacitaciones',
        accion: regressedEx
          ? `Priorizar práctica guiada en "${regressedEx.nombre}".`
          : 'Reforzar manejo preventivo y frenado anticipado.',
        impacto: 'Recuperar consistencia técnica y reducir incidentes.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: topMistake
          ? `Monitorear en campo el hábito "${topMistake.nombre}".`
          : 'Monitorear operadores con menor calificación o incidentes.',
        impacto: 'Reducir consumo innecesario de diésel y desgaste de frenos.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: `Buscar una meta promedio de ≥ ${scoreTarget.toFixed(1)} puntos para operadores recurrentes.`,
        impacto: 'Consolidar la mejora continua de la flota.'
      }
    ],
    metasSimples: [
      {
        indicador: 'Promedio flota',
        actual: `${metrics.ultimaCalificacion.toFixed(2)} / 10`,
        meta: `≥ ${scoreTarget.toFixed(1)} / 10`
      },
      {
        indicador: 'Incidencias / operador',
        actual: metrics.ultimaTasaIncidentes === null ? 'No disponible' : metrics.ultimaTasaIncidentes.toFixed(2),
        meta: incidentTarget === null ? 'No disponible' : `≤ ${incidentTarget.toFixed(2)}`
      },
      {
        indicador: 'Tasa de aprobación',
        actual: `${metrics.ultimaTasaAprobacion.toFixed(1)}%`,
        meta: `≥ ${passTarget}%`
      }
    ]
  };
}

export function buildLocalFleetEvolutionFallbackInsight(
  metrics: ReturnType<typeof buildFleetEvolutionAiMetricsContext>
): string {
  return formatStructuredReportAsText(buildLocalFleetEvolutionFallbackStructured(metrics));
}

function buildFleetEvolutionCacheKey(
  metrics: ReturnType<typeof buildFleetEvolutionAiMetricsContext>
): string {
  return `evolution-hybrid-v2|${metrics.empresa}|${metrics.alcance}|${metrics.aniosEvaluados}|${metrics.totalEvaluaciones}|${metrics.ultimaCalificacion}|${JSON.stringify(metrics.desgloseAnual)}|${metrics.operadoresRecurrentes.total}`;
}

export function getCachedFleetEvolutionAiInsight(
  input: FleetEvolutionAiInsightRequest
): CompanyAiInsightResult | null {
  const metrics = buildFleetEvolutionAiMetricsContext(input);
  return readCachedAiInsight(buildFleetEvolutionCacheKey(metrics));
}

export async function generateFleetEvolutionAiInsight(
  input: FleetEvolutionAiInsightRequest
): Promise<CompanyAiInsightResult> {
  const metrics = buildFleetEvolutionAiMetricsContext(input);
  const cacheKey = buildFleetEvolutionCacheKey(metrics);
  const prompt = buildFleetEvolutionAiPrompt(metrics);

  return invokeGeminiStructuredInsight({
    cacheKey,
    prompt,
    buildFallback: () => buildLocalFleetEvolutionFallbackStructured(metrics),
    forceRefresh: input.forceRefresh
  });
}
