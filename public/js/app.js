/**
 * TrackSIM CLOUD - Application Main Controller
 * Maneja la navegación, autenticación con Google, ingesta de PDFs,
 * trazabilidad de conductores y sincronización con Firestore.
 */

import {
  initAuth
} from './modules/auth.js';

import {
  initUserManagement
} from './modules/user-management.js';

import {
  initDropzone
} from './modules/ingesta.js';

import {
  initDirectoryFilters,
  initDirectoryTableSorting,
  renderDirectoryTable
} from './modules/directory.js';

import {
  getEvaluations,
  deleteEvaluation,
  clearAllEvaluations,
  clearLocalCache,
  processDriverSummaries,
  processCompanySummaries,
  createCompanySummaryFromEvaluations
} from './db.js';

import {
  renderEvolutionChart,
  renderDistributionChart,
  renderCompanyRankingChart,
  renderCompanySimulationsChart,
  renderCompanyEvolutionChart,
  renderCompanyExercisesAnnualChart,
  renderDriverAccidentsChart,
  renderCompanyAccidentsChart
} from './charts.js';

// Estado global de la aplicación
const AppState = {
  user: null,
  userRole: null, // 'admin' | 'viewer'
  allowedCompanies: [], // Empresas permitidas para lectores (vacío o ['all'] = todas)
  evaluations: [],
  drivers: [],
  companies: [],
  selectedDriver: null,
  selectedCompany: null,
  stagingEvaluations: [],
  stagingEditing: false,
  selectedDirectoryIds: new Set(),
  currentTab: 'dashboard',
  companyTableSort: {
    column: 'promedioScore',
    direction: 'desc'
  },
  directoryTableSort: {
    column: 'fecha',
    direction: 'desc'
  },
  filters: {
    search: '',
    empresa: 'all',
    sede: 'all',
    estado: 'all'
  }
};
window.AppState = AppState;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Limpiar datos de prueba residuales para garantizar inicio limpio
  if (!localStorage.getItem('tracksim_clean_empty_v2')) {
    localStorage.removeItem('tracksim_cloud_evaluaciones');
    localStorage.setItem('tracksim_clean_empty_v2', 'true');
  }

  window.loadAndRefreshData = loadAndRefreshData;
  initNavigation();
  initAuth(loadAndRefreshData);
  initDropzone(loadAndRefreshData);
  initCompanyView();
  initDirectoryFilters();
  initDirectoryTableSorting();
  initModals();
});

// ==========================================
// NAVEGACIÓN ENTRE SECCIONES
// ==========================================
function initNavigation() {
  window.switchTab = switchTab;

  window.confirmDeleteEvaluation = async (evalId, conductorName) => {
    if (AppState.userRole !== 'admin') {
      showToast('Acción restringida a administradores.', 'warning');
      return;
    }
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar la evaluación de "${conductorName || 'este operador'}"?\n\nEsta acción borrará el registro de Cloud Firestore y de la memoria local.`);
    if (!confirmed) return;

    try {
      await deleteEvaluation(evalId);
      await loadAndRefreshData();
      showToast(`Evaluación de ${conductorName || 'operador'} eliminada exitosamente.`, 'info');
    } catch (err) {
      console.error('Error eliminando evaluación:', err);
      showToast('Error al eliminar la evaluación.', 'error');
    }
  };

  window.confirmClearAllEvaluations = async () => {
    if (AppState.userRole !== 'admin') {
      showToast('Acción restringida a administradores.', 'warning');
      return;
    }
    const count = AppState.evaluations.length;
    const confirmed = window.confirm(`⚠️ ADVERTENCIA: ¿Estás seguro de que deseas eliminar TODAS las evaluaciones (${count} registros)?\n\nSe borrarán permanentemente de Cloud Firestore y de la memoria local. Esta acción NO se puede deshacer.`);
    if (!confirmed) return;

    const btn = document.getElementById('clearAllEvalsBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
      if (!document.getElementById('spinnerKeyframes')) {
        const st = document.createElement('style');
        st.id = 'spinnerKeyframes';
        st.textContent = '@keyframes btnSpin { to { transform: rotate(360deg); } }';
        document.head.appendChild(st);
      }
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;margin-right:0.5rem;vertical-align:-2px;border:2px solid rgba(239,68,68,0.3);border-top-color:#ef4444;border-radius:50%;animation:btnSpin 0.7s linear infinite;"></span>Eliminando evaluaciones...';
    }

    try {
      await clearAllEvaluations();
      await loadAndRefreshData();
      showToast('Se han eliminado todas las evaluaciones del sistema.', 'info');
    } catch (err) {
      console.error('Error vaciando evaluaciones:', err);
      showToast('Error al vaciar evaluaciones.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    }
  };

  window.clearLocalCache = async () => {
    clearLocalCache();
    await loadAndRefreshData();
    showToast('Caché local limpiada.', 'info');
  };
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      switchTab(targetTab);
    });
  });
}

export function switchTab(tabId) {
  // Protección de acceso estricta para usuarios limitados
  if ((tabId === 'ingesta' || tabId === 'directorio') && AppState.userRole !== 'admin') {
    const sectionName = tabId === 'ingesta' ? 'Ingesta de reportes' : 'Directorio de Evaluaciones';
    showToast(`Acceso denegado: La sección de ${sectionName} está reservada para Administradores.`, 'warning');
    if (AppState.currentTab === tabId || !AppState.currentTab) {
      tabId = 'dashboard';
    } else {
      return;
    }
  }

  AppState.currentTab = tabId;

  // Actualizar botones de navegación
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabId);
  });

  // Mostrar la sección correspondiente
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });

  const activeSec = document.getElementById(`view-${tabId}`);
  if (activeSec) {
    activeSec.classList.add('active');
  }

  // Actualizaciones específicas al entrar a una pestaña
  // Usamos requestAnimationFrame para que el navegador cambie la pestaña VISUALMENTE en el frame 0 (instantáneo)
  // y ejecute el cálculo/dibujo de gráficos pesados inmediatamente después sin congelar el clic
  requestAnimationFrame(() => {
    if (AppState.currentTab !== tabId) return;
    if (tabId === 'dashboard') {
      renderDashboard();
    } else if (tabId === 'evolucion') {
      renderEvolutionView();
    } else if (tabId === 'empresas') {
      renderCompanyView();
    } else if (tabId === 'directorio') {
      renderDirectoryTable();
    }
  });
}

// ==========================================
// CARGA Y SINCRONIZACIÓN DE DATOS
// ==========================================
async function loadAndRefreshData() {
  try {
    let allEvals = await getEvaluations();

    // Si el usuario es lector, aplicar restricción estricta de empresa
    if (AppState.userRole !== 'admin') {
      if (!AppState.allowedCompanies || AppState.allowedCompanies.length === 0) {
        // Lector sin empresa vinculada: NO tiene acceso a ninguna evaluación
        allEvals = [];
      } else if (!AppState.allowedCompanies.includes('all')) {
        const allowedSet = new Set(AppState.allowedCompanies.map(c => (c || '').trim().toLowerCase()));
        allEvals = allEvals.filter(e => {
          const emp = (e.empresa || '').trim().toLowerCase();
          return allowedSet.has(emp);
        });
      }
    }

    AppState.evaluations = allEvals;
    AppState.drivers = processDriverSummaries(AppState.evaluations);
    AppState.companies = processCompanySummaries(AppState.evaluations);

    // Actualizar selección activa de conductor
    if (AppState.drivers.length > 0) {
      if (!AppState.selectedDriver || !AppState.drivers.find(d => d.nombre === AppState.selectedDriver.nombre)) {
        AppState.selectedDriver = AppState.drivers[0];
      }
    } else {
      AppState.selectedDriver = null;
    }

    // Actualizar selección activa de empresa
    if (AppState.companies.length > 0) {
      if (AppState.userRole === 'admin') {
        AppState.selectedCompany = getAllCompaniesEvolutionSummary();
      } else if (!AppState.selectedCompany || !AppState.companies.find(c => c.nombre === AppState.selectedCompany.nombre)) {
        AppState.selectedCompany = AppState.companies[0];
      }
    } else {
      AppState.selectedCompany = null;
    }

    // Renderizado bajo demanda: solo renderizar la pestaña activa para evitar bloquear el hilo principal
    renderActiveTab();
  } catch (e) {
    console.error('Error cargando datos principales:', e);
    showToast('Error al inicializar datos.', 'error');
  }
}

export function renderActiveTab() {
  const tab = AppState.currentTab || 'dashboard';
  if (tab === 'dashboard') {
    renderDashboard();
  } else if (tab === 'evolucion') {
    renderEvolutionView();
  } else if (tab === 'empresas') {
    renderCompanyView();
  } else if (tab === 'directorio') {
    renderDirectoryTable();
  }
}

// ==========================================
// VISTA: DASHBOARD EJECUTIVO
// ==========================================
function renderDashboard() {
  const evals = AppState.evaluations;
  const drivers = AppState.drivers;

  // 1. KPIs
  document.getElementById('kpiTotalEvals').textContent = evals.length;
  document.getElementById('kpiTotalDrivers').textContent = drivers.length;

  if (evals.length > 0) {
    const avgScore = (evals.reduce((acc, e) => acc + (e.evaluacionFinalPuntos || e.calificacionExacta || 0), 0) / evals.length).toFixed(2);
    document.getElementById('kpiAvgScore').textContent = `${avgScore} / 10`;

    const approvedCount = evals.filter(e => (e.evaluacionFinalPuntos || 0) >= 6.0).length;
    const approvalRate = ((approvedCount / evals.length) * 100).toFixed(1);
    document.getElementById('kpiApprovalRate').textContent = `${approvalRate}%`;

    const totalCollisions = evals.reduce((acc, e) => acc + (e.colisiones || 0), 0);
    const totalFatalities = evals.reduce((acc, e) => acc + (e.fatalidades || 0), 0);
    document.getElementById('kpiTotalIncidents').textContent = totalCollisions + totalFatalities;
  } else {
    document.getElementById('kpiAvgScore').textContent = '0.00';
    document.getElementById('kpiApprovalRate').textContent = '0%';
    document.getElementById('kpiTotalIncidents').textContent = '0';
  }

  // 2. Gráfico Donut de Distribución
  renderDistributionChart('distributionChartCanvas', evals);

  // 3. Tabla de Evaluaciones Recientes
  const recentTableBody = document.getElementById('recentEvalsTableBody');
  if (recentTableBody) {
    if (evals.length === 0) {
      let emptyMsg = "No hay evaluaciones registradas aún en el sistema.";
      if (AppState.userRole === 'admin') {
        emptyMsg = "No hay evaluaciones registradas aún. Sube tus archivos PDF en la pestaña 'Ingesta de PDFs'.";
      } else if (!AppState.allowedCompanies || AppState.allowedCompanies.length === 0) {
        emptyMsg = "Tu cuenta no tiene una empresa asociada todavía. No se muestran evaluaciones.";
      }
      recentTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📁</div>
            ${emptyMsg}
          </td>
        </tr>
      `;
    } else {
      const recents = evals.slice(0, 5);
      recentTableBody.innerHTML = recents.map(e => `
        <tr>
          <td>
            <div style="font-weight: 600;">${e.conductor}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">
              <span>${e.empresa || 'Empresa'}</span>
              ${e.sede ? `<span style="color: #38bdf8;">· 📍 ${e.sede}</span>` : ''}
            </div>
          </td>
          <td>${e.fechaCapacitacionFormato || e.fechaCapacitacion || e.fechaReporte}</td>
          <td>
            <span class="score-pill">
              ${(e.evaluacionFinalPuntos || e.calificacionExacta || 0).toFixed(2)}
              <small style="color: var(--text-muted); font-size: 0.7rem;">/ 10</small>
            </span>
          </td>
          <td>
            <span class="badge badge-${e.badgeColor || 'info'}">${e.estado || 'Procesado'}</span>
          </td>
          <td>
            <div style="display: flex; gap: 0.4rem; align-items: center;">
              <button class="btn btn-secondary btn-sm" onclick="window.viewEvaluationDetail('${e.id}')">
                Detalle
              </button>
              ${AppState.userRole === 'admin' ? `
                <button class="btn btn-secondary btn-sm" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.35); padding: 0.25rem 0.5rem;" onclick="window.editSingleEvaluationPrompt('${e.id}')" title="Editar Evaluación">
                  ✏️
                </button>
                <button class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.35); padding: 0.25rem 0.5rem;" onclick="window.confirmDeleteEvaluation('${e.id}', '${(e.conductor || '').replace(/'/g, "\\'")}')" title="Eliminar evaluación">
                  🗑️
                </button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }
  }
}

