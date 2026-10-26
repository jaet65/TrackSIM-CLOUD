import React, { useState, useMemo } from 'react';
import { Evaluation } from '../../types';
import { logAudit } from '../../services/auditLog';

export type CompanySortKey = 'promedioScore' | 'nombre' | 'totalEvaluaciones' | 'ultimaFecha' | 'incidentes' | 'estado';
export type StatusFilterOption = 'all' | 'sobresaliente' | 'aprobado' | 'reforzar' | 'incidentes';

interface CompanyDriversTableProps {
  filteredConductores: any[];
  pagedDrivers: any[];
  driverSearch: string;
  onSetDriverSearch: (val: string) => void;
  driversPage: number;
  totalDriversPages: number;
  pageSize: number;
  onSetDriversPage: (page: number | ((prev: number) => number)) => void;
  sortKey: CompanySortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: CompanySortKey) => void;
  expandedExercises: Set<string>;
  onToggleExpandExercises: (key: string) => void;
  onViewReport: (ev: any) => void;
  filteredEvaluations: Evaluation[];
  comp: any;
  onSelectDriverName: (name: string) => void;
  onNavigate?: (tab: 'dashboard' | 'evolucion' | 'empresas' | 'directorio' | 'ingesta' | 'usuarios') => void;
}

export const CompanyDriversTable: React.FC<CompanyDriversTableProps> = ({
  filteredConductores,
  pagedDrivers: initialPagedDrivers,
  driverSearch,
  onSetDriverSearch,
  driversPage,
  totalDriversPages: initialTotalPages,
  pageSize,
  onSetDriversPage,
  sortKey,
  sortDir,
  onSort,
  expandedExercises,
  onToggleExpandExercises,
  onViewReport,
  filteredEvaluations,
  comp,
  onSelectDriverName,
  onNavigate
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('all');

  // Filtrado local adicional por estado si se selecciona un chip
  const displayedConductores = useMemo(() => {
    if (statusFilter === 'all') return filteredConductores;
    return filteredConductores.filter((c) => {
      const totIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);
      switch (statusFilter) {
        case 'sobresaliente':
          return c.estado === 'Sobresaliente' || c.promedioScore >= 8.0;
        case 'aprobado':
          return c.estado === 'Aprobado' || (c.promedioScore >= 6.0 && c.promedioScore < 8.0);
        case 'reforzar':
          return (
            c.estado === 'Reforzar' ||
            c.estado === 'Requiere Refuerzo' ||
            c.estado === 'No Aprobado' ||
            c.promedioScore < 6.0
          );
        case 'incidentes':
          return totIncidentes > 0;
        default:
          return true;
      }
    });
  }, [filteredConductores, statusFilter]);

  const effectiveTotalPages = statusFilter === 'all'
    ? initialTotalPages
    : Math.max(1, Math.ceil(displayedConductores.length / pageSize));

  const effectiveDriversPage = Math.min(Math.max(1, driversPage), effectiveTotalPages);

  const pagedDrivers = statusFilter === 'all'
    ? initialPagedDrivers
    : displayedConductores.slice((effectiveDriversPage - 1) * pageSize, effectiveDriversPage * pageSize);

  // Exportar roster de operadores a CSV
  const handleExportCSV = () => {
    if (displayedConductores.length === 0) {
      alert('No hay operadores disponibles para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'Empresa',
      'Sede',
      'Operador',
      'Evaluaciones / Sesiones',
      'Score Promedio (0-10)',
      'Ultimo Score (0-10)',
      'Ultima Fecha',
      'Colisiones',
      'Fatalidades',
      'Salidas de Via',
      'Total Incidentes',
      'Estado General',
      'Ejercicios Realizados'
    ];

    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = displayedConductores.map((c) => {
      const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);
      const exNames = Array.isArray(c.ejercicios)
        ? c.ejercicios.map((e: any) => e.nombre || `Ejercicio ${e.numero || ''}`).join('; ')
        : '';

      return [
        escapeCell(c.empresa || comp.nombre),
        escapeCell(c.sede || 'Principal'),
        escapeCell(c.nombre),
        escapeCell(c.totalEvaluaciones || 0),
        escapeCell(c.promedioScore?.toFixed(2) || '0.00'),
        escapeCell(c.ultimoScore?.toFixed(2) || '0.00'),
        escapeCell(c.ultimaFecha || ''),
        escapeCell(c.colisiones || 0),
        escapeCell(c.fatalidades || 0),
        escapeCell(c.totalFueraVia || 0),
        escapeCell(totalIncidentes),
        escapeCell(c.estado || 'N/A'),
        escapeCell(exNames)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (comp.nombre || 'Flota').toLowerCase().replace(/[^a-z0-9]/gi, '_');
    link.href = url;
    link.setAttribute('download', `roster_operadores_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    void logAudit({
      categoria: 'datos',
      accion: 'exportar',
      cantidad: displayedConductores.length,
      empresas: [comp.nombre],
      detalle: `Exportación CSV del roster de operadores de ${comp.nombre}`
    });
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header, Búsqueda y Botón de Exportar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-roster-header)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.4rem' }}>👨‍✈️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
              Operadores Pertenecientes a esta Flota
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {displayedConductores.length} operadores {statusFilter !== 'all' ? 'filtrados' : 'registrados'} {driverSearch && `(búsqueda "${driverSearch}")`}
            </span>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Barra de Búsqueda */}
          <div style={{ position: 'relative', width: '240px' }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Buscar operador..."
              value={driverSearch}
              onChange={(e) => {
                onSetDriverSearch(e.target.value);
                onSetDriversPage(1);
              }}
              style={{
                width: '100%',
                padding: '0.55rem 0.9rem 0.55rem 2.25rem',
                background: 'var(--bg-roster-search)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            />
            {driverSearch && (
              <button
                type="button"
                onClick={() => {
                  onSetDriverSearch('');
                  onSetDriversPage(1);
                }}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: '0.2rem'
                }}
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Botón Exportar CSV */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCSV}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="Exportar roster de operadores a archivo CSV"
          >
            <span>📥</span>
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros Rápidos por Estado (Chips) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.65rem 1.5rem',
          background: 'var(--bg-roster-filter)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '0.25rem' }}>
          Filtrar estado:
        </span>
        {[
          { key: 'all', label: 'Todos', count: filteredConductores.length },
          {
            key: 'sobresaliente',
            label: 'Sobresalientes (≥8)',
            count: filteredConductores.filter((c) => c.estado === 'Sobresaliente' || c.promedioScore >= 8.0).length,
            color: '#22c55e'
          },
          {
            key: 'aprobado',
            label: 'Aprobados (6 - 7.9)',
            count: filteredConductores.filter((c) => c.estado === 'Aprobado' || (c.promedioScore >= 6.0 && c.promedioScore < 8.0)).length,
            color: '#38bdf8'
          },
          {
            key: 'reforzar',
            label: 'Requiere Refuerzo (<6)',
            count: filteredConductores.filter((c) => c.estado === 'Reforzar' || c.estado === 'Requiere Refuerzo' || c.estado === 'No Aprobado' || c.promedioScore < 6.0).length,
            color: '#f59e0b'
          },
          {
            key: 'incidentes',
            label: 'Con Incidentes',
            count: filteredConductores.filter((c) => (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0) > 0).length,
            color: '#ef4444'
          }
        ].map((chip) => {
          const isActive = statusFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setStatusFilter(chip.key as StatusFilterOption);
                onSetDriversPage(1);
              }}
              style={{
                background: isActive
                  ? chip.color ? `${chip.color}25` : 'rgba(56, 189, 248, 0.2)'
                  : 'var(--bg-card-hover)',
                border: `1px solid ${isActive ? chip.color || 'var(--primary)' : 'var(--border-subtle)'}`,
                color: isActive ? chip.color || 'var(--primary)' : 'var(--text-secondary)',
                borderRadius: '9999px',
                padding: '0.2rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{chip.label}</span>
              <span
                style={{
                  background: isActive ? (chip.color || 'var(--primary)') : 'var(--bg-surface)',
                  color: isActive ? '#0f172a' : 'var(--text-secondary)',
                  borderRadius: '10px',
                  padding: '0.05rem 0.35rem',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabla Estilizada */}
      <div className="table-responsive screen-only">
        <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: 'var(--bg-roster-table-header)' }}>
              <th onClick={() => onSort('nombre')} style={{ cursor: 'pointer', padding: '1rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Operador {sortKey === 'nombre' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => onSort('totalEvaluaciones')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Sesiones {sortKey === 'totalEvaluaciones' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => onSort('ultimaFecha')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Última Fecha {sortKey === 'ultimaFecha' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => onSort('promedioScore')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Score Promedio {sortKey === 'promedioScore' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Ejercicios Realizados
              </th>
              <th onClick={() => onSort('incidentes')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Incidentes {sortKey === 'incidentes' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => onSort('estado')} style={{ cursor: 'pointer', padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Estado {sortKey === 'estado' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th className="no-print" style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', textAlign: 'right' }}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedDrivers.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    No se encontraron operadores
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Intenta con otro término de búsqueda o limpia el filtro actual.
                  </div>
                </td>
              </tr>
            ) : (
              pagedDrivers.map((c, idx) => {
                const globalIdx = (driversPage - 1) * pageSize + idx + 1;
                const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                const isTopScore = c.promedioScore >= 8.0;
                const isPassScore = c.promedioScore >= 6.0;
                const scoreColor = isTopScore ? '#22c55e' : isPassScore ? '#38bdf8' : '#ef4444';
                const scoreBg = isTopScore ? 'rgba(34, 197, 94, 0.12)' : isPassScore ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)';

                const initials = c.nombre
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n: string) => n[0].toUpperCase())
                  .join('');

                const handleOpenReport = () => {
                  const found = filteredEvaluations.find(
                    (e) => e.id === c.latestEvalId || (e.conductor || e.operador) === c.nombre
                  );
                  if (found) {
                    onViewReport(found);
                  } else {
                    onViewReport({
                      id: c.latestEvalId || 'N/A',
                      conductor: c.nombre,
                      empresa: c.empresa || comp.nombre,
                      sede: c.sede,
                      fechaCapacitacionFormato: c.ultimaFecha,
                      evaluacionFinalPuntos: c.ultimoScore,
                      colisiones: c.colisiones || 0,
                      fatalidades: c.fatalidades || 0,
                      vehiculoFueraVia: c.totalFueraVia || 0,
                      ejercicios: c.ejercicios || []
                    });
                  }
                };

                const handleGoToEvolution = () => {
                  onSelectDriverName(c.nombre);
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                  document.documentElement.scrollTop = 0;
                  document.body.scrollTop = 0;
                  const main = document.querySelector('.main-content');
                  if (main) main.scrollTop = 0;
                  if (onNavigate) {
                    onNavigate('evolucion');
                  }
                };

                return (
                  <tr
                    key={c.nombre + idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease'
                    }}
                    className="driver-row"
                  >
                    <td style={{ padding: '0.95rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            minWidth: '38px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.1))',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#38bdf8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)'
                          }}
                        >
                          {initials || `#${globalIdx}`}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                            {c.nombre}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                            {comp.esGlobal && c.empresa && (
                              <span style={{ color: '#38bdf8', fontWeight: 600 }}>🏢 {c.empresa} •</span>
                            )}
                            <span>📍 {c.sede || 'Sede Principal'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: c.totalEvaluaciones > 1 ? 'rgba(168, 85, 247, 0.14)' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${c.totalEvaluaciones > 1 ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                          color: c.totalEvaluaciones > 1 ? '#c084fc' : '#cbd5e1',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem'
                        }}
                      >
                        {c.totalEvaluaciones > 1 && <span>🔁</span>}
                        {c.totalEvaluaciones} {c.totalEvaluaciones === 1 ? 'sesión' : 'sesiones'}
                      </span>
                    </td>

                    <td style={{ padding: '0.95rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>📅</span>
                        <span>{c.ultimaFecha}</span>
                      </span>
                    </td>

                    <td style={{ padding: '0.95rem 1rem', minWidth: '150px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: scoreColor, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                          {c.promedioScore.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>/ 10 pts</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          Últ: {c.ultimoScore.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, c.promedioScore * 10))}%`,
                            height: '100%',
                            background: scoreColor,
                            borderRadius: '9999px'
                          }}
                        />
                      </div>
                    </td>

                    <td style={{ padding: '0.95rem 1rem' }}>
                      {(() => {
                        const driverIdKey = `${c.nombre}_${c.latestEvalId || idx}`;
                        const isExpanded = expandedExercises.has(driverIdKey);
                        const totalEx = c.ejercicios?.length || 0;
                        const visibleCount = isExpanded ? totalEx : 3;
                        const hasExcess = totalEx > 3;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', maxWidth: '260px' }}>
                            {totalEx > 0 ? (
                              c.ejercicios!.slice(0, visibleCount).map((e: any, i: number) => (
                                <div
                                  key={i}
                                  style={{
                                    fontSize: '0.76rem',
                                    color: '#cbd5e1',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                  }}
                                  title={e.nombre}
                                >
                                  <span style={{ color: '#38bdf8', fontSize: '0.6rem' }}>●</span>
                                  <span>{e.nombre}</span>
                                </div>
                              ))
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Simulaciones de rutina</span>
                            )}

                            {hasExcess && (
                              <button
                                type="button"
                                onClick={() => onToggleExpandExercises(driverIdKey)}
                                style={{
                                  fontSize: '0.72rem',
                                  color: isExpanded ? '#94a3b8' : '#38bdf8',
                                  fontWeight: 700,
                                  background: isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(56, 189, 248, 0.1)',
                                  border: `1px solid ${isExpanded ? 'rgba(255, 255, 255, 0.1)' : 'rgba(56, 189, 248, 0.25)'}`,
                                  borderRadius: '6px',
                                  padding: '0.15rem 0.5rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  width: 'fit-content',
                                  marginTop: '0.15rem',
                                  transition: 'all 0.15s ease'
                                }}
                                title={isExpanded ? 'Colapsar lista' : 'Expandir todos los ejercicios'}
                              >
                                <span>{isExpanded ? '▲ Mostrar menos' : `+${totalEx - 3} ejercicio(s) más`}</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          background: totalIncidentes > 0 ? 'rgba(239, 68, 68, 0.14)' : 'rgba(34, 197, 94, 0.12)',
                          color: totalIncidentes > 0 ? '#f87171' : '#4ade80',
                          border: `1px solid ${totalIncidentes > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                        }}
                        title={`Colisiones: ${c.colisiones || 0} | Fuera de vía: ${c.totalFueraVia || 0} | Fatalidades: ${c.fatalidades || 0}`}
                      >
                        <span>{totalIncidentes > 0 ? '⚠️' : '🛡️'}</span>
                        <span>{totalIncidentes}</span>
                      </span>
                    </td>

                    <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          background: scoreBg,
                          color: scoreColor,
                          border: `1px solid ${scoreColor}40`
                        }}
                      >
                        {c.estado}
                      </span>
                    </td>

                    <td className="no-print" style={{ padding: '0.75rem 1rem', textAlign: 'right', verticalAlign: 'middle', width: '130px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'stretch', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={handleOpenReport}
                          className="btn btn-secondary btn-sm"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem',
                            padding: '0.32rem 0.6rem',
                            borderRadius: '7px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: 'rgba(56, 189, 248, 0.1)',
                            borderColor: 'rgba(56, 189, 248, 0.3)',
                            color: '#38bdf8',
                            width: '100%'
                          }}
                          title="Ver reporte detallado de evaluación"
                        >
                          <span>📄</span>
                          <span>Reporte</span>
                        </button>

                        {c.totalEvaluaciones > 1 && (
                          <button
                            type="button"
                            onClick={handleGoToEvolution}
                            className="btn btn-sm"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem',
                              padding: '0.32rem 0.6rem',
                              borderRadius: '7px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.25))',
                              border: '1px solid rgba(168, 85, 247, 0.45)',
                              color: '#c084fc',
                              cursor: 'pointer',
                              width: '100%'
                            }}
                            title="Ver histórico y evolución de conductor individual"
                          >
                            <span>📈</span>
                            <span>Evolución</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Tabla Completa Exclusiva para Impresión / PDF (Sin Paginación, imprime TODOS los operadores) */}
      <div className="print-only" style={{ display: 'none', padding: '0 0.5rem' }}>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '35px' }}>#</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Operador</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Sede</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '60px' }}>Sesiones</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>Última Fecha</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>Score Promedio</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Ejercicios Realizados</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '65px' }}>Incidentes</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', width: '85px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {displayedConductores.map((c, idx) => {
              const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);
              const isTop = c.promedioScore >= 8.0;
              const isPass = c.promedioScore >= 6.0;
              const scoreColor = isTop ? '#15803d' : isPass ? '#0369a1' : '#b91c1c';

              const exNames = Array.isArray(c.ejercicios) && c.ejercicios.length > 0
                ? c.ejercicios.map((e: any) => e.nombre || `Ej. ${e.numero || ''}`).join(', ')
                : 'Rutina estándar';

              return (
                <tr key={c.nombre + idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '5px 6px', fontWeight: 700 }}>{c.nombre}</td>
                  <td style={{ padding: '5px 6px', color: '#475569' }}>{c.sede || 'Principal'}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>{c.totalEvaluaciones || 1}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>{c.ultimaFecha || '-'}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                    {c.promedioScore.toFixed(2)} pts
                  </td>
                  <td style={{ padding: '5px 6px', fontSize: '7.8pt', color: '#334155', maxWidth: '240px', wordBreak: 'break-word' }}>
                    {exNames}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: totalIncidentes > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                    {totalIncidentes}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600, fontSize: '8pt' }}>
                    {c.estado || 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Barra de paginación de la tabla */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-roster-pagination)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Mostrando operadores <strong style={{ color: 'var(--text-main)' }}>{(effectiveDriversPage - 1) * pageSize + 1}</strong> a <strong style={{ color: 'var(--text-main)' }}>{Math.min(effectiveDriversPage * pageSize, displayedConductores.length)}</strong> de <strong style={{ color: 'var(--primary)' }}>{displayedConductores.length}</strong>
          {statusFilter !== 'all' && ` (filtro "${statusFilter}")`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSetDriversPage(1)}
            disabled={effectiveDriversPage === 1}
            style={{ borderRadius: '6px', padding: '0.35rem 0.65rem' }}
            title="Primera página"
          >
            ««
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSetDriversPage((prev) => prev - 1)}
            disabled={effectiveDriversPage === 1}
            style={{ borderRadius: '6px', padding: '0.35rem 0.75rem' }}
          >
            « Ant
          </button>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', padding: '0 0.6rem' }}>
            Pág. {effectiveDriversPage} / {effectiveTotalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSetDriversPage((prev) => prev + 1)}
            disabled={effectiveDriversPage === effectiveTotalPages}
            style={{ borderRadius: '6px', padding: '0.35rem 0.75rem' }}
          >
            Sig »
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSetDriversPage(effectiveTotalPages)}
            disabled={effectiveDriversPage === effectiveTotalPages}
            style={{ borderRadius: '6px', padding: '0.35rem 0.65rem' }}
            title="Última página"
          >
            »»
          </button>
        </div>
      </div>
    </div>
  );
};
