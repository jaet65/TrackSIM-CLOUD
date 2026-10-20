// TrackSIM CLOUD - Firebase Modular Configuration & Auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase configuration from src/firebase.js
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
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Secondary App for Admin User Creation (prevents logging out the current admin)
export const secondaryApp = initializeApp(firebaseConfig, 'SecondaryUserAdminApp');
export const secondaryAuth = getAuth(secondaryApp);

// Export auth and firestore functions
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
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp 
};
