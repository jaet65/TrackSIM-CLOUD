import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import {
  buildCompanyAiMetricsContext,
  buildCompanyAiPrompt,
  buildLocalFallbackInsight,
  generateCompanyAiInsight
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

    expect(context.totalCriticalEvents).toBe(2);
    expect(context.criticalBreakdown).toEqual([{ nombre: 'Colisión con un objeto', total: 2 }]);
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
  });

  it('usa Gemini 3.8 Flash cuando la respuesta es exitosa y hace fallback si hay error de cuota', async () => {
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
    expect(okResult.model).toBe('gemini-3.8-flash');
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
            planDeAccion: [{ plazo: '1er ciclo próximo año', accion: 'Consolidar', impacto: 'Menor riesgo' }],
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
    expect(retryModelResult.model).toBe('gemini-3.5-flash-lite');

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
