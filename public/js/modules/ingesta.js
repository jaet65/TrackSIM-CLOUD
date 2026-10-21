/**
 * TrackSIM CLOUD - PDF Ingesta & Staging Module
 * Maneja el dropzone, procesamiento local de PDFs, previsualización,
 * edición masiva/individual y confirmación a Firestore.
 */

import {
  saveBatchEvaluations
} from '../db.js';
import {
  parsePDFFile,
  NOMBRES_SEDES_MEXICO
} from '../pdf-parser.js';
import { showToast } from './toast.js';

function initDropzone(onRefresh) {
  const dropzone = document.getElementById('pdfDropzone');
  const fileInput = document.getElementById('pdfFileInput');
  const saveBatchBtn = document.getElementById('saveBatchBtn');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processSelectedFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files && fileInput.files.length > 0) {
      await processSelectedFiles(Array.from(fileInput.files));
    }
  });

  const discardBatchBtn = document.getElementById('discardBatchBtn');
  const applyBatchBtn = document.getElementById('applyBatchEmpresaSedeBtn');
  const resetBtn = document.getElementById('resetToDetectedBtn');
  const toggleEditBtn = document.getElementById('toggleEditBatchBtn');

  // Alternar entre modo lectura (por default) y modo edición
  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', () => {
      AppState.stagingEditing = !AppState.stagingEditing;
      updateStagingEditModeUI();
    });
  }

  // Asignar Empresa y Sede por lote (opcional cuando el usuario lo desea)
  if (applyBatchBtn) {
    applyBatchBtn.addEventListener('click', () => {
      if (!AppState.stagingEvaluations || AppState.stagingEvaluations.length === 0) return;
      const batchEmpresa = document.getElementById('batchEmpresaInput')?.value.trim() || '';
      const batchSede = document.getElementById('batchSedeSelect')?.value || '';

      if (!batchEmpresa && !batchSede) {
        showToast('Ingresa el nombre de la empresa o selecciona una sede para asignar al lote.', 'warning');
        return;
      }

      AppState.stagingEvaluations.forEach(item => {
        if (batchEmpresa) item.empresa = batchEmpresa;
        if (batchSede) item.sede = batchSede;
      });

      displayStagingEvaluations(AppState.stagingEvaluations);
      showToast(`¡Empresa y Sede asignadas a los ${AppState.stagingEvaluations.length} reportes del lote!`, 'success');
    });
  }

  // Restaurar a las empresas y sedes detectadas en cada PDF
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!AppState.stagingEvaluations || AppState.stagingEvaluations.length === 0) return;

      AppState.stagingEvaluations.forEach(item => {
        item.empresa = item.originalEmpresa || '';
        item.sede = item.originalSede || '';
      });

      const batchEmpresaInput = document.getElementById('batchEmpresaInput');
      const batchSedeSelect = document.getElementById('batchSedeSelect');
      if (batchEmpresaInput) batchEmpresaInput.value = '';
      if (batchSedeSelect) batchSedeSelect.value = '';

      displayStagingEvaluations(AppState.stagingEvaluations);
      showToast('Se restauraron las empresas y sedes detectadas originalmente en cada PDF.', 'info');
    });
  }

  // Descartar lote pendiente
  if (discardBatchBtn) {
    discardBatchBtn.addEventListener('click', () => {
      if (!AppState.stagingEvaluations || AppState.stagingEvaluations.length === 0) return;
      if (confirm('¿Deseas descartar todas las evaluaciones pendientes de este lote? No se guardará nada en Firestore.')) {
        AppState.stagingEvaluations = [];
        AppState.stagingEditing = false;
        const box = document.getElementById('stagingReviewBox');
        if (box) box.style.display = 'none';
        const fileInput = document.getElementById('pdfFileInput');
        if (fileInput) fileInput.value = '';
        updateStagingEditModeUI();
        showToast('Lote de evaluaciones descartado.', 'info');
      }
    });
  }

  // Helper global para edición individual inline en la tabla
  window.updateStagingItem = (idx, field, value) => {
    if (AppState.stagingEvaluations && AppState.stagingEvaluations[idx]) {
      AppState.stagingEvaluations[idx][field] = value.trim();
    }
  };

  // Botón para confirmar y guardar en Firestore
  if (saveBatchBtn) {
    saveBatchBtn.addEventListener('click', async () => {
      if (AppState.stagingEvaluations.length === 0) return;

      const uniqueEmpresas = [...new Set(AppState.stagingEvaluations.map(e => e.empresa || 'Sin Empresa'))];
      const uniqueSedes = [...new Set(AppState.stagingEvaluations.map(e => e.sede || 'Sin Sede'))];

      const confirmMsg = `¿Confirmas el guardado de ${AppState.stagingEvaluations.length} evaluación(es) en Firestore?\n\n` +
        `🏢 Empresa(s): ${uniqueEmpresas.join(', ')}\n` +
        `📍 Sede(s): ${uniqueSedes.join(', ')}\n\n` +
        `Presiona Aceptar para proceder con la carga a la base de datos.`;

      if (!confirm(confirmMsg)) return;

      saveBatchBtn.disabled = true;
      saveBatchBtn.textContent = 'Guardando en Firestore...';

      try {
        await saveBatchEvaluations(AppState.stagingEvaluations);
        showToast(`¡Se guardaron ${AppState.stagingEvaluations.length} evaluaciones en Firestore exitosamente!`, 'success');

        AppState.stagingEvaluations = [];
        AppState.stagingEditing = false;
        document.getElementById('stagingReviewBox').style.display = 'none';
        const fileInput = document.getElementById('pdfFileInput');
        if (fileInput) fileInput.value = '';
        updateStagingEditModeUI();

        // Recargar datos y actualizar vistas
        if (typeof onRefresh === 'function') {
          await onRefresh();
        } else if (typeof window.loadAndRefreshData === 'function') {
          await window.loadAndRefreshData();
        }
      } catch (err) {
        console.error('Error al guardar en lote:', err);
        showToast('Error al guardar en la base de datos.', 'error');
      } finally {
        saveBatchBtn.disabled = false;
        saveBatchBtn.textContent = '💾 Confirmar y Guardar en Firestore';
      }
    });
  }
}

