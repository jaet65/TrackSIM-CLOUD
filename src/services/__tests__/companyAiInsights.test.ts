import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import {
  buildCompanyAiMetricsContext,
  buildCompanyAiPrompt,
  buildLocalFallbackInsight,
  buildLocalFallbackStructured,
  generateCompanyAiInsight,
  getCachedCompanyAiInsight,
  validateStructuredAiResponse,
  assessStructuredAiQuality,
  isUsableCompanyAiResult
} from '../companyAiInsights';

const generateContentMock = vi.fn();

vi.mock('firebase/ai', () => ({
  GoogleAIBackend: class MockGoogleAIBackend { },
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  getAI: vi.fn(() => ({})),
  getGenerativeModel: vi.fn(() => ({
    generateContent: generateContentMock
  }))
}));

function createSummary(): CompanySummary {
  return {
    nombre: 'Transcooler',
    slug: 'transcooler',
    totalConductores: 2,
    totalEvaluaciones: 2,
    promedioFinal: 8.15,
    promedioHabilidades: 2.5,
    promedioSimulador: 5.65,
    totalColisiones: 1,
    totalFatalidades: 0,
    totalFueraVia: 0,
    tasaAprobacion: 100,
    sedes: ['Atizapán'],
    simulacionesPromedio: { simulacion_2: 8, simulacion_3: 8, simulacion_4: 8 },
    nombresSimulaciones: {},
    conductores: [
      {
        nombre: 'Juan Pérez',
        empresa: 'Transcooler',
        sede: 'Atizapán',
        totalEvaluaciones: 1,
        promedioScore: 8.5,
        ultimoScore: 8.5,
        ultimaFecha: '2026-11-10',
        colisiones: 0,
        fatalidades: 0,
        totalFueraVia: 0,
        ejercicios: [],
        estado: 'Sobresaliente'
      },
      {
        nombre: 'Ana López',
        empresa: 'Transcooler',
        sede: 'Atizapán',
        totalEvaluaciones: 1,
        promedioScore: 7.8,
        ultimoScore: 7.8,
        ultimaFecha: '2026-11-11',
        colisiones: 1,
        fatalidades: 0,
        totalFueraVia: 0,
        ejercicios: [],
        estado: 'Aprobado'
      }
    ]
  };
}

