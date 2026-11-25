import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import { buildCompanyPresentationData, generateCompanyPresentationPptx } from '../companyPresentationGenerator';

vi.mock('../auditLog', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}));

const writeFileMock = vi.fn().mockResolvedValue('Informe.pptx');
const createdSlides: Array<{ texts: string[] }> = [];

vi.mock('pptxgenjs', () => {
  return {
    default: class MockPptxGenJS {
      layout = '';
      author = '';
      company = '';
      subject = '';
      title = '';
      ChartType = { bar: 'bar', doughnut: 'doughnut' };
      addSlide() {
        const texts: string[] = [];
        createdSlides.push({ texts });
        return {
          background: {},
          addShape: vi.fn(),
          addText: vi.fn((content: unknown) => {
            if (typeof content === 'string') {
              texts.push(content);
            } else if (Array.isArray(content)) {
              texts.push(content.map((item: { text?: string }) => item?.text || '').join(''));
            }
          }),
          addChart: vi.fn(),
          addTable: vi.fn(),
          addImage: vi.fn()
        };
      }
      writeFile = writeFileMock;
    }
  };
});

function createMockCompany(count: number): CompanySummary {
  const conductores = Array.from({ length: count }, (_, idx) => ({
    nombre: `Operador ${idx + 1}`,
    empresa: 'Transcooler',
    sede: idx % 2 === 0 ? 'Atizapán' : 'Monterrey',
    totalEvaluaciones: idx % 3 === 0 ? 2 : 1,
    promedioScore: Number((4.5 + idx * 0.45).toFixed(2)),
    ultimoScore: Number((4.5 + idx * 0.45).toFixed(2)),
    ultimaFecha: '2026-11-10',
    colisiones: idx < 3 ? 1 : 0,
    fatalidades: 0,
    totalFueraVia: 0,
    ejercicios: [],
    estado: idx * 0.45 + 4.5 >= 8 ? 'Sobresaliente' : idx * 0.45 + 4.5 >= 6 ? 'Aprobado' : 'Reforzar'
  }));

  return {
    nombre: 'Transcooler',
    slug: 'transcooler',
    totalConductores: count,
    totalEvaluaciones: count,
    promedioFinal: 7.2,
    promedioHabilidades: 2.1,
    promedioSimulador: 5.1,
    totalColisiones: 3,
    totalFatalidades: 0,
    totalFueraVia: 0,
    tasaAprobacion: 75,
    sedes: ['Atizapán', 'Monterrey'],
    simulacionesPromedio: { simulacion_2: 0, simulacion_3: 0, simulacion_4: 0 },
    nombresSimulaciones: {},
    conductores
  };
}

