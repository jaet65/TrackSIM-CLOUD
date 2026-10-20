/**
 * TrackSIM CLOUD - Application Main Controller
 * Maneja la navegación, autenticación con Google, ingesta de PDFs,
 * trazabilidad de conductores y sincronización con Firestore.
 */

import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  secondaryAuth,
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy
} from './firebase-config.js';

import {
  getEvaluations,
  saveEvaluation,
  saveBatchEvaluations,
  deleteEvaluation,
  clearAllEvaluations,
  clearLocalCache,
  updateEvaluationsBatchEmpresaSede,
  updateSingleEvaluation,
  processDriverSummaries,
  processCompanySummaries,
  slugify
} from './db.js';

import {
  parsePDFFile,
  NOMBRES_ESTADOS_MEXICO
} from './pdf-parser.js';

import {
  renderEvolutionChart,
  renderComparisonRadarChart,
  renderDistributionChart,
  renderCompanyRankingChart,
  renderCompanySimulationsChart
} from './charts.js';

import {
  findCatalogExercise,
  ensureExerciseDatalist
} from './exercise-catalog.js';

// Estado global de la aplicación
const AppState = {
  user: null,
  userRole: null, // 'admin' | 'viewer'
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

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Limpiar datos de prueba residuales para garantizar inicio limpio
  if (!localStorage.getItem('tracksim_clean_empty_v2')) {
    localStorage.removeItem('tracksim_cloud_evaluaciones');
    localStorage.setItem('tracksim_clean_empty_v2', 'true');
  }

  initNavigation();
  initAuth();
  initDropzone();
  initCompanyView();
  initDirectoryFilters();
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
  if (tabId === 'ingesta' && AppState.userRole !== 'admin') {
    showToast('Acceso denegado: La sección de Ingesta de reportes está reservada para Administradores.', 'warning');
    if (AppState.currentTab === 'ingesta' || !AppState.currentTab) {
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
  if (tabId === 'dashboard') {
    renderDashboard();
  } else if (tabId === 'evolucion') {
    renderEvolutionView();
  } else if (tabId === 'comparativa') {
    renderComparisonView();
  } else if (tabId === 'empresas') {
    renderCompanyView();
  } else if (tabId === 'directorio') {
    renderDirectoryTable();
  }
}

// ==========================================
// AUTENTICACIÓN Y CONTROL DE ROLES
// ==========================================
function showLoginAlert(msg) {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.style.display = 'block';
  }
}

function hideLoginAlert() {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    alertEl.style.display = 'none';
  }
}

