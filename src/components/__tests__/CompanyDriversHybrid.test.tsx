// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanyDriversTable } from '../company/CompanyDriversTable';
import { getHybridDriverIncidents, getHybridIncidentSummary, getIncidentModes } from '../../services/incidentMetrics';
import type { Evaluation } from '../../types';

vi.mock('../../context/SystemDialogContext', () => ({ useSystemDialogs: () => ({ showAlert: vi.fn() }) }));
vi.mock('../../services/auditLog', () => ({ logAudit: vi.fn() }));

describe('incidencias por operador', () => {
  it('incluye incidencias conocidas parciales en el filtro sin presentarlas como total completo', () => {
    const evaluations: Evaluation[] = [{ id: '1', empresa: 'Flota', conductor: 'Ana', colisiones: 2 }];
    const modes = getIncidentModes(evaluations);
    const driver = { nombre: 'Ana', empresa: 'Flota', promedioScore: 8, ultimoScore: 8, totalEvaluaciones: 1, ultimaFecha: '', ejercicios: [] };
    render(<CompanyDriversTable
      filteredConductores={[driver]} pagedDrivers={[driver]} driverSearch="" onSetDriverSearch={vi.fn()}
      driversPage={1} totalDriversPages={1} pageSize={30} onSetDriversPage={vi.fn()}
      sortKey="nombre" sortDir="asc" onSort={vi.fn()} expandedExercises={new Set()}
      onToggleExpandExercises={vi.fn()} onViewReport={vi.fn()} filteredEvaluations={evaluations}
      driverIncidents={getHybridDriverIncidents(evaluations, modes)}
      knownDriverIncidents={new Map([['ana', getHybridIncidentSummary(evaluations, modes)]])}
      comp={{ nombre: 'Flota' }} onSelectDriverName={vi.fn()}
    />);
    expect(screen.getByText('2 conocidas (parcial)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Con Incidentes'));
    expect(screen.getByText('2 conocidas (parcial)')).toBeInTheDocument();
  });
});
