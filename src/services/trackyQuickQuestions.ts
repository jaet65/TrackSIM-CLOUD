import type { Evaluation } from '../types';
import {
  type AiQuickAnswerResult,
  type CompanyAiInsightResult,
  invokeGeminiTextAnswer,
  isAlcoholAwarenessExercise,
  readCachedAiTextAnswer
} from './companyAiInsights';
import { getHybridEvaluationIncidents, getIncidentModes } from './incidentMetrics';

export type TrackySubjectType = 'company' | 'driver' | 'evolution';

export type TrackyQuickQuestionId =
  | 'whatsapp'
  | 'diesel'
  | 'priority_drivers'
  | 'next_course'
  | 'next_session'
  | 'supervisor_talk'
  | 'roi_training';

export interface TrackyQuickQuestion {
  id: TrackyQuickQuestionId;
  icon: string;
  label: string;
  copyLabel: string;
}

export interface TrackyQuickQuestionRequest {
  questionId: TrackyQuickQuestionId;
  subjectType: TrackySubjectType;
  companyName: string;
  periodText: string;
  insight: CompanyAiInsightResult;
  evaluations?: Evaluation[];
  contextEvaluations?: Evaluation[];
  forceRefresh?: boolean;
}

const QUESTIONS_BY_SUBJECT: Record<TrackySubjectType, TrackyQuickQuestion[]> = {
  company: [
    { id: 'whatsapp', icon: '💬', label: 'Resumen para WhatsApp', copyLabel: '💬 Copiar para WhatsApp' },
    { id: 'diesel', icon: '⛽', label: '¿Qué hábitos elevan el diésel?', copyLabel: '📋 Copiar respuesta' },
    { id: 'priority_drivers', icon: '🎯', label: '¿A qué operadores priorizar?', copyLabel: '📋 Copiar respuesta' },
    { id: 'next_course', icon: '📅', label: 'Temario para el próximo curso', copyLabel: '📋 Copiar respuesta' }
  ],
  driver: [
    { id: 'whatsapp', icon: '💬', label: 'Mensaje para el operador', copyLabel: '💬 Copiar para WhatsApp' },
    { id: 'diesel', icon: '⛽', label: '¿Cómo ahorrar diésel y frenos?', copyLabel: '📋 Copiar respuesta' },
    { id: 'next_session', icon: '🎮', label: '¿Qué practicar en simulador?', copyLabel: '📋 Copiar respuesta' },
    { id: 'supervisor_talk', icon: '📋', label: 'Guion rápido para supervisor', copyLabel: '📋 Copiar respuesta' }
  ],
  evolution: [
    { id: 'whatsapp', icon: '💬', label: 'Resumen ejecutivo WhatsApp', copyLabel: '💬 Copiar para WhatsApp' },
    { id: 'roi_training', icon: '📈', label: '¿Funcionó la re-capacitación?', copyLabel: '📋 Copiar respuesta' },
    { id: 'diesel', icon: '⛽', label: 'Hábitos que siguen costando diésel', copyLabel: '📋 Copiar respuesta' },
    { id: 'priority_drivers', icon: '🎯', label: '¿A quiénes reevaluar primero?', copyLabel: '📋 Copiar respuesta' }
  ]
};

const DIESEL_BRAKE_REGEX =
  /di[eé]sel|combust|rpm|revoluc|fren|aceler|veloc|ralent|marcha|cambio|embrag|clutch|eco|inercia/i;

export function getQuickQuestionsForSubject(subjectType: TrackySubjectType): TrackyQuickQuestion[] {
  return QUESTIONS_BY_SUBJECT[subjectType] ?? QUESTIONS_BY_SUBJECT.company;
}

function getEvalScore(ev: Evaluation): number {
  return ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
}

