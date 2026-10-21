import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Evaluation } from '../types';

export const DirectoryTab: React.FC = () => {
  const {
    filteredEvaluations,
    companies,
    deleteEvaluation,
    updateEvaluation,
    loading
  } = useData();

  const [search, setSearch] = useState('');
  const [selectedEmpresa, setSelectedEmpresa] = useState('all');
  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedSede, setSelectedSede] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<Evaluation | null>(null);

  const PAGE_SIZE = 30;

  // Sedes disponibles dinámicas
  const sedes = useMemo(() => {
    const set = new Set<string>();
    filteredEvaluations.forEach((e) => {
      if (e.sede) set.add(e.sede);
    });
    return Array.from(set).sort();
  }, [filteredEvaluations]);

  // Filtrado multi-criterio
  const displayList = useMemo(() => {
    return filteredEvaluations.filter((item) => {
      if (selectedEmpresa !== 'all' && item.empresa !== selectedEmpresa) return false;
      if (selectedSede !== 'all' && item.sede !== selectedSede) return false;
      if (selectedEstado !== 'all' && item.estado !== selectedEstado) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const op = (item.conductor || item.operador || '').toLowerCase();
        const fol = (item.folio || item.id || '').toLowerCase();
        const ins = (item.instructor || '').toLowerCase();
        if (!op.includes(q) && !fol.includes(q) && !ins.includes(q)) return false;
      }
      return true;
    });
  }, [filteredEvaluations, selectedEmpresa, selectedSede, selectedEstado, search]);

  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedList = displayList.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedList.map((e) => e.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Estás seguro de eliminar ${selectedIds.size} evaluaciones seleccionadas?`)) return;

    for (const id of Array.from(selectedIds)) {
      await deleteEvaluation(id);
    }
    setSelectedIds(new Set());
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    await updateEvaluation(editingItem.id, editingItem);
    setEditingItem(null);
  };

  return (
    <div className="view-section active">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>📋 Directorio de Evaluaciones</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {displayList.length} registros encontrados • Paginación de 30 por página
          </p>
        </div>
        {selectedIds.size > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleBatchDelete}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            🗑️ Eliminar ({selectedIds.size}) seleccionados
          </button>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Búsqueda</label>
            <input
              type="text"
              placeholder="Operador, Folio o Instructor..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Empresa</label>
            <select
              value={selectedEmpresa}
              onChange={(e) => {
                setSelectedEmpresa(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
            >
              <option value="all">Todas las Empresas</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Sede</label>
            <select
              value={selectedSede}
              onChange={(e) => {
                setSelectedSede(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
            >
              <option value="all">Todas las Sedes</option>
              {sedes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Estado</label>
            <select
              value={selectedEstado}
              onChange={(e) => {
                setSelectedEstado(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
            >
              <option value="all">Todos los Estados</option>
              <option value="Sobresaliente">Sobresaliente (8.0+)</option>
              <option value="Aprobado">Aprobado (6.0 - 7.9)</option>
              <option value="Reforzar">Reforzar (5.0 - 5.9)</option>
              <option value="No Aprobado">No Aprobado (&lt; 5.0)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de Directorio */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pagedList.length > 0 && selectedIds.size === pagedList.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Operador</th>
                <th>Empresa</th>
                <th>Sede</th>
                <th>Fecha</th>
                <th>Calificación</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    Cargando evaluaciones...
                  </td>
                </tr>
              ) : pagedList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No se encontraron evaluaciones con los filtros actuales.
                  </td>
                </tr>
              ) : (
                pagedList.map((item) => {
                  const score = item.evaluacionFinalPuntos ?? item.calificacionExacta ?? item.promedioScore ?? 0;
                  const opName = item.conductor || item.operador || 'Sin Asignar';
                  const isChecked = selectedIds.has(item.id);

                  return (
                    <tr key={item.id} style={{ background: isChecked ? 'rgba(56, 189, 248, 0.08)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(item.id)}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{opName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ID: {item.id.substring(0, 14)}
                        </div>
                      </td>
                      <td>{item.empresa || 'N/A'}</td>
                      <td>{item.sede || 'N/A'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte || item.fecha || 'N/A'}
                      </td>
                      <td>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                          {score.toFixed(2)}
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info">{item.estado || 'Evaluado'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingItem(item)}
                            title="Editar evaluación"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={async () => {
                              if (window.confirm(`¿Eliminar la evaluación de ${opName}?`)) {
                                await deleteEvaluation(item.id);
                              }
                            }}
                            title="Eliminar registro"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Mostrando {(activePage - 1) * PAGE_SIZE + 1}-{Math.min(activePage * PAGE_SIZE, displayList.length)} de {displayList.length} evaluaciones
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(1)}
              disabled={activePage === 1}
            >
              ««
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={activePage === 1}
            >
              « Ant
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8', padding: '0 0.5rem' }}>
              Página {activePage} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={activePage === totalPages}
            >
              Sig »
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={activePage === totalPages}
            >
              »»
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Edición Individual */}
      {editingItem && (
        <div className="modal-backdrop active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-dialog card" style={{ maxWidth: '600px', width: '90%', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, fontWeight: 700 }}>✏️ Editar Evaluación</h3>
            <form onSubmit={handleSaveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Conductor / Operador</label>
                  <input
                    type="text"
                    value={editingItem.conductor || editingItem.operador || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, conductor: e.target.value, operador: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Empresa</label>
                  <input
                    type="text"
                    value={editingItem.empresa || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, empresa: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sede</label>
                  <input
                    type="text"
                    value={editingItem.sede || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, sede: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Calificación Final (0 - 10)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={editingItem.evaluacionFinalPuntos ?? editingItem.calificacionExacta ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEditingItem({ ...editingItem, evaluacionFinalPuntos: val, calificacionExacta: val });
                    }}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
