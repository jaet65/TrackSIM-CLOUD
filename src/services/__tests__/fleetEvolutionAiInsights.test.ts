import { describe, expect, it, vi } from 'vitest';
import type { Evaluation } from '../../types';
import {
  type AnnualEvolutionRowInput,
  buildFleetEvolutionAiMetricsContext,
  buildFleetEvolutionAiPrompt,
  buildLocalFleetEvolutionFallbackInsight,
  buildLocalFleetEvolutionFallbackStructured,
  generateFleetEvolutionAiInsight,
  getCachedFleetEvolutionAiInsight
} from '../fleetEvolutionAiInsights';

const generateContentMock = vi.fn();

vi.mock('firebase/ai', () => ({
  GoogleAIBackend: class MockGoogleAIBackend {},
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  getAI: vi.fn(() => ({})),
  getGenerativeModel: vi.fn(() => ({
    generateContent: generateContentMock
  }))
}));

function createFleetEvolutionEvaluations(): Evaluation[] {
  return [
    {
      id: 'ev-2024-1',
      conductor: 'Juan Pérez',
      empresa: 'Transportes Norte',
      sede: 'Monterrey',
      fechaCapacitacion: '2024-03-15',
      evaluacionFinalPuntos: 6.4,
      colisiones: 2,
      vehiculoFueraVia: 1,
      fatalidades: 0,
      erroresFrecuentes: [
        { error: 'Exceso de velocidad en curva', repeticiones: 4 },
        { error: 'Frenado brusco', repeticiones: 3 }
      ],
      ejercicios: [
        { nombre: 'Conducción en Carretera', calificacion: 6.5 },
        { nombre: 'Frenado de Emergencia', calificacion: 7.4 },
        { nombre: 'Efectos del alcohol', calificacion: 2.0 }
      ]
    },
    {
      id: 'ev-2024-2',
      conductor: 'María López',
      empresa: 'Transportes Norte',
      sede: 'Monterrey',
      fechaCapacitacion: '2024-04-10',
      evaluacionFinalPuntos: 7.2,
      colisiones: 1,
      vehiculoFueraVia: 0,
      fatalidades: 0,
      erroresFrecuentes: [{ error: 'Exceso de velocidad en curva', repeticiones: 2 }],
      ejercicios: [
        { nombre: 'Conducción en Carretera', calificacion: 7.1 },
        { nombre: 'Frenado de Emergencia', calificacion: 7.6 }
      ]
    },
    {
      id: 'ev-2025-1',
      conductor: 'Juan Pérez',
      empresa: 'Transportes Norte',
      sede: 'Monterrey',
      fechaCapacitacion: '2025-03-20',
      evaluacionFinalPuntos: 8.4,
      colisiones: 0,
      vehiculoFueraVia: 0,
      fatalidades: 0,
      erroresFrecuentes: [{ error: 'Frenado brusco', repeticiones: 1 }],
      ejercicios: [
        { nombre: 'Conducción en Carretera', calificacion: 8.7 },
        { nombre: 'Frenado de Emergencia', calificacion: 5.9 },
        { nombre: 'Efectos del alcohol', calificacion: 1.5 }
      ]
    },
    {
      id: 'ev-2025-2',
      conductor: 'María López',
      empresa: 'Transportes Norte',
      sede: 'Monterrey',
      fechaCapacitacion: '2025-04-12',
      evaluacionFinalPuntos: 8.6,
      colisiones: 0,
      vehiculoFueraVia: 0,
      fatalidades: 0,
      erroresFrecuentes: [{ error: 'Exceso de velocidad en curva', repeticiones: 5 }],
      ejercicios: [
        { nombre: 'Conducción en Carretera', calificacion: 8.9 },
        { nombre: 'Frenado de Emergencia', calificacion: 6.1 }
      ]
    }
  ];
}

function createAnnualRows(): AnnualEvolutionRowInput[] {
  return [
    {
      year: '2024',
      evalCount: 2,
      operatorCount: 2,
      avgScore: 6.8,
      passRate: 100,
      collisions: 3,
      offRoad: 1,
      fatalities: 0,
      totalIncidents: 4,
      accidentRate: 2.0
    },
    {
      year: '2025',
      evalCount: 2,
      operatorCount: 2,
      avgScore: 8.5,
      passRate: 100,
      collisions: 0,
      offRoad: 0,
      fatalities: 0,
      totalIncidents: 0,
      accidentRate: 0
    }
  ];
}

