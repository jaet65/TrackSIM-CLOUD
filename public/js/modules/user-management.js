/**
 * TrackSIM CLOUD - User Management Module
 * Administración de usuarios lectores, creación con secondaryAuth,
 * edición de perfiles y asignación de empresas/dominios.
 */

import {
  auth,
  db,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  secondaryAuth,
  createUserWithEmailAndPassword
} from '../firebase-config.js';
import { showToast } from './toast.js';

/**
 * Obtiene la lista completa de todas las empresas conocidas en el sistema
 */
function getAllKnownCompanies() {
  const compSet = new Set();
  // Desde evaluaciones activas
  if (AppState.evaluations && AppState.evaluations.length > 0) {
    AppState.evaluations.forEach(e => {
      const emp = (e.empresa || '').trim();
      if (emp) compSet.add(emp);
    });
  }
  // También desde localStorage o catálogo por si el usuario actual es un lector restringido
  try {
    const local = localStorage.getItem('tracksim_cloud_evaluaciones');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        parsed.forEach(e => {
          const emp = (e.empresa || '').trim();
          if (emp) compSet.add(emp);
        });
      }
    }
  } catch (err) {
    console.debug('Error reading local evaluations for companies', err);
  }
  return Array.from(compSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Llena un elemento select con la lista de empresas registradas
 */
function populateCompanyDropdown(selectId, selectedCompany = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const companies = getAllKnownCompanies();

  let html = `<option value="">-- Seleccionar Empresa --</option>`;
  html += `<option value="all" ${selectedCompany === 'all' ? 'selected' : ''}>🌐 Todas las Empresas (Sin restricción)</option>`;

  companies.forEach(emp => {
    html += `<option value="${emp}" ${emp === selectedCompany ? 'selected' : ''}>🏢 ${emp}</option>`;
  });

  select.innerHTML = html;
}

/**
 * Gestión de Usuarios Lectores (Creación por Administrador con SecondaryAuth y Edición)
 */
function initUserManagement() {
  const mgmtModal = document.getElementById('userMgmtModal');
  const openBtn = document.getElementById('openUserMgmtBtn');
  const closeBtn = document.getElementById('closeUserMgmtBtn');
  const closeFooterBtn = document.getElementById('closeUserMgmtFooterBtn');
  const createForm = document.getElementById('adminCreateUserForm');

  // Modal de edición
  const editModal = document.getElementById('editUserModal');
  const closeEditBtn = document.getElementById('closeEditUserBtn');
  const cancelEditBtn = document.getElementById('cancelEditUserBtn');
  const editForm = document.getElementById('editUserForm');

  if (!mgmtModal) return;

  const showModal = async () => {
    if (AppState.userRole !== 'admin') {
      showToast('Acceso restringido: Exclusivo para administradores.', 'warning');
      return;
    }
    populateCompanyDropdown('newViewerCompanySelect', '');
    populateCompanyDropdown('newDomainCompanySelect', '');
    mgmtModal.classList.add('active');
    await Promise.all([loadRegisteredUsers(), loadRegisteredDomains()]);
  };

  const hideModal = () => {
    mgmtModal.classList.remove('active');
  };

  const hideEditModal = () => {
    if (editModal) editModal.classList.remove('active');
  };

  if (openBtn) openBtn.addEventListener('click', showModal);
  if (closeBtn) closeBtn.addEventListener('click', hideModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', hideModal);

  mgmtModal.addEventListener('click', (e) => {
    if (e.target === mgmtModal) hideModal();
  });

  if (closeEditBtn) closeEditBtn.addEventListener('click', hideEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', hideEditModal);
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) hideEditModal();
    });
  }

  // Formulario para vincular Dominio Corporativo a Empresa
  const domainForm = document.getElementById('adminDomainForm');
  if (domainForm) {
    domainForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const domainInput = document.getElementById('newDomainInput');
      const companySelect = document.getElementById('newDomainCompanySelect');
      const submitBtn = document.getElementById('btnSubmitDomain');

      let domain = (domainInput.value || '').toLowerCase().trim();
      // Limpiar prefijo @ o https:// si el usuario lo escribió
      domain = domain.replace(/^https?:\/\//i, '').replace(/^@/, '').split('/')[0].trim();
      const empresa = companySelect ? companySelect.value.trim() : '';

      if (!domain || !domain.includes('.')) {
        showToast('Por favor ingrese un dominio válido (ej: almex.com).', 'warning');
        return;
      }

      if (!empresa) {
        showToast('Por favor seleccione una empresa para asociar al dominio.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Vinculando...';

      try {
        const domainDocRef = doc(db, 'dominios_empresas', domain);
        await setDoc(domainDocRef, {
          dominio: domain,
          empresa: empresa,
          registradoPor: auth.currentUser?.email || 'admin@corporativomaf.com',
          fechaRegistro: new Date().toISOString()
        });

        showToast(`Dominio @${domain} vinculado exitosamente a "${empresa}".`, 'success');
        domainForm.reset();
        populateCompanyDropdown('newDomainCompanySelect', '');
        await loadRegisteredDomains();
      } catch (err) {
        console.error('Error al registrar dominio:', err);
        showToast('Error al registrar el dominio corporativo en Firestore.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔗 Vincular Dominio';
      }
    });
  }

  // Creación de nuevo usuario
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('newViewerEmail');
      const passInput = document.getElementById('newViewerPassword');
      const companySelect = document.getElementById('newViewerCompanySelect');
      const submitBtn = document.getElementById('btnSubmitCreateUser');

      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;
      const empresaPermitida = companySelect ? companySelect.value.trim() : '';

      if (!email || !password || password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres.', 'warning');
        return;
      }

      if (!empresaPermitida) {
        showToast('Por favor seleccione una empresa para el usuario.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando usuario...';

      try {
        // Crear usuario en instancia secundaria para no cerrar la sesión del admin
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth);

        // Guardar registro en colección usuarios de Firestore con empresa permitida
        const userDocRef = doc(db, 'usuarios', cred.user.uid);
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          email: email,
          role: 'viewer',
          empresaPermitida: empresaPermitida,
          empresasPermitidas: [empresaPermitida],
          creadoPor: auth.currentUser?.email || 'admin@corporativomaf.com',
          fechaAlta: new Date().toISOString()
        });

        showToast(`Usuario lector ${email} creado para la empresa ${empresaPermitida}.`, 'success');
        createForm.reset();
        populateCompanyDropdown('newViewerCompanySelect', '');
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

  // Guardar cambios al editar usuario
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = document.getElementById('editUserUid').value;
      const email = document.getElementById('editUserEmail').value;
      const companySelect = document.getElementById('editUserCompanySelect');
      const saveBtn = document.getElementById('saveEditUserBtn');
      const empresaPermitida = companySelect ? companySelect.value.trim() : '';

      if (!uid) {
        showToast('No se identificó el usuario a editar.', 'error');
        return;
      }

      if (!empresaPermitida) {
        showToast('Por favor seleccione una empresa.', 'warning');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';

      try {
        const userDocRef = doc(db, 'usuarios', uid);
        await updateDoc(userDocRef, {
          empresaPermitida: empresaPermitida,
          empresasPermitidas: [empresaPermitida]
        });

        showToast(`Empresa actualizada a "${empresaPermitida}" para ${email}.`, 'success');
        hideEditModal();
        await loadRegisteredUsers();
      } catch (err) {
        console.error('Error al actualizar permisos de usuario:', err);
        showToast('Error al actualizar la empresa del usuario.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar Cambios';
      }
    });
  }
}

