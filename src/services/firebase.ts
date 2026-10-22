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
  query,
  where,
  orderBy,
  Timestamp
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyDjKR_odoy5F1eROE-q_45Bm83qJ6a6mc0",
  authDomain: "tracksim-cloud.firebaseapp.com",
  projectId: "tracksim-cloud",
  storageBucket: "tracksim-cloud.firebasestorage.app",
  messagingSenderId: "410020297169",
  appId: "1:410020297169:web:6e87e92fb09568d98bc8f0"
};

// Initialize Primary Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Asegurar persistencia local inmediata para que las recargas mantengan la sesión activa
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Error estableciendo persistencia local de sesión:", err);
});

export const db = initializeFirestore(app, {});

// Habilitar persistencia offline con soporte multitestaña en IndexedDB
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistencia Firestore: Múltiples pestañas abiertas al mismo tiempo.');
  } else if (err.code === 'unimplemented') {
    console.warn('El navegador actual no soporta persistencia IndexedDB.');
  } else {
    console.warn('Aviso de persistencia Firestore:', err);
  }
});

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
  query,
  where,
  orderBy,
  Timestamp
};