describe('fleetEvolutionAiInsights', () => {
  it('agrupa colisiones en filas anuales externas sin cambiar totales ni datos originales', () => {
    const annualRows = createAnnualRows();
    annualRows[0].incidentDetails = [
      { name: 'Colisión con un objeto', count: 1 },
      { name: 'Colisión con unas piedras', count: 2 },
      { name: 'Atropello de un perro', count: 1 }
    ];
    const metrics = buildFleetEvolutionAiMetricsContext({
      companyName: 'Transportes Norte', evaluations: createFleetEvolutionEvaluations(), annualRows
    });
    expect(metrics.desgloseAnual[0].incidentesTotales).toBe(4);
    expect(metrics.desgloseAnual[0].desgloseIncidencias).toEqual([
      { name: 'Colisiones', count: 3 }, { name: 'Atropello de un perro', count: 1 }
    ]);
    expect(annualRows[0].incidentDetails[0]).toEqual({ name: 'Colisión con un objeto', count: 1 });
  });

  it('no calcula una reducción cuando hay años con incidencias incompletas', () => {
    const evaluations: Evaluation[] = [
      { id: 'v1', empresa: 'Flota', conductor: 'Ana', fecha: '2024-01-01', colisiones: 2, fatalidades: 0, vehiculoFueraVia: 1 },
      { id: 'v2', empresa: 'Flota', conductor: 'Ana', fecha: '2025-01-01', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 0 }
    ];
    const metrics = buildFleetEvolutionAiMetricsContext({ companyName: 'Flota', evaluations, annualRows: [] });
    expect(metrics.desgloseAnual[0].incidentesTotales).toBe(3);
    expect(metrics.desgloseAnual[0].desgloseIncidencias).toContainEqual({ name: 'Salirse de la vía', count: 1 });
    expect(metrics.desgloseAnual[1].incidentesTotales).toBeNull();
    expect(metrics.cambioTasaIncidentes).toBeNull();
    expect(metrics.tendenciaSiniestralidad).toBe('no_disponible');
    expect(buildLocalFleetEvolutionFallbackStructured(metrics).estadoGeneral.resumenSimple).toContain('no está disponible');
  });
  it('calcula variación interanual, operadores recurrentes, progresión por ejercicio y excluye Efectos del alcohol', () => {
    const evaluations = createFleetEvolutionEvaluations();
    const annualRows = createAnnualRows();

    const metrics = buildFleetEvolutionAiMetricsContext({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows
    });

    expect(metrics.aniosEvaluados).toBe(2);
    expect(metrics.primerAnio).toBe('2024');
    expect(metrics.ultimoAnio).toBe('2025');
    expect(metrics.cambioCalificacionPuntos).toBe(1.7);
    expect(metrics.tendenciaCalificacion).toBe('mejora');
    expect(metrics.cambioTasaIncidentes).toBe(-2);
    expect(metrics.tendenciaSiniestralidad).toBe('mejora');

    expect(metrics.operadoresRecurrentes).toEqual({
      total: 2,
      mejoraron: 2,
      empeoraron: 0,
      estables: 0,
      cambioPromedioPuntos: 1.7
    });

    const carretera = metrics.evolucionEjercicios.find((e) => e.nombre === 'Conducción en Carretera');
    const frenado = metrics.evolucionEjercicios.find((e) => e.nombre === 'Frenado de Emergencia');
    const alcohol = metrics.evolucionEjercicios.find((e) => e.nombre === 'Efectos del alcohol');

    expect(carretera?.cambioPuntos).toBe(2);
    expect(carretera?.esConcientizacionIntencional).toBe(false);
    expect(frenado?.cambioPuntos).toBe(-1.5);
    expect(frenado?.esConcientizacionIntencional).toBe(false);
    expect(alcohol?.esConcientizacionIntencional).toBe(true);

    const prompt = buildFleetEvolutionAiPrompt(metrics);
    expect(prompt).toContain('esConcientizacionIntencional: true');
    expect(prompt).toContain('Efectos del alcohol');

    const fallbackStructured = buildLocalFleetEvolutionFallbackStructured(metrics);
    expect(fallbackStructured.estadoGeneral.nivel).toBe('sobresaliente');
    expect(fallbackStructured.focosDeAtencion.some((f) => f.titulo.includes('Frenado de Emergencia'))).toBe(true);
    expect(
      fallbackStructured.focosDeAtencion.some((f) => f.titulo.toLowerCase().includes('alcohol'))
    ).toBe(false);
    expect(
      fallbackStructured.planDeAccion.some((p) => p.accion.toLowerCase().includes('alcohol'))
    ).toBe(false);

    const textSummary = buildLocalFleetEvolutionFallbackInsight(metrics);
    expect(textSummary).toContain('Transportes Norte');
  });

  it('prioriza Gemini 3.5 Flash-Lite, guarda caché 24h, conmuta ante 503 y usa respaldo local ante 429', async () => {
    const evaluations = createFleetEvolutionEvaluations();
    const annualRows = createAnnualRows();

    expect(
      getCachedFleetEvolutionAiInsight({
        companyName: 'Transportes Norte',
        scopeLabel: '2 años (2024 - 2025)',
        evaluations,
        annualRows
      })
    ).toBeNull();

    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'sobresaliente',
              titulo: 'Flota con clara mejora año contra año',
              resumenSimple: 'La flota elevó su promedio de 6.80 a 8.50 puntos y eliminó incidentes en 2025.'
            },
            loQueVaBien: [
              {
                titulo: 'Re-capacitación efectiva',
                detalle: 'Los dos operadores recurrentes subieron en promedio +1.70 puntos.'
              }
            ],
            focosDeAtencion: [
              {
                titulo: 'Reforzar Frenado de Emergencia',
                porqueImporta: 'Bajó de 7.5 a 6.0 puntos entre ciclos.',
                nivel: 'medio'
              }
            ],
            planDeAccion: [
              {
                plazo: 'Próxima jornada anual',
                accion: 'Repasar distancia de seguridad y frenado de emergencia en simulador.',
                impacto: 'Recuperar promedio ≥ 8.0 en maniobras críticas.'
              }
            ],
            metasSimples: [
              {
                indicador: 'Promedio flota',
                actual: '8.50 / 10',
                meta: '≥ 8.9 / 10'
              }
            ]
          })
      }
    });

    const firstResult = await generateFleetEvolutionAiInsight({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows
    });

    expect(firstResult.source).toBe('gemini');
    expect(firstResult.model).toBe('gemini-3.5-flash-lite');
    expect(firstResult.fromCache).toBe(false);

    const cachedResult = getCachedFleetEvolutionAiInsight({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows
    });
    expect(cachedResult?.summary).toBe(firstResult.summary);

    const viaGenerateCached = await generateFleetEvolutionAiInsight({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows
    });
    expect(viaGenerateCached.fromCache).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(1);

    generateContentMock.mockRejectedValueOnce(new Error('503 Service Unavailable')).mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            estadoGeneral: {
              nivel: 'bueno',
              titulo: 'Evolución positiva con ajuste puntual',
              resumenSimple: 'Mejora global sostenida entre 2024 y 2025.'
            },
            loQueVaBien: [{ titulo: 'Menos incidentes', detalle: 'Tasa bajó a 0.00 en 2025.' }],
            focosDeAtencion: [
              { titulo: 'Frenado de Emergencia', porqueImporta: 'Presentó descenso interanual.', nivel: 'medio' }
            ],
            planDeAccion: [
              { plazo: 'Siguiente ciclo anual', accion: 'Practicar frenado anticipado.', impacto: 'Mayor margen de reacción.' }
            ],
            metasSimples: [{ indicador: 'Incidentes', actual: '0.00', meta: '0.00' }]
          })
      }
    });

    const retryResult = await generateFleetEvolutionAiInsight({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows,
      forceRefresh: true
    });
    expect(retryResult.source).toBe('gemini');
    expect(retryResult.model).toBe('gemini-3.8-flash');

    generateContentMock.mockRejectedValue(new Error('429 quota exceeded'));
    const fallbackResult = await generateFleetEvolutionAiInsight({
      companyName: 'Transportes Norte',
      scopeLabel: '2 años (2024 - 2025)',
      evaluations,
      annualRows,
      forceRefresh: true
    });
    expect(fallbackResult.source).toBe('fallback');
    expect(fallbackResult.structured?.focosDeAtencion.some((f) => f.titulo.includes('Frenado'))).toBe(true);
  });
});