/**
 * Controla la visualización del modo edición (lote e individual)
 */
function updateStagingEditModeUI() {
  const toggleEditBtn = document.getElementById('toggleEditBatchBtn');
  const batchEditPanel = document.getElementById('batchEditPanel');
  const headerTh = document.getElementById('stagingEmpresaHeader');

  if (AppState.stagingEditing) {
    if (toggleEditBtn) {
      toggleEditBtn.innerHTML = '✓ Finalizar Edición';
      toggleEditBtn.classList.remove('btn-secondary');
      toggleEditBtn.classList.add('btn-primary');
    }
    if (batchEditPanel) batchEditPanel.style.display = 'block';
    if (headerTh) headerTh.textContent = 'Empresa y Sede (Modo Edición)';
  } else {
    if (toggleEditBtn) {
      toggleEditBtn.innerHTML = '✏️ Editar Empresa / Sede';
      toggleEditBtn.classList.remove('btn-primary');
      toggleEditBtn.classList.add('btn-secondary');
    }
    if (batchEditPanel) batchEditPanel.style.display = 'none';
    if (headerTh) headerTh.textContent = 'Empresa y Sede';
  }

  if (AppState.stagingEvaluations && AppState.stagingEvaluations.length > 0) {
    renderStagingTableRows(AppState.stagingEvaluations);
  }
}

/**
 * Procesa una lista de archivos Files locales seleccionados por el usuario
 */
