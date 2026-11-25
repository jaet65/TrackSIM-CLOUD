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
import { getHybridEvaluationIncidents, getIncidentModes } from './incidentMetrics';

export interface DriverAiInsightRequest {
  driverName: string;
  empresa: string;
  evaluations: Evaluation[];
  contextEvaluations?: Evaluation[];
  scopeLabel?: string;
  forceRefresh?: boolean;
}

function getEvalScore(ev: Evaluation): number {
  return ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
}

function getEvalDateLabel(ev: Evaluation, idx: number): string {
  return ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || `Sesión ${idx + 1}`;
}

export function buildDriverAiMetricsContext(input: DriverAiInsightRequest) {
  const orderedEvals = [...(input.evaluations || [])].sort((a, b) => {
    const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
    const db = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
    return String(da).localeCompare(String(db));
  });

  const scores = orderedEvals.map(getEvalScore).filter((s) => s > 0);
  const totalSesiones = orderedEvals.length;
  const primeraCalificacion = scores.length > 0 ? Number(scores[0].toFixed(2)) : 0;
  const ultimaCalificacion = scores.length > 0 ? Number(scores[scores.length - 1].toFixed(2)) : 0;
  const promedioCalificacion =
    scores.length > 0 ? Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(2)) : 0;
  const mejorCalificacion = scores.length > 0 ? Number(Math.max(...scores).toFixed(2)) : 0;
  const cambioEnPuntos = scores.length >= 2 ? Number((ultimaCalificacion - primeraCalificacion).toFixed(2)) : 0;
  const tendencia: 'mejora' | 'retroceso' | 'estable' | 'primera_sesion' =
    scores.length < 2
      ? 'primera_sesion'
      : cambioEnPuntos >= 0.3
        ? 'mejora'
        : cambioEnPuntos <= -0.3
          ? 'retroceso'
          : 'estable';

  const critMap = new Map<string, number>();
  const modes = getIncidentModes([...(input.contextEvaluations || []), ...orderedEvals]);
  let incidentDataIncomplete = orderedEvals.length === 0;
  const mistakesMap = new Map<string, { repeticiones: number; eje?: string }>();
  const exerciseMap = new Map<string, { nombre: string; sum: number; count: number }>();

  let destrezaSum = 0;
  let destrezaCount = 0;
  let ecoSum = 0;
  let ecoCount = 0;
  let habSum = 0;
  let habCount = 0;
  let pracSum = 0;
  let pracCount = 0;

  const historialSesiones = orderedEvals.map((ev, idx) => {
    const score = getEvalScore(ev);
    const incidents = getHybridEvaluationIncidents(ev, modes);
    if (!incidents.complete || incidents.total === null) incidentDataIncomplete = true;
    incidents.details.forEach((item) => {
      if (item.count > 0) critMap.set(item.name, (critMap.get(item.name) || 0) + item.count);
    });

    if (typeof ev.destrezaPuntos === 'number' && typeof ev.destrezaMax === 'number' && ev.destrezaMax > 0) {
      destrezaSum += (ev.destrezaPuntos / ev.destrezaMax) * 100;
      destrezaCount += 1;
    }
    if (typeof ev.ecoDrivingPuntos === 'number' && typeof ev.ecoDrivingMax === 'number' && ev.ecoDrivingMax > 0) {
      ecoSum += (ev.ecoDrivingPuntos / ev.ecoDrivingMax) * 100;
      ecoCount += 1;
    }
    if (typeof ev.habilidadesManejoPct === 'number' && ev.habilidadesManejoPct > 0) {
      habSum += ev.habilidadesManejoPct;
      habCount += 1;
    }
    if (typeof ev.practicaSimuladorPct === 'number' && ev.practicaSimuladorPct > 0) {
      pracSum += ev.practicaSimuladorPct;
      pracCount += 1;
    }

    if (Array.isArray(ev.erroresFrecuentes)) {
      ev.erroresFrecuentes.forEach((m) => {
        const name = (m.error || m.errorRaw || '').trim();
        if (!name) return;
        const prev = mistakesMap.get(name) || { repeticiones: 0, eje: m.ejeNombre || m.ejeShortName };
        prev.repeticiones += m.repeticiones || 1;
        mistakesMap.set(name, prev);
      });
    }

    if (Array.isArray(ev.ejercicios)) {
      ev.ejercicios.forEach((ex) => {
        if (!ex || ex.noRealizado || ex.estado === 'No Realizado') return;
        const exScore = ex.calificacion ?? ex.score;
        if (typeof exScore !== 'number' || Number.isNaN(exScore)) return;
        const rawName = (ex.nombre || (ex.numero ? `Ejercicio ${ex.numero}` : '')).trim();
        if (!rawName) return;
        const key = rawName.toLowerCase();
        const prev = exerciseMap.get(key) || { nombre: rawName, sum: 0, count: 0 };
        prev.sum += exScore;
        prev.count += 1;
        exerciseMap.set(key, prev);
      });
    }

    return {
      fecha: getEvalDateLabel(ev, idx),
      anio: getEvaluationYear(ev),
      calificacion: Number(score.toFixed(2)),
      incidentes: incidents.complete ? incidents.total : null,
      incidenciasConocidas: incidents.total,
      datosIncidenciasCompletos: incidents.complete
    };
  });

  const criticalBreakdown = Array.from(critMap.entries())
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);
  const totalCriticalEvents = incidentDataIncomplete ? null : criticalBreakdown.reduce((sum, item) => sum + item.total, 0);

  const topMistakes = Array.from(mistakesMap.entries())
    .map(([nombre, d]) => ({ nombre, repeticiones: d.repeticiones, eje: d.eje || undefined }))
    .sort((a, b) => b.repeticiones - a.repeticiones)
    .slice(0, 8);

  const ejercicios = Array.from(exerciseMap.values())
    .map((ex) => ({
      nombre: ex.nombre,
      promedio: Number((ex.sum / ex.count).toFixed(2)),
      evaluaciones: ex.count,
      esConcientizacionIntencional: isAlcoholAwarenessExercise(ex.nombre)
    }))
    .sort((a, b) => a.promedio - b.promedio);

  const latestEval = orderedEvals[orderedEvals.length - 1];
  const sede = latestEval?.sede || latestEval?.ciudad || 'Principal';

  return {
    operador: input.driverName,
    empresa: input.empresa || latestEval?.empresa || 'TrackSIM',
    sede,
    alcance: input.scopeLabel || (totalSesiones === 1 ? 'Sesión individual' : `Historial de ${totalSesiones} sesiones`),
    totalSesiones,
    primeraCalificacion,
    ultimaCalificacion,
    promedioCalificacion,
    mejorCalificacion,
    cambioEnPuntos,
    tendencia,
    dimensionesPct: {
      destrezaPct: destrezaCount > 0 ? Number((destrezaSum / destrezaCount).toFixed(1)) : null,
      ecoDrivingPct: ecoCount > 0 ? Number((ecoSum / ecoCount).toFixed(1)) : null,
      habilidadesManejoPct: habCount > 0 ? Number((habSum / habCount).toFixed(1)) : null,
      practicaSimuladorPct: pracCount > 0 ? Number((pracSum / pracCount).toFixed(1)) : null
    },
    totalCriticalEvents,
    incidentDataIncomplete,
    criticalBreakdown,
    topMistakes,
    ejercicios,
    historialSesiones: historialSesiones.slice(-6)
  };
}

