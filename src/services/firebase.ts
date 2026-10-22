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
  persistentLocalCache,
  persistentMultipleTabManager,
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

const sanitize = (val: string | undefined, fallback: string): string => {
  const raw = (val || fallback).trim();
  // Quitar comillas dobles o simples accidentales que puedan venir de variables de entorno o copiar/pegar
  return raw.replace(/^["']|["']$/g, '');
};

export const firebaseConfig = {
  apiKey: sanitize(import.meta.env.VITE_FIREBASE_API_KEY, "AIzaSyDjKR_odoy5F1eROE-q_45Bm83qJ6a6mc0"),
  authDomain: sanitize(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "tracksim-cloud.firebaseapp.com"),
  projectId: sanitize(import.meta.env.VITE_FIREBASE_PROJECT_ID, "tracksim-cloud"),
  storageBucket: sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "tracksim-cloud.firebasestorage.app"),
  messagingSenderId: sanitize(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "410020297169"),
  appId: sanitize(import.meta.env.VITE_FIREBASE_APP_ID, "1:410020297169:web:6e87e92fb09568d98bc8f0")
};

// Initialize Primary Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Asegurar persistencia local inmediata para que las recargas mantengan la sesión activa
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Error estableciendo persistencia local de sesión:", err);
});

// Inicializar Firestore con la API moderna de caché multitestaña recomendada en Firebase 13.1+
export const db = initializeFirestore(app, {
  localCache: typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : undefined
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
  writeBatch,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot
};