// Ventana flotante de edición de usuario
window.openEditUserModal = function (userJsonStr) {
  try {
    const user = JSON.parse(decodeURIComponent(userJsonStr));
    const editModal = document.getElementById('editUserModal');
    const uidInput = document.getElementById('editUserUid');
    const emailInput = document.getElementById('editUserEmail');
    const subtitle = document.getElementById('editUserSubtitle');

    if (!editModal || !uidInput || !emailInput) return;

    uidInput.value = user.uid;
    emailInput.value = user.email;
    if (subtitle) {
      subtitle.textContent = `Asignación de empresa para ${user.email}`;
    }

    const assignedCompany = user.empresaPermitida !== undefined ? user.empresaPermitida : (Array.isArray(user.empresasPermitidas) && user.empresasPermitidas.length > 0 ? user.empresasPermitidas[0] : '');
    populateCompanyDropdown('editUserCompanySelect', assignedCompany);

    editModal.classList.add('active');
  } catch (err) {
    console.error('Error abriendo modal de edición:', err);
    showToast('Error al abrir el editor de usuario.', 'error');
  }
};

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
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            No se han registrado usuarios lectores aún.
          </td>
        </tr>
      `;
      return;
    }

    const users = [];
    snapshot.forEach(docSnap => users.push({ uid: docSnap.id, ...docSnap.data() }));

    tbody.innerHTML = users.map(u => {
      const assigned = u.empresaPermitida !== undefined ? u.empresaPermitida : (Array.isArray(u.empresasPermitidas) && u.empresasPermitidas.length > 0 ? u.empresasPermitidas[0] : '');
      let companyBadgeHtml = '';
      if (!assigned || assigned === '') {
        companyBadgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.75rem; padding: 3px 8px;">⚠️ Sin Asignar</span>`;
      } else if (assigned === 'all') {
        companyBadgeHtml = `<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.3); font-size: 0.75rem; padding: 3px 8px;">🌐 Todas</span>`;
      } else {
        companyBadgeHtml = `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">🏢 ${assigned}</span>`;
      }

      const encodedUser = encodeURIComponent(JSON.stringify(u));
      const creadorDisplay = u.creadoPor || (u.metodoAcceso === 'google' ? 'Google (Autoregistro)' : (u.autoregistro ? 'Autoregistro' : 'Admin'));

      return `
        <tr>
          <td><strong>${u.email}</strong></td>
          <td><span class="role-badge viewer">👁️ Lector</span></td>
          <td>${companyBadgeHtml}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${creadorDisplay}</td>
          <td style="font-size: 0.8rem;">${u.fechaAlta ? new Date(u.fechaAlta).toLocaleDateString() : 'N/A'}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;" onclick="window.openEditUserModal('${encodedUser}')" title="Editar empresa autorizada">
              ✏️ Editar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('No se pudo cargar la lista de usuarios:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          Sin registros disponibles o modo local.
        </td>
      </tr>
    `;
  }
}

