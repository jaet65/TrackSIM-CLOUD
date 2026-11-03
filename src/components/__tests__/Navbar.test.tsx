import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppHeader, Navbar } from '../Navbar';
import * as AuthContext from '../../context/AuthContext';
import * as DataContext from '../../context/DataContext';
import { ThemeProvider } from '../../context/ThemeContext';

describe('Navbar component', () => {
  const mockOnTabChange = vi.fn();
  const mockSetSelectedCompany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    // Mock por defecto de DataContext
    vi.spyOn(DataContext, 'useData').mockReturnValue({
      selectedCompany: 'Transportes Demo',
      reloadEvaluations: vi.fn(),
      isSyncing: false,
      lastSyncTime: null,
      loading: false,
      evaluations: [],
      filteredEvaluations: [],
      companies: ['Transportes Demo'],
      companiesSummaries: [],
      driverSummaries: [],
      selectedCompanySummary: null,
      selectedDriverName: '',
      setSelectedDriverName: vi.fn(),
      setSelectedCompany: mockSetSelectedCompany,
      searchFilter: '',
      setSearchFilter: vi.fn(),
      roleAllowedEvaluations: [],
      initialLoaded: true,
      deleteEvaluation: vi.fn(),
      updateEvaluationsBatch: vi.fn(),
      deleteAllEvaluations: vi.fn(),
      getEvaluationsBackup: vi.fn(),
      restoreEvaluationsBackup: vi.fn(),
      updateEvaluation: vi.fn(),
      resetCacheAndReload: vi.fn()
    });
  });

  const renderNavbar = (currentTab: 'dashboard' | 'evolucion' | 'empresas' | 'directorio' | 'ingesta' | 'usuarios') =>
    render(
      <ThemeProvider>
        <>
          <Navbar currentTab={currentTab} onTabChange={mockOnTabChange} />
          <AppHeader />
        </>
      </ThemeProvider>
    );

  it('debe renderizar pestañas básicas para rol lector y ocultar pestañas de admin', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Operador Test', email: 'op@demo.com' } as any,
      userRole: 'viewer',
      allowedCompanies: ['Transportes Demo'],
      isDemo: false,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });

    renderNavbar('dashboard');

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
      isDemo: false,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });

    renderNavbar('dashboard');

    expect(document.querySelector('.navbar')).toHaveClass('is-collapsed');
    expect(screen.getByRole('combobox', { name: 'Filtrar por empresa' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir navegación' }));
    expect(document.querySelector('.navbar')).toHaveClass('is-expanded');

    expect(screen.getByText('Directorio')).toBeInTheDocument();
    expect(screen.getByText('Ingesta PDF')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();

    const companyFilter = screen.getByRole('combobox', { name: 'Filtrar por empresa' });
    expect(companyFilter).toHaveValue('Transportes Demo');
    fireEvent.change(companyFilter, { target: { value: 'all' } });
    expect(mockSetSelectedCompany).toHaveBeenCalledWith('all');
  });

  it('debe disparar onTabChange al hacer clic en una pestaña', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Admin Master', email: 'admin@tracksim.com' } as any,
      userRole: 'admin',
      allowedCompanies: ['all'],
      isDemo: false,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });

    renderNavbar('dashboard');

    const evolucionTab = screen.getByText('Evolución');
    fireEvent.click(evolucionTab);

    expect(mockOnTabChange).toHaveBeenCalledWith('evolucion');
  });

  it('debe iniciar en tema claro y guardar los cambios de preferencia', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Admin Master', email: 'admin@tracksim.com' } as any,
      userRole: 'admin',
      allowedCompanies: ['all'],
      isDemo: false,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });

    renderNavbar('dashboard');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('tracksim-theme')).toBe('light');
    expect(screen.getByAltText('TrackSIM Logo')).toHaveAttribute('src', '/Logo%20NN.png');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('tracksim-theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a tema claro' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('tracksim-theme')).toBe('light');
    expect(screen.getByAltText('TrackSIM Logo')).toHaveAttribute('src', '/Logo%20NN.png');
    expect(screen.getByRole('button', { name: 'Cambiar a tema oscuro' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('debe respetar la preferencia de tema oscuro guardada', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { displayName: 'Admin Master', email: 'admin@tracksim.com' } as any,
      userRole: 'admin',
      allowedCompanies: ['all'],
      isDemo: false,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });
    window.localStorage.setItem('tracksim-theme', 'dark');

    renderNavbar('dashboard');

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Cambiar a tema claro' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('debe mostrar el modo demo sin exponer pestañas administrativas', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      userRole: 'admin',
      allowedCompanies: ['all'],
      isDemo: true,
      profile: null,
      loading: false,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      resetPassword: vi.fn(),
      reauthenticateForMassDelete: vi.fn(),
      logout: vi.fn()
    });

    renderNavbar('dashboard');

    expect(screen.getByText('Sesión de demostración')).toBeInTheDocument();
    expect(screen.getByText('Datos simulados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir de demo/ })).toBeInTheDocument();
    expect(screen.queryByText('Ingesta PDF')).toBeNull();
    expect(screen.queryByText('Usuarios')).toBeNull();
    expect(screen.queryByText('Directorio')).toBeNull();
  });
});
