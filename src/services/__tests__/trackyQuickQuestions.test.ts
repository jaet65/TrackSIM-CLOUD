import { describe, expect, it, vi } from 'vitest';
import type { CompanyAiInsightResult } from '../companyAiInsights';
import type { Evaluation } from '../../types';
import {
  askTrackyQuickQuestion,
  buildLocalQuickQuestionFallback,
  buildQuickQuestionContextData,
  buildTrackyQuickQuestionPrompt,
  getCachedTrackyQuickAnswer,
  getQuickQuestionsForSubject,
  validateTrackyQuickAnswer
} from '../trackyQuickQuestions';

const generateContentMock = vi.fn();

vi.mock('firebase/ai', () => ({
  GoogleAIBackend: class MockGoogleAIBackend {},
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  getAI: vi.fn(() => ({})),
  getGenerativeModel: vi.fn(() => ({
    generateContent: generateContentMock
  }))
}));

function createSampleInsight(): CompanyAiInsightResult {
  return {
    source: 'gemini',
    model: 'gemini-3.5-flash-lite',
    generatedAt: '20-nov, 02:50 a. m.',
    createdAtMs: 1795164600000,
    summary: 'Resumen de flota de prueba',
    structured: {
      estadoGeneral: {
        nivel: 'atencion',
        titulo: 'Avance general con operadores por reforzar',
        resumenSimple: 'La flota muestra progreso interanual pero conserva errores en frenado y exceso de revoluciones.'
      },
      loQueVaBien: [
        {
          titulo: 'Mejora en Conducción en Carretera',
          detalle: 'El promedio subió a 8.6 sobre 10 en la última jornada.'
        }
      ],
      focosDeAtencion: [
        {
          titulo: 'Exceso de velocidad y frenado brusco',
          porqueImporta: 'Aumenta consumo de diésel y desgaste de balatas.',
          nivel: 'alto'
        }
      ],
      planDeAccion: [
        {
          plazo: 'Próxima jornada anual',
          accion: 'Reforzar Frenado de Emergencia y eco-conducción en simulador.',
          impacto: 'Reducir incidentes y consumo de combustible.'
        }
      ],
      metasSimples: [{ indicador: 'Promedio', actual: '7.4 / 10', meta: '≥ 8.1 / 10' }]
    }
  };
}

function createSampleEvaluations(): Evaluation[] {
  return [
    {
      id: 'q-1',
      conductor: 'Juan Pérez',
      empresa: 'Transcooler',
      fechaCapacitacion: '2024-03-10',
      evaluacionFinalPuntos: 6.1,
      colisiones: 2,
      vehiculoFueraVia: 0,
      fatalidades: 0,
      ecoDrivingPuntos: 1.8,
      ecoDrivingMax: 3,
      erroresFrecuentes: [
        { error: 'Frenado brusco', repeticiones: 6 },
        { error: 'Exceso de revoluciones RPM', repeticiones: 4 }
      ],
      ejercicios: [
        { nombre: 'Frenado de Emergencia', calificacion: 5.8 },
        { nombre: 'Efectos del alcohol', calificacion: 2.0 }
      ]
    },
    {
      id: 'q-2',
      conductor: 'Juan Pérez',
      empresa: 'Transcooler',
      fechaCapacitacion: '2025-04-10',
      evaluacionFinalPuntos: 8.2,
      colisiones: 0,
      vehiculoFueraVia: 0,
      fatalidades: 0,
      ecoDrivingPuntos: 2.5,
      ecoDrivingMax: 3,
      erroresFrecuentes: [{ error: 'Frenado brusco', repeticiones: 2 }],
      ejercicios: [{ nombre: 'Conducción en Carretera', calificacion: 8.8 }]
    },
    {
      id: 'q-3',
      conductor: 'Carlos Ruiz',
      empresa: 'Transcooler',
      fechaCapacitacion: '2025-04-12',
      evaluacionFinalPuntos: 5.7,
      colisiones: 1,
      vehiculoFueraVia: 1,
      fatalidades: 0,
      ecoDrivingPuntos: 1.5,
      ecoDrivingMax: 3,
      erroresFrecuentes: [
        { error: 'Exceso de velocidad en curva', repeticiones: 5 },
        { error: 'Aceleración brusca', repeticiones: 3 }
      ],
      ejercicios: [
        { nombre: 'Frenado de Emergencia', calificacion: 5.2 },
        { nombre: 'Efectos del alcohol', calificacion: 1.5 }
      ]
    }
  ];
}

