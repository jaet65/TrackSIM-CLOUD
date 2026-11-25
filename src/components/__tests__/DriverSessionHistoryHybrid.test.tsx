// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DriverSessionHistoryTable } from '../evolution/DriverSessionHistoryTable';
import { getIncidentModes } from '../../services/incidentMetrics';
import type { Evaluation } from '../../types';

describe('incidencias en el historial del operador', () => {
  it('usa el criterio mixto de la flota y distingue los datos incompletos', () => {
    const evaluations: Evaluation[] = [
      { id: 'legacy', empresa: 'Flota', colisiones: 2, fatalidades: 0, vehiculoFueraVia: 1 },
      { id: 'missing', empresa: 'Flota', colisiones: 0 }
    ];
    const modes = getIncidentModes([...evaluations, {
      id: 'other', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 0, erroresFrecuentes: []
    }]);
    render(<DriverSessionHistoryTable driverEvaluations={evaluations} incidentModes={modes} onViewReport={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText(/3 incidencias/)).toHaveAttribute('title', expect.stringContaining('Colisiones: 2'));
    expect(within(rows[2]).getByText(/0 incidencias conocidas \(datos incompletos\)/)).toBeInTheDocument();
    expect(within(rows[2]).queryByText(/Limpio/)).not.toBeInTheDocument();
  });
});
