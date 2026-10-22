import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Evaluation, ExerciseItem } from '../types';
import { findCatalogExercise } from '../services/exerciseCatalog';

/** Escapa un valor para CSV (comillas dobles, comas y saltos de línea) */
function csvCell(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Parser CSV (soporta comillas, saltos de línea en celdas y delimitador , o ;) */
function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

/** Obtiene los ejercicios de una evaluación como mapa numero -> ejercicio */
function getEvaluationExerciseMap(e: Evaluation): Record<number, ExerciseItem> {
  const map: Record<number, ExerciseItem> = {};
  if (Array.isArray(e.ejercicios) && e.ejercicios.length > 0) {
    e.ejercicios.forEach(ex => { if (ex && ex.numero != null) map[ex.numero] = ex; });
  } else {
    Object.keys(e.simulacionesDetalle || {}).forEach(k => {
      const n = parseInt(k.replace('simulacion_', ''), 10);
      if (!isNaN(n)) {
        map[n] = { numero: n, nombre: e.nombresSimulaciones?.[n] || '', calificacion: (e.simulacionesDetalle as any)[k] };
      }
    });
  }
  return map;
}

export const DirectoryTab: React.FC = () => {
  const { userRole } = useAuth();
  const {
    evaluations,
    filteredEvaluations,
    companies,
    deleteEvaluation,
    updateEvaluation,
    reloadEvaluations,
    loading
  } = useData();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');

  if (userRole !== 'admin') {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', margin: '2rem auto', maxWidth: '600px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>Acceso Restringido</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          El Directorio de Evaluaciones y edición de registros es exclusivo para personal administrativo. No tienes permisos para visualizar esta sección.
        </p>
      </div>
    );
  }

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

  /**
   * Exportar a CSV con columnas completas y formateo para edición masiva
   */
  const handleExportCSV = () => {
    if (displayList.length === 0) {
      alert('No hay datos disponibles para exportar con los filtros seleccionados.');
      return;
    }

    const exMaps = displayList.map(getEvaluationExerciseMap);
    let maxSim = 4;
    exMaps.forEach(m => Object.keys(m).forEach(k => { if (+k > maxSim) maxSim = +k; }));

    const headers = [
      'ID', 'Conductor', 'Empresa', 'Sede', 'Fecha', 'Curso', 'Nombre Curso', 'Instructor', 'Folio Grupo',
      'Habilidades Manejo (Puntos)', 'Habilidades Manejo (%)',
      'Simulador (Puntos)', 'Simulador (%)'
    ];
    for (let n = 2; n <= maxSim; n++) {
      headers.push(`Sim ${n} Titulo`, `Sim ${n} Nota`);
    }
    headers.push(
      'Evaluacion Final',
      'Colisiones', 'Fatalidades', 'Fuera de Via',
      'Estado'
    );

    const rows = displayList.map((e, idx) => {
      const row: any[] = [
        e.id,
        e.conductor || e.operador || '',
        e.empresa || '',
        e.sede || '',
        e.fechaCapacitacionFormato || e.fechaCapacitacion || e.fechaReporte || e.fecha || '',
        (e as any).cursoCodigo || '',
        (e as any).cursoNombre || '',
        e.instructor || '',
        (e as any).folioGrupo || '',
        e.habilidadesManejoPuntos || 0,
        e.habilidadesManejoPct || 0,
        e.practicaSimuladorPuntos || 0,
        e.practicaSimuladorPct || 0
      ];
      for (let n = 2; n <= maxSim; n++) {
        const ex = exMaps[idx][n];
        row.push(ex?.nombre ?? '', ex?.calificacion ?? '');
      }
      row.push(
        e.evaluacionFinalPuntos ?? e.calificacionExacta ?? 0,
        e.colisiones || 0,
        e.fatalidades || 0,
        e.vehiculoFueraVia || 0,
        e.estado || ''
      );
      return row.map(csvCell);
    });

    const csvContent = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrackSIM_Evaluaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Importar evaluaciones modificadas desde archivo CSV
   */
  const handleImportCSV = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        alert('El archivo CSV está vacío.');
        return;
      }

      const headers = rows[0].map(h => h.trim());
      const col = (name: string) => headers.indexOf(name);
      const idCol = col('ID');
      if (idCol < 0) {
        alert('El CSV no tiene la columna "ID". Usa un archivo previamente exportado desde TrackSIM.');
        return;
      }

      const simNums: number[] = [];
      headers.forEach(h => {
        const m = h.match(/^Sim (\d+) Titulo$/);
        if (m) simNums.push(parseInt(m[1], 10));
      });

      const num = (v: any, fallback: number) => {
        const n = parseFloat(String(v ?? '').replace(',', '.'));
        return isNaN(n) ? fallback : n;
      };

      const updates: { id: string; fields: Partial<Evaluation> }[] = [];
      let skipped = 0;

      rows.slice(1).forEach(r => {
        const id = (r[idCol] || '').trim();
        const item = evaluations.find(e => e.id === id);
        if (!item) {
          skipped++;
          return;
        }

        const get = (name: string) => {
          const i = col(name);
          return i >= 0 ? (r[i] ?? '').trim() : undefined;
        };

        const f: any = {};
        const setStr = (field: string, header: string) => {
          const v = get(header);
          if (v !== undefined) f[field] = v;
        };

        setStr('conductor', 'Conductor');
        setStr('empresa', 'Empresa');
        setStr('sede', 'Sede');
        setStr('cursoCodigo', 'Curso');
        setStr('cursoNombre', 'Nombre Curso');
        setStr('instructor', 'Instructor');
        setStr('folioGrupo', 'Folio Grupo');

        const fecha = get('Fecha');
        if (fecha) {
          let iso = '', fmt = '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            const [y, m, d] = fecha.split('-');
            iso = fecha;
            fmt = `${d}/${m}/${y}`;
          } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
            const [d, m, y] = fecha.split('/');
            fmt = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
            iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          if (iso) {
            f.fechaCapacitacion = iso;
            f.fechaCapacitacionFormato = fmt;
            f.fechaReporte = fmt;
          }
        }

        // Ejercicios
        if (simNums.length > 0) {
          const map = getEvaluationExerciseMap(item);
          Object.keys(map).forEach(k => {
            if (+k >= 2 && !simNums.includes(+k)) delete map[+k];
          });
          simNums.forEach(n => {
            const titulo = get(`Sim ${n} Titulo`) || '';
            const notaStr = get(`Sim ${n} Nota`) ?? '';
            if (!titulo && notaStr === '') {
              delete map[n];
              return;
            }
            const desc = findCatalogExercise(titulo)?.descripcion || map[n]?.comentarios || '';
            map[n] = {
              numero: n,
              nombre: titulo,
              calificacion: notaStr === '' ? undefined : num(notaStr, 0),
              comentarios: desc
            };
          });

          const ejercicios = Object.values(map).sort((a, b) => (a.numero || 0) - (b.numero || 0));
          f.ejercicios = ejercicios;
          f.simulacionesDetalle = {};
          f.nombresSimulaciones = {};
          ejercicios.forEach(ex => {
            if (ex.numero != null) {
              f.simulacionesDetalle[`simulacion_${ex.numero}`] = ex.calificacion ?? null;
              f.nombresSimulaciones[ex.numero] = ex.nombre;
            }
          });
        }

        // Calificaciones y dictamen
        const hab = num(get('Habilidades Manejo (Puntos)'), item.habilidadesManejoPuntos || 0);
        const sim = num(get('Simulador (Puntos)'), item.practicaSimuladorPuntos || 0);
        let finalPts = num(get('Evaluacion Final'), NaN);
        if (isNaN(finalPts)) finalPts = Number((hab + sim).toFixed(2));

        f.habilidadesManejoPuntos = hab;
        f.habilidadesManejoPct = Math.round((hab / 3.0) * 10000) / 100;
        f.practicaSimuladorPuntos = sim;
        f.practicaSimuladorPct = Math.round((sim / 7.0) * 10000) / 100;
        f.evaluacionFinalPuntos = finalPts;
        f.evaluacionFinalPct = Math.round((finalPts / 10.0) * 10000) / 100;
        f.calificacionExacta = Number(finalPts.toFixed(4));
        f.estado = finalPts >= 8 ? 'Sobresaliente' : finalPts >= 6 ? 'Aprobado' : finalPts >= 5 ? 'Reforzar' : 'No Aprobado';
        f.colisiones = parseInt(get('Colisiones') || '0', 10) || 0;
        f.fatalidades = parseInt(get('Fatalidades') || '0', 10) || 0;
        f.vehiculoFueraVia = parseInt(get('Fuera de Via') || '0', 10) || 0;

        updates.push({ id, fields: f });
      });

      if (updates.length === 0) {
        alert('Ninguna fila del CSV coincide con evaluaciones existentes (revisa la columna ID).');
        return;
      }

      if (!window.confirm(`Se actualizarán ${updates.length} evaluaciones en Firestore${skipped ? ` (${skipped} filas ignoradas por ID desconocido)` : ''}.\n\n¿Deseas continuar?`)) {
        return;
      }

      setIsImporting(true);
      let done = 0;
      setImportProgress(`0 / ${updates.length}`);

      for (const u of updates) {
        await updateEvaluation(u.id, u.fields);
        done++;
        setImportProgress(`${done} / ${updates.length}`);
      }

      await reloadEvaluations(false);
      alert(`¡${updates.length} evaluaciones actualizadas exitosamente desde el CSV!`);
    } catch (err) {
      console.error('Error al importar CSV:', err);
      alert('Ocurrió un error al procesar el archivo CSV.');
    } finally {
      setIsImporting(false);
      setImportProgress('');
    }
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
        
        {/* Acciones de Cabecera: Exportar, Importar y Eliminar Lote */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleImportCSV(file);
            }}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            title="Sube un archivo CSV modificado para actualizar masivamente por ID"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {isImporting ? `Importando ${importProgress}...` : 'Importar CSV'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            title="Descargar evaluaciones con filtros actuales en CSV"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Exportar CSV
          </button>

          {selectedIds.size > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleBatchDelete}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              🗑️ Eliminar ({selectedIds.size}) seleccionados
            </button>
          )}
        </div>
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
          {companies.length > 1 && (
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
          )}
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