function initAuth() {
  const loginScreen = document.getElementById('loginScreen');
  const appContainer = document.getElementById('appContainer');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const viewerLoginForm = document.getElementById('viewerLoginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  // Listener del estado de autenticación
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      AppState.user = null;
      AppState.userRole = null;
      if (loginScreen) loginScreen.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
      return;
    }

    const email = (user.email || '').toLowerCase().trim();
    const isGoogleAuth = user.providerData && user.providerData.some(p => p.providerId === 'google.com');

    // Validación de dominio para Administradores de Google
    if (isGoogleAuth) {
      if (!email.endsWith('@corporativomaf.com')) {
        showLoginAlert(`Acceso denegado: La cuenta ${email} no pertenece al dominio @corporativomaf.com. El acceso con Google está reservado para Administradores.`);
        await signOut(auth);
        return;
      }
      AppState.userRole = 'admin';
    } else {
      // Usuario autenticado por Correo y Contraseña -> Rol Lector
      AppState.userRole = 'viewer';
    }

    AppState.user = user;
    hideLoginAlert();

    // Mostrar aplicación principal y ocultar ventana de login
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    // Configurar interfaz de usuario según rol
    applyRolePermissions(user, AppState.userRole);

    // Cargar datos ahora que estamos autenticados
    await loadAndRefreshData();
  });

  // Acceso Administrador con Google
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      hideLoginAlert();
      googleLoginBtn.disabled = true;
      googleLoginBtn.textContent = 'Conectando con Google...';
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        console.error('Error Google Sign-In:', err);
        if (err.code !== 'auth/popup-closed-by-user') {
          showLoginAlert('Error al autenticar con Google. Intente nuevamente.');
        }
      } finally {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Ingresar con Google (Admin)
        `;
      }
    });
  }

  // Acceso Lector con Correo y Contraseña
  if (viewerLoginForm) {
    viewerLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideLoginAlert();
      const email = document.getElementById('viewerEmail').value.trim();
      const password = document.getElementById('viewerPassword').value;
      const submitBtn = document.getElementById('viewerSubmitBtn');

      if (!email || !password) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Verificando credenciales...';

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error('Error al iniciar sesión con correo:', err);
        let errorMsg = 'Correo o contraseña incorrectos. Verifica tus datos.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          errorMsg = 'Credenciales no autorizadas. Solicita a un Administrador que registre tu cuenta de Lector.';
        } else if (err.code === 'auth/too-many-requests') {
          errorMsg = 'Demasiados intentos fallidos. Por seguridad, intente en unos minutos.';
        }
        showLoginAlert(errorMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesión como Lector';
      }
    });
  }

  // Cerrar sesión
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut(auth);
      showToast('Sesión finalizada correctamente', 'info');
    });
  }
}

/**
 * Ajusta la interfaz según el rol del usuario (Administrador vs Lector)
 */
function applyRolePermissions(user, role) {
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const emailSubEl = document.getElementById('userEmailSubtitle');
  const roleBadgeEl = document.getElementById('userRoleBadge');
  if (roleBadgeEl) roleBadgeEl.remove();
  const openMgmtBtn = document.getElementById('openUserMgmtBtn');
  const navTabIngesta = document.getElementById('navTabIngesta');
  const dashboardNewEvalBtn = document.getElementById('dashboardNewEvalBtn');
  const dashboardGoIngestaBtn = document.getElementById('dashboardGoIngestaBtn');
  const driverEmptyUploadBtn = document.getElementById('driverEmptyUploadBtn');
  const compareEmptyUploadBtn = document.getElementById('compareEmptyUploadBtn');
  const ingestaLockedAlert = document.getElementById('ingestaLockedAlert');
  const uploadZoneWrapper = document.getElementById('uploadZoneWrapper');

  // Asignar clases de rol al body para activar reglas CSS de visibilidad
  document.body.classList.remove('role-admin', 'role-viewer');
  document.body.classList.add(`role-${role}`);

  if (avatarEl) {
    avatarEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=0284c7&color=fff`;
  }
  if (nameEl) {
    nameEl.textContent = user.displayName || user.email.split('@')[0];
  }
  if (emailSubEl) {
    emailSubEl.textContent = user.email;
  }

  if (role === 'admin') {
    if (openMgmtBtn) openMgmtBtn.style.display = 'inline-flex';
    if (navTabIngesta) navTabIngesta.style.display = 'flex';
    if (dashboardNewEvalBtn) dashboardNewEvalBtn.style.display = 'inline-flex';
    if (dashboardGoIngestaBtn) dashboardGoIngestaBtn.style.display = 'inline-flex';
    if (driverEmptyUploadBtn) driverEmptyUploadBtn.style.display = 'inline-flex';
    if (compareEmptyUploadBtn) compareEmptyUploadBtn.style.display = 'inline-flex';
    if (ingestaLockedAlert) ingestaLockedAlert.style.display = 'none';
    if (uploadZoneWrapper) uploadZoneWrapper.style.display = 'block';
  } else {
    // Rol: Lector (Usuario Limitado / Solo Lectura)
    // Ocultar completamente Ingesta de PDFs y cualquier función administrativa
    if (openMgmtBtn) openMgmtBtn.style.display = 'none';
    if (navTabIngesta) navTabIngesta.style.display = 'none';
    if (dashboardNewEvalBtn) dashboardNewEvalBtn.style.display = 'none';
    if (dashboardGoIngestaBtn) dashboardGoIngestaBtn.style.display = 'none';
    if (driverEmptyUploadBtn) driverEmptyUploadBtn.style.display = 'none';
    if (compareEmptyUploadBtn) compareEmptyUploadBtn.style.display = 'none';
    if (ingestaLockedAlert) ingestaLockedAlert.style.display = 'none';
    if (uploadZoneWrapper) uploadZoneWrapper.style.display = 'none';

    // Si el usuario limitado se encuentra en la vista de ingesta, redirigir al Dashboard
    if (AppState.currentTab === 'ingesta') {
      switchTab('dashboard');
    }
  }
}

