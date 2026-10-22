import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence
} from "firebase/auth";
import {
  initializeFirestore,
  enableMultiTabIndexedDbPersistence,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDjKR_odoy5F1eROE-q_45Bm83qJ6a6mc0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tracksim-cloud.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tracksim-cloud",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tracksim-cloud.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "410020297169",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:410020297169:web:6e87e92fb09568d98bc8f0"
};

// Initialize Primary Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Asegurar persistencia local inmediata para que las recargas mantengan la sesión activa
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Error estableciendo persistencia local de sesión:", err);
});

export const db = initializeFirestore(app, {});

// Habilitar persistencia offline con soporte multitestaña en IndexedDB (solo en cliente web real)
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistencia Firestore: Múltiples pestañas abiertas al mismo tiempo.');
    } else if (err.code === 'unimplemented') {
      console.warn('El navegador actual no soporta persistencia IndexedDB.');
    } else {
      console.warn('Aviso de persistencia Firestore:', err);
    }
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Secondary app for admin user creation without logging out
export const secondaryApp = initializeApp(firebaseConfig, 'SecondaryUserAdminApp');
export const secondaryAuth = getAuth(secondaryApp);

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot
};
