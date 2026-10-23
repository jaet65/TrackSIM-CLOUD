import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { app, firebaseConfig } from './firebaseApp';
import { getMassDeleteReauthMethod, isVerifiedCorporateAdmin } from './authorization';

export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Error estableciendo persistencia local de sesión:', err);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function reauthenticateForMassDelete(): Promise<void> {
  const user = auth.currentUser;
  const email = user?.email;
  if (!user || !email || !isVerifiedCorporateAdmin(email, user.emailVerified)) {
    throw new Error('Se requiere una cuenta administrativa corporativa verificada.');
  }

  const method = getMassDeleteReauthMethod(
    user.email,
    user.providerData.map((provider) => provider.providerId)
  );

  if (method === 'google') {
    const result = await reauthenticateWithPopup(user, googleProvider);
    if (
      result.user.uid !== user.uid ||
      (result.user.email || '').trim().toLowerCase() !== 'magraz@corporativomaf.com' ||
      !result.user.emailVerified
    ) {
      throw new Error('La cuenta de Google confirmada no coincide con la cuenta autorizada.');
    }
    return;
  }

  throw new Error(
    'Solo magraz@corporativomaf.com puede confirmar el borrado masivo mediante Google.'
  );
}

const secondaryApp = initializeApp(firebaseConfig, 'SecondaryUserAdminApp');
const secondaryAuth = getAuth(secondaryApp);

export {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  secondaryAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
};