export function buildQuickQuestionContextData(input: TrackyQuickQuestionRequest) {
  const evaluations = input.evaluations || [];
  const modes = getIncidentModes([...(input.contextEvaluations || []), ...evaluations]);
  let incidentDataIncomplete = evaluations.length === 0;

  const driverMap = new Map<
    string,
    { nombre: string; sessions: Array<{ date: string; score: number; incidents: number | null; complete: boolean }> }
  >();
  const dieselMistakesMap = new Map<string, number>();
  const allMistakesMap = new Map<string, number>();
  const exerciseMap = new Map<string, { nombre: string; sum: number; count: number }>();

  let ecoSum = 0;
  let ecoCount = 0;

  evaluations.forEach((ev) => {
    const rawDriver = (ev.conductor || ev.operador || '').trim();
    const score = getEvalScore(ev);
    const incidents = getHybridEvaluationIncidents(ev, modes);
    if (!incidents.complete || incidents.total === null) incidentDataIncomplete = true;

    if (rawDriver) {
      const key = rawDriver.toLowerCase();
      const entry = driverMap.get(key) || { nombre: rawDriver, sessions: [] };
      entry.sessions.push({
        date: String(ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || ''),
        score,
        incidents: incidents.total,
        complete: incidents.complete
      });
      driverMap.set(key, entry);
    }

    if (typeof ev.ecoDrivingPuntos === 'number' && typeof ev.ecoDrivingMax === 'number' && ev.ecoDrivingMax > 0) {
      ecoSum += (ev.ecoDrivingPuntos / ev.ecoDrivingMax) * 100;
      ecoCount += 1;
    }

    if (Array.isArray(ev.erroresFrecuentes)) {
      ev.erroresFrecuentes.forEach((m) => {
        const name = (m.error || m.errorRaw || '').trim();
        if (!name || isAlcoholAwarenessExercise(name)) return;
        const reps = m.repeticiones || 1;
        allMistakesMap.set(name, (allMistakesMap.get(name) || 0) + reps);
        if (DIESEL_BRAKE_REGEX.test(name)) {
          dieselMistakesMap.set(name, (dieselMistakesMap.get(name) || 0) + reps);
        }
      });
    }

    if (Array.isArray(ev.ejercicios)) {
      ev.ejercicios.forEach((ex) => {
        if (!ex || ex.noRealizado || ex.estado === 'No Realizado') return;
        const exScore = ex.calificacion ?? ex.score;
        if (typeof exScore !== 'number' || Number.isNaN(exScore)) return;
        const rawName = (ex.nombre || (ex.numero ? `Ejercicio ${ex.numero}` : '')).trim();
        if (!rawName || isAlcoholAwarenessExercise(rawName)) return;
        const key = rawName.toLowerCase();
        const prev = exerciseMap.get(key) || { nombre: rawName, sum: 0, count: 0 };
        prev.sum += exScore;
        prev.count += 1;
        exerciseMap.set(key, prev);
      });
    }
  });

  let recTotal = 0;
  let recImproved = 0;
  let recWorsened = 0;
  let recStable = 0;
  let recDeltaSum = 0;

  const priorityCandidates: Array<{
    nombre: string;
    sesiones: number;
    ultimaCalificacion: number;
    promedio: number;
    cambioPuntos: number;
    incidentes: number;
    datosIncidenciasCompletos: boolean;
    scorePrioridad: number;
  }> = [];

  driverMap.forEach((entry) => {
    const sorted = [...entry.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const validScores = sorted.map((s) => s.score).filter((s) => s > 0);
    const sesiones = sorted.length;
    const ultimaCalificacion = validScores.length > 0 ? Number(validScores[validScores.length - 1].toFixed(2)) : 0;
    const promedio =
      validScores.length > 0 ? Number((validScores.reduce((sum, s) => sum + s, 0) / validScores.length).toFixed(2)) : 0;
    const cambioPuntos =
      validScores.length >= 2 ? Number((validScores[validScores.length - 1] - validScores[0]).toFixed(2)) : 0;
    const incidentes = sorted.reduce((sum, s) => sum + (s.incidents ?? 0), 0);
    const datosIncidenciasCompletos = sorted.every((s) => s.complete && s.incidents !== null);

    if (validScores.length >= 2) {
      recTotal += 1;
      recDeltaSum += cambioPuntos;
      if (cambioPuntos >= 0.2) recImproved += 1;
      else if (cambioPuntos <= -0.2) recWorsened += 1;
      else recStable += 1;
    }

    if (ultimaCalificacion < 7.5 || incidentes > 0 || cambioPuntos <= -0.4) {
      const scorePrioridad =
        incidentes * 3 + Math.max(0, 7.5 - ultimaCalificacion) + (cambioPuntos <= -0.4 ? Math.abs(cambioPuntos) : 0);
      priorityCandidates.push({
        nombre: entry.nombre,
        sesiones,
        ultimaCalificacion,
        promedio,
        cambioPuntos,
        incidentes,
        datosIncidenciasCompletos,
        scorePrioridad
      });
    }
  });

  const operadoresPrioritarios = priorityCandidates
    .sort((a, b) => b.scorePrioridad - a.scorePrioridad || a.ultimaCalificacion - b.ultimaCalificacion)
    .slice(0, 6)
    .map(({ scorePrioridad: _, ...rest }) => rest);

  const habitosDieselYFrenos = Array.from(dieselMistakesMap.entries())
    .map(([nombre, repeticiones]) => ({ nombre, repeticiones }))
    .sort((a, b) => b.repeticiones - a.repeticiones)
    .slice(0, 6);

  const erroresGeneralesTop = Array.from(allMistakesMap.entries())
    .map(([nombre, repeticiones]) => ({ nombre, repeticiones }))
    .sort((a, b) => b.repeticiones - a.repeticiones)
    .slice(0, 6);

  const ejerciciosOperativosBajos = Array.from(exerciseMap.values())
    .map((ex) => ({
      nombre: ex.nombre,
      promedio: Number((ex.sum / ex.count).toFixed(2)),
      evaluaciones: ex.count
    }))
    .sort((a, b) => a.promedio - b.promedio)
    .slice(0, 4);

  const structured = input.insight.structured;
  const resumenPrincipal = structured
    ? {
        titulo: structured.estadoGeneral.titulo,
        resumenSimple: structured.estadoGeneral.resumenSimple,
        loQueVaBien: structured.loQueVaBien.slice(0, 2),
        focosDeAtencion: structured.focosDeAtencion.slice(0, 2),
        planDeAccion: structured.planDeAccion.slice(0, 2),
        metasSimples: structured.metasSimples.slice(0, 3)
      }
    : {
        titulo: input.companyName,
        resumenSimple: input.insight.summary.slice(0, 500),
        loQueVaBien: [],
        focosDeAtencion: [],
        planDeAccion: [],
        metasSimples: []
      };

  return {
    subjectType: input.subjectType,
    companyName: input.companyName,
    periodText: input.periodText,
    totalEvaluaciones: evaluations.length,
    totalOperadores: driverMap.size,
    incidentDataIncomplete,
    ecoDrivingPromedioPct: ecoCount > 0 ? Number((ecoSum / ecoCount).toFixed(1)) : null,
    operadoresPrioritarios,
    habitosDieselYFrenos,
    erroresGeneralesTop,
    ejerciciosOperativosBajos,
    recurrentesResumen: {
      total: recTotal,
      mejoraron: recImproved,
      empeoraron: recWorsened,
      estables: recStable,
      cambioPromedioPuntos: recTotal > 0 ? Number((recDeltaSum / recTotal).toFixed(2)) : 0
    },
    resumenPrincipal
  };
}

export type QuickQuestionContextData = ReturnType<typeof buildQuickQuestionContextData>;

const QUESTION_INSTRUCTIONS: Record<TrackyQuickQuestionId, string> = {
  whatsapp:
    'Redacta un mensaje LISTO PARA ENVIAR por WhatsApp (6 a 9 líneas cortas, emojis sobrios, máximo 140 palabras). NO incluyas frases introductorias ("Aquí tienes..."), NO uses encabezados markdown ## ni ###. Usa *negritas* simples de WhatsApp y viñetas breves con datos reales.',
  diesel:
    'Explica en lenguaje práctico qué hábitos detectados elevan el gasto de diésel, frenos o desgaste mecánico, y qué 3 ajustes concretos aplicar desde mañana en ruta. Si hay datos de ecoDrivingPromedioPct o habitosDieselYFrenos, cítalos.',
  priority_drivers:
    'Lista a los operadores que requieren seguimiento o re-capacitación prioritaria ordenados del más urgente al menos urgente, explicando con datos reales (calificación, incidentes o retroceso) por qué y en qué enfocar su refuerzo.',
  next_course:
    'Propón el temario concreto para el próximo ciclo de capacitación en simulador (recuerda que los cursos se imparten 1 o 2 veces al año), indicando ejercicios operativos prioritarios y hábitos clave a corregir.',
  next_session:
    'Indica paso a paso qué escenarios y maniobras debe practicar este operador en su próxima sesión de simulador y qué meta numérica debe buscar al cierre.',
  supervisor_talk:
    'Escribe un guion breve de 3 pasos (apertura positiva, 1-2 ajustes clave y compromiso en ruta) para una charla respetuosa y efectiva de 5 minutos entre supervisor y operador.',
  roi_training:
    'Evalúa claramente si la re-capacitación ha dado resultado comparando operadores recurrentes (cuántos mejoraron vs empeoraron y su cambio promedio en puntos) y recomienda cómo maximizar el retorno en el siguiente ciclo anual.'
};

export function buildTrackyQuickQuestionPrompt(
  question: TrackyQuickQuestion,
  contextData: QuickQuestionContextData
): string {
  return [
    'Eres Tracky, asesor amigable y experto en conducción segura de vehículos pesados (TrackSIM).',
    `Contexto: ${contextData.subjectType === 'driver' ? 'Operador individual' : contextData.subjectType === 'evolution' ? 'Evolución histórica de flota' : 'Flota / Empresa'} — ${contextData.companyName} (${contextData.periodText}).`,
    `Pregunta seleccionada: "${question.label}"`,
    '',
    'REGLAS ESTRICTAS:',
    '- Usa español claro, práctico y directo, SIN jerga estadística (nada de desviación estándar, mediana, sigma ni siglas internas).',
    '- Si incidentDataIncomplete o datosIncidenciasCompletos indica datos incompletos, acláralo; no afirmes que no hubo incidencias ni presentes los conteos conocidos como totales.',
    '- Los cursos en simulador se realizan 1 o 2 veces al año; ajusta tus plazos a esa realidad operativa.',
    '- REGLA SOBRE "Efectos del alcohol": es un ejercicio de concientización intencional; NUNCA lo menciones como falla operativa ni recomiendes reforzarlo.',
    `- INSTRUCCIÓN DE FORMATO: ${QUESTION_INSTRUCTIONS[question.id]}`,
    question.id !== 'whatsapp'
      ? '- Utiliza viñetas claras y, si ayuda, un máximo de 1 o 2 subtítulos con `###` para facilitar la lectura.'
      : '',
    '',
    'Datos reales disponibles (JSON):',
    JSON.stringify(contextData)
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildLocalQuickQuestionFallback(
  questionId: TrackyQuickQuestionId,
  ctx: QuickQuestionContextData
): string {
  const { resumenPrincipal, operadoresPrioritarios, habitosDieselYFrenos, erroresGeneralesTop, ejerciciosOperativosBajos, recurrentesResumen } =
    ctx;
  const topDriverNames = operadoresPrioritarios.slice(0, 3);
  const dieselList = habitosDieselYFrenos.length > 0 ? habitosDieselYFrenos : erroresGeneralesTop;
  const topFocus = resumenPrincipal.focosDeAtencion[0];
  const topGood = resumenPrincipal.loQueVaBien[0];
  const topAction = resumenPrincipal.planDeAccion[0];

  switch (questionId) {
    case 'whatsapp': {
      if (ctx.subjectType === 'driver') {
        const lines = [
          `👋 Hola *${ctx.companyName}*, te compartimos tu resumen TrackSIM (${ctx.periodText}):`,
          `📊 *Diagnóstico:* ${resumenPrincipal.titulo}.`,
          topGood ? `✅ *Fortaleza:* ${topGood.titulo} — ${topGood.detalle}` : '',
          topFocus ? `🎯 *Enfoque en ruta:* ${topFocus.titulo}.` : '',
          ejerciciosOperativosBajos[0]
            ? `🎮 *Práctica sugerida:* reforzar "${ejerciciosOperativosBajos[0].nombre}" (${ejerciciosOperativosBajos[0].promedio.toFixed(1)}/10).`
            : '',
          '¡Gracias por tu compromiso con una conducción segura y eficiente! 🚛'
        ].filter(Boolean);
        return lines.join('\n');
      }

      const lines = [
        `📊 *Resumen TrackSIM — ${ctx.companyName}* (${ctx.periodText})`,
        `${resumenPrincipal.titulo}.`,
        topGood ? `✅ *Lo positivo:* ${topGood.titulo}` : '',
        topFocus ? `⚠️ *Foco principal:* ${topFocus.titulo}` : '',
        topDriverNames.length > 0
          ? `🎯 *Prioridad seguimiento:* ${topDriverNames.map((d) => `${d.nombre} (${d.ultimaCalificacion.toFixed(1)})`).join(', ')}`
          : '',
        topAction ? `📅 *Siguiente paso:* ${topAction.accion}` : ''
      ].filter(Boolean);
      return lines.join('\n');
    }

    case 'diesel': {
      const bullets =
        dieselList.length > 0
          ? dieselList
              .slice(0, 4)
              .map(
                (m) =>
                  `- **${m.nombre}** (${m.repeticiones} repeticiones): incrementa el consumo de diésel y exige de más al sistema de frenos.`
              )
          : [
              '- **Anticipación y distancia de seguimiento**: evitar acelerones seguidos de frenados bruscos reduce el gasto de combustible.',
              '- **Uso de freno auxiliar y marcha correcta**: cuidar revoluciones en pendientes protege balatas y mejora rendimiento.'
            ];

      return [
        `### ⛽ Hábitos que impactan diésel y frenos (${ctx.companyName})`,
        ctx.ecoDrivingPromedioPct !== null
          ? `El promedio actual en conducción eficiente (Eco Driving) es de **${ctx.ecoDrivingPromedioPct}%**.`
          : `Con base en las **${ctx.totalEvaluaciones}** evaluaciones de **${ctx.periodText}**, estos hábitos explican el mayor desgaste:`,
        ...bullets,
        '',
        '### ✅ Ajustes prácticos en ruta',
        '- Reforzar la lectura anticipada del camino para soltar acelerador con tiempo en lugar de frenar de golpe.',
        '- Mantener velocidades crucero estables y uso oportuno del freno motor en descensos.'
      ].join('\n');
    }

    case 'priority_drivers': {
      if (operadoresPrioritarios.length === 0) {
        return [
          `### 🎯 Prioridad de seguimiento (${ctx.companyName})`,
          ctx.incidentDataIncomplete
            ? `Los datos de incidencias están incompletos para **${ctx.periodText}**; no es posible descartar operadores con incidencias.`
            : `No se detectaron operadores por debajo de 7.5 ni con incidencias en **${ctx.periodText}**.`,
          '- Mantén seguimiento preventivo en el siguiente ciclo anual para conservar el nivel de toda la flota.'
        ].join('\n');
      }

      const driverLines = operadoresPrioritarios.map((d, idx) => {
        const reasons: string[] = [`calificación ${d.ultimaCalificacion.toFixed(2)}/10`];
        if (d.incidentes > 0) reasons.push(`${d.incidentes} incidencia(s)${d.datosIncidenciasCompletos ? '' : ' conocidas'}`);
        if (!d.datosIncidenciasCompletos) reasons.push('datos de incidencias incompletos');
        if (d.cambioPuntos <= -0.4) reasons.push(`baja de ${Math.abs(d.cambioPuntos).toFixed(1)} pts`);
        return `${idx + 1}. **${d.nombre}** — ${reasons.join(', ')}.`;
      });

      return [
        `### 🎯 Operadores prioritarios para refuerzo (${ctx.companyName})`,
        ...driverLines,
        ...(ctx.incidentDataIncomplete ? ['Los datos de incidencias están incompletos; la lista puede no incluir a todos los operadores que requieren seguimiento.'] : []),
        '',
        '### Recomendación operativa',
        `- Asignar retroalimentación breve en campo antes de la próxima jornada y priorizar práctica enfocada en ${ejerciciosOperativosBajos[0] ? `"${ejerciciosOperativosBajos[0].nombre}"` : 'maniobras defensivas'}.`
      ].join('\n');
    }

    case 'next_course': {
      const modules = ejerciciosOperativosBajos.slice(0, 3).map(
        (ex) => `- **Escenario "${ex.nombre}"** (promedio ${ex.promedio.toFixed(1)}/10): práctica guiada paso a paso.`
      );
      const habitFocus = (dieselList.length > 0 ? dieselList : erroresGeneralesTop).slice(0, 2);

      return [
        `### 📅 Temario sugerido para el próximo ciclo anual (${ctx.companyName})`,
        modules.length > 0
          ? modules.join('\n')
          : '- **Manejo defensivo integral**: control de velocidad, distancias de frenado y anticipación de riesgos.',
        '',
        '### Hábitos a corregir en simulador',
        habitFocus.length > 0
          ? habitFocus.map((h) => `- Corregir **"${h.nombre}"** (${h.repeticiones} registros detectados).`).join('\n')
          : '- Control de velocidad en curva, anticipación visual y frenado progresivo.',
        topDriverNames.length > 0
          ? `\n- **Grupo prioritario de arranque:** ${topDriverNames.map((d) => d.nombre).join(', ')}.`
          : ''
      ]
        .filter(Boolean)
        .join('\n');
    }

    case 'next_session': {
      const targetEx = ejerciciosOperativosBajos[0];
      const topHabit = dieselList[0] || erroresGeneralesTop[0];

      return [
        `### 🎮 Plan de práctica en simulador para ${ctx.companyName}`,
        targetEx
          ? `- **Escenario prioritario:** "${targetEx.nombre}" (promedio actual ${targetEx.promedio.toFixed(1)}/10), buscando superar **8.0/10** sin incidentes.`
          : '- **Escenario prioritario:** conducción defensiva con tráfico pesado y frenado de emergencia.',
        topHabit
          ? `- **Hábito específico a corregir:** reducir repeticiones de **"${topHabit.nombre}"** (${topHabit.repeticiones} registros previos).`
          : '- **Hábito específico a cuidar:** anticipación visual y modulación suave de freno y acelerador.',
        '- Repetir la maniobra clave con retroalimentación inmediata del instructor al cierre de la sesión.'
      ].join('\n');
    }

    case 'supervisor_talk': {
      return [
        `### 📋 Guion breve para charla con ${ctx.companyName} (5 min)`,
        `1. **Reconocer lo positivo:** ${topGood ? `${topGood.titulo} (${topGood.detalle})` : 'Valorar su compromiso y disposición en las evaluaciones de simulador.'}`,
        `2. **Ajuste puntual en ruta:** ${topFocus ? `${topFocus.titulo} — ${topFocus.porqueImporta}` : 'Enfocarse en anticipar frenados y cuidar la velocidad en tramos críticos.'}`,
        `3. **Acuerdo práctico:** ${topAction ? topAction.accion : 'Aplicar un hábito concreto durante los próximos viajes y revisarlo en la siguiente sesión anual.'}`
      ].join('\n');
    }

    case 'roi_training': {
      const summaryLine =
        recurrentesResumen.total > 0
          ? `De **${recurrentesResumen.total}** operadores con evaluaciones en más de una sesión, **${recurrentesResumen.mejoraron}** mejoraron su calificación, **${recurrentesResumen.estables}** se mantuvieron estables y **${recurrentesResumen.empeoraron}** retrocedieron (cambio promedio **${recurrentesResumen.cambioPromedioPuntos >= 0 ? '+' : ''}${recurrentesResumen.cambioPromedioPuntos.toFixed(2)} pts**).`
          : `Actualmente no hay suficientes operadores con múltiples evaluaciones comparables en **${ctx.companyName}** para medir avance individual.`;

      return [
        `### 📈 Impacto de la re-capacitación (${ctx.companyName})`,
        summaryLine,
        topGood ? `- **Evidencia favorable:** ${topGood.titulo} — ${topGood.detalle}` : '',
        topDriverNames.length > 0
          ? `- **Ajuste sugerido para el próximo año:** concentrar refuerzo en ${topDriverNames.map((d) => d.nombre).join(', ')} para consolidar la mejora en toda la flota.`
          : '- **Siguiente paso:** conservar sesiones anuales enfocadas en hábitos preventivos para sostener el progreso.'
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
}

export function validateTrackyQuickAnswer(
  answer: string,
  questionId: TrackyQuickQuestionId,
  ctx: QuickQuestionContextData
): string {
  const forbidden =
    /desviaci[oó]n est[aá]ndar|mediana|sigma|telemetr[ií]a agregada|V2|efectos del alcohol|alcohol/i;
  const hasInvalidText = forbidden.test(answer);
  const tooShort = answer.trim().length < 45;
  let lacksRequiredContext = false;

  if (questionId === 'priority_drivers') {
    lacksRequiredContext =
      ctx.operadoresPrioritarios.length > 0
        ? !ctx.operadoresPrioritarios.some((driver) => answer.includes(driver.nombre))
        : !/no se detectaron|no hay operadores|mantenimiento preventivo|seguimiento preventivo/i.test(answer);
  }
  if (questionId === 'diesel') {
    lacksRequiredContext =
      ctx.habitosDieselYFrenos.length > 0
        ? !ctx.habitosDieselYFrenos.slice(0, 3).some((habit) => answer.includes(habit.nombre))
        : !/di[eé]sel|freno|combustible/i.test(answer);
  }
  if (questionId === 'next_session' && ctx.ejerciciosOperativosBajos[0]) {
    lacksRequiredContext = !answer.includes(ctx.ejerciciosOperativosBajos[0].nombre);
  }
  if (questionId === 'roi_training') {
    lacksRequiredContext =
      ctx.recurrentesResumen.total > 0
        ? !/mejor|retroced|estable|pts/i.test(answer)
        : !/no hay|insuficient|múltiples evaluaciones|recurren/i.test(answer);
  }

  if (hasInvalidText || tooShort || lacksRequiredContext) {
    return buildLocalQuickQuestionFallback(questionId, ctx);
  }

  return answer.trim();
}

function buildQuickQuestionCacheKey(input: TrackyQuickQuestionRequest): string {
  const insightStamp = input.insight.createdAtMs ?? input.insight.generatedAt;
  const modes = getIncidentModes([...(input.contextEvaluations || []), ...(input.evaluations || [])]);
  const evaluationFingerprint = JSON.stringify(
    (input.evaluations || []).map((ev) => ({
      id: ev.id,
      fecha: ev.fechaCapacitacion || ev.fechaReporte || ev.fecha,
      conductor: ev.conductor || ev.operador,
      score: ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore,
      sede: ev.sede || ev.ciudad,
      incidentes: getHybridEvaluationIncidents(ev, modes)
    }))
  );
  let hash = 2166136261;
  for (let i = 0; i < evaluationFingerprint.length; i += 1) {
    hash ^= evaluationFingerprint.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `qa-hybrid-v2|${input.subjectType}|${input.questionId}|${input.companyName}|${input.periodText}|${hash >>> 0}|${insightStamp}`;
}

export function getCachedTrackyQuickAnswer(input: TrackyQuickQuestionRequest): AiQuickAnswerResult | null {
  return readCachedAiTextAnswer(buildQuickQuestionCacheKey(input));
}

export async function askTrackyQuickQuestion(input: TrackyQuickQuestionRequest): Promise<AiQuickAnswerResult> {
  const questions = getQuickQuestionsForSubject(input.subjectType);
  const question = questions.find((q) => q.id === input.questionId) || questions[0];
  const contextData = buildQuickQuestionContextData(input);
  const cacheKey = buildQuickQuestionCacheKey(input);
  const prompt = buildTrackyQuickQuestionPrompt(question, contextData);

  return invokeGeminiTextAnswer({
    cacheKey,
    prompt,
    buildFallback: () => buildLocalQuickQuestionFallback(question.id, contextData),
    validateAnswer: (answer) => validateTrackyQuickAnswer(answer, question.id, contextData),
    forceRefresh: input.forceRefresh,
    maxOutputTokens: question.id === 'whatsapp' ? 600 : 1024
  });
}
