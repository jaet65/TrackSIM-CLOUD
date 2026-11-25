// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import { CompanyReportModal } from '../company/CompanyReportModal';

vi.mock('../../services/auditLog', () => ({ logAudit: vi.fn() }));

const company: CompanySummary = {
  nombre: 'Flota',
  slug: 'flota',
  totalEvaluaciones: 3,
  totalConductores: 1,
  promedioFinal: 7,
  promedioHabilidades: 0,
  promedioSimulador: 0,
  tasaAprobacion: 100,
  totalColisiones: 30,
  totalFatalidades: 20,
  totalFueraVia: 10,
  sedes: [],
  conductores: [],
  simulacionesPromedio: { simulacion_2: 0, simulacion_3: 0, simulacion_4: 0 },
  nombresSimulaciones: {}
};

describe('CompanyReportModal', () => {
  it('suma incidencias críticas filtradas de V2 y registros anteriores sin duplicar conteos', () => {
    const evaluations: Evaluation[] = [
      {
        id: 'v2',
        empresa: 'Flota',
        origen: 'TrackSIM-ZERO-V2',
        accidentesCriticos: 99,
        erroresFrecuentes: [
          { error: 'Colisión con un vehículo del tráfico', repeticiones: 2 },
          { error: 'Exceso de velocidad', repeticiones: 3, severidad: 'CRITICO' },
          { error: 'Exceso de velocidad', repeticiones: 7 }
        ]
      },
      {
        id: 'v2-2',
        empresa: 'Flota',
        origen: 'TrackSIM-ZERO-V2',
        erroresFrecuentes: [
          { error: 'Colisión con un vehículo del tráfico', repeticiones: 2 },
          { error: '<script>incidencia</script>', repeticiones: 1, severidad: 'CRITICO' }
        ]
      },
      { id: 'v2-fallback', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 4 },
      { id: 'legacy', empresa: 'Flota', colisiones: 1, fatalidades: 2, vehiculoFueraVia: 1 }
    ];
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      comp: company,
      selectedYear: '2026',
      periodText: 'Año 2026'
    };
    const { rerender } = render(<CompanyReportModal {...props} allEvaluations={evaluations} />);

    const getReport = () => {
      const frame = screen.getByTitle('Vista previa completa del expediente PDF') as HTMLIFrameElement;
      return new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    };
    const getSummary = () => getReport().querySelector('.kpi-grid')!;
    const getBreakdown = () => Array.from(
      getReport().querySelectorAll('section.report-section')
    ).find((section) => section.querySelector('h2')?.textContent === 'Desglose de incidencias críticas')!;
    const getRows = () => Array.from(getBreakdown().querySelectorAll('tbody tr')).map(
      (row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    );
    expect(getSummary().textContent).toContain('Incidencias críticas16');
    expect(getSummary().textContent).not.toMatch(/Colisiones|Fatalidades|Fuera de vía/);
    expect(getRows()).toEqual(expect.arrayContaining([
      ['Colisión con un vehículo del tráfico', '4'],
      ['Exceso de velocidad', '3'],
      ['<script>incidencia</script>', '1'],
      ['Sin desglose disponible', '4'],
      ['Colisiones', '1'],
      ['Fatalidades', '2'],
      ['Salidas de vía', '1']
    ]));
    expect(getRows()).toHaveLength(7);
    expect(getBreakdown().querySelector('script')).toBeNull();

    rerender(<CompanyReportModal {...props} allEvaluations={[evaluations[2]]} />);
    expect(getSummary().textContent).toContain('Incidencias críticas4');
    expect(getRows()).toEqual([['Sin desglose disponible', '4']]);

    rerender(<CompanyReportModal {...props} allEvaluations={[]} />);
    expect(getSummary().textContent).toContain('Incidencias críticas0');
    expect(getBreakdown().textContent).toContain('No hay evaluaciones disponibles');
  });

  it('incluye todos los operadores filtrados en métricas y solo recurrentes en evolución', () => {
    const evaluations: Evaluation[] = [
      { id: '2', empresa: 'Flota', conductor: 'Ana', sede: 'Norte', fecha: '2026-02-01', evaluacionFinalPuntos: 8 },
      { id: '1', empresa: 'Flota', conductor: 'Ana', sede: 'Norte', fecha: '2026-01-01', evaluacionFinalPuntos: 6 },
      { id: '3', empresa: 'Flota', conductor: 'Luis', sede: 'Sur', fecha: '2026-03-01', evaluacionFinalPuntos: 9 }
    ];
    const props = { isOpen: true, onClose: vi.fn(), comp: company, selectedYear: '2026', periodText: 'Año 2026' };
    const { rerender } = render(<CompanyReportModal {...props} allEvaluations={evaluations} />);
    const section = (heading: string) => {
      const frame = screen.getByTitle('Vista previa completa del expediente PDF') as HTMLIFrameElement;
      const report = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
      return Array.from(report.querySelectorAll('section.report-section'))
        .find((item) => item.querySelector('h2')?.textContent === heading);
    };
    const cards = () => Array.from(section('Resumen ejecutivo')!.querySelectorAll('.kpi-grid > div'));
    expect(cards()[0].querySelector('span')?.textContent).toBe('Operadores');
    expect(cards()[1].querySelector('span')?.textContent).toBe('Operadores con más de una evaluación');
    expect(cards()[1].querySelector('strong')?.textContent).toBe('1');
    const metrics = section('Métricas por operador')!;
    expect(metrics.textContent).toContain('Ana');
    expect(metrics.textContent).toContain('Luis');
    expect(metrics.textContent).toContain('7.00 / 10');
    expect(metrics.textContent).toContain('8.00 / 10');
    expect(metrics.textContent).toContain('2026-02-01');
    expect(section('Evolución por operador recurrente')?.textContent).toContain('Ana');
    expect(section('Evolución por operador recurrente')?.textContent).not.toContain('Luis');
    const evolutionCells = Array.from(section('Evolución por operador recurrente')!.querySelectorAll('tbody td'))
      .map((cell) => cell.textContent);
    expect(evolutionCells).toEqual(['1', 'Ana', '2', '6.00', '8.00', '+2.00 pts', 'Mejora']);
    expect(section('Detalle de evolución por operador')).toBeUndefined();

    rerender(<CompanyReportModal {...props} allEvaluations={[evaluations[2]]} />);
    expect(cards()[1].querySelector('strong')?.textContent).toBe('0');
    expect(section('Métricas por operador')?.textContent).toContain('Luis');
    expect(section('Métricas por operador')?.textContent).not.toContain('Ana');
    expect(section('Evolución por operador recurrente')).toBeUndefined();
    expect(section('Detalle de evolución por operador')).toBeUndefined();
  });

  it('no inventa evolución cuando faltan fechas o calificaciones', () => {
    const evaluations: Evaluation[] = Array.from({ length: 101 }, (_, index) => ({
      id: `${index}`,
      empresa: 'Flota',
      conductor: 'Ana',
      fecha: index === 0 ? undefined : '2026-02-01',
      evaluacionFinalPuntos: 8
    }));
    evaluations.push({ id: 'local', empresa: 'Flota', conductor: 'Ana', fecha: '01/01/2026' });
    const props = { isOpen: true, onClose: vi.fn(), comp: company, selectedYear: '2026', periodText: 'Año 2026' };
    const { rerender } = render(<CompanyReportModal {...props} allEvaluations={evaluations} />);
    const frame = screen.getByTitle('Vista previa completa del expediente PDF') as HTMLIFrameElement;
    const report = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    const sections = Array.from(report.querySelectorAll('section.report-section'));
    const evolution = sections.find((item) => item.querySelector('h2')?.textContent === 'Evolución por operador recurrente')!;
    expect(evolution.textContent).toContain('No comparable');
    expect(sections.find((item) => item.querySelector('h2')?.textContent === 'Detalle de evolución por operador')).toBeUndefined();

    rerender(<CompanyReportModal {...props} allEvaluations={evaluations.slice(1, 3)} />);
    const updatedReport = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    const updatedEvolution = Array.from(updatedReport.querySelectorAll('section.report-section'))
      .find((item) => item.querySelector('h2')?.textContent === 'Evolución por operador recurrente')!;
    expect(updatedEvolution.querySelector('tbody')?.textContent).toContain('No comparable');
  });

  it('grafica promedios anuales y tasa de incidentes por operador con los filtros activos', () => {
    const evaluations: Evaluation[] = [
      { id: '1', empresa: 'Flota', conductor: 'Ana', fecha: '2024-01-01', evaluacionFinalPuntos: 6, colisiones: 2 },
      { id: '2', empresa: 'Flota', conductor: 'Ana', fecha: '2024-02-01', evaluacionFinalPuntos: 8 },
      { id: '3', empresa: 'Flota', conductor: 'Luis', fecha: '2024-03-01', evaluacionFinalPuntos: 7, fatalidades: 1 },
      { id: '4', empresa: 'Flota', conductor: 'Ana', fecha: '2025-01-01', evaluacionFinalPuntos: 8, origen: 'TrackSIM-ZERO-V2', erroresFrecuentes: [{ error: 'Colisión con un vehículo del tráfico', repeticiones: 1 }] },
      { id: '5', empresa: 'Flota', conductor: 'Luis', fecha: '2025-02-01', evaluacionFinalPuntos: 9 },
      { id: '6', empresa: 'Flota', conductor: 'Luis', evaluacionFinalPuntos: 10 }
    ];
    const props = { isOpen: true, onClose: vi.fn(), comp: company, selectedYear: 'all', periodText: '2024 – 2025' };
    const { rerender } = render(<CompanyReportModal {...props} allEvaluations={evaluations} />);
    const getReport = () => {
      const frame = screen.getByTitle('Vista previa completa del expediente PDF') as HTMLIFrameElement;
      return new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    };
    const graphValues = (label: string) => Array.from(
      getReport().querySelectorAll(`svg[aria-label="${label}"] g title`)
    ).map((title) => title.textContent);
    expect(graphValues('Calificación promedio anual de la flota')).toEqual(['2024: 7.00', '2025: 8.50']);
    expect(graphValues('Incidentes viales anuales por operador evaluado')).toEqual(['2024: 1.50', '2025: 0.50']);
    expect(getReport().body.textContent).toContain('Reducción de 1.00 incidentes por operador');
    expect(getReport().body.textContent).toContain('1 evaluación sin año se excluyó');
    expect(getReport().body.textContent).not.toContain('Detalle de evolución por operador');

    rerender(<CompanyReportModal {...props} selectedYear="2025" periodText="Año 2025" allEvaluations={evaluations.slice(3, 5)} />);
    expect(graphValues('Calificación promedio anual de la flota')).toEqual(['2025: 8.50']);
    expect(getReport().body.textContent).toContain('Se necesitan al menos dos años para comparar la tasa.');
    expect(getReport().body.textContent).not.toContain('Reducción de');

    rerender(<CompanyReportModal {...props} allEvaluations={[
      { id: 'zero', empresa: 'Flota', conductor: 'Ana', fecha: '2024-01-01', evaluacionFinalPuntos: 7 },
      { id: 'increase', empresa: 'Flota', conductor: 'Ana', fecha: '2025-01-01', evaluacionFinalPuntos: 7, colisiones: 1 }
    ]} />);
    expect(getReport().body.textContent).toContain('Aumento de 1.00 incidentes por operador');
    expect(getReport().body.textContent).not.toContain('Reducción de');

    rerender(<CompanyReportModal {...props} allEvaluations={[]} />);
    expect(getReport().querySelectorAll('svg.annual-chart')).toHaveLength(0);
    expect(getReport().body.textContent).toContain('No hay evaluaciones con año disponible');
  });
});
