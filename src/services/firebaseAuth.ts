import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { app, firebaseConfig } from './firebaseApp';

export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Error estableciendo persistencia local de sesión:', err);
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
