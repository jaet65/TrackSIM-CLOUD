/**
 * TrackSIM CLOUD - Directory & Evaluation Table Module
 * Filtros de búsqueda, ordenamiento, selección masiva,
 * exportación CSV, edición por lotes y renderizado del directorio.
 */

import {
  updateEvaluationsBatchEmpresaSede,
  updateSingleEvaluation
} from '../db.js';
import {
  NOMBRES_SEDES_MEXICO
} from '../pdf-parser.js';
import {
  findCatalogExercise,
  ensureExerciseDatalist
} from '../exercise-catalog.js';
import { showToast } from './toast.js';

export function parseDateToTimestamp(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const s = dateStr.trim();
  const dmMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmMatch) {
    return new Date(parseInt(dmMatch[3], 10), parseInt(dmMatch[2], 10) - 1, parseInt(dmMatch[1], 10)).getTime() || 0;
  }
  const ymMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymMatch) {
    return new Date(parseInt(ymMatch[1], 10), parseInt(ymMatch[2], 10) - 1, parseInt(ymMatch[3], 10)).getTime() || 0;
  }
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
}

function initDirectoryTableSorting() {
  const table = document.getElementById('directoryTable');
  if (!table) return;

  const thead = table.querySelector('thead');
  if (!thead) return;

  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable-th');
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;

    if (AppState.directoryTableSort.column === key) {
      AppState.directoryTableSort.direction = AppState.directoryTableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      AppState.directoryTableSort.column = key;
      if (key === 'conductor' || key === 'empresa') {
        AppState.directoryTableSort.direction = 'asc';
      } else {
        AppState.directoryTableSort.direction = 'desc';
      }
    }

    renderDirectoryTable();
  });
}

function updateDirectoryTableSortHeaders(activeCol, activeDir) {
  const ths = document.querySelectorAll('#directoryTable thead th.sortable-th');
  ths.forEach(th => {
    const key = th.dataset.sortKey;
    const indicator = th.querySelector('.sort-indicator');
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (key === activeCol) {
      th.classList.add(activeDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      th.setAttribute('aria-sort', activeDir === 'asc' ? 'ascending' : 'descending');
      if (indicator) indicator.textContent = activeDir === 'asc' ? '▲' : '▼';
    } else {
      th.setAttribute('aria-sort', 'none');
      if (indicator) indicator.textContent = '↕';
    }
  });
}

function getEvaluationSimScore(e) {
  if (!e) return -1;
  if (e.simulacionesDetalle) {
    const s2 = e.simulacionesDetalle.simulacion_2;
    const s3 = e.simulacionesDetalle.simulacion_3;
    const s4 = e.simulacionesDetalle.simulacion_4;
    let sum = 0, count = 0;
    if (typeof s2 === 'number' && !isNaN(s2) && s2 >= 0) { sum += s2; count++; }
    if (typeof s3 === 'number' && !isNaN(s3) && s3 >= 0) { sum += s3; count++; }
    if (typeof s4 === 'number' && !isNaN(s4) && s4 >= 0) { sum += s4; count++; }
    if (count > 0) return (sum / count);
  }
  // Fallback si no vinieron calificaciones individuales: promedio obtenido en la práctica de simulador sobre 10
  if (typeof e.practicaSimuladorPct === 'number' && e.practicaSimuladorPct > 0) {
    return e.practicaSimuladorPct / 10;
  }
  if (typeof e.practicaSimuladorPuntos === 'number' && e.practicaSimuladorPuntos > 0) {
    return (e.practicaSimuladorPuntos / 7) * 10;
  }
  return -1;
}


// Paginación del directorio
const DIRECTORY_PAGE_SIZE = 50;
let directoryCurrentPage = 1;

function initDirectoryFilters() {
  const searchInput = document.getElementById('directorySearch');
  const companySelect = document.getElementById('filterCompany');
  const sedeSelect = document.getElementById('filterSede');
  const statusSelect = document.getElementById('filterStatus');
  const exportBtn = document.getElementById('exportCsvBtn');
  const selectAllCheckbox = document.getElementById('selectAllDirCheckbox');
  const clearSelectionBtn = document.getElementById('clearDirSelectionBtn');
  const openModalBtn = document.getElementById('openBatchEditDirModalBtn');
  const closeModalBtn = document.getElementById('closeDirBatchModalBtn');
  const cancelModalBtn = document.getElementById('cancelDirBatchModalBtn');
  const confirmUpdateBtn = document.getElementById('confirmDirBatchUpdateBtn');

  // Controles de Paginación
  const firstPageBtn = document.getElementById('dirFirstPageBtn');
  const prevPageBtn = document.getElementById('dirPrevPageBtn');
  const nextPageBtn = document.getElementById('dirNextPageBtn');
  const lastPageBtn = document.getElementById('dirLastPageBtn');

  if (firstPageBtn) {
    firstPageBtn.addEventListener('click', () => {
      if (directoryCurrentPage !== 1) {
        directoryCurrentPage = 1;
        renderDirectoryTable();
      }
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (directoryCurrentPage > 1) {
        directoryCurrentPage--;
        renderDirectoryTable();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      const list = getFilteredDirectoryEvaluations();
      const totalPages = Math.max(1, Math.ceil(list.length / DIRECTORY_PAGE_SIZE));
      if (directoryCurrentPage < totalPages) {
        directoryCurrentPage++;
        renderDirectoryTable();
      }
    });
  }

  if (lastPageBtn) {
    lastPageBtn.addEventListener('click', () => {
      const list = getFilteredDirectoryEvaluations();
      const totalPages = Math.max(1, Math.ceil(list.length / DIRECTORY_PAGE_SIZE));
      if (directoryCurrentPage !== totalPages) {
        directoryCurrentPage = totalPages;
        renderDirectoryTable();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.filters.search = e.target.value.toLowerCase().trim();
      directoryCurrentPage = 1;
      renderDirectoryTable();
    });
  }

  if (companySelect) {
    companySelect.addEventListener('change', (e) => {
      AppState.filters.empresa = e.target.value;
      directoryCurrentPage = 1;
      renderDirectoryTable();
    });
  }

  if (sedeSelect) {
    sedeSelect.addEventListener('change', (e) => {
      AppState.filters.sede = e.target.value;
      directoryCurrentPage = 1;
      renderDirectoryTable();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      AppState.filters.estado = e.target.value;
      directoryCurrentPage = 1;
      renderDirectoryTable();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportToCSV());
  }

  const importBtn = document.getElementById('importCsvBtn');
  const importInput = document.getElementById('importCsvInput');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) await importEvaluationsFromCSV(file);
    });
  }

  // Selección de todas las evaluaciones visibles en el directorio
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const visibleIds = getFilteredDirectoryEvaluations().map(ev => ev.id);
      if (e.target.checked) {
        visibleIds.forEach(id => AppState.selectedDirectoryIds.add(id));
      } else {
        visibleIds.forEach(id => AppState.selectedDirectoryIds.delete(id));
      }
      updateDirectorySelectionUI();
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      AppState.selectedDirectoryIds.clear();
      updateDirectorySelectionUI();
    });
  }

  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      if (AppState.selectedDirectoryIds.size === 1) {
        const singleId = Array.from(AppState.selectedDirectoryIds)[0];
        openEditSingleEvaluationModal(singleId);
      } else {
        openDirectoryBatchEditModal();
      }
    });
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', () => closeDirectoryBatchEditModal());
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => closeDirectoryBatchEditModal());

  const dirModal = document.getElementById('dirBatchEditModal');
  if (dirModal) {
    dirModal.addEventListener('click', (e) => {
      if (e.target === dirModal) closeDirectoryBatchEditModal();
    });
  }

  // Confirmar actualización en Firestore
  if (confirmUpdateBtn) {
    confirmUpdateBtn.addEventListener('click', async () => {
      await handleDirectoryBatchUpdate();
    });
  }

  // Configuración de modal de edición individual completa
  const editModal = document.getElementById('editIndividualEvalModal');
  const closeEditModalBtn = document.getElementById('closeEditIndividualModalBtn');
  const cancelEditModalBtn = document.getElementById('cancelEditIndividualModalBtn');
  const editEvalForm = document.getElementById('editIndividualEvalForm');
  const addExerciseBtn = document.getElementById('editEvalAddExerciseBtn');
  const calcAutoBtn = document.getElementById('editEvalCalcAutoBtn');
  const habPuntosInput = document.getElementById('editEvalHabPuntos');
  const simPuntosInput = document.getElementById('editEvalSimPuntos');

  if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditSingleEvaluationModal);
  if (cancelEditModalBtn) cancelEditModalBtn.addEventListener('click', closeEditSingleEvaluationModal);
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditSingleEvaluationModal();
    });
  }

  if (addExerciseBtn) {
    addExerciseBtn.addEventListener('click', () => {
      const container = document.getElementById('editEvalEjerciciosContainer');
      if (container) addEditExerciseRowToContainer(container);
    });
  }

  if (calcAutoBtn) {
    calcAutoBtn.addEventListener('click', () => {
      recalculateEditScores();
      showToast('Puntajes y dictamen oficial recalculados en el fondo.', 'info');
    });
  }

  const finalPuntosInput = document.getElementById('editEvalFinalPuntos');

  const updateCalculationsInBackground = () => {
    const habVal = parseFloat(habPuntosInput?.value) || 0;
    const simVal = parseFloat(simPuntosInput?.value) || 0;
    const habPct = Math.round((habVal / 3.0) * 10000) / 100;
    const simPct = Math.round((simVal / 7.0) * 10000) / 100;
    const total = Number((habVal + simVal).toFixed(2));
    const totalPct = Math.round((total / 10.0) * 10000) / 100;

    const habPctEl = document.getElementById('editEvalHabPct');
    if (habPctEl) habPctEl.value = habPct;
    const simPctEl = document.getElementById('editEvalSimPct');
    if (simPctEl) simPctEl.value = simPct;

    if (finalPuntosInput) finalPuntosInput.value = total;
    const finalPctEl = document.getElementById('editEvalFinalPct');
    if (finalPctEl) finalPctEl.value = totalPct;
    const calExactaEl = document.getElementById('editEvalCalExacta');
    if (calExactaEl) calExactaEl.value = total;

    // Dictamen oficial calculado en el fondo
    let est = 'No Aprobado';
    if (total >= 8.0) est = 'Sobresaliente';
    else if (total >= 6.0) est = 'Aprobado';
    else if (total >= 5.0) est = 'Reforzar';
    const estadoEl = document.getElementById('editEvalEstado');
    if (estadoEl) estadoEl.value = est;
  };

  if (habPuntosInput) habPuntosInput.addEventListener('input', updateCalculationsInBackground);
  if (simPuntosInput) simPuntosInput.addEventListener('input', updateCalculationsInBackground);

  if (finalPuntosInput) {
    finalPuntosInput.addEventListener('input', () => {
      const val = parseFloat(finalPuntosInput.value);
      if (!isNaN(val)) {
        const finalPctEl = document.getElementById('editEvalFinalPct');
        if (finalPctEl) finalPctEl.value = Math.round((val / 10.0) * 10000) / 100;
        const calExactaEl = document.getElementById('editEvalCalExacta');
        if (calExactaEl) calExactaEl.value = val;

        // Dictamen oficial calculado en el fondo
        let est = 'No Aprobado';
        if (val >= 8.0) est = 'Sobresaliente';
        else if (val >= 6.0) est = 'Aprobado';
        else if (val >= 5.0) est = 'Reforzar';
        const estadoEl = document.getElementById('editEvalEstado');
        if (estadoEl) estadoEl.value = est;
      }
    });
  }

  if (editEvalForm) {
    editEvalForm.addEventListener('submit', handleEditIndividualEvaluationSubmit);
  }

  // Inicializar ordenamiento interactivo de la tabla del directorio
  initDirectoryTableSorting();
}