// ==========================================
// VISTA: INGESTA INTELIGENTE DE PDFS
// ==========================================
// VISTA: TRAZABILIDAD Y EVOLUCIÓN
// ==========================================
let currentEvolutionSubtab = 'driver'; // 'driver' | 'company'

function initEvolutionViewControls() {
  const driverBtn = document.getElementById('subnavEvolucionDriverBtn');
  const companyBtn = document.getElementById('subnavEvolucionCompanyBtn');

  if (driverBtn && !driverBtn.dataset.bound) {
    driverBtn.dataset.bound = 'true';
    driverBtn.addEventListener('click', () => {
      switchEvolutionSubtab('driver');
    });
  }

  if (companyBtn && !companyBtn.dataset.bound) {
    companyBtn.dataset.bound = 'true';
    companyBtn.addEventListener('click', () => {
      switchEvolutionSubtab('company');
    });
  }

  const companySelect = document.getElementById('companyEvolutionSelect');
  if (companySelect && !companySelect.dataset.bound) {
    companySelect.dataset.bound = 'true';
    companySelect.addEventListener('change', (e) => {
      const selectedName = e.target.value;
      if (selectedName === 'all') {
        const allSummary = getAllCompaniesEvolutionSummary();
        AppState.selectedCompany = allSummary;
        updateCompanyEvolutionDetails(allSummary);
        return;
      }
      const found = AppState.companies.find(c => c.nombre === selectedName);
      if (found) {
        AppState.selectedCompany = found;
        updateCompanyEvolutionDetails(found);
      }
    });
  }
}

function switchEvolutionSubtab(subtab) {
  currentEvolutionSubtab = subtab;
  const driverBtn = document.getElementById('subnavEvolucionDriverBtn');
  const companyBtn = document.getElementById('subnavEvolucionCompanyBtn');
  const panelDriver = document.getElementById('panelEvolucionDriver');
  const panelCompany = document.getElementById('panelEvolucionCompany');

  if (driverBtn) {
    driverBtn.classList.toggle('active', subtab === 'driver');
    driverBtn.setAttribute('aria-selected', subtab === 'driver' ? 'true' : 'false');
  }
  if (companyBtn) {
    companyBtn.classList.toggle('active', subtab === 'company');
    companyBtn.setAttribute('aria-selected', subtab === 'company' ? 'true' : 'false');
  }

  if (subtab === 'driver') {
    if (panelDriver) panelDriver.style.display = 'block';
    if (panelCompany) panelCompany.style.display = 'none';
    renderEvolutionView();
  } else {
    if (panelDriver) panelDriver.style.display = 'none';
    if (panelCompany) panelCompany.style.display = 'block';
    renderCompanyEvolutionView();
  }
}

function renderEvolutionView() {
  initEvolutionViewControls();

  if (currentEvolutionSubtab === 'company') {
    renderCompanyEvolutionView();
    return;
  }

  const select = document.getElementById('driverSelect');
  const selectorBar = document.getElementById('driverSelectorBar');
  const emptyEl = document.getElementById('driverHeroEmpty');
  const contentEl = document.getElementById('driverHeroContent');

  const allDrivers = AppState.drivers || [];
  // Filtrar exclusivamente operadores con más de 1 evaluación para graficar trazabilidad temporal
  const drivers = allDrivers.filter(d => (d.totalEvaluaciones || d.evaluaciones?.length || 0) > 1);

  if (!drivers || drivers.length === 0) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
      const emptyTitle = emptyEl.querySelector('h3');
      const emptyText = emptyEl.querySelector('p');
      if (allDrivers.length > 0) {
        if (emptyTitle) emptyTitle.textContent = 'Sin Operadores con Trazabilidad';
        if (emptyText) emptyText.textContent = 'La trazabilidad y evolución histórica temporal requiere que el operador cuente con al menos 2 evaluaciones registradas. Actualmente todos los operadores registrados cuentan con una sola evaluación (línea base).';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Sin Evaluaciones Registradas';
        if (emptyText) emptyText.textContent = 'Aún no se han cargado reportes PDF en el sistema. Sube los archivos de tus operadores en la sección de Ingesta para comenzar a visualizar el historial y trazabilidad.';
      }
    }
    if (contentEl) contentEl.style.display = 'none';
    if (selectorBar) selectorBar.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
  if (selectorBar) selectorBar.style.display = 'flex';

  if (!select) return;

  // Llenar selector exclusivamente con operadores que tienen más de 1 evaluación
  select.innerHTML = drivers.map(d => `
    <option value="${d.slug}" ${AppState.selectedDriver && AppState.selectedDriver.slug === d.slug ? 'selected' : ''}>
      ${d.nombre} (${d.totalEvaluaciones} evaluaciones)
    </option>
  `).join('');

  select.onchange = (e) => {
    const found = drivers.find(d => d.slug === e.target.value);
    if (found) {
      AppState.selectedDriver = found;
      updateDriverDetails(found);
    }
  };

  // Si no hay conductor seleccionado o el actual solo tiene 1 evaluación, seleccionar el primero válido
  if (!AppState.selectedDriver || !drivers.some(d => d.slug === AppState.selectedDriver.slug)) {
    AppState.selectedDriver = drivers[0];
  }

  select.value = AppState.selectedDriver.slug;
  updateDriverDetails(AppState.selectedDriver);
}

