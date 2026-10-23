import { initializeApp } from 'firebase/app';

const sanitize = (val: string | undefined, fallback: string): string => {
  const raw = (val || fallback).trim();
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

export const app = initializeApp(firebaseConfig);