// ==========================================
// CARGA Y SINCRONIZACIÓN DE DATOS
// ==========================================
async function loadAndRefreshData() {
  try {
    AppState.evaluations = await getEvaluations();
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
      if (!AppState.selectedCompany || !AppState.companies.find(c => c.nombre === AppState.selectedCompany.nombre)) {
        AppState.selectedCompany = AppState.companies[0];
      }
    } else {
      AppState.selectedCompany = null;
    }

    renderDashboard();
    renderEvolutionView();
    renderComparisonView();
    renderCompanyView();
    renderDirectoryTable();
  } catch (e) {
    console.error('Error cargando datos principales:', e);
    showToast('Error al inicializar datos.', 'error');
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
      const emptyMsg = AppState.userRole === 'admin'
        ? "No hay evaluaciones registradas aún. Sube tus archivos PDF en la pestaña 'Ingesta de PDFs'."
        : "No hay evaluaciones registradas aún en el sistema.";
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
function initDropzone() {
  const dropzone = document.getElementById('pdfDropzone');
  const fileInput = document.getElementById('pdfFileInput');
  const loadSamplesBtn = document.getElementById('loadSamplePdfsBtn');
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
        await loadAndRefreshData();
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
    batchSedeSelect.innerHTML = '<option value="">-- Seleccionar Estado --</option>' +
      NOMBRES_ESTADOS_MEXICO.map(st => `<option value="${st}">${st}</option>`).join('');
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
                ${NOMBRES_ESTADOS_MEXICO.map(st => `
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

// ==========================================
// VISTA: TRAZABILIDAD Y EVOLUCIÓN
// ==========================================
function renderEvolutionView() {
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

// ==========================================
// VISTA: COMPARADOR DE CONDUCTORES
// ==========================================
function renderComparisonView() {
  const selectA = document.getElementById('compareDriverA');
  const selectB = document.getElementById('compareDriverB');
  const emptyState = document.getElementById('compareEmptyState');
  const compareContent = document.getElementById('compareContent');

  const drivers = AppState.drivers;
  if (!drivers || drivers.length < 2) {
    if (emptyState) emptyState.style.display = 'block';
    if (compareContent) compareContent.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (compareContent) compareContent.style.display = 'block';

  if (!selectA || !selectB) return;

  const optionsHTML = drivers.map(d => `<option value="${d.slug}">${d.nombre}</option>`).join('');
  selectA.innerHTML = optionsHTML;
  selectB.innerHTML = optionsHTML;

  if (drivers.length > 1) {
    selectB.selectedIndex = 1;
  }

  const updateRadar = () => {
    const dA = drivers.find(d => d.slug === selectA.value) || drivers[0];
    const dB = drivers.find(d => d.slug === selectB.value) || drivers[1] || drivers[0];

    renderComparisonRadarChart('comparisonRadarCanvas', dA, dB);
    renderComparisonCards(dA, dB);
  };

  selectA.onchange = updateRadar;
  selectB.onchange = updateRadar;

  updateRadar();
}

function renderComparisonCards(driverA, driverB) {
  const cardA = document.getElementById('compareCardA');
  const cardB = document.getElementById('compareCardB');
  if (!cardA || !cardB) return;

  function renderCardHTML(d, color) {
    return `
      <div style="border-left: 4px solid ${color}; padding-left: 1rem;">
        <h3 style="color: ${color}; font-size: 1.3rem;">${d.nombre}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${d.empresa}</p>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-top: 1rem;">
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Calificación Actual:</span>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ffffff;">${(d.ultimaCalificacion || 0).toFixed(2)}</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Promedio General:</span>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ffffff;">${(d.promedioCalificacion || 0).toFixed(2)}</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Habilidades Manejo:</span>
            <div style="font-weight: 600; color: #10b981;">${(d.promedioHabilidades || 0).toFixed(2)} / 3.0</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Práctica Simulador:</span>
            <div style="font-weight: 600; color: #a855f7;">${(d.promedioSimulador || 0).toFixed(2)} / 7.0</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Total Incidentes:</span>
            <div style="font-weight: 600; color: ${(d.totalColisiones + d.totalFatalidades) > 0 ? 'var(--danger)' : 'var(--success)'};">
              ${d.totalColisiones} Colisiones / ${d.totalFatalidades} Fatalidades
            </div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Tendencia:</span>
            <div><span class="badge badge-${d.badgeColor}">${d.estadoGeneral}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  cardA.innerHTML = renderCardHTML(driverA, '#38bdf8');
  cardB.innerHTML = renderCardHTML(driverB, '#f59e0b');
}

// ==========================================
// VISTA: INSPECCIÓN DE FLOTAS POR EMPRESA
// ==========================================
function initCompanyView() {
  const select = document.getElementById('companySelect');
  const searchInput = document.getElementById('companyDriverSearch');

  if (select) {
    select.addEventListener('change', (e) => {
      const selectedName = e.target.value;
      AppState.selectedCompany = AppState.companies.find(c => c.nombre === selectedName) || null;
      renderCompanyView();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderCompanyDriversTable(e.target.value.toLowerCase().trim());
    });
  }

  // Listener para re-renderizar o ajustar el gráfico de ranking cuando se abre el colapsable
  const rankingDetails = document.getElementById('companyRankingDetails');
  if (rankingDetails) {
    rankingDetails.addEventListener('toggle', () => {
      if (rankingDetails.open && AppState.selectedCompany) {
        renderCompanyRankingChart('companyRankingChartCanvas', AppState.selectedCompany.conductores);
      }
    });
  }

  // Listener para re-renderizar el gráfico de simulaciones cuando se abre el colapsable
  const simDetails = document.getElementById('companySimulationsDetails');
  if (simDetails) {
    simDetails.addEventListener('toggle', () => {
      if (simDetails.open && AppState.selectedCompany) {
        renderCompanySimulationsChart('companySimulationsChartCanvas', AppState.selectedCompany);
      }
    });
  }

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
    switchTab('evolucion');
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
  const dmMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmMatch) {
    return new Date(parseInt(dmMatch[3], 10), parseInt(dmMatch[2], 10) - 1, parseInt(dmMatch[1], 10)).getTime() || 0;
  }
  const ymMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
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

  // Si no hay empresa seleccionada o la actual ya no existe en el listado, seleccionar la primera
  if (!AppState.selectedCompany || !companies.some(c => c.nombre === AppState.selectedCompany.nombre)) {
    AppState.selectedCompany = companies[0];
  }

  // Actualizar opciones del select
  if (select) {
    const currentVal = AppState.selectedCompany ? AppState.selectedCompany.nombre : '';
    select.innerHTML = companies.map(c => `
      <option value="${c.nombre}" ${c.nombre === currentVal ? 'selected' : ''}>
        🏢 ${c.nombre} ${c.sedes && c.sedes.length > 0 ? `(📍 Sede: ${c.sedes.join(', ')})` : ''} (${c.totalConductores} operadores)
      </option>
    `).join('');
  }

  const comp = AppState.selectedCompany;
  if (!comp) return;

  // 1. Resumen Hero
  const titleEl = document.getElementById('companyNameTitle');
  if (titleEl) titleEl.textContent = comp.nombre;

  const sedesSubtitle = document.getElementById('companySedesSubtitle');
  if (sedesSubtitle) {
    if (comp.sedes && comp.sedes.length > 0) {
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

  // 2. Gráficos de la Empresa
  renderCompanyRankingChart('companyRankingChartCanvas', comp.conductores);
  renderCompanySimulationsChart('companySimulationsChartCanvas', comp);

  // 3. Tabla / Roster de Operadores de la Empresa
  const searchInput = document.getElementById('companyDriverSearch');
  const currentSearch = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderCompanyDriversTable(currentSearch);
}

function renderCompanyDriversTable(filterSearch = '') {
  const comp = AppState.selectedCompany;
  const tbody = document.getElementById('companyDriversTableBody');
  const countBadge = document.getElementById('companyDriversCountBadge');
  if (!comp || !tbody) return;

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
        const totalA = (a.colisiones || 0) + (a.fatalidades || 0);
        const totalB = (b.colisiones || 0) + (b.fatalidades || 0);
        if (totalA !== totalB) {
          cmp = totalA - totalB;
        } else {
          cmp = (a.fatalidades || 0) - (b.fatalidades || 0);
        }
        break;
      }
      case 'estado': {
        const rank = {
          'Sobresaliente': 4,
          'Aprobado': 3,
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

  if (countBadge) countBadge.textContent = `${list.length} operador${list.length === 1 ? '' : 'es'}`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No se encontraron operadores que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((c, idx) => {
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
              ${idx + 1}
            </div>
            <div style="min-width: 0;">
              <div style="font-weight: 600; color: #ffffff; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.nombre}">${c.nombre}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">ID: ${c.latestEvalId ? c.latestEvalId.substring(0, 16) : 'N/A'}</div>
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
          <div style="font-size: 0.76rem; display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; max-width: 250px;">
            ${(() => {
              if (c.promediosEjercicios && Object.keys(c.promediosEjercicios).length > 0) {
                const exKeys = Object.keys(c.promediosEjercicios);
                return exKeys.map((k, i) => {
                  const ex = c.promediosEjercicios[k];
                  const prefix = ex.numero != null ? `S${ex.numero}:` : `${ex.nombre.substring(0, 7)}:`;
                  const repText = ex.totalVeces > 1 ? ` (${ex.totalVeces}x prom)` : '';
                  const color = ['#38bdf8', '#f97316', '#a855f7', '#22c55e', '#eab308'][i % 5];
                  return `<span style="color: ${color};" title="${ex.nombre}${repText}">${prefix} <strong>${ex.promedio}</strong></span>`;
                }).join(' · ');
              }
              return `
                <span style="color: #94a3b8;" title="S2: ${n2}">S2: <strong>${s2}</strong></span> ·
                <span style="color: #f97316;" title="S3: ${n3}">S3: <strong>${s3}</strong></span> ·
                <span style="color: #38bdf8;" title="S4: ${n4}">S4: <strong>${s4}</strong></span>
              `;
            })()}
          </div>
        </td>
        <td>
          <span style="color: ${(c.colisiones + c.fatalidades) > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 600; font-size: 0.8rem;">
            ${c.colisiones} col / ${c.fatalidades} fat
          </span>
        </td>
        <td>
          <span class="badge badge-${c.badgeColor}">${c.estado}</span>
        </td>
        <td class="actions-col">
          <div class="table-actions">
            ${c.totalEvaluaciones > 1 ? `
              <button class="btn btn-secondary btn-sm" onclick="window.inspectDriverEvolucion('${c.nombre.replace(/'/g, "\\'")}')" title="Ver curva de evolución y trazabilidad del conductor">
                📈 Trazabilidad
              </button>
            ` : ''}
            ${c.latestEvalId ? `
              <button class="btn btn-primary btn-sm" onclick="window.viewEvaluationDetail('${c.latestEvalId}')" title="Ver último reporte digital oficial">
                📄 Reporte
              </button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// VISTA: DIRECTORIO & FILTROS
// ==========================================
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

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.filters.search = e.target.value.toLowerCase().trim();
      renderDirectoryTable();
    });
  }

  if (companySelect) {
    companySelect.addEventListener('change', (e) => {
      AppState.filters.empresa = e.target.value;
      renderDirectoryTable();
    });
  }

  if (sedeSelect) {
    sedeSelect.addEventListener('change', (e) => {
      AppState.filters.sede = e.target.value;
      renderDirectoryTable();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      AppState.filters.estado = e.target.value;
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
    else if (total >= 5.0) est = 'Requiere Refuerzo';
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
        else if (val >= 5.0) est = 'Requiere Refuerzo';
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
      ${NOMBRES_ESTADOS_MEXICO.map(st => `<option value="${st}">📍 ${st}</option>`).join('')}
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
      ${NOMBRES_ESTADOS_MEXICO.map(st => `<option value="${st}">📍 ${st}</option>`).join('')}
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
  else if (finalPts >= 5.0) est = 'Requiere Refuerzo';
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
      estado = 'Requiere Refuerzo';
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

  // Extraer empresas únicas presentes en las evaluaciones registradas
  const companies = Array.from(new Set(
    AppState.evaluations
      .map(e => (e.empresa || '').trim())
      .filter(emp => emp.length > 0)
  )).sort((a, b) => a.localeCompare(b));

  if (currentVal !== 'all' && !companies.includes(currentVal)) {
    currentVal = 'all';
    AppState.filters.empresa = 'all';
  }

  companySelect.innerHTML = `
    <option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todas las Empresas (${AppState.evaluations.length})</option>
    ${companies.map(emp => {
    const count = AppState.evaluations.filter(e => (e.empresa || '').trim() === emp).length;
    return `<option value="${emp}" ${emp === currentVal ? 'selected' : ''}>🏢 ${emp} (${count})</option>`;
  }).join('')}
  `;
}

/**
 * Llena dinámicamente las opciones del selector de sede en el directorio
 */
function populateDirectorySedeFilter() {
  const sedeSelect = document.getElementById('filterSede');
  if (!sedeSelect) return;

  let currentVal = AppState.filters.sede || 'all';

  // Extraer sedes únicas presentes en las evaluaciones registradas
  const sedes = Array.from(new Set(
    AppState.evaluations
      .map(e => (e.sede || '').trim())
      .filter(s => s.length > 0)
  )).sort((a, b) => a.localeCompare(b));

  const countWithoutSede = AppState.evaluations.filter(e => !(e.sede || '').trim()).length;

  if (currentVal !== 'all' && currentVal !== '__NONE__' && !sedes.includes(currentVal)) {
    currentVal = 'all';
    AppState.filters.sede = 'all';
  }

  sedeSelect.innerHTML = `
    <option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todas las Sedes (${AppState.evaluations.length})</option>
    ${sedes.map(s => {
    const count = AppState.evaluations.filter(e => (e.sede || '').trim() === s).length;
    return `<option value="${s}" ${s === currentVal ? 'selected' : ''}>📍 ${s} (${count})</option>`;
  }).join('')}
    ${countWithoutSede > 0 ? `<option value="__NONE__" ${currentVal === '__NONE__' ? 'selected' : ''}>⚠️ Sin Sede Asignada (${countWithoutSede})</option>` : ''}
  `;
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
    updateDirectorySelectionUI();
    return;
  }

  tbody.innerHTML = list.map(e => {
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
      f.estado = finalPts >= 8 ? 'Sobresaliente' : finalPts >= 6 ? 'Aprobado' : finalPts >= 5 ? 'Requiere Refuerzo' : 'No Aprobado';
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

  // Inicializar modal de gestión de usuarios lectores
  initUserManagement();
}

/**
 * Gestión de Usuarios Lectores (Creación por Administrador con SecondaryAuth)
 */
function initUserManagement() {
  const mgmtModal = document.getElementById('userMgmtModal');
  const openBtn = document.getElementById('openUserMgmtBtn');
  const closeBtn = document.getElementById('closeUserMgmtBtn');
  const closeFooterBtn = document.getElementById('closeUserMgmtFooterBtn');
  const form = document.getElementById('adminCreateUserForm');

  if (!mgmtModal) return;

  const showModal = async () => {
    if (AppState.userRole !== 'admin') {
      showToast('Acceso restringido: Exclusivo para administradores.', 'warning');
      return;
    }
    mgmtModal.classList.add('active');
    await loadRegisteredUsers();
  };

  const hideModal = () => {
    mgmtModal.classList.remove('active');
  };

  if (openBtn) openBtn.addEventListener('click', showModal);
  if (closeBtn) closeBtn.addEventListener('click', hideModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', hideModal);

  mgmtModal.addEventListener('click', (e) => {
    if (e.target === mgmtModal) hideModal();
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('newViewerEmail');
      const passInput = document.getElementById('newViewerPassword');
      const submitBtn = document.getElementById('btnSubmitCreateUser');

      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;

      if (!email || !password || password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando usuario...';

      try {
        // Crear usuario en instancia secundaria para no cerrar la sesión del admin
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth);

        // Guardar registro en colección usuarios de Firestore
        const userDocRef = doc(db, 'usuarios', cred.user.uid);
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          email: email,
          role: 'viewer',
          creadoPor: auth.currentUser?.email || 'admin@corporativomaf.com',
          fechaAlta: new Date().toISOString()
        });

        showToast(`Usuario lector ${email} creado exitosamente.`, 'success');
        form.reset();
        await loadRegisteredUsers();
      } catch (err) {
        console.error('Error al crear usuario lector:', err);
        let msg = 'Error al registrar el usuario.';
        if (err.code === 'auth/email-already-in-use') {
          msg = 'Este correo electrónico ya está registrado en Firebase.';
        } else if (err.code === 'auth/invalid-email') {
          msg = 'Formato de correo inválido.';
        } else if (err.code === 'auth/weak-password') {
          msg = 'La contraseña es muy débil (mínimo 6 caracteres).';
        }
        showToast(msg, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '➕ Crear Cuenta de Lector';
      }
    });
  }
}

/**
 * Consulta y lista los usuarios creados en Firestore
 */
async function loadRegisteredUsers() {
  const tbody = document.getElementById('registeredUsersTableBody');
  if (!tbody) return;

  try {
    const q = query(collection(db, 'usuarios'), orderBy('fechaAlta', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            No se han registrado usuarios lectores aún.
          </td>
        </tr>
      `;
      return;
    }

    const users = [];
    snapshot.forEach(docSnap => users.push(docSnap.data()));

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.email}</strong></td>
        <td><span class="role-badge viewer">👁️ Lector</span></td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${u.creadoPor || 'Admin'}</td>
        <td style="font-size: 0.8rem;">${u.fechaAlta ? new Date(u.fechaAlta).toLocaleDateString() : 'N/A'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('No se pudo cargar la lista de usuarios:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          Sin registros disponibles o modo local.
        </td>
      </tr>
    `;
  }
}

// ==========================================
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
