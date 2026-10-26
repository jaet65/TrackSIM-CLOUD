import {
  addDoc,
  limit,
  serverTimestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { app } from './firebaseApp';

export const db = initializeFirestore(app, {
  localCache: typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : undefined
});

export {
  addDoc,
  limit,
  serverTimestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
};