export function buildDriverAiPrompt(metrics: ReturnType<typeof buildDriverAiMetricsContext>): string {
  return [
    'Eres Tracky, asesor amigable y experto en conducción segura de vehículos pesados (TrackSIM).',
    'Redacta retroalimentación individual personalizada, respetuosa y práctica para revisar con el operador y su supervisor.',
    'REGLAS ESTRICTAS:',
    '- Usa un español claro, cercano y motivador, SIN jerga estadística (nada de desviación estándar, mediana, sigma ni siglas V2).',
    '- Destaca si mejoró o retrocedió respecto a sesiones previas cuando totalSesiones >= 2.',
    '- Si los datos de incidencias son incompletos o null, no afirmes que no hubo incidentes ni inventes totales o tendencias.',
    '- "Atropello de peatón y vuelcos" puede incluir fatalidades históricas sin subtipo; no atribuyas esos registros a un subtipo específico.',
    '- En focosDeAtencion y planDeAccion enfócate en 2 o 3 hábitos concretos para las próximas capacitaciones y para aplicar en ruta (ahorro de diésel, cuidado de frenos, distancia de seguridad y carril). Todas las acciones deben agruparse bajo el plazo "Próximas capacitaciones"; no uses ciclos separados.',
    '- REGLA SOBRE "Efectos del alcohol" (esConcientizacionIntencional: true): es un ejercicio de CONCIENTIZACIÓN planeado intencionalmente para salir mal y evidenciar riesgos de conducir alcoholizado. Es completamente natural tener calificación baja y accidentes ahí; NO lo pongas como error del operador ni recomiendes reforzar ese ejercicio.',
    '- Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta (sin markdown ni texto extra):',
    '{',
    '  "estadoGeneral": {',
    '    "nivel": "sobresaliente | bueno | atencion | critico",',
    '    "titulo": "Frase corta de máximo 8 palabras sobre el operador",',
    '    "resumenSimple": "2 oraciones claras con su calificación, avance entre sesiones si aplica y nivel de seguridad."',
    '  },',
    '  "loQueVaBien": [',
    '    { "titulo": "Fortaleza concreta", "detalle": "Qué hace bien con su dato real." }',
    '  ],',
    '  "focosDeAtencion": [',
    '    { "titulo": "Hábito a corregir", "porqueImporta": "Impacto práctico en ruta, combustible, frenos o seguridad.", "nivel": "alto | medio" }',
    '  ],',
    '  "planDeAccion": [',
    '    { "plazo": "Próximas capacitaciones", "accion": "Acción práctica y específica para el operador", "impacto": "Beneficio esperado" }',
    '  ],',
    '  "metasSimples": [',
    '    { "indicador": "Nombre corto", "actual": "Valor actual", "meta": "Meta siguiente evaluación" }',
    '  ]',
    '}',
    '',
    'Datos del operador (JSON):',
    JSON.stringify(metrics)
  ].join('\n');
}

