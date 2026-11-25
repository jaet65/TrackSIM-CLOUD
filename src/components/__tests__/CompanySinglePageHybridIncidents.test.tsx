// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import { CompanySinglePageReportModal } from '../company/CompanySinglePageReportModal';

vi.mock('../../services/auditLog', () => ({ logAudit: vi.fn() }));
vi.mock('../../services/companyAiInsights', () => ({
  getCachedCompanyAiInsight: () => null,
  generateCompanyAiInsight: vi.fn()
}));

describe('incidencias híbridas del reporte single-page', () => {
  const company: CompanySummary = {
    nombre: 'Flota', slug: 'flota', totalEvaluaciones: 2, totalConductores: 1,
    promedioFinal: 7, promedioHabilidades: 0, promedioSimulador: 0, tasaAprobacion: 100,
    totalColisiones: 2, totalFatalidades: 1, totalFueraVia: 3, sedes: [],
    conductores: [{ nombre: 'Ana', empresa: 'Flota', ultimaFecha: '', ultimoScore: 7, totalEvaluaciones: 2, promedioScore: 7, sede: 'Principal' }],
    simulacionesPromedio: { simulacion_2: 0, simulacion_3: 0, simulacion_4: 0 },
    nombresSimulaciones: {}
  };

  it('muestra las equivalencias sin sumar dos veces los errores V1', () => {
    const evaluations: Evaluation[] = [
      { id: 'v1', empresa: 'Flota', conductor: 'Ana', colisiones: 2, fatalidades: 1, vehiculoFueraVia: 3, erroresFrecuentes: [{ error: 'Colisión con un objeto', repeticiones: 2 }] },
      { id: 'v2', empresa: 'Flota', conductor: 'Ana', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 3, erroresFrecuentes: [
        { error: 'Colisión con un vehículo del tráfico', repeticiones: 2 },
        { error: 'Vuelco', repeticiones: 1 },
        { error: 'Salirse de la vía', repeticiones: 2 }
      ] }
    ];
    render(<CompanySinglePageReportModal isOpen onClose={vi.fn()} comp={company} selectedYear="all" periodText="Histórico"
      conductoresRecurrentes={1} pctRecurrentes="100" exerciseStats={[]} topConductores={company.conductores}
      allEvaluations={evaluations} />);
    expect(screen.getByText(/Desglose de Incidencias \(11 eventos conocidos\)/)).toBeInTheDocument();
    expect(screen.getByText(/Colisiones/, { selector: 'span' })).toHaveTextContent('4');
    expect(screen.getByText(/Atropello de peatón y vuelcos/, { selector: 'span' })).toHaveTextContent('2');
    expect(screen.getByText(/Salirse de la vía/, { selector: 'span' })).toHaveTextContent('5');
    expect(screen.getByText(/fatalidades V1 no distinguen/)).toBeInTheDocument();
  });

  it('imprime una copia de la hoja visible y limpia el marco al terminar', async () => {
    render(<CompanySinglePageReportModal isOpen onClose={vi.fn()} comp={company} selectedYear="all" periodText="Histórico"
      conductoresRecurrentes={1} pctRecurrentes="100" exerciseStats={[]} topConductores={company.conductores}
      allEvaluations={[{ id: '1', empresa: 'Flota', colisiones: 2, fatalidades: 1, vehiculoFueraVia: 3 }]} />);
    const sheet = document.querySelector<HTMLElement>('#single-page-report-sheet')!;
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 1100 } as DOMRect);
    fireEvent.click(screen.getByRole('button', { name: /Imprimir Single-Page/ }));
    const frame = document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]')!;
    const frameDocument = frame.contentDocument!;
    const frameWindow = frame.contentWindow!;
    const clonedSheet = frameDocument.querySelector<HTMLElement>('.single-page-sheet')!;
    Object.defineProperty(frameDocument, 'fonts', { value: { ready: Promise.resolve() } });
    Object.defineProperty(clonedSheet.querySelector('img')!, 'decode', { value: vi.fn().mockResolvedValue(undefined) });
    vi.spyOn(clonedSheet, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 1100 } as DOMRect);
    const print = vi.spyOn(frameWindow, 'print').mockImplementation(() => {});
    vi.spyOn(frameWindow, 'focus').mockImplementation(() => {});
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(clonedSheet.textContent).toBe(sheet.textContent);
    expect(frameDocument.title).toBe('Single-Page_Flota_Historico');
    expect(frameDocument.querySelector('.single-page-print-area')?.getAttribute('style')).toContain('--print-scale:');
    expect(frameDocument.body.textContent).not.toContain('Imprimir Single-Page');
    frameWindow.dispatchEvent(new Event('afterprint'));
    expect(document.body.contains(frame)).toBe(false);
  });

  it('informa si no puede cargar los elementos necesarios para imprimir', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CompanySinglePageReportModal isOpen onClose={vi.fn()} comp={company} selectedYear="all" periodText="Histórico"
      conductoresRecurrentes={0} pctRecurrentes="0" exerciseStats={[]} topConductores={[]} allEvaluations={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Imprimir Single-Page/ }));
    const frame = document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]')!;
    Object.defineProperty(frame.contentDocument!.querySelector('img')!, 'decode', { value: vi.fn().mockRejectedValue(new Error('imagen')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo preparar la impresión');
    expect(document.body.contains(frame)).toBe(false);
    error.mockRestore();
  });
});
