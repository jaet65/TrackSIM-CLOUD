// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompanySummary, Evaluation } from '../../types';
import { CompanySinglePageReportModal } from '../company/CompanySinglePageReportModal';

vi.mock('../../services/auditLog', () => ({ logAudit: vi.fn() }));
vi.mock('../../services/companyAiInsights', () => ({
  getCachedCompanyAiInsight: () => null,
  generateCompanyAiInsight: vi.fn()
}));

describe('incidencias híbridas del reporte single-page', () => {
  it('muestra las equivalencias sin sumar dos veces los errores V1', () => {
    const company: CompanySummary = {
      nombre: 'Flota', slug: 'flota', totalEvaluaciones: 2, totalConductores: 1,
      promedioFinal: 7, promedioHabilidades: 0, promedioSimulador: 0, tasaAprobacion: 100,
      totalColisiones: 2, totalFatalidades: 1, totalFueraVia: 3, sedes: [],
      conductores: [{ nombre: 'Ana', empresa: 'Flota', ultimaFecha: '', ultimoScore: 7, totalEvaluaciones: 2, promedioScore: 7, sede: 'Principal' }],
      simulacionesPromedio: { simulacion_2: 0, simulacion_3: 0, simulacion_4: 0 },
      nombresSimulaciones: {}
    };
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
});