async function processSelectedFiles(fileList) {
  const pdfs = fileList.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) {
    showToast('Por favor selecciona archivos con formato PDF.', 'warning');
    return;
  }

  // Por default, el modo edición está desactivado para respetar la detección automática
  AppState.stagingEditing = false;
  updateStagingEditModeUI();

  showProgress(true, 10, `Iniciando análisis de ${pdfs.length} archivo(s)...`);
  const parsedItems = [];

  for (let i = 0; i < pdfs.length; i++) {
    const file = pdfs[i];
    const pct = Math.round(((i + 1) / pdfs.length) * 90);
    showProgress(true, pct, `Leyendo ${file.name}...`);

    try {
      const data = await parsePDFFile(file, file.name);
      // Preservar la detección original individual de cada archivo
      data.originalEmpresa = data.empresa || '';
      data.originalSede = data.sede || '';
      parsedItems.push(data);
    } catch (err) {
      console.error(`Error procesando ${file.name}:`, err);
      showToast(`Error al leer ${file.name}`, 'error');
    }
  }

  showProgress(true, 100, '¡Todos los PDFs han sido procesados!');
  setTimeout(() => showProgress(false), 800);

  if (parsedItems.length > 0) {
    displayStagingEvaluations(parsedItems);
    showToast(`¡Se extrajeron con éxito ${parsedItems.length} reportes!`, 'success');
  }
}

function showProgress(visible, percentage = 0, statusText = '') {
  const card = document.getElementById('processingCard');
  const bar = document.getElementById('processingBarFill');
  const text = document.getElementById('processingStatusText');

  if (!card) return;
  card.style.display = visible ? 'block' : 'none';
  if (bar) bar.style.width = `${percentage}%`;
  if (text && statusText) text.textContent = statusText;
}

/**
 * Despliega los resultados extraídos en la tabla de revisión antes de guardar
 */
