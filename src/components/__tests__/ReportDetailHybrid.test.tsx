// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportDetailModal } from '../ReportDetailModal';
import type { Evaluation } from '../../types';

vi.mock('../../services/auditLog', () => ({ logAudit: vi.fn() }));
vi.mock('../SessionRadarWidget', () => ({ SessionRadarWidget: () => null }));
vi.mock('../company/CompanyAiInsightsCard', () => ({ CompanyAiInsightsCard: () => null }));

describe('incidencias del detalle de evaluación', () => {
  it('conserva el contexto mixto y muestra que la información es parcial', () => {
    const evaluation: Evaluation = { id: 'legacy', empresa: 'Flota', colisiones: 2 };
    const v2: Evaluation = { id: 'v2', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 0 };
    render(<ReportDetailModal evaluation={evaluation} contextEvaluations={[evaluation, v2]} onClose={vi.fn()} />);
    expect(screen.getByText('Colisiones')).toBeInTheDocument();
    expect(screen.getByText('2 incidencias conocidas')).toBeInTheDocument();
    expect(screen.getByText('Datos de incidencias incompletos o no disponibles.')).toBeInTheDocument();
  });
});
