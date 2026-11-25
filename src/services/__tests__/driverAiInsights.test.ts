import { describe, expect, it, vi } from 'vitest';
import type { Evaluation } from '../../types';
import {
  buildDriverAiMetricsContext,
  buildDriverAiPrompt,
  buildLocalDriverFallbackStructured,
  generateDriverAiInsight,
  getCachedDriverAiInsight
} from '../driverAiInsights';

const generateContentMock = vi.fn();

vi.mock('firebase/ai', () => ({
  GoogleAIBackend: class MockGoogleAIBackend {},
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  getAI: vi.fn(() => ({})),
  getGenerativeModel: vi.fn(() => ({
    generateContent: generateContentMock
  }))
}));

function createDriverEvaluations(): Evaluation[] {
  return [
    {
      id: 'ev-1',
      conductor: 'Juan Pérez',
      empresa: 'Transcooler',
      sede: 'Atizapán',
      fechaCapacitacion: '2025-05-10',
      evaluacionFinalPuntos: 6.4,
      origen: 'TrackSIM-ZERO-V2',
      erroresFrecuentes: [
        { error: 'Acelerar por encima de la zona verde', repeticiones: 6 },
        { error: 'Colisión con un objeto', repeticiones: 1 }
      ],
      ejercicios: [
        { nombre: 'Efectos del alcohol', calificacion: 4.2, estado: 'Realizado' },
        { nombre: '02 - Montaña', calificacion: 5.8, estado: 'Realizado' },
        { nombre: '05 - Manejo defensivo', calificacion: 8.6, estado: 'Realizado' }
      ]
    },
    {
      id: 'ev-2',
      conductor: 'Juan Pérez',
      empresa: 'Transcooler',
      sede: 'Atizapán',
      fechaCapacitacion: '2026-11-10',
      evaluacionFinalPuntos: 8.1,
      origen: 'TrackSIM-ZERO-V2',
      erroresFrecuentes: [{ error: 'Acelerar por encima de la zona verde', repeticiones: 2 }],
      ejercicios: [
        { nombre: 'Efectos del alcohol', calificacion: 4.5, estado: 'Realizado' },
        { nombre: '02 - Montaña', calificacion: 7.2, estado: 'Realizado' },
        { nombre: '05 - Manejo defensivo', calificacion: 9.0, estado: 'Realizado' }
      ]
    }
  ];
}