export function buildLocalDriverFallbackStructured(
  metrics: ReturnType<typeof buildDriverAiMetricsContext>
): CompanyAiStructuredReport {
  const refScore = metrics.ultimaCalificacion || metrics.promedioCalificacion;
  const nivel: CompanyAiStructuredReport['estadoGeneral']['nivel'] =
    refScore >= 8.0 && metrics.totalCriticalEvents === 0
      ? 'sobresaliente'
      : refScore >= 8.0 || (refScore >= 7.0 && metrics.totalCriticalEvents !== null && metrics.totalCriticalEvents <= 1)
        ? 'bueno'
        : refScore >= 6.0
          ? 'atencion'
          : 'critico';

  const titulo =
    nivel === 'sobresaliente'
      ? 'Desempeño sobresaliente y conducción muy segura'
      : nivel === 'bueno'
        ? 'Buen manejo general con detalles por afinar'
        : nivel === 'atencion'
          ? 'Desempeño regular: requiere pulir hábitos en ruta'
          : 'Prioridad de refuerzo técnico y conducción preventiva';

  const evolutionPhrase =
    metrics.totalSesiones >= 2
      ? metrics.cambioEnPuntos >= 0.3
        ? ` Mostró una mejora de +${metrics.cambioEnPuntos.toFixed(1)} puntos respecto a su primera sesión (${metrics.primeraCalificacion.toFixed(1)} → ${metrics.ultimaCalificacion.toFixed(1)}).`
        : metrics.cambioEnPuntos <= -0.3
          ? ` Bajó ${Math.abs(metrics.cambioEnPuntos).toFixed(1)} puntos respecto a su primera sesión (${metrics.primeraCalificacion.toFixed(1)} → ${metrics.ultimaCalificacion.toFixed(1)}).`
          : ` Mantiene un desempeño estable alrededor de ${metrics.promedioCalificacion.toFixed(1)} puntos en ${metrics.totalSesiones} sesiones.`
      : ` Corresponde a su sesión evaluada en ${metrics.alcance}.`;

  const operationalExercises = metrics.ejercicios.filter((ex) => !ex.esConcientizacionIntencional);
  const sortedExDesc = [...operationalExercises].sort((a, b) => b.promedio - a.promedio);
  const bestEx = sortedExDesc[0];
  const worstEx = sortedExDesc[sortedExDesc.length - 1];
  const topCrit = metrics.criticalBreakdown[0];
  const topMistakes = metrics.topMistakes.slice(0, 2);

  const loQueVaBien: CompanyAiStructuredReport['loQueVaBien'] = [];
  if (bestEx) {
    loQueVaBien.push({
      titulo: `Buen control en "${bestEx.nombre}"`,
      detalle: `Obtuvo un promedio de ${bestEx.promedio.toFixed(1)} de 10 en este escenario.`
    });
  }
  if (metrics.totalCriticalEvents === 0) {
    loQueVaBien.push({
      titulo: 'Sin incidentes graves',
      detalle: 'No se registraron incidencias según el criterio del cliente.'
    });
  } else if (metrics.tendencia === 'mejora') {
    loQueVaBien.push({
      titulo: 'Evolución positiva entre evaluaciones',
      detalle: `Subió de ${metrics.primeraCalificacion.toFixed(1)} a ${metrics.ultimaCalificacion.toFixed(1)} puntos.`
    });
  }
  if (loQueVaBien.length === 0) {
    loQueVaBien.push({
      titulo: 'Disposición y registro en simulador',
      detalle: `Alcanzó un promedio general de ${metrics.promedioCalificacion.toFixed(1)} sobre 10.`
    });
  }

  const focosDeAtencion: CompanyAiStructuredReport['focosDeAtencion'] = [];
  if (topCrit) {
    focosDeAtencion.push({
      titulo: `Incidencia registrada: ${topCrit.nombre}`,
      porqueImporta: `Es el punto más urgente a corregir para prevenir percances reales en carretera.`,
      nivel: 'alto'
    });
  }
  if (topMistakes[0]) {
    focosDeAtencion.push({
      titulo: `Hábito repetido: "${topMistakes[0].nombre}"`,
      porqueImporta: `Se repitió ${topMistakes[0].repeticiones} veces y puede aumentar el desgaste mecánico, consumo de diésel o riesgo en ruta.`,
      nivel: topMistakes[0].repeticiones >= 5 ? 'alto' : 'medio'
    });
  }
  if (worstEx && worstEx.nombre !== bestEx?.nombre && worstEx.promedio < 7.5) {
    focosDeAtencion.push({
      titulo: `Reforzar maniobras en "${worstEx.nombre}"`,
      porqueImporta: `Promedió ${worstEx.promedio.toFixed(1)} de 10, siendo su escenario operativo con mayor oportunidad de mejora.`,
      nivel: worstEx.promedio < 6.0 ? 'alto' : 'medio'
    });
  }
  if (focosDeAtencion.length === 0) {
    focosDeAtencion.push({
      titulo: 'Mantener prevención y consistencia',
      porqueImporta: 'Conviene seguir cuidando distancias de frenado y anticipación ante clima o tráfico difícil.',
      nivel: 'medio'
    });
  }

  const targetScore = Math.min(9.5, Number((refScore + 0.8).toFixed(1)));

  return {
    estadoGeneral: {
      nivel,
      titulo,
      resumenSimple: `${metrics.operador} tiene una calificación actual de ${metrics.ultimaCalificacion.toFixed(2)} sobre 10 (promedio ${metrics.promedioCalificacion.toFixed(2)}).${evolutionPhrase}`
    },
    loQueVaBien,
    focosDeAtencion,
    planDeAccion: [
      {
        plazo: 'Próximas capacitaciones',
        accion: topMistakes[0]
          ? `Cuidar el hábito "${topMistakes[0].nombre}" durante las próximas jornadas.`
          : 'Mantener anticipación visual, uso adecuado de frenos auxiliares y respeto a límites de velocidad.',
        impacto: 'Menor consumo de diésel y menor desgaste de frenos y motor.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: `Practicar ${worstEx && worstEx.nombre !== bestEx?.nombre ? `"${worstEx.nombre}"` : 'manejo defensivo'} en simulador.`,
        impacto: 'Mayor seguridad y soltura ante situaciones críticas.'
      },
      {
        plazo: 'Próximas capacitaciones',
        accion: `Confirmar una calificación objetivo de ≥ ${targetScore.toFixed(1)} puntos y cero incidentes graves.`,
        impacto: 'Consolidar conducción segura y consistente.'
      }
    ],
    metasSimples: [
      {
        indicador: 'Calificación',
        actual: `${metrics.ultimaCalificacion.toFixed(1)} / 10`,
        meta: `≥ ${targetScore.toFixed(1)} siguiente ciclo`
      },
      {
        indicador: 'Incidencias',
        actual: metrics.totalCriticalEvents === null ? 'Datos incompletos' : `${metrics.totalCriticalEvents}`,
        meta: '0 incidentes'
      },
      {
        indicador: topMistakes[0] ? 'Error principal' : 'Escenario clave',
        actual: topMistakes[0] ? `${topMistakes[0].repeticiones} veces` : bestEx ? `${bestEx.promedio.toFixed(1)} / 10` : 'En seguimiento',
        meta: topMistakes[0] ? 'Reducir ≥ 50%' : 'Mantener ≥ 8.0'
      }
    ]
  };
}

