import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import { buildCompanyPresentationData, generateCompanyPresentationPptx } from '../companyPresentationGenerator';

vi.mock('../auditLog', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}));

const writeFileMock = vi.fn().mockResolvedValue('Informe.pptx');

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
        return {
          background: {},
          addShape: vi.fn(),
          addText: vi.fn(),
          addChart: vi.fn(),
          addTable: vi.fn()
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

    expect(fileName).toBe('Informe_Ejecutivo_Transcooler_2024_2026.pptx');
    expect(writeFileMock).toHaveBeenCalledWith({ fileName: 'Informe_Ejecutivo_Transcooler_2024_2026.pptx' });
  });
});