describe('driverAiInsights', () => {
  it('aplica el modo mixto de la flota aunque el operador solo tenga sesiones V1', () => {
    const legacy: Evaluation = { id: 'v1', empresa: 'Flota', conductor: 'Ana', colisiones: 2, fatalidades: 1, vehiculoFueraVia: 3 };
    const metrics = buildDriverAiMetricsContext({
      driverName: 'Ana', empresa: 'Flota', evaluations: [legacy],
      contextEvaluations: [legacy, { id: 'v2', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 0, erroresFrecuentes: [] }]
    });
    expect(metrics.totalCriticalEvents).toBe(6);
    expect(metrics.criticalBreakdown).toContainEqual({ nombre: 'Atropello de peatón y vuelcos', total: 1 });
    expect(metrics.criticalBreakdown).toContainEqual({ nombre: 'Salirse de la vía', total: 3 });
  });
  it('calcula evolución individual, incidencias V2 y excluye Efectos del alcohol de refuerzo', () => {
    const evaluations = createDriverEvaluations();
    const metrics = buildDriverAiMetricsContext({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations
    });

    expect(metrics.totalSesiones).toBe(2);
    expect(metrics.primeraCalificacion).toBe(6.4);
    expect(metrics.ultimaCalificacion).toBe(8.1);
    expect(metrics.cambioEnPuntos).toBe(1.7);
    expect(metrics.tendencia).toBe('mejora');
    expect(metrics.totalCriticalEvents).toBeNull();
    expect(metrics.incidentDataIncomplete).toBe(true);
    expect(metrics.criticalBreakdown).toEqual([{ nombre: 'Colisiones', total: 1 }]);
    expect(metrics.ejercicios.find((e) => e.nombre === 'Efectos del alcohol')?.esConcientizacionIntencional).toBe(true);

    const prompt = buildDriverAiPrompt(metrics);
    expect(prompt).toContain('Juan Pérez');
    expect(prompt).toContain('CONCIENTIZACIÓN');

    const structured = buildLocalDriverFallbackStructured(metrics);
    expect(structured.estadoGeneral.resumenSimple).toContain('+1.7');
    expect(structured.focosDeAtencion.map((f) => f.titulo).join(' ')).not.toContain('Efectos del alcohol');
    expect(structured.planDeAccion.map((p) => p.accion).join(' ')).not.toContain('Efectos del alcohol');
  });

  it('prioriza Gemini 3.5 Flash-Lite, guarda caché 24h por operador, conmuta ante 503 y usa respaldo local ante 429', async () => {
    const evaluations = createDriverEvaluations();

    expect(
      getCachedDriverAiInsight({
        driverName: 'Juan Pérez',
        empresa: 'Transcooler',
        evaluations
      })
    ).toBeNull();

    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'bueno',
              titulo: 'Excelente progreso de Juan Pérez',
              resumenSimple: 'Subió 1.7 puntos entre 2025 y 2026.'
            },
            loQueVaBien: [{ titulo: 'Manejo defensivo', detalle: 'Alcanzó 9.0 sobre 10.' }],
            focosDeAtencion: [{ titulo: 'Zona verde', porqueImporta: 'Ayuda a ahorrar diésel.', nivel: 'medio' }],
            planDeAccion: [{ plazo: 'En ruta diaria', accion: 'Mantener RPM estables', impacto: 'Menos consumo.' }],
            metasSimples: [{ indicador: 'Calificación', actual: '8.1 / 10', meta: '≥ 8.8 siguiente ciclo' }]
          })
      }
    });

    const okResult = await generateDriverAiInsight({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations,
      forceRefresh: true
    });
    expect(okResult.source).toBe('gemini');
    expect(okResult.model).toBe('gemini-3.5-flash-lite');
    expect(okResult.fromCache).toBe(false);

    const cached = getCachedDriverAiInsight({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations
    });
    expect(cached?.fromCache).toBe(true);
    expect(cached?.summary).toBe(okResult.summary);

    const viaGenerateCached = await generateDriverAiInsight({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations
    });
    expect(viaGenerateCached.fromCache).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(1);

    generateContentMock.mockRejectedValueOnce(new Error('503 Service Unavailable')).mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'bueno',
              titulo: 'Respaldo 3.8 Flash',
              resumenSimple: 'Análisis individual con modelo respaldo.'
            },
            loQueVaBien: [{ titulo: 'Continuidad', detalle: 'Dos evaluaciones completas.' }],
            focosDeAtencion: [{ titulo: 'Velocidad', porqueImporta: 'Control en bajadas.', nivel: 'medio' }],
            planDeAccion: [{ plazo: 'En ruta diaria', accion: 'Usar retardador', impacto: 'Cuidar balatas.' }],
            metasSimples: [{ indicador: 'Calificación', actual: '8.1 / 10', meta: '≥ 8.8' }]
          })
      }
    });

    const retryResult = await generateDriverAiInsight({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations,
      forceRefresh: true
    });
    expect(retryResult.source).toBe('gemini');
    expect(retryResult.model).toBe('gemini-3.8-flash');

    generateContentMock.mockRejectedValue(new Error('429 quota exceeded'));
    const fallbackResult = await generateDriverAiInsight({
      driverName: 'Juan Pérez',
      empresa: 'Transcooler',
      evaluations,
      forceRefresh: true
    });
    expect(fallbackResult.source).toBe('fallback');
    expect(fallbackResult.structured?.estadoGeneral.titulo).toBeTruthy();
    expect(fallbackResult.summary).toContain('Juan Pérez');
  });
});