/**
 * Obtiene la lista actual de evaluaciones que cumplen con los filtros activos
 */
function getFilteredDirectoryEvaluations() {
  let list = AppState.evaluations.slice();
  const { search, empresa, sede, estado } = AppState.filters;

  if (search) {
    list = list.filter(e =>
      (e.conductor || '').toLowerCase().includes(search) ||
      (e.empresa || '').toLowerCase().includes(search) ||
      (e.sede || '').toLowerCase().includes(search) ||
      (e.instructor || '').toLowerCase().includes(search) ||
      (e.cursoCodigo || '').toLowerCase().includes(search)
    );
  }

  if (empresa !== 'all') {
    list = list.filter(e => e.empresa === empresa);
  }

  if (sede !== 'all') {
    if (sede === '__NONE__') {
      list = list.filter(e => !(e.sede || '').trim());
    } else {
      list = list.filter(e => (e.sede || '').trim() === sede);
    }
  }

  if (estado !== 'all') {
    list = list.filter(e => e.estado === estado);
  }

  // Ordenamiento interactivo por columnas en directorio
  const sortCol = AppState.directoryTableSort?.column || 'fecha';
  const sortDir = AppState.directoryTableSort?.direction || 'desc';

  list.sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'conductor':
        cmp = (a.conductor || '').localeCompare(b.conductor || '', 'es', { sensitivity: 'base', numeric: true });
        break;
      case 'empresa':
        cmp = (a.empresa || '').localeCompare(b.empresa || '', 'es', { sensitivity: 'base', numeric: true });
        break;
      case 'fecha': {
        const da = a.fechaCapacitacion || a.fechaCapacitacionFormato || a.fechaReporte || '';
        const db = b.fechaCapacitacion || b.fechaCapacitacionFormato || b.fechaReporte || '';
        cmp = parseDateToTimestamp(da) - parseDateToTimestamp(db);
        break;
      }
      case 'habilidades':
        cmp = (a.habilidadesManejoPuntos || 0) - (b.habilidadesManejoPuntos || 0);
        break;
      case 'simulador':
        cmp = (a.practicaSimuladorPuntos || 0) - (b.practicaSimuladorPuntos || 0);
        break;
      case 'simulaciones': {
        const sa = getEvaluationSimScore(a);
        const sb = getEvaluationSimScore(b);
        cmp = sa - sb;
        break;
      }
      case 'evaluacionFinal': {
        const fa = a.evaluacionFinalPuntos || a.calificacionExacta || 0;
        const fb = b.evaluacionFinalPuntos || b.calificacionExacta || 0;
        cmp = fa - fb;
        break;
      }
      case 'estado': {
        const rank = {
          'Sobresaliente': 4,
          'Aprobado': 3,
          'Reforzar': 2,
          'Requiere Refuerzo': 2,
          'No Aprobado': 1
        };
        const ra = rank[a.estado] || 0;
        const rb = rank[b.estado] || 0;
        if (ra !== rb) {
          cmp = ra - rb;
        } else {
          const fa = a.evaluacionFinalPuntos || a.calificacionExacta || 0;
          const fb = b.evaluacionFinalPuntos || b.calificacionExacta || 0;
          cmp = fa - fb;
        }
        break;
      }
      default: {
        const da = a.fechaCapacitacion || a.fechaCapacitacionFormato || a.fechaReporte || '';
        const db = b.fechaCapacitacion || b.fechaCapacitacionFormato || b.fechaReporte || '';
        cmp = parseDateToTimestamp(da) - parseDateToTimestamp(db);
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return list;
}

/**
 * Actualiza la barra de acción por lote y el checkbox de selección maestra
 */
function updateDirectorySelectionUI() {
  const count = AppState.selectedDirectoryIds.size;
  const bar = document.getElementById('dirBatchActionBar');
  const countSpan = document.getElementById('dirSelectedCountSpan');
  const textEl = document.getElementById('dirBatchSelectionText');
  const selectAll = document.getElementById('selectAllDirCheckbox');

  if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
  if (countSpan) countSpan.textContent = count;
  if (textEl) {
    textEl.textContent = `${count} ${count === 1 ? 'evaluación seleccionada' : 'evaluaciones seleccionadas'}`;
  }

  const visibleList = getFilteredDirectoryEvaluations();
  if (selectAll && visibleList.length > 0) {
    const allSelected = visibleList.every(ev => AppState.selectedDirectoryIds.has(ev.id));
    const someSelected = visibleList.some(ev => AppState.selectedDirectoryIds.has(ev.id));
    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected && !allSelected;
  }

  document.querySelectorAll('.dir-item-checkbox').forEach(cb => {
    cb.checked = AppState.selectedDirectoryIds.has(cb.value);
  });
}

window.toggleDirectoryItemSelection = (id) => {
  if (AppState.selectedDirectoryIds.has(id)) {
    AppState.selectedDirectoryIds.delete(id);
  } else {
    AppState.selectedDirectoryIds.add(id);
  }
  updateDirectorySelectionUI();
};

function openDirectoryBatchEditModal(preselectedId = null) {
  if (preselectedId) {
    AppState.selectedDirectoryIds.clear();
    AppState.selectedDirectoryIds.add(preselectedId);
    updateDirectorySelectionUI();
  }

  const selectedCount = AppState.selectedDirectoryIds.size;
  if (selectedCount === 0) {
    showToast('Selecciona al menos una evaluación para editar.', 'warning');
    return;
  }

  const modal = document.getElementById('dirBatchEditModal');
  const subtitle = document.getElementById('dirBatchModalSubtitle');
  const empresaInput = document.getElementById('modalBatchEmpresaInput');
  const sedeSelect = document.getElementById('modalBatchSedeSelect');
  const previewList = document.getElementById('dirBatchPreviewList');

  if (subtitle) {
    subtitle.textContent = `Actualizando ${selectedCount} ${selectedCount === 1 ? 'evaluación seleccionada' : 'evaluaciones seleccionadas'}`;
  }

  // Poblar select de sedes si aún no tiene las opciones
  if (sedeSelect && sedeSelect.options.length <= 2) {
    sedeSelect.innerHTML = `
      <option value="__KEEP__">-- Conservar Sede Actual --</option>
      <option value="">-- Sin Sede (Limpiar Sede) --</option>
      ${NOMBRES_SEDES_MEXICO.map(st => `<option value="${st}">📍 ${st}</option>`).join('')}
    `;
  }

  const selectedItems = AppState.evaluations.filter(e => AppState.selectedDirectoryIds.has(e.id));

  // Si solo hay uno seleccionado, pre-cargar sus datos actuales
  if (selectedCount === 1) {
    const single = selectedItems[0];
    if (empresaInput) empresaInput.value = single.empresa || '';
    if (sedeSelect) sedeSelect.value = single.sede || '';
  } else {
    if (empresaInput) empresaInput.value = '';
    if (sedeSelect) sedeSelect.value = '__KEEP__';
  }

  if (previewList) {
    previewList.innerHTML = selectedItems.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
        <div>
          <strong style="color: #f8fafc;">${item.conductor}</strong>
          <span style="color: var(--text-muted); font-size: 0.72rem; margin-left: 0.4rem;">${item.cursoCodigo}</span>
        </div>
        <div style="font-size: 0.74rem; text-align: right;">
          <span style="color: #38bdf8;">${item.empresa || 'Sin Empresa'}</span>
          ${item.sede ? `<span style="color: #c084fc; margin-left: 0.35rem;">📍 ${item.sede}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  if (modal) modal.classList.add('active');
}

function closeDirectoryBatchEditModal() {
  const modal = document.getElementById('dirBatchEditModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Mapea el estado oficial a la clase CSS del badge
 */
function getBadgeColorForEstado(estado) {
  switch (estado) {
    case 'Sobresaliente': return 'success';
    case 'Aprobado': return 'info';
    case 'Reforzar':
    case 'Requiere Refuerzo': return 'warning';
    case 'No Aprobado': return 'danger';
    default: return 'info';
  }
}

/**
 * Abre el modal de edición individual completa con todos los campos pre-cargados
 */
function openEditSingleEvaluationModal(evalId) {
  if (AppState.userRole !== 'admin') {
    showToast('Acceso restringido: Se requieren permisos de administrador para editar.', 'warning');
    return;
  }

  const item = AppState.evaluations.find(e => e.id === evalId);
  if (!item) {
    showToast('No se encontró la evaluación seleccionada.', 'error');
    return;
  }

  const modal = document.getElementById('editIndividualEvalModal');
  const subtitle = document.getElementById('editIndividualModalSubtitle');
  const sedeSelect = document.getElementById('editEvalSede');

  if (subtitle) {
    subtitle.textContent = `Modificando reporte oficial de ${item.conductor || 'Sin Conductor'} (${item.cursoCodigo || 'TrackSIM'})`;
  }

  // Poblar select de sedes si aún no tiene las opciones
  if (sedeSelect && sedeSelect.options.length <= 2) {
    sedeSelect.innerHTML = `
      <option value="">-- Sin Sede --</option>
      ${NOMBRES_SEDES_MEXICO.map(st => `<option value="${st}">📍 ${st}</option>`).join('')}
    `;
  }

  // Cargar datos en los campos
  document.getElementById('editEvalId').value = item.id;
  document.getElementById('editEvalConductor').value = item.conductor || '';
  document.getElementById('editEvalEmpresa').value = item.empresa || '';
  if (sedeSelect) sedeSelect.value = item.sede || '';

  // Fecha
  let dateVal = '';
  if (item.fechaCapacitacion && /^\d{4}-\d{2}-\d{2}$/.test(item.fechaCapacitacion)) {
    dateVal = item.fechaCapacitacion;
  } else if (item.fechaCapacitacionFormato && /^\d{2}\/\d{2}\/\d{4}$/.test(item.fechaCapacitacionFormato)) {
    const [d, m, y] = item.fechaCapacitacionFormato.split('/');
    dateVal = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else if (item.fechaReporte && /^\d{2}\/\d{2}\/\d{4}$/.test(item.fechaReporte)) {
    const [d, m, y] = item.fechaReporte.split('/');
    dateVal = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  document.getElementById('editEvalFechaCapacitacion').value = dateVal;

  document.getElementById('editEvalCursoCodigo').value = item.cursoCodigo || '';
  document.getElementById('editEvalCursoNombre').value = item.cursoNombre || '';
  document.getElementById('editEvalInstructor').value = item.instructor || 'Mario Agraz';
  document.getElementById('editEvalFolioGrupo').value = item.folioGrupo || '1';

  // Calificaciones
  document.getElementById('editEvalHabPuntos').value = item.habilidadesManejoPuntos != null ? item.habilidadesManejoPuntos : '';
  document.getElementById('editEvalHabPct').value = item.habilidadesManejoPct != null ? item.habilidadesManejoPct : '';
  document.getElementById('editEvalSimPuntos').value = item.practicaSimuladorPuntos != null ? item.practicaSimuladorPuntos : '';
  document.getElementById('editEvalSimPct').value = item.practicaSimuladorPct != null ? item.practicaSimuladorPct : '';
  document.getElementById('editEvalFinalPuntos').value = item.evaluacionFinalPuntos != null ? item.evaluacionFinalPuntos : '';
  document.getElementById('editEvalFinalPct').value = item.evaluacionFinalPct != null ? item.evaluacionFinalPct : '';
  document.getElementById('editEvalCalExacta').value = item.calificacionExacta != null ? item.calificacionExacta : (item.evaluacionFinalPuntos != null ? item.evaluacionFinalPuntos : '');

  // Incidentes
  document.getElementById('editEvalColisiones').value = item.colisiones != null ? item.colisiones : 0;
  document.getElementById('editEvalFatalidades').value = item.fatalidades != null ? item.fatalidades : 0;
  document.getElementById('editEvalVehiculoFueraVia').value = item.vehiculoFueraVia != null ? item.vehiculoFueraVia : 0;

  // Estatus y Firma
  const estadoSelect = document.getElementById('editEvalEstado');
  if (estadoSelect) estadoSelect.value = item.estado || 'Aprobado';
  document.getElementById('editEvalFirmaDigital').value = item.firmaDigital || '';
  document.getElementById('editEvalObservaciones').value = item.observaciones || '';

  // Desglose de ejercicios evaluados
  renderEditExercises(item);

  if (modal) modal.classList.add('active');
}

/**
 * Cierra el modal de edición individual
 */
function closeEditSingleEvaluationModal() {
  const modal = document.getElementById('editIndividualEvalModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Renderiza los ejercicios evaluados en el modal de edición
 */
function renderEditExercises(item) {
  const container = document.getElementById('editEvalEjerciciosContainer');
  if (!container) return;

  let ejerciciosToRender = [];
  if (Array.isArray(item.ejercicios) && item.ejercicios.length > 0) {
    ejerciciosToRender = JSON.parse(JSON.stringify(item.ejercicios));
  } else {
    // Fallback estándar de simulaciones
    ejerciciosToRender = [
      { numero: 2, nombre: 'Montaña', descripcion: 'Conducción en Montaña con uso de frenos auxiliares.', calificacion: item.simulacionesDetalle?.simulacion_2 ?? null },
      { numero: 3, nombre: 'Sierra', descripcion: 'Conducción en Sierra con condiciones adversas de baja tracción.', calificacion: item.simulacionesDetalle?.simulacion_3 ?? null },
      { numero: 4, nombre: 'Maniobras / Niebla', descripcion: 'Conducción bajo condiciones críticas o adversas.', calificacion: item.simulacionesDetalle?.simulacion_4 ?? null }
    ];
  }

  container.innerHTML = '';
  ejerciciosToRender.forEach(ex => addEditExerciseRowToContainer(container, ex));
}

/**
 * Agrega una fila de ejercicio al contenedor de edición
 */
function addEditExerciseRowToContainer(container, ex = {}) {
  ensureExerciseDatalist();
  const currentCount = container.querySelectorAll('.edit-eval-exercise-row').length;
  const num = ex.numero != null ? ex.numero : (currentCount + 2);
  const name = ex.nombre || '';
  const score = ex.calificacion != null ? ex.calificacion : '';
  // Si la evaluación antigua no trae descripción, se completa desde el catálogo
  const desc = ex.descripcion || findCatalogExercise(name)?.descripcion || '';

  const row = document.createElement('div');
  row.className = 'edit-eval-exercise-row';
  row.innerHTML = `
    <div>
      <input type="number" class="custom-input edit-ex-num" value="${num}" style="width: 100%; height: 32px; font-weight: 700; text-align: center; color: #38bdf8;" title="N° de Simulación" />
    </div>
    <div>
      <input type="text" class="custom-input edit-ex-name" list="exerciseCatalogList" value="${(name || '').replace(/"/g, '&quot;')}" placeholder="Nombre (Ej: Montaña)..." style="width: 100%; height: 32px;" />
    </div>
    <div>
      <input type="number" step="any" min="0" max="10" class="custom-input edit-ex-score" value="${score}" placeholder="Nota / 10" style="width: 100%; height: 32px; font-weight: 700; text-align: right;" />
    </div>
    <div>
      <input type="text" class="custom-input edit-ex-desc" value="${(desc || '').replace(/"/g, '&quot;')}" placeholder="Descripción breve..." style="width: 100%; height: 32px;" />
    </div>
    <div style="text-align: right;">
      <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35); padding: 0.2rem 0.4rem; height: 32px;" title="Eliminar simulación">
        ✕
      </button>
    </div>
  `;

  // Autocompletar descripción al escribir/seleccionar un ejercicio del catálogo
  const nameInput = row.querySelector('.edit-ex-name');
  const descInput = row.querySelector('.edit-ex-desc');
  const autofill = () => {
    const match = findCatalogExercise(nameInput.value);
    if (match) descInput.value = match.descripcion;
  };
  nameInput.addEventListener('input', autofill);
  nameInput.addEventListener('change', autofill);

  row.querySelector('button').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

/**
 * Recalcula automáticamente porcentajes, nota final y estado sugerido
 */
function recalculateEditScores() {
  const hab = parseFloat(document.getElementById('editEvalHabPuntos')?.value) || 0;
  const sim = parseFloat(document.getElementById('editEvalSimPuntos')?.value) || 0;
  const finalPtsInput = document.getElementById('editEvalFinalPuntos');
  const finalPts = finalPtsInput && finalPtsInput.value !== '' ? parseFloat(finalPtsInput.value) : Number((hab + sim).toFixed(2));

  const habPct = Math.round((hab / 3.0) * 10000) / 100;
  const simPct = Math.round((sim / 7.0) * 10000) / 100;
  const finalPct = Math.round((finalPts / 10.0) * 10000) / 100;

  const habPctEl = document.getElementById('editEvalHabPct');
  if (habPctEl) habPctEl.value = habPct;
  const simPctEl = document.getElementById('editEvalSimPct');
  if (simPctEl) simPctEl.value = simPct;
  if (finalPtsInput) finalPtsInput.value = finalPts;
  const finalPctEl = document.getElementById('editEvalFinalPct');
  if (finalPctEl) finalPctEl.value = finalPct;
  const calExactaEl = document.getElementById('editEvalCalExacta');
  if (calExactaEl) calExactaEl.value = finalPts;

  // Dictamen oficial calculado automáticamente de fondo
  let est = 'No Aprobado';
  if (finalPts >= 8.0) est = 'Sobresaliente';
  else if (finalPts >= 6.0) est = 'Aprobado';
  else if (finalPts >= 5.0) est = 'Reforzar';
  const estadoEl = document.getElementById('editEvalEstado');
  if (estadoEl) estadoEl.value = est;
}

/**
 * Maneja el guardado de la edición individual completa en Firestore
 */
async function handleEditIndividualEvaluationSubmit(e) {
  if (e) e.preventDefault();

  const evalId = document.getElementById('editEvalId').value;
  if (!evalId) return;

  const confirmBtn = document.getElementById('confirmEditIndividualBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Actualizando en Firestore...';
  }

  try {
    const conductor = document.getElementById('editEvalConductor').value.trim();
    const empresa = document.getElementById('editEvalEmpresa').value.trim();
    const sede = document.getElementById('editEvalSede').value.trim();
    const fechaCap = document.getElementById('editEvalFechaCapacitacion').value;

    let fechaCapFormato = '';
    let fechaCapIso = fechaCap;
    if (fechaCap && /^\d{4}-\d{2}-\d{2}$/.test(fechaCap)) {
      const [y, m, d] = fechaCap.split('-');
      fechaCapFormato = `${d}/${m}/${y}`;
    }

    const cursoCodigo = document.getElementById('editEvalCursoCodigo').value.trim();
    const cursoNombre = document.getElementById('editEvalCursoNombre').value.trim();
    const instructor = document.getElementById('editEvalInstructor').value.trim();
    const folioGrupo = document.getElementById('editEvalFolioGrupo').value.trim();

    const habPts = parseFloat(document.getElementById('editEvalHabPuntos').value) || 0;
    const simPts = parseFloat(document.getElementById('editEvalSimPuntos').value) || 0;
    const finalPtsInput = document.getElementById('editEvalFinalPuntos');
    let finalPts = finalPtsInput && finalPtsInput.value !== '' ? parseFloat(finalPtsInput.value) : Number((habPts + simPts).toFixed(2));
    if (isNaN(finalPts)) finalPts = Number((habPts + simPts).toFixed(2));

    // Cálculos en el fondo: porcentajes y calificación exacta
    const habPct = Math.round((habPts / 3.0) * 10000) / 100;
    const simPct = Math.round((simPts / 7.0) * 10000) / 100;
    const finalPct = Math.round((finalPts / 10.0) * 10000) / 100;
    const calExacta = Number(finalPts.toFixed(4));

    // Dictamen oficial calculado en el fondo
    let estado = 'No Aprobado';
    if (finalPts >= 8.0) {
      estado = 'Sobresaliente';
    } else if (finalPts >= 6.0) {
      estado = 'Aprobado';
    } else if (finalPts >= 5.0) {
      estado = 'Reforzar';
    } else {
      estado = 'No Aprobado';
    }
    const badgeColor = getBadgeColorForEstado(estado);

    // Desglose dinámico de ejercicios
    const exRows = document.querySelectorAll('#editEvalEjerciciosContainer .edit-eval-exercise-row');
    const ejercicios = [];
    const simulacionesDetalle = {};
    const nombresSimulaciones = {};

    exRows.forEach(row => {
      const numInput = row.querySelector('.edit-ex-num');
      const nameInput = row.querySelector('.edit-ex-name');
      const scoreInput = row.querySelector('.edit-ex-score');
      const descInput = row.querySelector('.edit-ex-desc');

      const num = parseInt(numInput?.value, 10);
      const name = nameInput?.value.trim() || '';
      const scoreVal = scoreInput?.value !== '' ? parseFloat(scoreInput.value) : null;
      const desc = descInput?.value.trim() || '';

      if (!isNaN(num)) {
        ejercicios.push({
          numero: num,
          nombre: name,
          calificacion: scoreVal,
          descripcion: desc
        });
        simulacionesDetalle[`simulacion_${num}`] = scoreVal;
        nombresSimulaciones[num] = name;
      }
    });

    const colisiones = parseInt(document.getElementById('editEvalColisiones').value, 10) || 0;
    const fatalidades = parseInt(document.getElementById('editEvalFatalidades').value, 10) || 0;
    const vehiculoFueraVia = parseInt(document.getElementById('editEvalVehiculoFueraVia').value, 10) || 0;

    const firmaDigital = document.getElementById('editEvalFirmaDigital').value.trim();
    const observaciones = document.getElementById('editEvalObservaciones').value.trim();

    const updatedFields = {
      conductor,
      empresa,
      sede,
      fechaCapacitacion: fechaCapIso || '',
      fechaCapacitacionFormato: fechaCapFormato || fechaCapIso,
      fechaReporte: fechaCapFormato || fechaCapIso,
      cursoCodigo,
      cursoNombre,
      instructor,
      folioGrupo,
      habilidadesManejoPuntos: habPts,
      habilidadesManejoPct: habPct,
      practicaSimuladorPuntos: simPts,
      practicaSimuladorPct: simPct,
      evaluacionFinalPuntos: finalPts,
      evaluacionFinalPct: finalPct,
      calificacionExacta: calExacta,
      ejercicios,
      simulacionesDetalle,
      nombresSimulaciones,
      colisiones,
      fatalidades,
      vehiculoFueraVia,
      estado,
      badgeColor,
      firmaDigital,
      observaciones
    };

    await updateSingleEvaluation(evalId, updatedFields);

    showToast(`¡Evaluación de ${conductor || 'operador'} actualizada exitosamente!`, 'success');
    closeEditSingleEvaluationModal();

    // Recargar datos y refrescar todas las vistas
    await loadAndRefreshData();

    // Si el modal de reporte digital está abierto y muestra esta evaluación, refrescar su contenido
    const reportModal = document.getElementById('evaluationModal');
    if (reportModal && reportModal.classList.contains('active')) {
      window.viewEvaluationDetail(evalId);
    }
  } catch (err) {
    console.error('Error al actualizar la evaluación:', err);
    showToast('Error al actualizar los datos en Firestore.', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '💾 Guardar Cambios en Firestore';
    }
  }
}

window.editSingleEvaluationPrompt = (evalId) => {
  openEditSingleEvaluationModal(evalId);
};

async function handleDirectoryBatchUpdate() {
  const selectedIds = Array.from(AppState.selectedDirectoryIds);
  if (selectedIds.length === 0) return;

  const empresaInput = document.getElementById('modalBatchEmpresaInput');
  const sedeSelect = document.getElementById('modalBatchSedeSelect');
  const confirmBtn = document.getElementById('confirmDirBatchUpdateBtn');

  const newEmpresa = empresaInput ? empresaInput.value.trim() : '';
  const newSede = sedeSelect ? sedeSelect.value : '__KEEP__';

  if (!newEmpresa && newSede === '__KEEP__') {
    showToast('Ingresa un nuevo nombre de empresa o selecciona una sede para actualizar.', 'warning');
    return;
  }

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Actualizando en Firestore...';
  }

  try {
    await updateEvaluationsBatchEmpresaSede(
      selectedIds,
      newEmpresa || null,
      newSede
    );

    showToast(`¡Se actualizaron ${selectedIds.length} evaluaciones en Firestore exitosamente!`, 'success');
    closeDirectoryBatchEditModal();

    AppState.selectedDirectoryIds.clear();
    updateDirectorySelectionUI();

    // Recargar datos y refrescar todas las vistas
    await loadAndRefreshData();
  } catch (err) {
    console.error('Error al actualizar lote en directorio:', err);
    showToast('Error al actualizar las evaluaciones en Firestore.', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '💾 Guardar Cambios en Firestore';
    }
  }
}

/**
 * Llena dinámicamente las opciones del selector de empresa en el directorio
 */
function populateDirectoryCompanyFilter() {
  const companySelect = document.getElementById('filterCompany');
  if (!companySelect) return;

  let currentVal = AppState.filters.empresa || 'all';

  // Contar frecuencias en una sola pasada O(N)
  const compCounts = new Map();
  for (let i = 0; i < AppState.evaluations.length; i++) {
    const emp = (AppState.evaluations[i].empresa || '').trim();
    if (emp) compCounts.set(emp, (compCounts.get(emp) || 0) + 1);
  }

  const companies = Array.from(compCounts.keys()).sort((a, b) => a.localeCompare(b));

  if (currentVal !== 'all' && !compCounts.has(currentVal)) {
    currentVal = 'all';
    AppState.filters.empresa = 'all';
  }

  if (companies.length <= 1) {
    companySelect.style.display = 'none';
  } else {
    companySelect.style.display = '';
  }

  let html = `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todas las Empresas (${AppState.evaluations.length})</option>`;
  for (let i = 0; i < companies.length; i++) {
    const emp = companies[i];
    html += `<option value="${emp}" ${emp === currentVal ? 'selected' : ''}>🏢 ${emp} (${compCounts.get(emp)})</option>`;
  }
  companySelect.innerHTML = html;
}

/**
 * Llena dinámicamente las opciones del selector de sede en el directorio
 */
function populateDirectorySedeFilter() {
  const sedeSelect = document.getElementById('filterSede');
  if (!sedeSelect) return;

  let currentVal = AppState.filters.sede || 'all';

  // Contar frecuencias en una sola pasada O(N)
  const sedeCounts = new Map();
  let countWithoutSede = 0;
  for (let i = 0; i < AppState.evaluations.length; i++) {
    const s = (AppState.evaluations[i].sede || '').trim();
    if (s) {
      sedeCounts.set(s, (sedeCounts.get(s) || 0) + 1);
    } else {
      countWithoutSede++;
    }
  }

  const sedes = Array.from(sedeCounts.keys()).sort((a, b) => a.localeCompare(b));

  if (currentVal !== 'all' && currentVal !== '__NONE__' && !sedeCounts.has(currentVal)) {
    currentVal = 'all';
    AppState.filters.sede = 'all';
  }

  let html = `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todas las Sedes (${AppState.evaluations.length})</option>`;
  for (let i = 0; i < sedes.length; i++) {
    const s = sedes[i];
    html += `<option value="${s}" ${s === currentVal ? 'selected' : ''}>📍 ${s} (${sedeCounts.get(s)})</option>`;
  }
  if (countWithoutSede > 0) {
    html += `<option value="__NONE__" ${currentVal === '__NONE__' ? 'selected' : ''}>⚠️ Sin Sede Asignada (${countWithoutSede})</option>`;
  }
  sedeSelect.innerHTML = html;
}

function renderDirectoryTable() {
  const tbody = document.getElementById('directoryTableBody');
  if (!tbody) return;

  // Actualizar opciones del filtro de empresas y sedes
  populateDirectoryCompanyFilter();
  populateDirectorySedeFilter();

  const list = getFilteredDirectoryEvaluations();

  // Actualizar indicadores visuales de los encabezados del directorio
  const sortCol = AppState.directoryTableSort?.column || 'fecha';
  const sortDir = AppState.directoryTableSort?.direction || 'desc';
  updateDirectoryTableSortHeaders(sortCol, sortDir);

  document.getElementById('directoryCountBadge').textContent = `${list.length} registros`;

  if (list.length === 0) {
    const isFiltered = !!AppState.filters.search || AppState.filters.empresa !== 'all' || AppState.filters.sede !== 'all' || AppState.filters.estado !== 'all';
    const noEvalsMsg = AppState.userRole === 'admin'
      ? 'No hay evaluaciones registradas aún. Sube tus archivos PDF en la pestaña "Ingesta de PDFs" para comenzar.'
      : 'No hay evaluaciones registradas aún en el sistema.';
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
          ${isFiltered ? 'No se encontraron evaluaciones con los filtros seleccionados.' : noEvalsMsg}
        </td>
      </tr>
    `;
    const paginationBar = document.getElementById('directoryPaginationBar');
    if (paginationBar) paginationBar.style.display = 'none';
    updateDirectorySelectionUI();
    return;
  }

  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / DIRECTORY_PAGE_SIZE));

  if (directoryCurrentPage > totalPages) {
    directoryCurrentPage = totalPages;
  }
  if (directoryCurrentPage < 1) {
    directoryCurrentPage = 1;
  }

  const startIndex = (directoryCurrentPage - 1) * DIRECTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + DIRECTORY_PAGE_SIZE, totalItems);
  const pageList = list.slice(startIndex, endIndex);

  // Actualizar elementos de la barra de paginación
  const paginationBar = document.getElementById('directoryPaginationBar');
  const paginationInfo = document.getElementById('directoryPaginationInfo');
  const pageDisplay = document.getElementById('dirCurrentPageDisplay');
  const firstBtn = document.getElementById('dirFirstPageBtn');
  const prevBtn = document.getElementById('dirPrevPageBtn');
  const nextBtn = document.getElementById('dirNextPageBtn');
  const lastBtn = document.getElementById('dirLastPageBtn');

  if (paginationBar) {
    paginationBar.style.display = totalItems > 0 ? 'flex' : 'none';
  }
  if (paginationInfo) {
    paginationInfo.textContent = `Mostrando ${startIndex + 1}-${endIndex} de ${totalItems} evaluaciones`;
  }
  if (pageDisplay) {
    pageDisplay.textContent = `Página ${directoryCurrentPage} de ${totalPages}`;
  }
  if (firstBtn) firstBtn.disabled = directoryCurrentPage === 1;
  if (prevBtn) prevBtn.disabled = directoryCurrentPage === 1;
  if (nextBtn) nextBtn.disabled = directoryCurrentPage === totalPages;
  if (lastBtn) lastBtn.disabled = directoryCurrentPage === totalPages;

  tbody.innerHTML = pageList.map(e => {
    const n2 = (e.nombresSimulaciones && e.nombresSimulaciones[2]) || 'S2';
    const n3 = (e.nombresSimulaciones && e.nombresSimulaciones[3]) || 'S3';
    const n4 = (e.nombresSimulaciones && e.nombresSimulaciones[4]) || 'S4';
    const s2 = e.simulacionesDetalle?.simulacion_2 != null ? e.simulacionesDetalle.simulacion_2 : '-';
    const s3 = e.simulacionesDetalle?.simulacion_3 != null ? e.simulacionesDetalle.simulacion_3 : '-';
    const s4 = e.simulacionesDetalle?.simulacion_4 != null ? e.simulacionesDetalle.simulacion_4 : '-';

    return `
    <tr>
      <td style="text-align: center;">
        <input 
          type="checkbox" 
          class="dir-item-checkbox" 
          value="${e.id}" 
          ${AppState.selectedDirectoryIds.has(e.id) ? 'checked' : ''}
          onchange="window.toggleDirectoryItemSelection('${e.id}')"
          style="cursor: pointer; width: 16px; height: 16px; accent-color: #38bdf8;"
        >
      </td>
      <td>
        <div style="font-weight: 600; color: #ffffff; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${e.conductor}">${e.conductor}</div>
        <div style="font-size: 0.74rem; color: var(--text-muted); max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${e.cursoCodigo}">${e.cursoCodigo}</div>
      </td>
      <td>
        <div style="font-weight: 600; color: #ffffff; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${e.empresa || 'N/A'}">${e.empresa || 'N/A'}</div>
        ${e.sede ? `<div style="font-size: 0.72rem; color: #38bdf8; display: flex; align-items: center; gap: 0.2rem; margin-top: 0.15rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="📍 ${e.sede}">📍 ${e.sede}</div>` : ''}
      </td>
      <td>${e.fechaCapacitacionFormato || e.fechaCapacitacion || e.fechaReporte}</td>
      <td>
        <span style="font-weight: 600; color: #10b981;">${(e.habilidadesManejoPuntos || 0).toFixed(2)}</span>
        <small style="color: var(--text-muted);">/ 3</small>
      </td>
      <td>
        <span style="font-weight: 600; color: #a855f7;">${(e.practicaSimuladorPuntos || 0).toFixed(2)}</span>
        <small style="color: var(--text-muted);">/ 7</small>
      </td>
      <td>
        <div style="font-size: 0.76rem; display: flex; gap: 0.35rem; align-items: center; white-space: nowrap;">
          <span style="color: #94a3b8;" title="S2: ${n2}">S2: <strong>${s2}</strong></span> ·
          <span style="color: #f97316;" title="S3: ${n3}">S3: <strong>${s3}</strong></span> ·
          <span style="color: #38bdf8;" title="S4: ${n4}">S4: <strong>${s4}</strong></span>
        </div>
      </td>
      <td>
        <span class="score-pill" style="color: #38bdf8;">
          ${(e.evaluacionFinalPuntos || e.calificacionExacta || 0).toFixed(2)}
        </span>
      </td>
      <td>
        <span class="badge badge-${e.badgeColor}">${e.estado}</span>
      </td>
      <td class="actions-col">
        <div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.viewEvaluationDetail('${e.id}')" title="Ver reporte">
            📄 Reporte
          </button>
          ${AppState.userRole === 'admin' ? `
            <button class="btn btn-secondary btn-sm" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); padding: 0.3rem 0.5rem;" onclick="window.editSingleEvaluationPrompt('${e.id}')" title="Editar Evaluación Completa">
              ✏️
            </button>
            <button class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35); padding: 0.3rem 0.5rem;" onclick="window.confirmDeleteEvaluation('${e.id}', '${(e.conductor || '').replace(/'/g, "\\'")}')" title="Eliminar evaluación">
              🗑️
            </button>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');

  updateDirectorySelectionUI();
}

/** Escapa un valor para CSV (comillas dobles, comas y saltos de línea) */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Obtiene los ejercicios de una evaluación como mapa numero -> ejercicio */
function getEvaluationExerciseMap(e) {
  const map = {};
  if (Array.isArray(e.ejercicios) && e.ejercicios.length > 0) {
    e.ejercicios.forEach(ex => { if (ex && ex.numero != null) map[ex.numero] = ex; });
  } else {
    Object.keys(e.simulacionesDetalle || {}).forEach(k => {
      const n = parseInt(k.replace('simulacion_', ''), 10);
      if (!isNaN(n)) {
        map[n] = { numero: n, nombre: e.nombresSimulaciones?.[n] || '', calificacion: e.simulacionesDetalle[k], descripcion: '' };
      }
    });
  }
  return map;
}

/**
 * Exporta las evaluaciones filtradas a un archivo CSV.
 * El mismo archivo puede reimportarse para edición masiva (columna ID).
 */
function exportToCSV() {
  const evals = getFilteredDirectoryEvaluations();
  if (evals.length === 0) {
    showToast('No hay datos disponibles para exportar con los filtros seleccionados.', 'warning');
    return;
  }

  const exMaps = evals.map(getEvaluationExerciseMap);
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

  const rows = evals.map((e, idx) => {
    const row = [
      e.id, e.conductor || '', e.empresa || '', e.sede || '',
      e.fechaCapacitacionFormato || e.fechaCapacitacion || '',
      e.cursoCodigo || '', e.cursoNombre || '', e.instructor || '', e.folioGrupo || '',
      e.habilidadesManejoPuntos || 0, e.habilidadesManejoPct || 0,
      e.practicaSimuladorPuntos || 0, e.practicaSimuladorPct || 0
    ];
    for (let n = 2; n <= maxSim; n++) {
      const ex = exMaps[idx][n];
      row.push(ex?.nombre ?? '', ex?.calificacion ?? '');
    }
    row.push(
      e.evaluacionFinalPuntos || 0,
      e.colisiones || 0, e.fatalidades || 0, e.vehiculoFueraVia || 0,
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
  showToast('Archivo CSV generado y descargado correctamente.', 'success');
}

/** Parser CSV (soporta comillas, saltos de línea en celdas y delimitador , o ;) */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
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

/**
 * Importa un CSV (generado con Exportar CSV) y actualiza masivamente las evaluaciones por ID
 */
async function importEvaluationsFromCSV(file) {
  try {
    const rows = parseCSV(await file.text());
    if (rows.length < 2) {
      showToast('El archivo CSV está vacío.', 'warning');
      return;
    }
    const headers = rows[0].map(h => h.trim());
    const col = (name) => headers.indexOf(name);
    const idCol = col('ID');
    if (idCol < 0) {
      showToast('El CSV no tiene la columna "ID". Usa un archivo generado con Exportar CSV.', 'error');
      return;
    }

    const simNums = [];
    headers.forEach(h => {
      const m = h.match(/^Sim (\d+) Titulo$/);
      if (m) simNums.push(parseInt(m[1], 10));
    });

    const num = (v, fallback) => {
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return isNaN(n) ? fallback : n;
    };

    const updates = [];
    let skipped = 0;
    rows.slice(1).forEach(r => {
      const id = (r[idCol] || '').trim();
      const item = AppState.evaluations.find(e => e.id === id);
      if (!item) { skipped++; return; }
      const get = (name) => { const i = col(name); return i >= 0 ? (r[i] ?? '').trim() : undefined; };
      const f = {};
      const setStr = (field, header) => { const v = get(header); if (v !== undefined) f[field] = v; };
      setStr('conductor', 'Conductor'); setStr('empresa', 'Empresa'); setStr('sede', 'Sede');
      setStr('cursoCodigo', 'Curso'); setStr('cursoNombre', 'Nombre Curso');
      setStr('instructor', 'Instructor'); setStr('folioGrupo', 'Folio Grupo');

      const fecha = get('Fecha');
      if (fecha) {
        let iso = '', fmt = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          const [y, m, d] = fecha.split('-'); iso = fecha; fmt = `${d}/${m}/${y}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
          const [d, m, y] = fecha.split('/');
          fmt = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`; iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        if (iso) {
          f.fechaCapacitacion = iso; f.fechaCapacitacionFormato = fmt; f.fechaReporte = fmt;
        }
      }

      // Ejercicios: se fusionan con los existentes por número
      if (simNums.length > 0) {
        const map = getEvaluationExerciseMap(item);
        // Si el usuario eliminó columnas "Sim N" del CSV, esos ejercicios se eliminan de la evaluación
        Object.keys(map).forEach(k => {
          if (+k >= 2 && !simNums.includes(+k)) delete map[k];
        });
        simNums.forEach(n => {
          const titulo = get(`Sim ${n} Titulo`) || '';
          const notaStr = get(`Sim ${n} Nota`) ?? '';
          if (!titulo && notaStr === '') { delete map[n]; return; }
          // La descripción se obtiene del catálogo según el título; si no hay coincidencia se conserva la existente
          const desc = findCatalogExercise(titulo)?.descripcion || map[n]?.descripcion || '';
          map[n] = {
            numero: n,
            nombre: titulo,
            calificacion: notaStr === '' ? null : num(notaStr, null),
            descripcion: desc
          };
        });
        const ejercicios = Object.values(map).sort((a, b) => a.numero - b.numero);
        f.ejercicios = ejercicios;
        f.simulacionesDetalle = {};
        f.nombresSimulaciones = {};
        ejercicios.forEach(ex => {
          f.simulacionesDetalle[`simulacion_${ex.numero}`] = ex.calificacion;
          f.nombresSimulaciones[ex.numero] = ex.nombre;
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
      f.badgeColor = getBadgeColorForEstado(f.estado);
      f.colisiones = parseInt(get('Colisiones'), 10) || 0;
      f.fatalidades = parseInt(get('Fatalidades'), 10) || 0;
      f.vehiculoFueraVia = parseInt(get('Fuera de Via'), 10) || 0;

      updates.push({ id, fields: f });
    });

    if (updates.length === 0) {
      showToast('Ninguna fila del CSV coincide con evaluaciones existentes (revisa la columna ID).', 'warning');
      return;
    }
    if (!confirm(`Se actualizarán ${updates.length} evaluaciones en Firestore${skipped ? ` (${skipped} filas ignoradas por ID desconocido)` : ''}.\n\n¿Continuar?`)) return;

    const btn = document.getElementById('importCsvBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (!document.getElementById('spinnerKeyframes')) {
      const st = document.createElement('style');
      st.id = 'spinnerKeyframes';
      st.textContent = '@keyframes btnSpin { to { transform: rotate(360deg); } }';
      document.head.appendChild(st);
    }
    const setProgress = (done) => {
      if (!btn) return;
      btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;margin-right:0.5rem;vertical-align:-2px;border:2px solid rgba(56,189,248,0.3);border-top-color:#38bdf8;border-radius:50%;animation:btnSpin 0.7s linear infinite;"></span>Importando ${done}/${updates.length}...`;
    };
    if (btn) btn.disabled = true;
    try {
      setProgress(0);
      let done = 0;
      for (const u of updates) {
        await updateSingleEvaluation(u.id, u.fields);
        setProgress(++done);
      }
      if (btn) btn.innerHTML = originalHTML.replace('Importar CSV', 'Actualizando vista...');
      await loadAndRefreshData();
      showToast(`¡${updates.length} evaluaciones actualizadas desde CSV!`, 'success');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    }
  } catch (err) {
    console.error('Error al importar CSV:', err);
    showToast('Error al importar el CSV.', 'error');
  }
}

// ==========================================

export {
  initDirectoryFilters,
  initDirectoryTableSorting,
  updateDirectoryTableSortHeaders,
  renderDirectoryTable,
  getEvaluationSimScore
};

// Habilitar Hot Module Replacement (HMR)
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    console.log('⚡ [HMR] Módulo Directorio actualizado en caliente sin recargar.');
    if (newModule && typeof newModule.renderDirectoryTable === 'function') {
      newModule.renderDirectoryTable();
    }
  });
}