/**
 * Consulta y lista los dominios corporativos vinculados en Firestore
 */
async function loadRegisteredDomains() {
  const tbody = document.getElementById('registeredDomainsTableBody');
  if (!tbody) return;

  try {
    const q = query(collection(db, 'dominios_empresas'), orderBy('fechaRegistro', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            No se han registrado dominios corporativos aún. Agregue uno arriba (ej. <code>almex.com</code>).
          </td>
        </tr>
      `;
      return;
    }

    const domains = [];
    snapshot.forEach(docSnap => domains.push({ id: docSnap.id, ...docSnap.data() }));

    tbody.innerHTML = domains.map(d => {
      const assigned = d.empresa || 'all';
      let companyBadgeHtml = '';
      if (assigned === 'all' || !assigned) {
        companyBadgeHtml = `<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.3); font-size: 0.75rem; padding: 3px 8px;">🌐 Todas</span>`;
      } else {
        companyBadgeHtml = `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">🏢 ${assigned}</span>`;
      }

      return `
        <tr>
          <td><code style="background: rgba(255,255,255,0.06); padding: 3px 6px; border-radius: 4px; color: var(--primary);">@${d.dominio}</code></td>
          <td>${companyBadgeHtml}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${d.registradoPor || 'Admin'}</td>
          <td style="font-size: 0.8rem;">${d.fechaRegistro ? new Date(d.fechaRegistro).toLocaleDateString() : 'N/A'}</td>
          <td style="text-align: center;">
            <button class="btn btn-danger btn-sm" style="padding: 3px 8px; font-size: 0.75rem; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); color: #f87171;" onclick="window.confirmDeleteDomain('${d.id}', '${d.dominio}', '${assigned}')" title="Eliminar vinculación de dominio">
              🗑️ Desvincular
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('No se pudo cargar la lista de dominios:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          Sin registros disponibles o modo local.
        </td>
      </tr>
    `;
  }
}

// Handler global para eliminar vinculación de dominio
window.confirmDeleteDomain = async function (domainId, domainName, empresa) {
  if (AppState.userRole !== 'admin') {
    showToast('Acción restringida a administradores.', 'warning');
    return;
  }

  if (window.confirm(`¿Estás seguro de que deseas desvincular el dominio @${domainName} de la empresa "${empresa}"?\n\nLos usuarios con este correo ya no tendrán acceso automático a esa empresa.`)) {
    try {
      const domainDocRef = doc(db, 'dominios_empresas', domainId);
      await deleteDoc(domainDocRef);
      showToast(`Dominio @${domainName} desvinculado exitosamente.`, 'info');
      await loadRegisteredDomains();
    } catch (err) {
      console.error('Error al desvincular dominio:', err);
      showToast('Error al desvincular el dominio.', 'error');
    }
  }
};

export {
  initUserManagement,
  getAllKnownCompanies,
  populateCompanyDropdown
};

// Habilitar Hot Module Replacement (HMR)
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('⚡ [HMR] Módulo Gestión de Usuarios actualizado en caliente sin recargar.');
  });
}
