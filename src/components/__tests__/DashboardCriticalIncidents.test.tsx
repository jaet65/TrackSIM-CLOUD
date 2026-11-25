// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardTab } from '../DashboardTab';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ userRole: 'admin' }) }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    filteredEvaluations: [
      { id: '1', empresa: 'Flota', conductor: 'Ana', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 2, erroresFrecuentes: [{ error: 'semáforo en rojo', repeticiones: 2 }] },
      { id: '2', empresa: 'Flota', conductor: 'Luis', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 3 },
      { id: '3', empresa: 'Flota', conductor: 'Eva', colisiones: 20, fatalidades: 0, vehiculoFueraVia: 0 }
    ],
    companies: ['Flota'],
    selectedCompany: 'Flota',
    selectedCompanySummary: null,
    companiesSummaries: [],
    selectedYear: 'all',
    loading: false
  })
}));
vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null }));
vi.mock('../company/CompanySinglePageReportModal', () => ({ CompanySinglePageReportModal: () => null }));
vi.mock('../company/CompanyReportModal', () => ({ CompanyReportModal: () => null }));
vi.mock('../company/CompanyDiplomasModal', () => ({ CompanyDiplomasModal: () => null }));

describe('incidencias críticas del dashboard', () => {
  it('combina conteos V1 y V2 con las equivalencias para clientes mixtos', () => {
    render(<DashboardTab />);
    const label = screen.getByText('Incidencias críticas', { selector: 'span.kpi-label' });
    const card = label.closest('.kpi-card') as HTMLElement;
    expect(within(card).getByText('25')).toBeInTheDocument();
    const list = within(card).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(card).getByText('Saltarse un semáforo en rojo: 2')).toBeInTheDocument();
    expect(within(card).getByText('Sin desglose disponible: 3')).toBeInTheDocument();
    expect(within(card).getByText('Colisiones: 20')).toBeInTheDocument();
    expect(within(card).getByText(/Datos incompletos o inconsistentes: 1 evaluación/)).toBeInTheDocument();
    expect(within(card).getByText(/En clientes mixtos se equiparan/)).toBeInTheDocument();
  });
});
