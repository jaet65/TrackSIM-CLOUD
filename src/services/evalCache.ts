// Caché local de evaluaciones en IndexedDB (sin el límite de ~5MB de localStorage)
import type { Evaluation } from '../types';

export interface EvalCacheRecord {
  items: Evaluation[];
  syncTime: string | null;
  scope: string | null;
}

const DB_NAME = 'tracksim_cloud_cache';
const STORE = 'kv';
const KEY = 'evaluaciones';

let dbPromise: Promise<IDBDatabase> | null = null;

const getDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
};

const withStore = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await getDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const loadEvalCache = async (): Promise<EvalCacheRecord | null> => {
  try {
    const rec = await withStore<EvalCacheRecord | undefined>('readonly', (s) => s.get(KEY));
    return rec && Array.isArray(rec.items) ? rec : null;
  } catch (err) {
    console.warn('[Cache] No se pudo leer IndexedDB:', err);
    return null;
  }
};

export const saveEvalCache = async (rec: EvalCacheRecord): Promise<boolean> => {
  try {
    await withStore('readwrite', (s) => s.put(rec, KEY));
    return true;
  } catch (err) {
    console.warn('[Cache] No se pudo guardar en IndexedDB:', err);
    return false;
  }
};

export const clearEvalCache = async (): Promise<void> => {
  try {
    await withStore('readwrite', (s) => s.delete(KEY));
  } catch (err) {
    console.warn('[Cache] No se pudo limpiar IndexedDB:', err);
  }
};