export function buildLocalDriverFallbackInsight(metrics: ReturnType<typeof buildDriverAiMetricsContext>): string {
  return formatStructuredReportAsText(buildLocalDriverFallbackStructured(metrics));
}

function buildDriverCacheKey(
  input: DriverAiInsightRequest,
  metrics: ReturnType<typeof buildDriverAiMetricsContext>
): string {
  return `driver-hybrid-v2|${metrics.empresa}|${metrics.operador}|${input.scopeLabel || 'history'}|${metrics.totalSesiones}|${metrics.ultimaCalificacion}|${JSON.stringify(metrics.historialSesiones)}|${JSON.stringify(metrics.criticalBreakdown)}`;
}

export function getCachedDriverAiInsight(input: DriverAiInsightRequest): CompanyAiInsightResult | null {
  const metrics = buildDriverAiMetricsContext(input);
  return readCachedAiInsight(buildDriverCacheKey(input, metrics));
}

export async function generateDriverAiInsight(input: DriverAiInsightRequest): Promise<CompanyAiInsightResult> {
  const metrics = buildDriverAiMetricsContext(input);
  const cacheKey = buildDriverCacheKey(input, metrics);
  const prompt = buildDriverAiPrompt(metrics);

  return invokeGeminiStructuredInsight({
    cacheKey,
    prompt,
    buildFallback: () => buildLocalDriverFallbackStructured(metrics),
    forceRefresh: input.forceRefresh
  });
}