describe('trackyQuickQuestions', () => {
  it('reemplaza respuestas rápidas incompatibles por el respaldo local', () => {
    const ctx = buildQuickQuestionContextData({
      questionId: 'diesel',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight: createSampleInsight(),
      evaluations: createSampleEvaluations()
    });

    const fallbackWithAlcohol = validateTrackyQuickAnswer(
      'Debes reforzar el ejercicio de Efectos del alcohol porque tuvo una calificación baja.',
      'diesel',
      ctx
    );
    expect(fallbackWithAlcohol).toContain('Frenado brusco');

    const fallbackForPriority = validateTrackyQuickAnswer(
      'Carlos Ruiz es el operador prioritario.',
      'priority_drivers',
      ctx
    );
    expect(fallbackForPriority).toContain('Carlos Ruiz');

    const fallbackForWrongSession = validateTrackyQuickAnswer(
      'Practica frenado y conducción defensiva buscando 8.0/10.',
      'next_session',
      ctx
    );
    expect(fallbackForWrongSession).toContain('Frenado de Emergencia');
  });

  it('ofrece 4 preguntas rápidas diferenciadas según el contexto (company, driver, evolution)', () => {
    const companyQs = getQuickQuestionsForSubject('company');
    const driverQs = getQuickQuestionsForSubject('driver');
    const evolutionQs = getQuickQuestionsForSubject('evolution');

    expect(companyQs).toHaveLength(4);
    expect(companyQs.map((q) => q.id)).toEqual(['whatsapp', 'diesel', 'priority_drivers', 'next_course']);

    expect(driverQs).toHaveLength(4);
    expect(driverQs.map((q) => q.id)).toEqual(['whatsapp', 'diesel', 'next_session', 'supervisor_talk']);

    expect(evolutionQs).toHaveLength(4);
    expect(evolutionQs.map((q) => q.id)).toEqual(['whatsapp', 'roi_training', 'diesel', 'priority_drivers']);
  });

  it('arma contexto real, genera respaldos locales por pregunta y excluye Efectos del alcohol', () => {
    const insight = createSampleInsight();
    const evaluations = createSampleEvaluations();

    const baseReq = {
      questionId: 'diesel' as const,
      subjectType: 'company' as const,
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations
    };

    const ctx = buildQuickQuestionContextData(baseReq);

    expect(ctx.operadoresPrioritarios[0]?.nombre).toBe('Carlos Ruiz');
    expect(ctx.habitosDieselYFrenos.some((m) => m.nombre === 'Frenado brusco')).toBe(true);
    expect(ctx.habitosDieselYFrenos.some((m) => m.nombre.includes('RPM'))).toBe(true);
    expect(ctx.ejerciciosOperativosBajos.every((ex) => !/alcohol/i.test(ex.nombre))).toBe(true);
    expect(ctx.recurrentesResumen).toEqual({
      total: 1,
      mejoraron: 1,
      empeoraron: 0,
      estables: 0,
      cambioPromedioPuntos: 2.1
    });

    const whatsappPrompt = buildTrackyQuickQuestionPrompt(getQuickQuestionsForSubject('company')[0], ctx);
    expect(whatsappPrompt).toContain('WhatsApp');
    expect(whatsappPrompt).toContain('Efectos del alcohol');

    const whatsappText = buildLocalQuickQuestionFallback('whatsapp', ctx);
    expect(whatsappText).toContain('Transcooler');
    expect(whatsappText).toContain('Carlos Ruiz');
    expect(whatsappText.toLowerCase()).not.toContain('alcohol');

    const dieselText = buildLocalQuickQuestionFallback('diesel', ctx);
    expect(dieselText).toContain('Frenado brusco');
    expect(dieselText).toContain('Eco Driving');

    const priorityText = buildLocalQuickQuestionFallback('priority_drivers', ctx);
    expect(priorityText).toContain('Carlos Ruiz');

    const nextCourseText = buildLocalQuickQuestionFallback('next_course', ctx);
    expect(nextCourseText).toContain('Frenado de Emergencia');
    expect(nextCourseText.toLowerCase()).not.toContain('alcohol');

    const roiText = buildLocalQuickQuestionFallback('roi_training', {
      ...ctx,
      subjectType: 'evolution'
    });
    expect(roiText).toContain('1');
    expect(roiText).toContain('+2.10 pts');

    const driverCtx = buildQuickQuestionContextData({
      ...baseReq,
      questionId: 'next_session',
      subjectType: 'driver',
      companyName: 'Carlos Ruiz',
      evaluations: evaluations.filter((e) => e.conductor === 'Carlos Ruiz')
    });
    expect(buildLocalQuickQuestionFallback('next_session', driverCtx)).toContain('Frenado de Emergencia');
    expect(buildLocalQuickQuestionFallback('supervisor_talk', driverCtx)).toContain('Carlos Ruiz');
  });

  it('consulta Gemini 3.5 Flash-Lite, guarda caché 24h, conmuta ante 503 y cae a respaldo local ante 429', async () => {
    const insight = createSampleInsight();
    const evaluations = createSampleEvaluations();

    expect(
      getCachedTrackyQuickAnswer({
        questionId: 'whatsapp',
        subjectType: 'company',
        companyName: 'Transcooler',
        periodText: 'Año 2025',
        insight,
        evaluations
      })
    ).toBeNull();

    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () => '📊 *Resumen TrackSIM — Transcooler*\n✅ Mejora en carretera.'
      }
    });

    const first = await askTrackyQuickQuestion({
      questionId: 'whatsapp',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations
    });

    expect(first.source).toBe('gemini');
    expect(first.model).toBe('gemini-3.5-flash-lite');
    expect(first.fromCache).toBe(false);
    expect(first.answer).toContain('Transcooler');

    const cached = getCachedTrackyQuickAnswer({
      questionId: 'whatsapp',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations
    });
    expect(cached?.answer).toBe(first.answer);

    const second = await askTrackyQuickQuestion({
      questionId: 'whatsapp',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations
    });
    expect(second.fromCache).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(1);

    generateContentMock.mockRejectedValueOnce(new Error('503 Service Unavailable')).mockResolvedValueOnce({
      response: {
        text: () => '📊 *Resumen actualizado Transcooler*'
      }
    });

    const retried = await askTrackyQuickQuestion({
      questionId: 'whatsapp',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations,
      forceRefresh: true
    });
    expect(retried.source).toBe('gemini');
    expect(retried.model).toBe('gemini-3.8-flash');

    generateContentMock.mockRejectedValue(new Error('429 quota exceeded'));
    const fallback = await askTrackyQuickQuestion({
      questionId: 'whatsapp',
      subjectType: 'company',
      companyName: 'Transcooler',
      periodText: 'Año 2025',
      insight,
      evaluations,
      forceRefresh: true
    });
    expect(fallback.source).toBe('fallback');
    expect(fallback.model).toBe('Motor Local (Respaldo)');
    expect(fallback.answer).toContain('Transcooler');
  });
});