describe('companyAiInsights', () => {
  it('usa incidencias híbridas y excluye sesiones incompletas de las sesiones sin incidentes', () => {
    const allEvaluations: Evaluation[] = [
      { id: 'legacy', empresa: 'Flota', conductor: 'Ana', colisiones: 1, fatalidades: 0, vehiculoFueraVia: 1, evaluacionFinalPuntos: 7 },
      { id: 'zero', empresa: 'Flota', conductor: 'Luis', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 1,
        erroresFrecuentes: [{ error: 'Atropello de un perro', repeticiones: 1 }, { error: 'Salirse de la vía', repeticiones: 2 }], evaluacionFinalPuntos: 8 },
      { id: 'missing', empresa: 'Flota', conductor: 'Eva', evaluacionFinalPuntos: 9 }
    ];
    const metrics = buildCompanyAiMetricsContext({
      comp: createSummary(), periodText: 'Histórico', selectedYear: 'all', conductoresRecurrentes: 0,
      pctRecurrentes: '0', exerciseStats: [], allEvaluations
    });
    expect(metrics.totalCriticalEvents).toBeNull();
    expect(metrics.criticalBreakdown).toContainEqual({ nombre: 'Salirse de la vía', total: 3 });
    expect(metrics.criticalBreakdown).toContainEqual({ nombre: 'Atropello de un perro', total: 1 });
    expect(metrics.correlacionIncidentes.evaluacionesSinIncidentes).toBe(0);
    expect(metrics.operadoresConIncidentes).toBe(2);
  });
  it('separa una respuesta combinada con Además en recomendaciones independientes', () => {
    const metrics = buildCompanyAiMetricsContext({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });
    const validated = validateStructuredAiResponse(
      {
        estadoGeneral: {
          nivel: 'bueno',
          titulo: 'Flota estable',
          resumenSimple: 'Desempeño estable.'
        },
        loQueVaBien: [{ titulo: 'Control', detalle: 'Buen control general.' }],
        focosDeAtencion: [{ titulo: 'Frenado', porqueImporta: 'Evitar desgaste.', nivel: 'medio' }],
        planDeAccion: [
          {
            plazo: 'Próximas capacitaciones',
            accion: 'Reforzar frenos auxiliares. Además, Practicar técnicas de manejo en zona verde. Además, Reducir el uso incorrecto del retarder.',
            impacto: 'Mejorar seguridad. Además, Reducir consumo.'
          }
        ],
        metasSimples: [{ indicador: 'Promedio', actual: '8.1', meta: '≥ 8.5' }]
      },
      metrics
    );

    expect(validated.planDeAccion.length).toBeGreaterThanOrEqual(2);
    expect(validated.planDeAccion.every((item) => !/además/i.test(item.accion))).toBe(true);
  });

  it('solo permite exportar resultados Gemini con calidad mínima y acepta respaldo local', () => {
    const structured = buildLocalFallbackStructured(
      buildCompanyAiMetricsContext({
        comp: createSummary(),
        periodText: 'Año 2026',
        selectedYear: '2026',
        conductoresRecurrentes: 0,
        pctRecurrentes: '0.0',
        exerciseStats: [],
        allEvaluations: []
      })
    );
    expect(isUsableCompanyAiResult({
      summary: 'Respuesta',
      structured,
      source: 'gemini',
      model: 'gemini-3.5-flash-lite',
      generatedAt: 'ahora',
      quality: { score: 69, issues: ['Jerga técnica'] }
    })).toBe(false);
    expect(isUsableCompanyAiResult({
      summary: 'Respuesta',
      structured,
      source: 'fallback',
      model: 'Motor Local',
      generatedAt: 'ahora',
      quality: { score: 100, issues: [] }
    })).toBe(true);
  });

  it('calcula una calidad visible para respuestas incompatibles', () => {
    const metrics = buildCompanyAiMetricsContext({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });

    const quality = assessStructuredAiQuality(
      {
        estadoGeneral: {
          nivel: 'critico',
          titulo: 'Diagnóstico con desviación estándar',
          resumenSimple: 'Resumen compatible.'
        },
        loQueVaBien: [],
        focosDeAtencion: [
          { titulo: 'Efectos del alcohol', porqueImporta: 'Debe ser concientización.', nivel: 'alto' }
        ],
        planDeAccion: [
          { plazo: 'Esta semana', accion: 'Reforzar.', impacto: 'Mejorar.' }
        ],
        metasSimples: []
      },
      metrics
    );

    expect(quality.score).toBeLessThan(70);
    expect(quality.issues).toContain('Incluyó jerga técnica prohibida');
    expect(quality.issues).toContain('Incluyó el ejercicio de concientización');
    expect(quality.issues).toContain('Incluyó un plazo distinto al horizonte anual');
  });

  it('invalida la caché cuando cambian las métricas relevantes', async () => {
    const baseInput = {
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [] as Array<{ nombre: string; promedio: number; totalEvaluaciones: number }>,
      allEvaluations: [] as Evaluation[]
    };

    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'bueno',
              titulo: 'Flota estable',
              resumenSimple: 'Desempeño estable.'
            },
            loQueVaBien: [{ titulo: 'Continuidad', detalle: 'Base estable.' }],
            focosDeAtencion: [{ titulo: 'Seguimiento', porqueImporta: 'Mantener prevención.', nivel: 'medio' }],
            planDeAccion: [{ plazo: 'Seguimiento anual', accion: 'Mantener capacitación.', impacto: 'Evitar retrocesos.' }],
            metasSimples: [{ indicador: 'Aprobación', actual: '100%', meta: 'Mantener ≥ 95%' }]
          })
      }
    });

    await generateCompanyAiInsight({ ...baseInput, forceRefresh: true });
    expect(getCachedCompanyAiInsight(baseInput)?.fromCache).toBe(true);

    const changedEvaluations: Evaluation[] = [{
      id: 'cache-change',
      empresa: 'Transcooler',
      fechaCapacitacion: '2026-11-21',
      evaluacionFinalPuntos: 4.2,
      colisiones: 3
    }];

    expect(getCachedCompanyAiInsight({ ...baseInput, allEvaluations: changedEvaluations })).toBeNull();
  });

  it('valida el nivel y limpia contenido incompatible con las métricas locales', () => {
    const metrics = buildCompanyAiMetricsContext({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [
        { nombre: '02 - Montaña', promedio: 8.3, totalEvaluaciones: 2 },
        { nombre: 'Efectos del alcohol', promedio: 4.1, totalEvaluaciones: 2 }
      ],
      allEvaluations: []
    });

    const validated = validateStructuredAiResponse(
      {
        estadoGeneral: {
          nivel: 'critico',
          titulo: 'Diagnóstico con desviación estándar',
          resumenSimple: 'Resumen de prueba.'
        },
        loQueVaBien: [
          { titulo: 'Efectos del alcohol', detalle: 'No debe recomendarse como falla técnica.' }
        ],
        focosDeAtencion: [
          { titulo: 'V2', porqueImporta: 'La telemetría agregada indica riesgo.', nivel: 'alto' }
        ],
        planDeAccion: [
          { plazo: 'Esta semana', accion: 'Reforzar maniobras.', impacto: 'Mejorar pronto.' }
        ],
        metasSimples: [
          { indicador: 'Aprobación', actual: '100%', meta: '≥ 95% próximo año' }
        ]
      },
      metrics
    );

    expect(validated.estadoGeneral.nivel).toBe('sobresaliente');
    expect(validated.estadoGeneral.titulo).not.toContain('desviación estándar');
    expect(validated.loQueVaBien.every((item) => !/alcohol/i.test(`${item.titulo} ${item.detalle}`))).toBe(true);
    expect(validated.focosDeAtencion.every((item) => !/V2|telemetría agregada/i.test(`${item.titulo} ${item.porqueImporta}`))).toBe(true);
    expect(validated.planDeAccion[0]?.plazo).toBe('Próximas capacitaciones');
  });

  it('construye contexto de métricas agregadas y prompt ejecutivo con incidencias críticas V2', () => {
    const evaluations: Evaluation[] = [
      {
        id: 'e1',
        empresa: 'Transcooler',
        fechaCapacitacion: '2026-11-10',
        evaluacionFinalPuntos: 8.5,
        origen: 'TrackSIM-ZERO-V2',
        erroresFrecuentes: [{ error: 'Colisión con un objeto', repeticiones: 2 }]
      }
    ];

    const context = buildCompanyAiMetricsContext({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [
        { nombre: '02 - Montaña', promedio: 8.3, totalEvaluaciones: 2 },
        { nombre: 'Efectos del alcohol', promedio: 4.1, totalEvaluaciones: 2 }
      ],
      allEvaluations: evaluations
    });

    expect(context.totalCriticalEvents).toBeNull();
    expect(context.incidentDataIncomplete).toBe(true);
    expect(context.criticalBreakdown).toEqual([{ nombre: 'Colisiones', total: 2 }]);
    expect(context.filtroAnioActivo).toBe('2026');
    expect(context.ejercicios.find((e) => e.nombre === 'Efectos del alcohol')?.esConcientizacionIntencional).toBe(true);
    const prompt = buildCompanyAiPrompt(context);
    expect(prompt).toContain('Transcooler');
    expect(prompt).toContain('Colisión con un objeto');
    expect(prompt).toContain('CONCIENTIZACIÓN');
    expect(prompt).toContain('"filtroAnioActivo":"2026"');

    const allYearsContext = buildCompanyAiMetricsContext({
      comp: createSummary(),
      periodText: '2025 – 2026',
      selectedYear: 'all',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [{ nombre: '02 - Montaña', promedio: 8.3, totalEvaluaciones: 2 }],
      allEvaluations: evaluations
    });
    expect(allYearsContext.filtroAnioActivo).toBe('Todos los años');
    expect(buildCompanyAiPrompt(allYearsContext)).toContain('"filtroAnioActivo":"Todos los años"');

    const fallback = buildLocalFallbackInsight(context);
    expect(fallback).toContain('RESUMEN GENERAL:');
    expect(fallback).toContain('Transcooler');
    expect(fallback).not.toContain('Reforzar la prueba "Efectos del alcohol"');
    expect(buildLocalFallbackStructured(context).planDeAccion).toHaveLength(3);
    expect(buildLocalFallbackStructured(context).planDeAccion[0].plazo).toBe('Próximas capacitaciones');
  });

  it('prioriza Gemini 3.5 Flash-Lite cuando la respuesta es exitosa, respalda con 3.8 Flash y usa motor local si ambos fallan', async () => {
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'sobresaliente',
              titulo: 'Flota con desempeño sólido',
              resumenSimple: 'Desempeño sólido con alta aprobación.'
            },
            loQueVaBien: [{ titulo: 'Buen control', detalle: 'Sin incidentes graves.' }],
            focosDeAtencion: [{ titulo: 'Práctica continua', porqueImporta: 'Mantener nivel.', nivel: 'medio' }],
            planDeAccion: [{ plazo: 'Este mes', accion: 'Seguir evaluando', impacto: 'Estabilidad' }],
            metasSimples: [{ indicador: 'Aprobación', actual: '100%', meta: '≥ 95%' }]
          })
      }
    });

    const okResult = await generateCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: [],
      forceRefresh: true
    });

    expect(okResult.source).toBe('gemini');
    expect(okResult.model).toBe('gemini-3.5-flash-lite');
    expect(okResult.summary).toContain('Desempeño sólido');
    expect(okResult.fromCache).toBe(false);

    const cachedResult = await generateCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });
    expect(cachedResult.fromCache).toBe(true);
    expect(cachedResult.summary).toBe(okResult.summary);
    expect(generateContentMock).toHaveBeenCalledTimes(1);

    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'bueno',
              titulo: 'Resumen histórico todos los años',
              resumenSimple: 'Análisis multi-año.'
            },
            loQueVaBien: [{ titulo: 'Continuidad', detalle: 'Buen desempeño histórico.' }],
            focosDeAtencion: [{ titulo: 'Seguimiento', porqueImporta: 'Reforzar bases.', nivel: 'medio' }],
            planDeAccion: [{ plazo: 'Próximas capacitaciones', accion: 'Consolidar', impacto: 'Menor riesgo' }],
            metasSimples: [{ indicador: 'Aprobación', actual: '100%', meta: '≥ 95% próximo año' }]
          })
      }
    });

    const allYearsResult = await generateCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Histórico general',
      selectedYear: 'all',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });
    expect(allYearsResult.fromCache).toBe(false);
    expect(allYearsResult.summary).toContain('Resumen histórico todos los años');
    expect(generateContentMock).toHaveBeenCalledTimes(2);

    const syncedCache = getCachedCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Histórico general',
      selectedYear: 'all',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });
    expect(syncedCache?.fromCache).toBe(true);
    expect(syncedCache?.summary).toBe(allYearsResult.summary);

    const emptyCache = getCachedCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Año 2025',
      selectedYear: '2025',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: []
    });
    expect(emptyCache).toBeNull();

    generateContentMock.mockRejectedValueOnce(new Error('503 Service Unavailable')).mockResolvedValueOnce({
      response: { text: () => '### 1. Diagnóstico Ejecutivo y Salud de la Flota\nRespaldo con 2.5 Flash.' }
    });

    const retryModelResult = await generateCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: [],
      forceRefresh: true
    });
    expect(retryModelResult.source).toBe('gemini');
    expect(retryModelResult.model).toBe('gemini-3.8-flash');

    generateContentMock.mockRejectedValue(new Error('429 quota exceeded'));

    const fallbackResult = await generateCompanyAiInsight({
      comp: createSummary(),
      periodText: 'Año 2026',
      selectedYear: '2026',
      conductoresRecurrentes: 0,
      pctRecurrentes: '0.0',
      exerciseStats: [],
      allEvaluations: [],
      forceRefresh: true
    });

    expect(fallbackResult.source).toBe('fallback');
    expect(fallbackResult.warning).toContain('503/429');
    expect(fallbackResult.structured?.estadoGeneral.titulo).toBeTruthy();
    expect(fallbackResult.summary).toContain('RESUMEN GENERAL:');
  });
});
