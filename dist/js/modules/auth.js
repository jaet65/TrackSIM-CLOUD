/**
 * TrackSIM CLOUD - Auth & Role Permissions Module
 * Maneja la autenticación, roles de usuario, permisos y sesiones.
 */

import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  db,
  doc,
  getDoc,
  setDoc
} from '../firebase-config.js';

export function showLoginAlert(msg) {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.style.display = 'block';
  }
}

export function hideLoginAlert() {
  const alertEl = document.getElementById('loginAlert');
  if (alertEl) {
    alertEl.style.display = 'none';
  }
}

export function initAuth(onAuthSuccess) {
  const loginScreen = document.getElementById('loginScreen');
  const appContainer = document.getElementById('appContainer');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const viewerLoginForm = document.getElementById('viewerLoginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  // Listener del estado de autenticación
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.AppState.user = null;
      window.AppState.userRole = null;
      if (loginScreen) loginScreen.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
      return;
    }

    const email = (user.email || '').toLowerCase().trim();
    const isGoogleAuth = user.providerData && user.providerData.some(p => p.providerId === 'google.com');

    // Determinación de Rol: Exclusivamente @corporativomaf.com es Administrador
    if (email.endsWith('@corporativomaf.com')) {
      window.AppState.userRole = 'admin';
      window.AppState.allowedCompanies = ['all'];
    } else {
      window.AppState.userRole = 'viewer';
      window.AppState.allowedCompanies = [];

      try {
        const emailParts = email.split('@');
        const userDomain = emailParts.length > 1 ? emailParts[1].trim() : '';
        let domainMatchedCompany = null;

        // 1. Verificar si el dominio de correo está registrado en dominios_empresas
        if (userDomain) {
          try {
            const domainDocRef = doc(db, 'dominios_empresas', userDomain);
            const domainSnap = await getDoc(domainDocRef);
            if (domainSnap.exists()) {
              const dData = domainSnap.data();
              if (dData.empresa) {
                domainMatchedCompany = dData.empresa;
              }
            }
          } catch (domainErr) {
            console.warn('Error verificando asignación por dominio:', domainErr);
          }
        }

        // 2. Si el usuario ingresó por primera vez y no existe documento en 'usuarios', crearlo
        const userDocRef = doc(db, 'usuarios', user.uid);
        let userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
          const newUserData = {
            uid: user.uid,
            email: email,
            role: 'viewer',
            empresaPermitida: domainMatchedCompany || '',
            empresasPermitidas: domainMatchedCompany ? [domainMatchedCompany] : [],
            metodoAcceso: isGoogleAuth ? 'google' : 'password',
            creadoPor: isGoogleAuth ? 'Google (Autoregistro)' : 'Autoregistro',
            autoregistro: true,
            dominioDetectado: userDomain,
            fechaAlta: new Date().toISOString()
          };
          try {
            await setDoc(userDocRef, newUserData);
            userSnap = await getDoc(userDocRef);
          } catch (regDocErr) {
            console.warn('Error al autoguardar documento de usuario en Firestore:', regDocErr);
          }
        }

        // 3. Determinar empresa permitida
        if (domainMatchedCompany) {
          window.AppState.allowedCompanies = domainMatchedCompany === 'all' ? ['all'] : [domainMatchedCompany];
        } else if (userSnap && userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.empresaPermitida && uData.empresaPermitida !== '') {
            window.AppState.allowedCompanies = uData.empresaPermitida === 'all' ? ['all'] : [uData.empresaPermitida];
          } else if (Array.isArray(uData.empresasPermitidas) && uData.empresasPermitidas.length > 0) {
            window.AppState.allowedCompanies = uData.empresasPermitidas;
          } else {
            window.AppState.allowedCompanies = [];
          }
        } else {
          window.AppState.allowedCompanies = [];
        }
      } catch (err) {
        console.warn('No se pudo determinar la empresa asignada en Firestore:', err);
        window.AppState.allowedCompanies = [];
      }
    }

    window.AppState.user = user;
    hideLoginAlert();

    // Mostrar aplicación principal y ocultar login
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    applyRolePermissions(user, window.AppState.userRole);

    if (typeof onAuthSuccess === 'function') {
      await onAuthSuccess();
    }
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
          Acceso con Google
        `;
      }
    });
  }

  // Acceso Usuario Lector con Correo y Contraseña
  if (viewerLoginForm) {
    viewerLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideLoginAlert();

      const email = (document.getElementById('viewerEmail').value || '').trim().toLowerCase();
      const password = document.getElementById('viewerPassword').value;
      const submitBtn = document.getElementById('viewerSubmitBtn') || document.getElementById('viewerLoginBtn');

      if (!email || !password) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';
      }

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error('Error de login de lector:', err);
        let errorMsg = 'No se pudo iniciar sesión. Verifique sus credenciales.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          errorMsg = 'Correo electrónico o contraseña incorrectos.';
        } else if (err.code === 'auth/invalid-email') {
          errorMsg = 'El formato del correo electrónico no es válido.';
        } else if (err.code === 'auth/user-disabled') {
          errorMsg = 'Esta cuenta ha sido deshabilitada por el administrador.';
        }
        showLoginAlert(errorMsg);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Iniciar Sesión';
        }
      }
    });
  }

  // Tabs de Login vs Registro
  const authTabLogin = document.getElementById('authTabLogin');
  const authTabRegister = document.getElementById('authTabRegister');
  const viewerRegisterForm = document.getElementById('viewerRegisterForm');

  if (authTabLogin && authTabRegister) {
    authTabLogin.addEventListener('click', () => {
      hideLoginAlert();
      authTabLogin.classList.add('active');
      authTabRegister.classList.remove('active');
      if (viewerLoginForm) viewerLoginForm.style.display = 'block';
      if (viewerRegisterForm) viewerRegisterForm.style.display = 'none';
    });

    authTabRegister.addEventListener('click', () => {
      hideLoginAlert();
      authTabRegister.classList.add('active');
      authTabLogin.classList.remove('active');
      if (viewerLoginForm) viewerLoginForm.style.display = 'none';
      if (viewerRegisterForm) viewerRegisterForm.style.display = 'block';
    });
  }

  // Actualizar pista de dominio en vivo
  const regEmailInput = document.getElementById('regEmail');
  const regDomainHint = document.getElementById('regDomainHint');
  if (regEmailInput && regDomainHint) {
    regEmailInput.addEventListener('input', async () => {
      const emailVal = regEmailInput.value.trim().toLowerCase();
      const parts = emailVal.split('@');
      if (parts.length > 1 && parts[1].includes('.')) {
        const dom = parts[1].trim();
        try {
          const domSnap = await getDoc(doc(db, 'dominios_empresas', dom));
          if (domSnap.exists() && domSnap.data().empresa) {
            regDomainHint.innerHTML = `🏢 Empresa detectada: <strong>${domSnap.data().empresa}</strong>`;
            regDomainHint.style.color = '#38bdf8';
            return;
          }
        } catch {
          // Ignorar error en preview
        }
        regDomainHint.innerHTML = `ℹ️ Dominio <code>@${dom}</code> (se asignará tras aprobación o vinculación de dominio)`;
        regDomainHint.style.color = 'var(--text-muted)';
      } else {
        regDomainHint.textContent = 'Se vinculará a la empresa según el dominio registrado en el sistema.';
        regDomainHint.style.color = 'var(--primary)';
      }
    });
  }

  // Procesar Autoregistro de Usuario
  if (viewerRegisterForm) {
    viewerRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideLoginAlert();

      const email = (document.getElementById('regEmail').value || '').trim().toLowerCase();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const submitBtn = document.getElementById('regSubmitBtn');

      if (!email || !password) return;

      if (password !== confirmPassword) {
        showLoginAlert('Las contraseñas no coinciden. Verifique e intente nuevamente.');
        return;
      }

      if (password.length < 6) {
        showLoginAlert('La contraseña debe contener al menos 6 caracteres.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';

      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error('Error de registro de lector:', err);
        let errorMsg = 'No se pudo crear la cuenta. Intente nuevamente.';
        if (err.code === 'auth/email-already-in-use') {
          errorMsg = 'Este correo electrónico ya está registrado. Utilice la pestaña "Iniciar Sesión".';
        } else if (err.code === 'auth/invalid-email') {
          errorMsg = 'El formato del correo electrónico no es válido.';
        } else if (err.code === 'auth/weak-password') {
          errorMsg = 'La contraseña es muy débil (debe tener al menos 6 caracteres).';
        } else {
          errorMsg = `No se pudo completar el registro: ${err.message || err.code}`;
        }
        showLoginAlert(errorMsg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrarme como Usuario';
      }
    });
  }

  // Cerrar sesión
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut(auth);
      if (typeof window.showToast === 'function') {
        window.showToast('Sesión finalizada correctamente', 'info');
      }
    });
  }
}

export function applyRolePermissions(user, role) {
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const emailSubEl = document.getElementById('userEmailSubtitle');
  const roleBadgeEl = document.getElementById('userRoleBadge');
  if (roleBadgeEl) roleBadgeEl.remove();
  const openMgmtBtn = document.getElementById('openUserMgmtBtn');
  const navTabIngesta = document.getElementById('navTabIngesta');
  const navTabDirectorio = document.getElementById('navTabDirectorio');
  const dashboardNewEvalBtn = document.getElementById('dashboardNewEvalBtn');
  const dashboardGoIngestaBtn = document.getElementById('dashboardGoIngestaBtn');
  const driverEmptyUploadBtn = document.getElementById('driverEmptyUploadBtn');
  const compareEmptyUploadBtn = document.getElementById('compareEmptyUploadBtn');
  const ingestaLockedAlert = document.getElementById('ingestaLockedAlert');
  const uploadZoneWrapper = document.getElementById('uploadZoneWrapper');

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
    if (navTabDirectorio) navTabDirectorio.style.display = 'flex';
    if (dashboardNewEvalBtn) dashboardNewEvalBtn.style.display = 'inline-flex';
    if (dashboardGoIngestaBtn) dashboardGoIngestaBtn.style.display = 'inline-flex';
    if (driverEmptyUploadBtn) driverEmptyUploadBtn.style.display = 'inline-flex';
    if (compareEmptyUploadBtn) compareEmptyUploadBtn.style.display = 'inline-flex';
    if (ingestaLockedAlert) ingestaLockedAlert.style.display = 'none';
    if (uploadZoneWrapper) uploadZoneWrapper.style.display = 'block';
  } else {
    if (openMgmtBtn) openMgmtBtn.style.display = 'none';
    if (navTabIngesta) navTabIngesta.style.display = 'none';
    if (navTabDirectorio) navTabDirectorio.style.display = 'none';
    if (dashboardNewEvalBtn) dashboardNewEvalBtn.style.display = 'none';
    if (dashboardGoIngestaBtn) dashboardGoIngestaBtn.style.display = 'none';
    if (driverEmptyUploadBtn) driverEmptyUploadBtn.style.display = 'none';
    if (compareEmptyUploadBtn) compareEmptyUploadBtn.style.display = 'none';
    if (ingestaLockedAlert) ingestaLockedAlert.style.display = 'none';
    if (uploadZoneWrapper) uploadZoneWrapper.style.display = 'none';

    if (window.AppState.currentTab === 'ingesta' || window.AppState.currentTab === 'directorio') {
      if (typeof window.switchTab === 'function') {
        window.switchTab('dashboard');
      }
    }
  }

  const unassignedBanner = document.getElementById('unassignedCompanyBanner');
  if (unassignedBanner) {
    if (role !== 'admin' && (!window.AppState.allowedCompanies || window.AppState.allowedCompanies.length === 0)) {
      unassignedBanner.style.display = 'flex';
    } else {
      unassignedBanner.style.display = 'none';
    }
  }
}

// Habilitar Hot Module Replacement (HMR)
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('⚡ [HMR] Módulo de Autenticación actualizado en caliente.');
  });
}
