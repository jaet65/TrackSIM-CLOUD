import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Evaluation, ExerciseItem } from '../types';
import { findCatalogExercise } from '../services/exerciseCatalog';
import { ReportDetailModal } from './ReportDetailModal';

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
    deleteAllEvaluations,
    updateEvaluation,
    reloadEvaluations,
    loading
  } = useData();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

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
  const [viewingReport, setViewingReport] = useState<Evaluation | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchEmpresa, setBatchEmpresa] = useState('');
  const [batchSede, setBatchSede] = useState('__KEEP__');
  const [batchInstructor, setBatchInstructor] = useState('__KEEP__');
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Ordenamiento interactivo por columnas
  type SortColumn = 'conductor' | 'empresa' | 'sede' | 'fecha' | 'score' | 'estado';
  const [sortCol, setSortCol] = useState<SortColumn>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'conductor' || col === 'empresa' ? 'asc' : 'desc');
    }
  };

  const PAGE_SIZE = 30;

  // Sedes disponibles dinámicas
  const sedes = useMemo(() => {
    const set = new Set<string>();
    filteredEvaluations.forEach((e) => {
      if (e.sede) set.add(e.sede);
    });
    return Array.from(set).sort();
  }, [filteredEvaluations]);

  // Filtrado multi-criterio y ordenamiento interactivo
  const displayList = useMemo(() => {
    const filtered = filteredEvaluations.filter((item) => {
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

    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'conductor':
          cmp = (a.conductor || a.operador || '').localeCompare(b.conductor || b.operador || '', 'es', { numeric: true, sensitivity: 'base' });
          break;
        case 'empresa':
          cmp = (a.empresa || '').localeCompare(b.empresa || '', 'es', { numeric: true, sensitivity: 'base' });
          break;
        case 'sede':
          cmp = (a.sede || '').localeCompare(b.sede || '', 'es', { numeric: true, sensitivity: 'base' });
          break;
        case 'fecha': {
          const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
          const db = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
          cmp = da.localeCompare(db);
          break;
        }
        case 'score': {
          const sa = a.evaluacionFinalPuntos ?? a.calificacionExacta ?? a.promedioScore ?? 0;
          const sb = b.evaluacionFinalPuntos ?? b.calificacionExacta ?? b.promedioScore ?? 0;
          cmp = sa - sb;
          break;
        }
        case 'estado': {
          const rank: Record<string, number> = {
            'Sobresaliente': 4,
            'Aprobado': 3,
            'Reforzar': 2,
            'Requiere Refuerzo': 2,
            'No Aprobado': 1
          };
          const ra = rank[a.estado || ''] || 0;
          const rb = rank[b.estado || ''] || 0;
          cmp = ra - rb;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredEvaluations, selectedEmpresa, selectedSede, selectedEstado, search, sortCol, sortDir]);

  // Resumen métrico (KPIs) en tiempo real según filtros aplicados
  const stats = useMemo(() => {
    const total = displayList.length;
    if (total === 0) return { total: 0, promedio: 0, aprobados: 0, tasaAprobacion: 0, incidentes: 0 };
    let sumScore = 0;
    let aprobados = 0;
    let incidentes = 0;
    displayList.forEach((e) => {
      const sc = e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0;
      sumScore += sc;
      if (sc >= 6.0 || e.estado === 'Aprobado' || e.estado === 'Sobresaliente') {
        aprobados++;
      }
      incidentes += (e.colisiones || 0) + (e.fatalidades || 0) + (e.vehiculoFueraVia || 0);
    });
    return {
      total,
      promedio: Number((sumScore / total).toFixed(2)),
      aprobados,
      tasaAprobacion: Math.round((aprobados / total) * 100),
      incidentes
    };
  }, [displayList]);

  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedList = displayList.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedList.length && pagedList.length > 0) {
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

  const handleDeleteAllEvaluations = async () => {
    const total = filteredEvaluations.length;
    if (total === 0) {
      alert('No hay evaluaciones para eliminar.');
      return;
    }

    const isFiltered = total !== evaluations.length;
    const confirmMessage = isFiltered
      ? `⚠️ ATENCIÓN: Tienes filtros activos.\n\n¿Deseas eliminar definitivamente las ${total} evaluaciones actualmente filtradas?\n\nEsta acción borrará los registros de Firestore y no se puede deshacer.`
      : `⚠️ PELIGRO: ESTA ACCIÓN NO SE PUEDE DESHACER.\n\n¿Estás completamente seguro de eliminar TODAS las evaluaciones de la base de datos (${total} registros)?\n\nSe eliminarán de Firestore y de la nube.`;

    if (!window.confirm(confirmMessage)) return;

    // Doble confirmación de seguridad para evitar eliminaciones accidentales
    const userInput = window.prompt(`Para confirmar la eliminación de ${total} evaluaciones, escribe la palabra "ELIMINAR":`);
    if (userInput?.trim().toUpperCase() !== 'ELIMINAR') {
      alert('Operación cancelada. El texto ingresado no coincide.');
      return;
    }

    try {
      setIsDeletingAll(true);
      const deletedCount = await deleteAllEvaluations(isFiltered ? filteredEvaluations : undefined);
      setSelectedIds(new Set());
      alert(`Se eliminaron exitosamente ${deletedCount} evaluaciones en Firestore.`);
    } catch (err: any) {
      console.error('Error eliminando todas las evaluaciones:', err);
      const msg = err?.message || 'Error desconocido';
      alert(`⚠️ No se completó la eliminación:\n\n${msg}\n\nSi la cuota de Firebase está agotada, las operaciones se reanudarán al reiniciarse la cuota diaria.`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleBatchUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const updates: Partial<Evaluation> = {};
    if (batchEmpresa.trim()) updates.empresa = batchEmpresa.trim();
    if (batchSede !== '__KEEP__') updates.sede = batchSede;
    if (batchInstructor !== '__KEEP__' && batchInstructor.trim()) updates.instructor = batchInstructor.trim();

    if (Object.keys(updates).length === 0) {
      alert('Por favor selecciona o introduce al menos un campo para actualizar.');
      return;
    }

    if (!window.confirm(`Se actualizarán ${ids.length} evaluaciones seleccionadas. ¿Continuar?`)) return;

    setIsSavingBatch(true);
    try {
      for (const id of ids) {
        await updateEvaluation(id, updates);
      }
      setIsBatchModalOpen(false);
      setSelectedIds(new Set());
      setBatchEmpresa('');
      setBatchSede('__KEEP__');
      setBatchInstructor('__KEEP__');
      alert(`¡${ids.length} evaluaciones actualizadas correctamente en Firestore!`);
    } catch (err) {
      console.error('Error al actualizar en lote:', err);
      alert('Ocurrió un error al actualizar los registros seleccionados.');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    await updateEvaluation(editingItem.id, editingItem);
    setEditingItem(null);
  };

  /** Helper para obtener color del Badge según estado */
  const getBadgeStyle = (estado?: string, score?: number) => {
    const s = score ?? 0;
    if (estado === 'Sobresaliente' || s >= 8.0) {
      return { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.35)', label: estado || 'Sobresaliente' };
    }
    if (estado === 'Aprobado' || s >= 6.0) {
      return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.35)', label: estado || 'Aprobado' };
    }
    if (estado === 'Reforzar' || estado === 'Requiere Refuerzo' || s >= 5.0) {
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)', label: estado || 'Reforzar' };
    }
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.35)', label: estado || 'No Aprobado' };
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
      {/* Encabezado Principal y Acciones */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>📋</span> Directorio de Evaluaciones
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Explora, filtra, audita reportes detallados y realiza ediciones individuales o masivas en Firestore.
          </p>
        </div>
        
        {/* Acciones de Cabecera: Exportar e Importar CSV */}
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

          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDeleteAllEvaluations}
            disabled={isDeletingAll || filteredEvaluations.length === 0}
            title="Eliminar todas las evaluaciones de la base de datos o las filtradas"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.18)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            {isDeletingAll ? 'Eliminando...' : 'Eliminar Todas'}
          </button>
        </div>
      </div>

      {/* KPI Cards de Resumen en Tiempo Real */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="glass-card" style={{ padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Registros</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>
            {stats.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Evaluaciones visibles</div>
        </div>

        <div className="glass-card" style={{ padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Promedio Calificación</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.promedio >= 6.0 ? '#4ade80' : '#f87171', marginTop: '0.2rem' }}>
            {stats.promedio.toFixed(2)} <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>/ 10</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Flota consultada</div>
        </div>

        <div className="glass-card" style={{ padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Tasa Aprobación</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.tasaAprobacion >= 70 ? '#4ade80' : '#fbbf24', marginTop: '0.2rem' }}>
            {stats.tasaAprobacion}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{stats.aprobados} de {stats.total} aprobados</div>
        </div>

        <div className="glass-card" style={{ padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Incidentes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.incidentes > 0 ? '#f87171' : '#4ade80', marginTop: '0.2rem' }}>
            {stats.incidentes}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Colisiones / Fuera de Vía</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', borderRadius: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>🔍 Búsqueda Rápida</label>
            <input
              type="text"
              placeholder="Operador, Folio o Instructor..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
            />
          </div>

          {companies.length > 1 && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>🏢 Empresa</label>
              <select
                value={selectedEmpresa}
                onChange={(e) => {
                  setSelectedEmpresa(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
              >
                <option value="all">Todas las Empresas ({companies.length})</option>
                {companies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>📍 Sede</label>
            <select
              value={selectedSede}
              onChange={(e) => {
                setSelectedSede(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
            >
              <option value="all">Todas las Sedes ({sedes.length})</option>
              {sedes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>🎯 Estado Dictamen</label>
            <select
              value={selectedEstado}
              onChange={(e) => {
                setSelectedEstado(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
            >
              <option value="all">Todos los Estados</option>
              <option value="Sobresaliente">⭐ Sobresaliente (8.0+)</option>
              <option value="Aprobado">✅ Aprobado (6.0 - 7.9)</option>
              <option value="Reforzar">⚠️ Reforzar (5.0 - 5.9)</option>
              <option value="No Aprobado">❌ No Aprobado (&lt; 5.0)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Barra de Acciones por Lote (cuando hay checkboxes activos) */}
      {selectedIds.size > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(99, 102, 241, 0.12))',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '10px',
            padding: '0.8rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.8rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
              ⚡
            </div>
            <div>
              <strong style={{ color: '#fff', fontSize: '0.92rem' }}>
                {selectedIds.size} {selectedIds.size === 1 ? 'evaluación seleccionada' : 'evaluaciones seleccionadas'}
              </strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Aplica cambios masivos directos a Firestore o elimina los registros seleccionados
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setBatchEmpresa('');
                setBatchSede('__KEEP__');
                setBatchInstructor('__KEEP__');
                setIsBatchModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            >
              ✏️ Modificar en Lote ({selectedIds.size})
            </button>

            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleBatchDelete}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            >
              🗑️ Eliminar ({selectedIds.size})
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedIds(new Set())}
              style={{ fontSize: '0.82rem' }}
            >
              ✕ Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Tabla de Directorio */}
      <div className="card" style={{ borderRadius: '12px', overflow: 'hidden', width: '100%' }}>
        <div className="table-responsive" style={{ width: '100%' }}>
          <table className="custom-table" style={{ width: '100%', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{ width: '44px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={pagedList.length > 0 && selectedIds.size === pagedList.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#38bdf8' }}
                    title="Seleccionar todo en esta página"
                  />
                </th>
                <th
                  onClick={() => handleSort('conductor')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Operador"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Operador</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'conductor' ? 1 : 0.4, color: sortCol === 'conductor' ? '#38bdf8' : undefined }}>
                      {sortCol === 'conductor' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('empresa')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Empresa"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Empresa</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'empresa' ? 1 : 0.4, color: sortCol === 'empresa' ? '#38bdf8' : undefined }}>
                      {sortCol === 'empresa' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('sede')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Sede"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Sede</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'sede' ? 1 : 0.4, color: sortCol === 'sede' ? '#38bdf8' : undefined }}>
                      {sortCol === 'sede' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('fecha')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Fecha"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Fecha</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'fecha' ? 1 : 0.4, color: sortCol === 'fecha' ? '#38bdf8' : undefined }}>
                      {sortCol === 'fecha' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('score')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Calificación Final"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Calificación</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'score' ? 1 : 0.4, color: sortCol === 'score' ? '#38bdf8' : undefined }}>
                      {sortCol === 'score' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('estado')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Estado"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Estado</span>
                    <span style={{ fontSize: '0.75rem', opacity: sortCol === 'estado' ? 1 : 0.4, color: sortCol === 'estado' ? '#38bdf8' : undefined }}>
                      {sortCol === 'estado' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                    Cargando directorio de evaluaciones...
                  </td>
                </tr>
              ) : pagedList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🔍</div>
                    No se encontraron evaluaciones con los filtros actuales.
                  </td>
                </tr>
              ) : (
                pagedList.map((item) => {
                  const score = item.evaluacionFinalPuntos ?? item.calificacionExacta ?? item.promedioScore ?? 0;
                  const opName = item.conductor || item.operador || 'Sin Asignar';
                  const isChecked = selectedIds.has(item.id);
                  const badge = getBadgeStyle(item.estado, score);

                  return (
                    <tr
                      key={item.id}
                      style={{
                        background: isChecked ? 'rgba(56, 189, 248, 0.08)' : undefined,
                        transition: 'background 0.2s ease'
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(item.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#38bdf8' }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{opName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.4rem', marginTop: '0.1rem' }}>
                          <span>{item.folio || item.id.substring(0, 10)}</span>
                          {item.instructor && <span>• Ins: {item.instructor}</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{item.empresa || 'N/A'}</div>
                      </td>
                      <td>
                        {item.sede ? (
                          <span style={{ fontSize: '0.78rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            📍 {item.sede}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte || item.fecha || 'N/A'}
                      </td>
                      <td>
                        <span style={{ color: score >= 6.0 ? '#38bdf8' : '#f87171', fontWeight: 700, fontSize: '0.92rem' }}>
                          {score.toFixed(2)}
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.22rem 0.65rem',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setViewingReport(item)}
                            title="Ver reporte digital completo"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                          >
                            📄 Ver
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingItem(item)}
                            title="Editar evaluación"
                            style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)', padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={async () => {
                              if (window.confirm(`¿Eliminar definitivamente la evaluación de ${opName}?`)) {
                                await deleteEvaluation(item.id);
                              }
                            }}
                            title="Eliminar registro"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
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
            Mostrando {(activePage - 1) * PAGE_SIZE + (displayList.length > 0 ? 1 : 0)}-{Math.min(activePage * PAGE_SIZE, displayList.length)} de {displayList.length} evaluaciones
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

      {/* Modal: Ver Reporte Digital Detallado Unificado */}
      <ReportDetailModal
        evaluation={viewingReport}
        onClose={() => setViewingReport(null)}
      />

      {/* Modal: Edición Masiva en Lote */}
      {isBatchModalOpen && (
        <div
          className="modal-overlay active"
          onClick={() => !isSavingBatch && setIsBatchModalOpen(false)}
        >
          <div
            className="modal-dialog"
            style={{ maxWidth: '540px', width: '90%', padding: '1.75rem', borderRadius: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>
              ⚡ Edición Masiva en Lote
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
              Modificarás {selectedIds.size} evaluaciones simultáneamente en Firestore.
            </p>

            <form onSubmit={handleBatchUpdateSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    🏢 Nueva Empresa (dejar en blanco para conservar actual)
                  </label>
                  <input
                    type="text"
                    placeholder="Escribe la nueva empresa..."
                    value={batchEmpresa}
                    onChange={(e) => setBatchEmpresa(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    📍 Sede
                  </label>
                  <select
                    value={batchSede}
                    onChange={(e) => setBatchSede(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="__KEEP__">-- Conservar Sede Actual --</option>
                    <option value="">-- Sin Sede (Limpiar) --</option>
                    {sedes.map((s) => (
                      <option key={s} value={s}>📍 {s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    👨‍🏫 Instructor (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Dejar en blanco para conservar actual..."
                    value={batchInstructor === '__KEEP__' ? '' : batchInstructor}
                    onChange={(e) => setBatchInstructor(e.target.value || '__KEEP__')}
                    style={{ width: '100%', padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsBatchModalOpen(false)}
                  disabled={isSavingBatch}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingBatch}
                >
                  {isSavingBatch ? 'Guardando en Firestore...' : `Guardar en ${selectedIds.size} Registros`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edición Individual */}
      {editingItem && (
        <div
          className="modal-overlay active"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="modal-dialog"
            style={{ maxWidth: '640px', width: '90%', padding: '1.75rem', borderRadius: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>✏️ Editar Evaluación Individual</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Modificando evaluación ID: {editingItem.id}
            </p>
            <form onSubmit={handleSaveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Conductor / Operador</label>
                  <input
                    type="text"
                    value={editingItem.conductor || editingItem.operador || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, conductor: e.target.value, operador: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Empresa</label>
                  <input
                    type="text"
                    value={editingItem.empresa || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, empresa: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Sede</label>
                  <input
                    type="text"
                    value={editingItem.sede || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, sede: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Instructor</label>
                  <input
                    type="text"
                    value={editingItem.instructor || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, instructor: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Calificación Final (0 - 10)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={editingItem.evaluacionFinalPuntos ?? editingItem.calificacionExacta ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      let est = 'No Aprobado';
                      if (val >= 8.0) est = 'Sobresaliente';
                      else if (val >= 6.0) est = 'Aprobado';
                      else if (val >= 5.0) est = 'Reforzar';
                      setEditingItem({ ...editingItem, evaluacionFinalPuntos: val, calificacionExacta: val, estado: est });
                    }}
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Dictamen / Estado</label>
                  <select
                    value={editingItem.estado || 'Aprobado'}
                    onChange={(e) => setEditingItem({ ...editingItem, estado: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="Sobresaliente">Sobresaliente</option>
                    <option value="Aprobado">Aprobado</option>
                    <option value="Reforzar">Reforzar</option>
                    <option value="No Aprobado">No Aprobado</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 Guardar Cambios en Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
