// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompanyAnnualBreakdownTable } from '../evolution/CompanyAnnualBreakdownTable';

describe('desglose anual de incidencias', () => {
  it('agrupa las colisiones V1 y V2 sin mezclar atropellos ni modificar el total', () => {
    render(<CompanyAnnualBreakdownTable consolidatedAnnualRows={[
      { year: '2026', evalCount: 2, operatorCount: 2, avgScore: 8, passRate: 100,
        incidentDetails: [
          { name: 'Colisión con un vehículo del tráfico', count: 27 },
          { name: 'Colisiones', count: 3 },
          { name: 'Colisión con un vehículo de incidencia', count: 13 },
          { name: 'Colisión con un objeto', count: 4 },
          { name: 'Colisión con unas piedras', count: 2 },
          { name: 'Atropello de un perro', count: 1 },
          { name: 'Salirse de la vía', count: 20 }
        ], totalIncidents: 70, accidentRate: 35 },
      { year: '2027', evalCount: 1, operatorCount: 1, avgScore: 8, passRate: 100,
        incidentDetails: [{ name: 'Colisión con un objeto', count: 1 }], totalIncidents: null, accidentRate: null }
    ]} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Colisiones: 49')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Atropello de un perro: 1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Salirse de la vía: 20')).toBeInTheDocument();
    expect(within(rows[1]).getByText('70 incidencias')).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/Colisión con/)).not.toBeInTheDocument();
    expect(within(rows[2]).getByText('Colisiones: 1')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Datos incompletos')).toBeInTheDocument();
  });

  it('muestra los tipos híbridos y no presenta como cero las tasas incompletas', () => {
    render(<CompanyAnnualBreakdownTable consolidatedAnnualRows={[
      { year: '2024', evalCount: 1, operatorCount: 1, avgScore: 8, passRate: 100,
        incidentDetails: [{ name: 'Atropello de un perro', count: 2 }], totalIncidents: 2, accidentRate: 2 },
      { year: '2025', evalCount: 1, operatorCount: 1, avgScore: 8, passRate: 100,
        incidentDetails: [{ name: 'Salirse de la vía', count: 1 }], totalIncidents: null, accidentRate: null }
    ]} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Atropello de un perro: 2')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Salirse de la vía: 1')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Datos incompletos')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Sin datos')).toBeInTheDocument();
  });
});