describe('companyPresentationGenerator', () => {
  it('prepara exactamente Top 10 mejores y Top 10 peores conductores e incidencias críticas V2', () => {
    const comp = createMockCompany(14);
    const evaluations: Evaluation[] = [
      {
        id: 'ev-1',
        empresa: 'Transcooler',
        origen: 'TrackSIM-ZERO-V2',
        erroresFrecuentes: [
          { error: 'Colisión con un vehículo del tráfico', repeticiones: 4 },
          { error: 'Salirse de la vía', repeticiones: 2, severidad: 'CRITICO' },
          { error: 'Exceso de velocidad', repeticiones: 7 }
        ]
      }
    ];

    const data = buildCompanyPresentationData({
      comp,
      selectedYear: '2026',
      periodText: 'Año 2026',
      conductoresRecurrentes: 5,
      pctRecurrentes: '35.7',
      operadoresConHistorialPrevio: { count: 4, pct: '28.6' },
      exerciseStats: [{ key: 'e1', nombre: '02 - Montaña', promedio: 8.4, totalEvaluaciones: 14 }],
      allEvaluations: evaluations
    });

    expect(data.top10Best).toHaveLength(10);
    expect(data.top10Best[0].nombre).toBe('Operador 14');
    expect(data.top10Worst).toHaveLength(10);
    expect(data.top10Worst[0].nombre).toBe('Operador 1');
    expect(data.criticalSummary.hasV2Data).toBe(true);
    expect(data.criticalSummary.totalIncidentes).toBe(6);
    expect(data.criticalSummary.items).toEqual([
      { error: 'Colisión con un vehículo del tráfico', repeticiones: 4 },
      { error: 'Salirse de la vía', repeticiones: 2 }
    ]);
    expect(data.topMistakes[0]).toEqual({ error: 'Exceso de velocidad', repeticiones: 7 });
    expect(data.exercises[0].descripcion.length).toBeGreaterThan(10);
    expect(data.exercises[0].descripcion).not.toBe('Escenario de evaluación práctica en simulador TrackSIM.');
    expect(data.exercises[0].lecturaIA).toContain('Desempeño sólido');
  });

  it('genera el archivo .pptx con nombre sanitizado y ejecuta writeFile', async () => {
    writeFileMock.mockClear();
    const comp = createMockCompany(5);

    const fileName = await generateCompanyPresentationPptx({
      comp,
      selectedYear: 'all',
      periodText: '2024 – 2026',
      conductoresRecurrentes: 2,
      pctRecurrentes: '40.0',
      exerciseStats: [{ key: 'e1', nombre: 'Autopista', promedio: 7.5, totalEvaluaciones: 5 }],
      allEvaluations: []
    });

    expect(fileName).toBe('Resultado TrackSIM - Transcooler - 2024-2026.pptx');
    expect(writeFileMock).toHaveBeenCalledWith({ fileName: 'Resultado TrackSIM - Transcooler - 2024-2026.pptx' });
  });

  it('calcula evolución histórica anual e impacto en operadores recurrentes cuando hay varios años', () => {
    const comp = createMockCompany(4);
    const multiYearEvaluations: Evaluation[] = [
      {
        id: 'y1-1',
        empresa: 'Transcooler',
        conductor: 'Juan Pérez',
        fechaCapacitacion: '2024-05-10',
        evaluacionFinalPuntos: 6.0,
        colisiones: 2
      },
      {
        id: 'y1-2',
        empresa: 'Transcooler',
        conductor: 'Ana López',
        fechaCapacitacion: '2024-06-15',
        evaluacionFinalPuntos: 7.0,
        colisiones: 1
      },
      {
        id: 'y2-1',
        empresa: 'Transcooler',
        conductor: 'Juan Pérez',
        fechaCapacitacion: '2026-11-10',
        evaluacionFinalPuntos: 8.5,
        origen: 'TrackSIM-ZERO-V2',
        erroresFrecuentes: []
      },
      {
        id: 'y2-2',
        empresa: 'Transcooler',
        conductor: 'Ana López',
        fechaCapacitacion: '2026-11-11',
        evaluacionFinalPuntos: 9.1,
        origen: 'TrackSIM-ZERO-V2',
        erroresFrecuentes: [{ error: 'Colisión con un objeto', repeticiones: 1 }]
      }
    ];

    const data = buildCompanyPresentationData({
      comp,
      selectedYear: 'all',
      periodText: '2024 – 2026',
      conductoresRecurrentes: 2,
      pctRecurrentes: '50.0',
      exerciseStats: [],
      allEvaluations: multiYearEvaluations
    });

    expect(data.annualEvolution.hasMultiYear).toBe(true);
    expect(data.annualEvolution.years).toHaveLength(2);
    expect(data.annualEvolution.years[0]).toMatchObject({
      year: '2024',
      operadores: 2,
      promedio: 6.5,
      tasaAccidentes: 1.5
    });
    expect(data.annualEvolution.years[1]).toMatchObject({
      year: '2026',
      operadores: 2,
      promedio: 8.8,
      tasaAccidentes: 0.5
    });
    expect(data.annualEvolution.scoreDeltaFirstToLast).toBe(2.3);
    expect(data.annualEvolution.accidentRateDeltaFirstToLast).toBe(-1);
    expect(data.annualEvolution.recurrentImpact).toEqual({
      count: 2,
      firstAvg: 6.5,
      latestAvg: 8.8,
      improvedCount: 2
    });
  });

  it('agrega la diapositiva ejecutiva de IA antes del cierre cuando se proporciona aiReport', async () => {
    createdSlides.length = 0;
    writeFileMock.mockClear();
    const comp = createMockCompany(5);

    await generateCompanyPresentationPptx({
      comp,
      selectedYear: '2026',
      periodText: 'Año 2026',
      conductoresRecurrentes: 2,
      pctRecurrentes: '40.0',
      exerciseStats: [{ key: 'e1', nombre: 'Autopista', promedio: 7.5, totalEvaluaciones: 5 }],
      allEvaluations: [],
      aiSourceLabel: 'Análisis Ejecutivo con IA (TrackSIM)',
      aiQuality: { score: 85, issues: [] },
      aiCached: true,
      aiReport: {
        estadoGeneral: {
          nivel: 'bueno',
          titulo: 'Flota con avance sólido en 2026',
          resumenSimple: 'Promedio de 7.2 con tendencia favorable.'
        },
        loQueVaBien: [{ titulo: 'Control de carril', detalle: 'Sin salidas de vía graves.' }],
        focosDeAtencion: [
          { titulo: 'Velocidad en pendiente', porqueImporta: 'Incrementa desgaste de frenos.', nivel: 'alto' }
        ],
        planDeAccion: [
          {
            plazo: 'Próximas capacitaciones',
            accion: 'Reforzar uso de freno auxiliar',
            impacto: 'Menor fatiga térmica.'
          }
        ],
        metasSimples: [{ indicador: 'Promedio', actual: '7.2', meta: '≥ 7.8 próximo año' }]
      }
    });

    expect(createdSlides.length).toBe(9);
    const aiSlideTexts = createdSlides[createdSlides.length - 2].texts.join(' ');
    expect(aiSlideTexts).toContain('Conclusiones Ejecutivas y Plan Anual');
    expect(aiSlideTexts).toContain('Flota con avance sólido en 2026');
    expect(aiSlideTexts).toContain('Control de carril');
    expect(aiSlideTexts).toContain('Velocidad en pendiente');
    expect(aiSlideTexts).toContain('Reforzar uso de freno auxiliar');
    expect(aiSlideTexts).not.toContain('METAS PARA EL PRÓXIMO AÑO');
    expect(aiSlideTexts).not.toContain('≥ 7.8 próximo año');
    expect(aiSlideTexts).toContain('Calidad 85/100');
    expect(aiSlideTexts).toContain('Caché');
    expect(aiSlideTexts).toContain('Prioridad operativa');
    expect(createdSlides[createdSlides.length - 1].texts.join(' ')).toContain('¡Gracias por su atención!');
  });
});