// Helper para obtener el objeto de resumen consolidado de 'Todas las empresas' con caché
let cachedAllCompaniesSummary = null;
let cachedAllCompaniesEvalsRef = null;

function getAllCompaniesEvolutionSummary() {
  const allEvals = AppState.evaluations || [];
  if (cachedAllCompaniesSummary && cachedAllCompaniesEvalsRef === allEvals) {
    return cachedAllCompaniesSummary;
  }
  const summary = createCompanySummaryFromEvaluations(
    'Todas las empresas',
    'todas-las-empresas',
    allEvals
  );
  summary.esGlobal = true;
  cachedAllCompaniesSummary = summary;
  cachedAllCompaniesEvalsRef = allEvals;
  return summary;
}

// Renderizar la trazabilidad y evolución anual por empresa
function renderCompanyEvolutionView() {
  initEvolutionViewControls();

  const companies = AppState.companies || [];
  const selectorBar = document.getElementById('companyEvolutionSelectorBar');
  const select = document.getElementById('companyEvolutionSelect');
  const emptyEl = document.getElementById('companyEvolutionEmpty');
  const contentEl = document.getElementById('companyEvolutionContent');

  if (!companies || companies.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
    if (selectorBar) selectorBar.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  const isAdmin = AppState.userRole === 'admin';
  // Ocultar la barra de selección si sólo hay una empresa disponible para el usuario y no es admin
  if (selectorBar) selectorBar.style.display = (companies.length > 1 || isAdmin) ? 'flex' : 'none';

  // Si no hay empresa seleccionada o la actual ya no existe (y no es 'all' o 'Todas las empresas')
  const isSelectedAll = AppState.selectedCompany && (AppState.selectedCompany.nombre === 'Todas las empresas' || AppState.selectedCompany.slug === 'todas-las-empresas');
  if (isAdmin) {
    if (!AppState.selectedCompany || (!isSelectedAll && !companies.some(c => c.nombre === AppState.selectedCompany.nombre))) {
      AppState.selectedCompany = getAllCompaniesEvolutionSummary();
    }
  } else {
    if (isSelectedAll || !AppState.selectedCompany || !companies.some(c => c.nombre === AppState.selectedCompany.nombre)) {
      AppState.selectedCompany = companies[0];
    }
  }

  if (select) {
    let optionsHtml = '';
    if (isAdmin) {
      const allSummary = getAllCompaniesEvolutionSummary();
      const allYearsCount = (allSummary.evolucionAnual || []).length;
      const isAllSelected = isSelectedAll || (AppState.selectedCompany && AppState.selectedCompany.nombre === 'Todas las empresas');
      optionsHtml += `
        <option value="all" ${isAllSelected ? 'selected' : ''}>
          🌐 Todas las empresas (${allYearsCount} ${allYearsCount === 1 ? 'año evaluado' : 'años evaluados'} - ${allSummary.totalConductores} operadores)
        </option>
      `;
    }

    const currentVal = AppState.selectedCompany ? AppState.selectedCompany.nombre : '';
    optionsHtml += companies.map(c => {
      const yearsCount = (c.evolucionAnual || []).length;
      const isSelected = (!isSelectedAll && c.nombre === currentVal);
      return `
        <option value="${c.nombre}" ${isSelected ? 'selected' : ''}>
          🏢 ${c.nombre} (${yearsCount} ${yearsCount === 1 ? 'año evaluado' : 'años evaluados'} - ${c.totalConductores} operadores)
        </option>
      `;
    }).join('');

    select.innerHTML = optionsHtml;
    select.value = isSelectedAll ? 'all' : (AppState.selectedCompany ? AppState.selectedCompany.nombre : (isAdmin ? 'all' : companies[0]?.nombre));
  }

  const activeCompany = (isSelectedAll || (select && select.value === 'all'))
    ? getAllCompaniesEvolutionSummary()
    : AppState.selectedCompany;

  AppState.selectedCompany = activeCompany;
  updateCompanyEvolutionDetails(activeCompany);
}

function updateCompanyEvolutionDetails(company) {
  if (!company) return;

  const evolucionAnual = company.evolucionAnual || [];

  // 1. Resumen Hero
  const titleEl = document.getElementById('companyEvolutionNameTitle');
  if (titleEl) titleEl.textContent = company.nombre;

  const sedesSubtitle = document.getElementById('companyEvolutionSedesSubtitle');
  if (sedesSubtitle) {
    if (company.esGlobal || company.nombre === 'Todas las empresas') {
      sedesSubtitle.innerHTML = `🌐 Vista Consolidada Global: <strong style="color: #38bdf8;">Todas las flotas y empresas registradas</strong>`;
    } else if (company.sedes && company.sedes.length > 0) {
      sedesSubtitle.innerHTML = `📍 Sedes: <strong style="color: #38bdf8;">${company.sedes.join(', ')}</strong>`;
    } else {
      sedesSubtitle.textContent = 'Flota Oficial de Autotransporte TrackSIM';
    }
  }

  const statTotalYears = document.getElementById('companyStatTotalYears');
  if (statTotalYears) statTotalYears.textContent = `${evolucionAnual.length} ${evolucionAnual.length === 1 ? 'Año' : 'Años'}`;

  const statTotalDrivers = document.getElementById('companyEvolutionStatTotalDrivers');
  if (statTotalDrivers) statTotalDrivers.textContent = `${company.totalConductores} operadores`;

  const statTotalEvals = document.getElementById('companyEvolutionStatTotalEvals');
  if (statTotalEvals) statTotalEvals.textContent = `${company.totalEvaluaciones} reportes`;

  const statAvgScore = document.getElementById('companyEvolutionStatAvgScore');
  if (statAvgScore) statAvgScore.textContent = `${company.promedioFinal.toFixed(2)} / 10`;

  // 2. Gráfico de evolución temporal anual
  renderCompanyEvolutionChart('companyAnnualEvolutionChartCanvas', evolucionAnual);

  // 3. Gráfico de curva de conteo de accidentes e incidentes anual
  renderCompanyAccidentsChart('companyAnnualAccidentsChartCanvas', evolucionAnual);

  // 4. Gráfico de comparativa de ejercicios a través de los años
  renderCompanyExercisesAnnualChart('companyAnnualExercisesChartCanvas', evolucionAnual);

  const exSubtitle = document.getElementById('companyAnnualExercisesSubtitle');
  if (exSubtitle) {
    exSubtitle.textContent = `Contraste anual del desempeño medio de la flota en ${company.ejerciciosPromedio?.length || 0} ejercicio(s) impartido(s).`;
  }

  // 5. Tabla de desglose anual comparativa
  const tbody = document.getElementById('companyAnnualTableBody');
  if (tbody) {
    if (evolucionAnual.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No hay registros con año válido para esta empresa.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = evolucionAnual.map((item, index) => {
      const col = item.totalColisiones || 0;
      const off = item.totalFueraVia || 0;
      const fat = item.totalFatalidades || 0;
      const incidents = col + off + fat;
      const tasaAccidentes = item.totalConductores > 0
        ? Number((incidents / item.totalConductores).toFixed(2))
        : 0;

      let comparativaTexto = '';
      if (index > 0) {
        const prev = evolucionAnual[index - 1];
        const prevIncidents = (prev.totalColisiones || 0) + (prev.totalFueraVia || 0) + (prev.totalFatalidades || 0);
        const prevTasa = prev.totalConductores > 0 ? (prevIncidents / prev.totalConductores) : 0;
        const diffTasa = Number((tasaAccidentes - prevTasa).toFixed(2));

        if (diffTasa < 0) {
          // Menos accidentes por conductor es una mejora (verde)
          comparativaTexto = `<div style="font-size: 0.72rem; color: #10b981; margin-top: 2px;">▼ ${Math.abs(diffTasa).toFixed(2)} vs año prev.</div>`;
        } else if (diffTasa > 0) {
          // Más accidentes por conductor es un retroceso (rojo)
          comparativaTexto = `<div style="font-size: 0.72rem; color: #ef4444; margin-top: 2px;">▲ +${diffTasa.toFixed(2)} vs año prev.</div>`;
        } else {
          comparativaTexto = `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">= Sin cambio</div>`;
        }
      }

      // Badge principal de tasa por conductor
      const badgeClass = tasaAccidentes === 0 ? 'badge-success' : tasaAccidentes <= 0.5 ? 'badge-info' : 'badge-danger';
      const tasaHTML = `
        <div>
          <span class="badge ${badgeClass}" style="font-size: 0.8rem; font-weight: 700;">
            ${tasaAccidentes.toFixed(2)} acc/op
          </span>
          ${comparativaTexto}
        </div>
      `;

      return `
        <tr>
          <td><strong style="color: #38bdf8; font-size: 0.95rem;">📅 ${item.year}</strong></td>
          <td>${item.totalConductores} operadores</td>
          <td>${item.totalEvaluaciones} capacitaciones</td>
          <td>
            <span class="score-pill" style="color: #38bdf8; font-weight: 700;">
              ${item.promedioFinal.toFixed(2)} / 10
            </span>
          </td>
          <td><strong style="color: #10b981;">${item.promedioHabilidades.toFixed(2)} pts</strong></td>
          <td><strong style="color: #a855f7;">${item.promedioSimulador.toFixed(2)} pts</strong></td>
          <td>
            <span class="badge ${item.tasaAprobacion >= 80 ? 'badge-success' : item.tasaAprobacion >= 60 ? 'badge-info' : 'badge-warning'}">
              ${item.tasaAprobacion.toFixed(1)}%
            </span>
          </td>
          <td>
            <div style="display: inline-flex; flex-direction: column; font-size: 0.78rem; line-height: 1.35; min-width: 135px; padding: 0.15rem 0;">
              <div style="display: flex; justify-content: space-between; color: #f87171;">
                <span>Colisiones:</span>
                <strong>${col}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; color: #fbbf24;">
                <span>+ Fuera de vía:</span>
                <strong>${off}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; color: #f43f5e; padding-bottom: 3px; border-bottom: 1px dashed rgba(255, 255, 255, 0.2);">
                <span>+ Fatalidades:</span>
                <strong>${fat}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 3px; font-weight: 700; color: ${incidents > 0 ? '#ef4444' : '#10b981'};">
                <span>= Total:</span>
                <span style="font-size: 0.85rem;">${incidents}</span>
              </div>
            </div>
          </td>
          <td>${tasaHTML}</td>
        </tr>
      `;
    }).join('');
  }
}


function updateDriverDetails(driver) {
  if (!driver) return;

  // Header del conductor
  document.getElementById('driverNameTitle').textContent = driver.nombre;
  document.getElementById('driverCompanySubtitle').textContent = driver.empresa;
  document.getElementById('driverInitialsAvatar').textContent = driver.nombre.split(' ').map(n => n[0]).slice(0, 2).join('');

  // Estadísticas
  document.getElementById('statTotalEvals').textContent = driver.totalEvaluaciones;
  document.getElementById('statLatestScore').textContent = `${(driver.ultimaCalificacion || 0).toFixed(2)} / 10`;
  document.getElementById('statAvgScore').textContent = `${(driver.promedioCalificacion || 0).toFixed(2)}`;

  const changeEl = document.getElementById('statEvolutionChange');
  if (driver.totalEvaluaciones > 1) {
    const sign = driver.cambioPorcentual > 0 ? '+' : '';
    changeEl.textContent = `${sign}${driver.cambioPorcentual}%`;
    changeEl.style.color = driver.cambioPorcentual >= 0 ? 'var(--success)' : 'var(--danger)';
  } else {
    changeEl.textContent = '1ra Evaluación (Línea base)';
    changeEl.style.color = 'var(--text-muted)';
  }

  // Gráfico de línea temporal
  renderEvolutionChart('driverEvolutionChartCanvas', driver.evaluaciones);

  // Gráfico de curva de conteo de accidentes e incidentes
  renderDriverAccidentsChart('driverAccidentsChartCanvas', driver.evaluaciones);

  // Timeline cronológico
  const timelineContainer = document.getElementById('driverTimelineContainer');
  if (timelineContainer) {
    timelineContainer.innerHTML = driver.evaluaciones.map((ev, index) => {
      const dotColor = ev.badgeColor || 'info';
      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotColor}"></div>
          <div class="timeline-content">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">SESIÓN #${index + 1}</span>
                <h4 style="font-size: 1.1rem; color: #ffffff;">${ev.cursoNombre || ev.cursoCodigo}</h4>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">
                  📅 Fecha: ${ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte} &nbsp;|&nbsp; 👨‍🏫 Instructor: ${ev.instructor || 'Mario Agraz'}
                </div>
              </div>
              <div>
                <span class="badge badge-${ev.badgeColor}">${ev.estado}</span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; margin-top: 1rem; background: rgba(0, 0, 0, 0.2); padding: 0.8rem; border-radius: var(--radius-sm);">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">HABILIDADES (3 PTS)</div>
                <div style="font-weight: 700; color: #10b981;">${(ev.habilidadesManejoPuntos || 0).toFixed(2)} (${ev.habilidadesManejoPct || 0}%)</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">SIMULADOR (7 PTS)</div>
                <div style="font-weight: 700; color: #a855f7;">${(ev.practicaSimuladorPuntos || 0).toFixed(2)} (${ev.practicaSimuladorPct || 0}%)</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">FINAL (10 PTS)</div>
                <div style="font-weight: 800; font-size: 1.1rem; color: #38bdf8;">${(ev.evaluacionFinalPuntos || ev.calificacionExacta || 0).toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">INCIDENTES</div>
                <div style="font-weight: 600; color: ${(ev.colisiones + ev.fatalidades) > 0 ? 'var(--danger)' : 'var(--success)'};">
                  ${ev.colisiones || 0} colisiones / ${ev.fatalidades || 0} fat.
                </div>
              </div>
            </div>

            <div style="margin-top: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">Firma: ${(ev.firmaDigital || '').substring(0, 16)}...</span>
              <button class="btn btn-secondary btn-sm" onclick="window.viewEvaluationDetail('${ev.id}')">
                Ver Reporte Completo
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}



// Paginación para métricas de flota
const COMPANY_DRIVERS_PAGE_SIZE = 30;
const COMPANY_RANKING_PAGE_SIZE = 30;
let companyDriversCurrentPage = 1;
let companyRankingCurrentPage = 1;

// ==========================================
// VISTA: INSPECCIÓN DE FLOTAS POR EMPRESA
// ==========================================
function initCompanyView() {
  const select = document.getElementById('companySelect');
  const searchInput = document.getElementById('companyDriverSearch');

  if (select) {
    select.addEventListener('change', (e) => {
      const selectedName = e.target.value;
      if (selectedName === 'all') {
        AppState.selectedCompany = getAllCompaniesEvolutionSummary();
      } else {
        AppState.selectedCompany = AppState.companies.find(c => c.nombre === selectedName) || null;
      }
      companyDriversCurrentPage = 1;
      companyRankingCurrentPage = 1;
      renderCompanyView();
    });
  }

  if (searchInput) {
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      companyDriversCurrentPage = 1;
      companyRankingCurrentPage = 1;
      renderCompanyDriversTable(q);
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (AppState.selectedCompany) {
          renderCompanyRankingChart('companyRankingChartCanvas', AppState.selectedCompany.conductores, q, companyRankingCurrentPage, COMPANY_RANKING_PAGE_SIZE);
          renderCompanySimulationsChart('companySimulationsChartCanvas', AppState.selectedCompany, q);
        }
      }, 150);
    });
  }

  // Controles de paginación del Ranking de Operadores (Top 50 por página)
  const rankingFirstBtn = document.getElementById('rankingFirstPageBtn');
  const rankingPrevBtn = document.getElementById('rankingPrevPageBtn');
  const rankingNextBtn = document.getElementById('rankingNextPageBtn');
  const rankingLastBtn = document.getElementById('rankingLastPageBtn');

  const getRankingTotalPages = () => {
    if (!AppState.selectedCompany || !AppState.selectedCompany.conductores) return 1;
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let count = AppState.selectedCompany.conductores.length;
    if (q) {
      count = AppState.selectedCompany.conductores.filter(c => c.nombre.toLowerCase().includes(q)).length;
    }
    return Math.max(1, Math.ceil(count / COMPANY_RANKING_PAGE_SIZE));
  };

  const updateRankingPage = (newPage) => {
    const totalPages = getRankingTotalPages();
    companyRankingCurrentPage = Math.min(Math.max(1, newPage), totalPages);
    if (AppState.selectedCompany) {
      const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
      renderCompanyRankingChart('companyRankingChartCanvas', AppState.selectedCompany.conductores, q, companyRankingCurrentPage, COMPANY_RANKING_PAGE_SIZE);
    }
  };

  if (rankingFirstBtn) rankingFirstBtn.addEventListener('click', () => updateRankingPage(1));
  if (rankingPrevBtn) rankingPrevBtn.addEventListener('click', () => updateRankingPage(companyRankingCurrentPage - 1));
  if (rankingNextBtn) rankingNextBtn.addEventListener('click', () => updateRankingPage(companyRankingCurrentPage + 1));
  if (rankingLastBtn) rankingLastBtn.addEventListener('click', () => updateRankingPage(getRankingTotalPages()));

  // Controles de paginación de la Tabla de Operadores (50 operadores por página)
  const driversFirstBtn = document.getElementById('companyDriversFirstPageBtn');
  const driversPrevBtn = document.getElementById('companyDriversPrevPageBtn');
  const driversNextBtn = document.getElementById('companyDriversNextPageBtn');
  const driversLastBtn = document.getElementById('companyDriversLastPageBtn');

  const getDriversTotalPages = () => {
    if (!AppState.selectedCompany || !AppState.selectedCompany.conductores) return 1;
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let count = AppState.selectedCompany.conductores.length;
    if (q) {
      count = AppState.selectedCompany.conductores.filter(c => c.nombre.toLowerCase().includes(q)).length;
    }
    return Math.max(1, Math.ceil(count / COMPANY_DRIVERS_PAGE_SIZE));
  };

  const updateDriversPage = (newPage) => {
    const totalPages = getDriversTotalPages();
    companyDriversCurrentPage = Math.min(Math.max(1, newPage), totalPages);
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderCompanyDriversTable(q);
  };

  if (driversFirstBtn) driversFirstBtn.addEventListener('click', () => updateDriversPage(1));
  if (driversPrevBtn) driversPrevBtn.addEventListener('click', () => updateDriversPage(companyDriversCurrentPage - 1));
  if (driversNextBtn) driversNextBtn.addEventListener('click', () => updateDriversPage(companyDriversCurrentPage + 1));
  if (driversLastBtn) driversLastBtn.addEventListener('click', () => updateDriversPage(getDriversTotalPages()));

  // Listener para re-renderizar o ajustar el gráfico de ranking cuando se abre el colapsable
  const rankingDetails = document.getElementById('companyRankingDetails');
  if (rankingDetails) {
    rankingDetails.addEventListener('toggle', () => {
      if (rankingDetails.open && AppState.selectedCompany) {
        const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
        renderCompanyRankingChart('companyRankingChartCanvas', AppState.selectedCompany.conductores, q, companyRankingCurrentPage, COMPANY_RANKING_PAGE_SIZE);
      }
    });
  }

  // Listener para re-renderizar el gráfico de simulaciones cuando se abre el colapsable
  const simDetails = document.getElementById('companySimulationsDetails');
  if (simDetails) {
    simDetails.addEventListener('toggle', () => {
      if (simDetails.open && AppState.selectedCompany) {
        const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
        renderCompanySimulationsChart('companySimulationsChartCanvas', AppState.selectedCompany, q);
      }
    });
  }

  // Función global para filtrar operador al hacer clic directamente en la gráfica de ranking
  window.selectCompanyDriverFromChart = (driverName) => {
    if (!driverName || !searchInput) return;

    // Si ya está filtrado por este mismo conductor, alternar (desfiltrar)
    if (searchInput.value.trim().toLowerCase() === driverName.trim().toLowerCase()) {
      searchInput.value = '';
    } else {
      searchInput.value = driverName;
    }

    companyDriversCurrentPage = 1;
    companyRankingCurrentPage = 1;
    const q = searchInput.value.toLowerCase().trim();
    renderCompanyDriversTable(q);
    if (AppState.selectedCompany) {
      renderCompanyRankingChart('companyRankingChartCanvas', AppState.selectedCompany.conductores, q, companyRankingCurrentPage, COMPANY_RANKING_PAGE_SIZE);
      renderCompanySimulationsChart('companySimulationsChartCanvas', AppState.selectedCompany, q);
    }

    // Scroll suave hacia la tabla si el usuario lo seleccionó
    const tableEl = document.getElementById('companyDriversTable');
    if (tableEl && q) {
      tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Inicializar ordenamiento interactivo de la tabla de operadores de la flota
  initCompanyDriversTableSorting();

  // Permite saltar directamente a la trazabilidad del conductor desde la empresa
  window.inspectDriverEvolucion = (driverName) => {
    const driver = AppState.drivers.find(d => d.nombre === driverName);
    if (!driver) return;

    if (driver.totalEvaluaciones <= 1) {
      showToast(`${driver.nombre} solo tiene 1 evaluación registrada (línea base). Se requieren al menos 2 capacitaciones para visualizar trazabilidad temporal.`, 'info');
      return;
    }

    AppState.selectedDriver = driver;
    const driverSelect = document.getElementById('driverSelect');
    if (driverSelect) driverSelect.value = driver.slug;
    switchEvolutionSubtab('driver');
    switchTab('evolucion');
  };

  // Permite saltar directamente a la trazabilidad anual de la empresa
  window.inspectCompanyEvolucion = (companyName) => {
    let company = null;
    if (companyName) {
      company = AppState.companies.find(c => c.nombre === companyName);
    }
    if (!company) {
      company = AppState.selectedCompany || (AppState.companies && AppState.companies[0]);
    }
    if (!company) return;

    AppState.selectedCompany = company;
    switchTab('evolucion');
    switchEvolutionSubtab('company');

    const companySelect = document.getElementById('companyEvolutionSelect');
    if (companySelect) {
      companySelect.value = company.nombre;
    }
    updateCompanyEvolutionDetails(company);
  };

  // Permite abrir directamente el reporte o preguntar cuál ver si el conductor tiene múltiples evaluaciones
  window.openDriverReportsPrompt = (driverName) => {
    if (!driverName) return;

    // Buscar todas las evaluaciones del operador (coincidencia por nombre exacto o slug)
    const driverEvals = (AppState.evaluations || [])
      .filter(e => (e.conductor || '').trim().toLowerCase() === driverName.trim().toLowerCase())
      .sort((a, b) => {
        const da = a.fechaCapacitacion || a.fechaReporte || '';
        const db = b.fechaCapacitacion || b.fechaReporte || '';
        return db.localeCompare(da); // Más reciente primero
      });

    if (driverEvals.length === 0) {
      showToast(`No se encontraron reportes registrados para ${driverName}.`, 'warning');
      return;
    }

    // Si solo tiene 1 evaluación registrada, abrir directamente su reporte digital
    if (driverEvals.length === 1) {
      window.viewEvaluationDetail(driverEvals[0].id);
      return;
    }

    // Si tiene más de 1 conducción/evaluación, abrir el modal de selección
    const pickerModal = document.getElementById('driverReportPickerModal');
    const titleEl = document.getElementById('pickerModalTitle');
    const subtitleEl = document.getElementById('pickerModalSubtitle');
    const listEl = document.getElementById('pickerReportsList');

    if (titleEl) titleEl.textContent = `📄 Reportes de ${driverName}`;
    if (subtitleEl) subtitleEl.textContent = `${driverEvals.length} evaluaciones registradas en el sistema`;

    if (listEl) {
      listEl.innerHTML = driverEvals.map((ev, idx) => {
        const dateStr = ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte || 'Fecha no especificada';
        const score = (ev.evaluacionFinalPuntos || ev.calificacionExacta || 0).toFixed(2);
        const isLatest = idx === 0;

        return `
          <button type="button" class="btn btn-secondary picker-report-item"
            onclick="window.viewEvaluationDetail('${ev.id}'); document.getElementById('driverReportPickerModal').classList.remove('active');"
            style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1rem; border-radius: 8px; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); transition: all 0.2s ease;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="color: #ffffff; font-size: 0.95rem;">📅 ${dateStr}</strong>
                ${isLatest ? '<span class="badge badge-info" style="font-size: 0.7rem;">Más Reciente</span>' : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">
                Curso: ${ev.cursoCodigo || 'N/A'} ${ev.cursoNombre ? `- ${ev.cursoNombre}` : ''}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
                💥 ${ev.colisiones || 0} col. · 💀 ${ev.fatalidades || 0} fat. · 🛑 ${ev.vehiculoFueraVia || 0} fuera vía
              </div>
            </div>
            <div style="text-align: right; min-width: 90px;">
              <span class="score-pill" style="font-size: 0.95rem; font-weight: 700; color: #38bdf8;">
                ${score} / 10
              </span>
              <div style="margin-top: 0.25rem;">
                <span class="badge badge-${ev.badgeColor || 'info'}" style="font-size: 0.72rem;">
                  ${ev.estado || 'Procesado'}
                </span>
              </div>
            </div>
          </button>
        `;
      }).join('');
    }

    if (pickerModal) {
      pickerModal.classList.add('active');
    }
  };
}

function initCompanyDriversTableSorting() {
  const table = document.getElementById('companyDriversTable');
  if (!table) return;

  const thead = table.querySelector('thead');
  if (!thead) return;

  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable-th');
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;

    if (AppState.companyTableSort.column === key) {
      AppState.companyTableSort.direction = AppState.companyTableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      AppState.companyTableSort.column = key;
      // Dirección inicial según columna
      if (key === 'nombre') {
        AppState.companyTableSort.direction = 'asc';
      } else {
        AppState.companyTableSort.direction = 'desc';
      }
    }

    const searchInput = document.getElementById('companyDriverSearch');
    const currentSearch = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderCompanyDriversTable(currentSearch);
  });
}

function parseDateToTimestamp(dateStr) {
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

function getConductorSimScore(c) {
  if (!c || !c.simulaciones) return -1;
  const s2 = c.simulaciones.simulacion_2;
  const s3 = c.simulaciones.simulacion_3;
  const s4 = c.simulaciones.simulacion_4;
  let sum = 0, count = 0;
  if (typeof s2 === 'number' && !isNaN(s2)) { sum += s2; count++; }
  if (typeof s3 === 'number' && !isNaN(s3)) { sum += s3; count++; }
  if (typeof s4 === 'number' && !isNaN(s4)) { sum += s4; count++; }
  return count > 0 ? (sum / count) : -1;
}

function updateCompanyTableSortHeaders(activeCol, activeDir) {
  const ths = document.querySelectorAll('#companyDriversTable thead th.sortable-th');
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

function renderCompanyView() {
  const companies = AppState.companies;
  const emptyState = document.getElementById('companyEmptyState');
  const content = document.getElementById('companyContent');
  const countBadge = document.getElementById('companyCountBadge');
  const select = document.getElementById('companySelect');

  if (countBadge) countBadge.textContent = `${companies.length} Empresa${companies.length === 1 ? '' : 's'}`;

  if (!companies || companies.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (content) content.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (content) content.style.display = 'block';
  const isAdmin = AppState.userRole === 'admin';

  // Si no hay empresa seleccionada o la actual ya no existe en el listado
  const isSelectedAll = AppState.selectedCompany && (AppState.selectedCompany.nombre === 'Todas las empresas' || AppState.selectedCompany.slug === 'todas-las-empresas');
  if (isAdmin) {
    if (!AppState.selectedCompany || (!isSelectedAll && !companies.some(c => c.nombre === AppState.selectedCompany.nombre))) {
      AppState.selectedCompany = getAllCompaniesEvolutionSummary();
    }
  } else {
    if (isSelectedAll || !AppState.selectedCompany || !companies.some(c => c.nombre === AppState.selectedCompany.nombre)) {
      AppState.selectedCompany = companies[0];
    }
  }

  // Controlar visibilidad del selector de empresa si sólo hay una empresa disponible y no es admin
  const selectWrapper = document.getElementById('companySelectWrapper');
  if (selectWrapper) {
    selectWrapper.style.display = (companies.length > 1 || isAdmin) ? 'flex' : 'none';
  }

  // Actualizar opciones del select
  if (select) {
    let optionsHtml = '';
    if (isAdmin) {
      const allSummary = getAllCompaniesEvolutionSummary();
      const isAllSelected = isSelectedAll || (AppState.selectedCompany && AppState.selectedCompany.nombre === 'Todas las empresas');
      optionsHtml += `
        <option value="all" ${isAllSelected ? 'selected' : ''}>
          🌐 Todas las empresas (${allSummary.totalConductores} operadores - ${allSummary.totalEvaluaciones} reportes)
        </option>
      `;
    }

    const currentVal = AppState.selectedCompany ? AppState.selectedCompany.nombre : '';
    optionsHtml += companies.map(c => `
      <option value="${c.nombre}" ${(!isSelectedAll && c.nombre === currentVal) ? 'selected' : ''}>
        🏢 ${c.nombre} ${c.sedes && c.sedes.length > 0 ? `(📍 Sede: ${c.sedes.join(', ')})` : ''} (${c.totalConductores} operadores)
      </option>
    `).join('');

    select.innerHTML = optionsHtml;
    select.value = isSelectedAll ? 'all' : (AppState.selectedCompany ? AppState.selectedCompany.nombre : (isAdmin ? 'all' : companies[0]?.nombre));
  }

  const comp = (isSelectedAll || (select && select.value === 'all'))
    ? getAllCompaniesEvolutionSummary()
    : AppState.selectedCompany;

  AppState.selectedCompany = comp;
  if (!comp) return;

  // 1. Resumen Hero
  const titleEl = document.getElementById('companyNameTitle');
  if (titleEl) titleEl.textContent = comp.nombre;

  const sedesSubtitle = document.getElementById('companySedesSubtitle');
  if (sedesSubtitle) {
    if (comp.esGlobal || comp.nombre === 'Todas las empresas') {
      sedesSubtitle.innerHTML = `🌐 Vista Consolidada Global: <strong style="color: #38bdf8;">Todas las flotas y empresas registradas</strong>`;
    } else if (comp.sedes && comp.sedes.length > 0) {
      sedesSubtitle.innerHTML = `📍 Sede de Evaluación: <strong style="color: #38bdf8;">${comp.sedes.join(', ')}</strong>`;
    } else {
      sedesSubtitle.textContent = 'Flota Oficial de Autotransporte TrackSIM';
    }
  }

  const totalDriversEl = document.getElementById('companyStatTotalDrivers');
  if (totalDriversEl) totalDriversEl.textContent = `${comp.totalConductores} operadores`;

  const totalEvalsEl = document.getElementById('companyStatTotalEvals');
  if (totalEvalsEl) totalEvalsEl.textContent = `${comp.totalEvaluaciones} reportes`;

  const avgScoreEl = document.getElementById('companyStatAvgScore');
  if (avgScoreEl) avgScoreEl.textContent = `${comp.promedioFinal.toFixed(2)} / 10`;

  const approvalRateEl = document.getElementById('companyStatApprovalRate');
  if (approvalRateEl) approvalRateEl.textContent = `${comp.tasaAprobacion.toFixed(1)}%`;

  // 2. Tabla / Roster de Operadores de la Empresa (se renderiza primero inmediatamente para mostrar datos al instante)
  const searchInput = document.getElementById('companyDriverSearch');
  const currentSearch = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderCompanyDriversTable(currentSearch);

  // 3. Gráficos de la Empresa (se difieren un tick con requestAnimationFrame para que la vista y tabla aparezcan en 0ms sin trabas)
  requestAnimationFrame(() => {
    if (AppState.currentTab !== 'empresas') return;
    renderCompanyRankingChart('companyRankingChartCanvas', comp.conductores, currentSearch, companyRankingCurrentPage, COMPANY_RANKING_PAGE_SIZE);
    renderCompanySimulationsChart('companySimulationsChartCanvas', comp, currentSearch);
  });
}

function renderCompanyDriversTable(filterSearch = '') {
  const comp = AppState.selectedCompany;
  const tbody = document.getElementById('companyDriversTableBody');
  const countBadge = document.getElementById('companyDriversCountBadge');
  if (!comp || !tbody) return;

  const paginationBar = document.getElementById('companyDriversPaginationBar');
  const paginationInfo = document.getElementById('companyDriversPaginationInfo');
  const pageDisplay = document.getElementById('companyDriversCurrentPageDisplay');
  const firstBtn = document.getElementById('companyDriversFirstPageBtn');
  const prevBtn = document.getElementById('companyDriversPrevPageBtn');
  const nextBtn = document.getElementById('companyDriversNextPageBtn');
  const lastBtn = document.getElementById('companyDriversLastPageBtn');

  let list = comp.conductores ? [...comp.conductores] : [];
  if (filterSearch) {
    list = list.filter(c => c.nombre.toLowerCase().includes(filterSearch));
  }

  // Ordenamiento interactivo por encabezados
  const sortCol = AppState.companyTableSort?.column || 'promedioScore';
  const sortDir = AppState.companyTableSort?.direction || 'desc';

  list.sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'nombre':
        cmp = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base', numeric: true });
        break;
      case 'totalEvaluaciones':
        cmp = (a.totalEvaluaciones || 0) - (b.totalEvaluaciones || 0);
        break;
      case 'ultimaFecha': {
        const ta = parseDateToTimestamp(a.ultimaFecha);
        const tb = parseDateToTimestamp(b.ultimaFecha);
        cmp = ta - tb;
        break;
      }
      case 'promedioScore':
        cmp = (a.promedioScore || 0) - (b.promedioScore || 0);
        break;
      case 'simulaciones': {
        const sa = getConductorSimScore(a);
        const sb = getConductorSimScore(b);
        cmp = sa - sb;
        break;
      }
      case 'incidentes': {
        const totalA = (a.colisiones || 0) + (a.fatalidades || 0) + (a.totalFueraVia || 0);
        const totalB = (b.colisiones || 0) + (b.fatalidades || 0) + (b.totalFueraVia || 0);
        cmp = totalA - totalB;
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
          cmp = (a.promedioScore || 0) - (b.promedioScore || 0);
        }
        break;
      }
      default:
        cmp = (a.promedioScore || 0) - (b.promedioScore || 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  updateCompanyTableSortHeaders(sortCol, sortDir);

  const totalDrivers = list.length;
  if (countBadge) countBadge.textContent = `${totalDrivers} operador${totalDrivers === 1 ? '' : 'es'}`;

  if (totalDrivers === 0) {
    if (paginationBar) paginationBar.style.display = 'none';
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No se encontraron operadores que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  // Paginación de registros por página
  const pageSize = COMPANY_DRIVERS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalDrivers / pageSize));
  companyDriversCurrentPage = Math.min(Math.max(1, companyDriversCurrentPage), totalPages);

  const startIndex = (companyDriversCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalDrivers);
  const pagedList = list.slice(startIndex, endIndex);

  // Actualizar barra de paginación
  if (paginationBar) paginationBar.style.display = 'flex';
  if (paginationInfo) paginationInfo.textContent = `Mostrando operadores ${startIndex + 1}-${endIndex} de ${totalDrivers}`;
  if (pageDisplay) pageDisplay.textContent = `Página ${companyDriversCurrentPage} de ${totalPages}`;
  if (firstBtn) firstBtn.disabled = companyDriversCurrentPage === 1;
  if (prevBtn) prevBtn.disabled = companyDriversCurrentPage === 1;
  if (nextBtn) nextBtn.disabled = companyDriversCurrentPage === totalPages;
  if (lastBtn) lastBtn.disabled = companyDriversCurrentPage === totalPages;

  tbody.innerHTML = pagedList.map((c, idx) => {
    const globalIdx = startIndex + idx + 1;
    const n2 = (c.simulacionesNombres && c.simulacionesNombres[2]) || 'Montaña';
    const n3 = (c.simulacionesNombres && c.simulacionesNombres[3]) || 'Sierra';
    const n4 = (c.simulacionesNombres && c.simulacionesNombres[4]) || 'S4';
    const s2 = c.simulaciones.simulacion_2 != null ? c.simulaciones.simulacion_2 : '-';
    const s3 = c.simulaciones.simulacion_3 != null ? c.simulaciones.simulacion_3 : '-';
    const s4 = c.simulaciones.simulacion_4 != null ? c.simulaciones.simulacion_4 : '-';

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
            <div style="width: 28px; height: 28px; min-width: 28px; border-radius: 50%; background: rgba(56, 189, 248, 0.15); color: #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">
              ${globalIdx}
            </div>
            <div style="min-width: 0;">
              <div style="font-weight: 600; color: #ffffff; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.nombre}">${c.nombre}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${(comp.esGlobal || comp.nombre === 'Todas las empresas') && c.empresa ? `<strong style="color: #38bdf8;">🏢 ${c.empresa}</strong> • ` : ''}ID: ${c.latestEvalId ? c.latestEvalId.substring(0, 16) : 'N/A'}
              </div>
            </div>
          </div>
        </td>
        <td>
          <span style="font-weight: 600;">${c.totalEvaluaciones}</span> <small style="color: var(--text-muted);">sesion${c.totalEvaluaciones > 1 ? 'es' : ''}</small>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${c.ultimaFecha || 'N/A'}</td>
        <td>
          <span class="score-pill" style="color: #38bdf8; font-weight: 700;">
            ${c.promedioScore.toFixed(2)}
            <small style="color: var(--text-muted); font-size: 0.7rem;">/ 10</small>
          </span>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">Último: ${c.ultimoScore.toFixed(2)}</div>
        </td>
        <td>
          <ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; line-height: 1.35; max-width: 260px;">
            ${(() => {
        if (c.promediosEjercicios && Object.keys(c.promediosEjercicios).length > 0) {
          const exKeys = Object.keys(c.promediosEjercicios);
          return exKeys.map((k, i) => {
            const ex = c.promediosEjercicios[k];
            const repText = ex.totalVeces > 1 ? ` (${ex.totalVeces} sesiones)` : '';
            const bulletColor = ['#38bdf8', '#f97316', '#a855f7', '#22c55e', '#eab308'][i % 5];
            return `<li style="display: flex; align-items: baseline; gap: 0.4rem; color: #f1f5f9;" title="Ejercicio: ${ex.nombre}${repText} (Calificación: ${ex.promedio}/10)">
              <span style="color: ${bulletColor}; font-size: 0.55rem; line-height: 1;">●</span>
              <span>${ex.nombre}</span>
            </li>`;
          }).join('');
        }

        // Si existen ejercicios registrados en el objeto del conductor
        if (Array.isArray(c.ejercicios) && c.ejercicios.length > 0) {
          return c.ejercicios.map((ex, i) => {
            const bulletColor = ['#38bdf8', '#f97316', '#a855f7', '#22c55e', '#eab308'][i % 5];
            return `<li style="display: flex; align-items: baseline; gap: 0.4rem; color: #f1f5f9;" title="${ex.nombre} (Calificación: ${ex.calificacion ?? '-'})">
              <span style="color: ${bulletColor}; font-size: 0.65rem; line-height: 1;">●</span>
              <span>${ex.nombre}</span>
            </li>`;
          }).join('');
        }

        // Fallback para simulaciones genéricas históricas
        return `
          <li style="display: flex; align-items: baseline; gap: 0.4rem; color: #f1f5f9;" title="Simulación: ${n2} (Calificación: ${s2})">
            <span style="color: #38bdf8; font-size: 0.65rem; line-height: 1;">●</span>
            <span>${n2}</span>
          </li>
          <li style="display: flex; align-items: baseline; gap: 0.4rem; color: #f1f5f9;" title="Simulación: ${n3} (Calificación: ${s3})">
            <span style="color: #f97316; font-size: 0.65rem; line-height: 1;">●</span>
            <span>${n3}</span>
          </li>
          <li style="display: flex; align-items: baseline; gap: 0.4rem; color: #f1f5f9;" title="Simulación: ${n4} (Calificación: ${s4})">
            <span style="color: #a855f7; font-size: 0.65rem; line-height: 1;">●</span>
            <span>${n4}</span>
          </li>
        `;
      })()}
          </ul>
        </td>
        <td>
          ${(() => {
        const totalIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);
        const isDanger = totalIncidentes > 0;
        return `
              <span style="color: ${isDanger ? 'var(--danger)' : 'var(--success)'}; font-size: 0.82rem; font-weight: 700; padding: 0.3rem 0.65rem; text-align: center; display: inline-block; width: 100%;"
                    title="${c.colisiones || 0} colisiones, ${c.fatalidades || 0} fatalidades, ${c.totalFueraVia || 0} fuera de vía">
                ${totalIncidentes}
              </span>
            `;
      })()}
        </td>
        <td>
          <span class="badge badge-${c.badgeColor}">${c.estado}</span>
        </td>
        <td class="actions-col">
          <div class="table-actions" style="display: flex; flex-direction: column; gap: 0.25rem; align-items: stretch; min-width: 50px;">
            <button class="btn btn-primary btn-sm" onclick="window.openDriverReportsPrompt('${c.nombre.replace(/'/g, "\\'")}')" title="Ver reporte individual de evaluación (${c.totalEvaluaciones} registrado${c.totalEvaluaciones === 1 ? '' : 's'})" style="justify-content: center; width: auto; font-size: 0.72rem; padding: 0.4rem 0.35rem; line-height: 1.2;">
              📄 Reporte${c.totalEvaluaciones > 1 ? `s (${c.totalEvaluaciones})` : ''}
            </button>
            ${c.totalEvaluaciones > 1 ? `
              <button class="btn btn-secondary btn-sm" onclick="window.inspectDriverEvolucion('${c.nombre.replace(/'/g, "\\'")}')" title="Ver curva de evolución y trazabilidad del conductor" style="justify-content: center; width: auto; font-size: 0.72rem; padding: 0.4rem 0.35rem; line-height: 1.2;">
                📈 Trazabilidad
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// VISTA: DIRECTORIO & FILTROS
// ==========================================
// MODAL: REPORTE DIGITAL INDIVIDUAL
// ==========================================
function initModals() {
  const modal = document.getElementById('evaluationModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  const closeFooterBtn = document.getElementById('modalCloseFooterBtn');
  const modalDeleteBtn = document.getElementById('modalDeleteBtn');
  let currentModalItem = null;

  const hide = () => {
    modal.classList.remove('active');
    currentModalItem = null;
  };

  if (closeBtn) closeBtn.addEventListener('click', hide);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', hide);

  if (modalDeleteBtn) {
    modalDeleteBtn.addEventListener('click', async () => {
      if (!currentModalItem) return;
      await window.confirmDeleteEvaluation(currentModalItem.id, currentModalItem.conductor);
      hide();
    });
  }

  const modalEditBtn = document.getElementById('modalEditBtn');
  if (modalEditBtn) {
    modalEditBtn.addEventListener('click', () => {
      if (!currentModalItem) return;
      openEditSingleEvaluationModal(currentModalItem.id);
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });

  // Exponer al scope global para botones inline
  window.viewEvaluationDetail = (evalId) => {
    const item = AppState.evaluations.find(e => e.id === evalId);
    if (!item) return;
    currentModalItem = item;

    document.getElementById('modalTitle').textContent = `Reporte de Evaluación - ${item.conductor}`;
    document.getElementById('modalDriver').textContent = item.conductor;
    document.getElementById('modalCompany').textContent = item.empresa || 'N/A';
    const sedeEl = document.getElementById('modalSedeText');
    if (sedeEl) sedeEl.textContent = item.sede || 'No especificada';
    document.getElementById('modalDate').textContent = item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte;
    document.getElementById('modalCourse').textContent = `${item.cursoCodigo} - ${item.cursoNombre}`;
    document.getElementById('modalInstructor').textContent = item.instructor || 'Mario Agraz';
    document.getElementById('modalFolio').textContent = item.folioGrupo || '1';

    // Calificaciones
    document.getElementById('modalScoreHab').textContent = `${(item.habilidadesManejoPuntos || 0).toFixed(2)} / 3.0 (${item.habilidadesManejoPct || 0}%)`;
    document.getElementById('modalScoreSim').textContent = `${(item.practicaSimuladorPuntos || 0).toFixed(2)} / 7.0 (${item.practicaSimuladorPct || 0}%)`;
    document.getElementById('modalScoreFinal').textContent = `${(item.evaluacionFinalPuntos || 0).toFixed(2)} / 10.0 (${item.evaluacionFinalPct || 0}%)`;
    document.getElementById('modalScoreExact').textContent = item.calificacionExacta || item.evaluacionFinalPuntos || '0.00';

    // Renderizado dinámico de los ejercicios evaluados en simulador (Página 4 y 5)
    const simContainer = document.getElementById('modalSimulationsContainer');
    if (simContainer) {
      let ejerciciosToRender = [];
      if (Array.isArray(item.ejercicios) && item.ejercicios.length > 0) {
        ejerciciosToRender = item.ejercicios;
      } else {
        // Fallback para evaluaciones históricas anteriores
        ejerciciosToRender = [
          { numero: 2, nombre: 'Montaña', descripcion: 'Conducción en Montaña con uso de frenos auxiliares.', calificacion: item.simulacionesDetalle?.simulacion_2 },
          { numero: 3, nombre: 'Sierra', descripcion: 'Conducción en Sierra con condiciones adversas de baja tracción.', calificacion: item.simulacionesDetalle?.simulacion_3 },
          { numero: 4, nombre: 'Maniobras / Niebla', descripcion: 'Conducción bajo condiciones críticas o adversas.', calificacion: item.simulacionesDetalle?.simulacion_4 }
        ];
      }

      const getIcon = (name) => {
        const n = (name || '').toLowerCase();
        if (n.includes('montaña') || n.includes('montana')) return '🏔️';
        if (n.includes('sierra')) return '🌲';
        if (n.includes('niebla') || n.includes('neblina')) return '🌫️';
        if (n.includes('maniobra')) return '🏙️';
        return '🎯';
      };

      const getScoreColor = (score) => {
        if (score == null) return '#94a3b8';
        if (score >= 9.0) return '#10b981';
        if (score >= 8.0) return '#38bdf8';
        if (score >= 6.0) return '#f59e0b';
        return '#ef4444';
      };

      simContainer.innerHTML = ejerciciosToRender.map(e => {
        const icon = getIcon(e.nombre);
        const scoreVal = e.calificacion != null ? e.calificacion : (item.simulacionesDetalle?.[`simulacion_${e.numero}`] ?? null);
        const scoreColor = getScoreColor(scoreVal);
        const scoreText = scoreVal != null ? `${scoreVal} <small style="font-size: 0.68rem; color: var(--text-muted);">/ 10</small>` : '<span style="color: var(--text-muted); font-size: 0.75rem;">Pendiente</span>';

        return `
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; transition: background 0.2s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
              <span style="font-weight: 600; font-size: 0.82rem; color: #f8fafc; display: flex; align-items: center; gap: 0.35rem;">
                <span>${icon}</span>
                <span>Simulación ${e.numero}:</span>
                <strong style="color: #38bdf8;">${e.nombre}</strong>
              </span>
              <span style="font-size: 0.85rem; font-weight: 700; color: ${scoreColor}; background: rgba(0, 0, 0, 0.25); padding: 0.15rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
                ${scoreText}
              </span>
            </div>
            ${e.descripcion ? `<p style="font-size: 0.73rem; color: var(--text-muted); margin: 0; line-height: 1.35; padding-left: 1.4rem;">${e.descripcion}</p>` : ''}
          </div>
        `;
      }).join('');
    }

    // Incidentes
    document.getElementById('modalCollisions').textContent = item.colisiones || 0;
    document.getElementById('modalFatalities').textContent = item.fatalidades || 0;
    document.getElementById('modalOffRoad').textContent = item.vehiculoFueraVia || 0;

    // Estado & Firma
    const badgeEl = document.getElementById('modalStatusBadge');
    badgeEl.className = `badge badge-${item.badgeColor}`;
    badgeEl.textContent = item.estado;

    document.getElementById('modalDigitalSign').textContent = item.firmaDigital || 'Sin firma digital registrada';
    document.getElementById('modalObservations').textContent = item.observaciones || 'Reporte procesado exitosamente por TrackSIM Cloud.';

    modal.classList.add('active');
  };

  // Configuración de modal de selección de reporte para operadores con múltiples evaluaciones
  const pickerModal = document.getElementById('driverReportPickerModal');
  const closePickerModalBtn = document.getElementById('closePickerModalBtn');
  const cancelPickerModalBtn = document.getElementById('cancelPickerModalBtn');
  const hidePicker = () => {
    if (pickerModal) pickerModal.classList.remove('active');
  };
  if (closePickerModalBtn) closePickerModalBtn.addEventListener('click', hidePicker);
  if (cancelPickerModalBtn) cancelPickerModalBtn.addEventListener('click', hidePicker);
  if (pickerModal) {
    pickerModal.addEventListener('click', (e) => {
      if (e.target === pickerModal) hidePicker();
    });
  }

  // Inicializar modal de gestión de usuarios lectores
  initUserManagement();
}

// TOAST NOTIFICATIONS
// ==========================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '⚡';

  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