function displayStagingEvaluations(items) {
  AppState.stagingEvaluations = items;
  const box = document.getElementById('stagingReviewBox');
  const countBadge = document.getElementById('stagingCountBadge');
  const batchSedeSelect = document.getElementById('batchSedeSelect');
  const summaryEl = document.getElementById('detectedSummaryContent');

  if (!box) return;
  box.style.display = 'block';
  if (countBadge) countBadge.textContent = `${items.length} pendientes`;

  // 1. Resumir todas las empresas y sedes detectadas en este lote
  const empresaCounts = {};
  const sedeCounts = {};
  items.forEach(it => {
    if (it.originalEmpresa === undefined) it.originalEmpresa = it.empresa || '';
    if (it.originalSede === undefined) it.originalSede = it.sede || '';

    const emp = (it.empresa || '').trim() || 'Sin Empresa';
    const sed = (it.sede || '').trim() || 'Sin Sede';
    empresaCounts[emp] = (empresaCounts[emp] || 0) + 1;
    sedeCounts[sed] = (sedeCounts[sed] || 0) + 1;
  });

  const empBadges = Object.entries(empresaCounts).map(([emp, cnt]) =>
    `<span style="color: #38bdf8; background: rgba(56, 189, 248, 0.16); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
      🏢 ${emp} (${cnt})
    </span>`
  ).join(' ');

  const sedeBadges = Object.entries(sedeCounts).map(([sed, cnt]) =>
    `<span style="color: #a855f7; background: rgba(168, 85, 247, 0.16); padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
      📍 ${sed} (${cnt})
    </span>`
  ).join(' ');

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span style="color: var(--text-muted); font-size: 0.78rem; font-weight: 500;">Detección individual:</span>
      ${empBadges}
      ${sedeBadges}
    `;
  }

  // 2. Poblar selector de sedes para edición por lote si se llega a requerir
  if (batchSedeSelect && batchSedeSelect.options.length <= 1) {
    batchSedeSelect.innerHTML = '<option value="">-- Seleccionar Sede / Ciudad --</option>' +
      NOMBRES_SEDES_MEXICO.map(st => `<option value="${st}">${st}</option>`).join('');
  }

  // 3. Renderizar las filas de la tabla según el modo actual (lectura o edición)
  renderStagingTableRows(items);
}

/**
 * Renderiza el cuerpo de la tabla de revisión de reportes
 */
function renderStagingTableRows(items) {
  const tbody = document.getElementById('stagingTableBody');
  if (!tbody) return;

  tbody.innerHTML = items.map((item, idx) => `
    <tr>
      <td>
        <div style="font-weight: 600;">${item.conductor || 'Sin Conductor'}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${item.filename}</div>
      </td>
      <td>
        ${AppState.stagingEditing ? `
          <div class="staging-edit-card">
            <div class="staging-input-wrapper">
              <span class="staging-input-icon">🏢</span>
              <input 
                type="text" 
                class="staging-table-input" 
                placeholder="Empresa..."
                value="${(item.empresa || '').replace(/"/g, '&quot;')}"
                oninput="window.updateStagingItem(${idx}, 'empresa', this.value)"
                onchange="window.updateStagingItem(${idx}, 'empresa', this.value)"
              />
            </div>
            <div class="staging-input-wrapper">
              <span class="staging-input-icon">📍</span>
              <select 
                class="staging-table-select" 
                onchange="window.updateStagingItem(${idx}, 'sede', this.value)"
              >
                <option value="">-- Sin Sede --</option>
                ${NOMBRES_SEDES_MEXICO.map(st => `
                  <option value="${st}" ${item.sede === st ? 'selected' : ''}>${st}</option>
                `).join('')}
              </select>
            </div>
          </div>
        ` : `
          <div style="font-weight: 600; color: #f8fafc; font-size: 0.88rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>🏢</span> ${item.empresa || '<span style="color: #ef4444; font-style: italic;">Sin Empresa</span>'}
          </div>
          <div style="font-size: 0.75rem; color: #38bdf8; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.25rem;">
            <span>📍</span> ${item.sede || '<span style="color: var(--text-muted); font-style: italic;">Sin Sede</span>'}
          </div>
        `}
      </td>
      <td>${item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte}</td>
      <td>
        <strong>${(item.habilidadesManejoPuntos || 0).toFixed(2)}</strong> / 3.0
        <div style="font-size: 0.7rem; color: var(--text-muted);">${item.habilidadesManejoPct || 0}%</div>
      </td>
      <td>
        <strong>${(item.practicaSimuladorPuntos || 0).toFixed(2)}</strong> / 7.0
        <div style="font-size: 0.7rem; color: var(--text-muted);">${item.practicaSimuladorPct || 0}%</div>
        ${Array.isArray(item.ejercicios) && item.ejercicios.length > 0 ? `
          <div style="font-size: 0.68rem; color: #a855f7; margin-top: 0.2rem; font-weight: 500;" title="Ejercicios evaluados: ${item.ejercicios.map(e => `S${e.numero} (${e.nombre}): ${e.calificacion ?? '-'}`).join(' | ')}">
            ${item.ejercicios.map(e => `S${e.numero} (${e.nombre}): <strong>${e.calificacion != null ? e.calificacion : '-'}</strong>`).join(' · ')}
          </div>` : (item.simulacionesDetalle?.simulacion_2 != null ? `
          <div style="font-size: 0.68rem; color: #a855f7; margin-top: 0.2rem; font-weight: 500;" title="Calificaciones obtenidas en simulaciones individuales">
            S2: ${item.simulacionesDetalle.simulacion_2} | S3: ${item.simulacionesDetalle.simulacion_3 ?? '-'} | S4: ${item.simulacionesDetalle.simulacion_4 ?? '-'}
          </div>` : '')}
      </td>
      <td>
        <span class="score-pill" style="color: var(--primary);">
          ${(item.evaluacionFinalPuntos || 0).toFixed(2)}
        </span>
        <div style="font-size: 0.7rem; color: var(--text-muted);">${item.evaluacionFinalPct || 0}%</div>
      </td>
      <td>
        <span style="color: ${(item.colisiones + item.fatalidades) > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
          ${item.colisiones} col / ${item.fatalidades} fat
        </span>
      </td>
      <td>
        <span class="badge badge-${item.badgeColor}">${item.estado}</span>
      </td>
    </tr>
  `).join('');
}

export {
  initDropzone,
  updateStagingEditModeUI,
  processSelectedFiles,
  displayStagingEvaluations,
  renderStagingTableRows
};

// Habilitar Hot Module Replacement (HMR) para actualizar este módulo sin recargar la página
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    console.log('⚡ [HMR] Módulo Ingesta actualizado en caliente sin recargar.');
    if (newModule && typeof newModule.updateStagingEditModeUI === 'function') {
      newModule.updateStagingEditModeUI();
    }
  });
}
