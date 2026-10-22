import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../Navbar';
import * as AuthContext from '../../context/AuthContext';
import * as DataContext from '../../context/DataContext';

describe('Navbar component', () => {
  const mockOnTabChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock por defecto de DataContext
    vi.spyOn(DataContext, 'useData').mockReturnValue({
      selectedCompany: 'Transportes Demo',
      reloadEvaluations: vi.fn(),
      isSyncing: false,
      lastSyncTime: null,
      loading: false,
      evaluations: [],
      filteredEvaluations: [],
      companies: [],
      companiesSummaries: [],
      driverSummaries: [],
      selectedCompanySummary: null,
      selectedDriverName: '',
      setSelectedDriverName: vi.fn(),
      setSelectedCompany: vi.fn(),
      searchFilter: '',
      setSearchFilter: vi.fn(),
      roleAllowedEvaluations: [],
      initialLoaded: true,
      deleteEvaluation: vi.fn(),
      deleteAllEvaluations: vi.fn(),
      updateEvaluation: vi.fn()
    });
  });

  it('debe renderizar pestañas básicas para rol lector y ocultar pestañas de admin', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Operador Test', email: 'op@demo.com' } as any,
      userRole: 'viewer',
      allowedCompanies: ['Transportes Demo'],
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      logout: vi.fn()
    });

    render(<Navbar currentTab="dashboard" onTabChange={mockOnTabChange} />);

    // Pestañas visibles para todos
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Evolución')).toBeInTheDocument();
    expect(screen.getByText('Métricas')).toBeInTheDocument();

    // Pestañas exclusivas de administrador no deben estar
    expect(screen.queryByText('Ingesta PDF')).toBeNull();
    expect(screen.queryByText('Usuarios')).toBeNull();
    expect(screen.queryByText('Directorio')).toBeNull();
  });

  it('debe mostrar las pestañas de administración si el usuario es admin', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Admin Master', email: 'admin@tracksim.com' } as any,
      userRole: 'admin',
      allowedCompanies: ['all'],
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      logout: vi.fn()
    });

    render(<Navbar currentTab="dashboard" onTabChange={mockOnTabChange} />);

    expect(screen.getByText('Directorio')).toBeInTheDocument();
    expect(screen.getByText('Ingesta PDF')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('debe disparar onTabChange al hacer clic en una pestaña', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Admin Master', email: 'admin@tracksim.com' } as any,
      userRole: 'admin',
      allowedCompanies: ['all'],
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      logout: vi.fn()
    });

    render(<Navbar currentTab="dashboard" onTabChange={mockOnTabChange} />);

    const evolucionTab = screen.getByText('Evolución');
    fireEvent.click(evolucionTab);

    expect(mockOnTabChange).toHaveBeenCalledWith('evolucion');
  });
});
