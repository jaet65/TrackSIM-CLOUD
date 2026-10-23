import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, setDoc, query, where, writeBatch } from '../services/firebase';
import { db } from '../services/firebase';
import { Evaluation, CompanySummary, DriverSummary } from '../types';
import { processCompanySummaries, processDriverSummaries, createCompanySummaryFromEvaluations } from '../services/analytics';
import { useAuth } from './AuthContext';

const LOCAL_STORAGE_KEY = 'tracksim_cloud_evaluaciones';
const LOCAL_STORAGE_SYNC_TIME_KEY = 'tracksim_cloud_last_sync_time';

const safeStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      console.warn(`[Storage Quota] Espacio de localStorage excedido al guardar ${key}. Se conserva la copia en memoria y caché IndexedDB de Firestore.`);
    } else {
      console.warn(`[Storage] No se pudo guardar ${key} en localStorage:`, err);
    }
  }
};

interface DataContextType {
  evaluations: Evaluation[];
  roleAllowedEvaluations: Evaluation[];
  loading: boolean;
  initialLoaded: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  reloadEvaluations: (forceFull?: boolean) => Promise<void>;
  filteredEvaluations: Evaluation[];
  companies: string[];
  companiesSummaries: CompanySummary[];
  driverSummaries: DriverSummary[];
  selectedCompany: string;
  setSelectedCompany: (c: string) => void;
  selectedCompanySummary: CompanySummary | null;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  searchFilter: string;
  setSearchFilter: (s: string) => void;
  deleteEvaluation: (id: string) => Promise<void>;
  deleteAllEvaluations: (targetEvaluations?: Evaluation[]) => Promise<number>;
  updateEvaluation: (id: string, data: Partial<Evaluation>) => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, userRole, allowedCompanies } = useAuth();
  const [evaluations, setEvaluations] = useState<Evaluation[]>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(LOCAL_STORAGE_SYNC_TIME_KEY);
  });
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Sincronización inteligente (Incremental o Completa)
  const fetchEvaluations = async (forceFull = false) => {
    if (!user) return;
    
    // Si ya tenemos datos en memoria/localStorage y no es carga forzada, marcamos isSyncing para no bloquear la UI
    const hasLocalData = evaluations.length > 0;
    if (hasLocalData) {
      setIsSyncing(true);
    } else {
      setLoading(true);
    }

    try {
      const storedLastSync = localStorage.getItem(LOCAL_STORAGE_SYNC_TIME_KEY);
      const isIncremental = !forceFull && hasLocalData && !!storedLastSync;

      let itemsMap = new Map<string, Evaluation>();
      evaluations.forEach((item) => itemsMap.set(item.id, item));

      if (isIncremental) {
        // Consulta incremental: únicamente documentos actualizados o creados después de la última sincronización
        console.log(`[Firestore Cache] Buscando actualizaciones incrementales desde: ${storedLastSync}`);
        const incrementalQuery = query(
          collection(db, 'evaluaciones'),
          where('updatedAt', '>', storedLastSync)
        );
        const [snapUpdates, snapDeletions] = await Promise.all([
          getDocs(incrementalQuery),
          getDocs(query(collection(db, '_eliminaciones'), where('deletedAt', '>', storedLastSync)))
        ]);

        console.log(`[Firestore Sync] ${snapUpdates.docs.length} documentos nuevos/modificados y ${snapDeletions.docs.length} eliminaciones recibidas.`);

        if (snapUpdates.docs.length > 0) {
          snapUpdates.forEach((d) => {
            itemsMap.set(d.id, { id: d.id, ...d.data() } as Evaluation);
          });
        }

        // Remover de la memoria y caché local cualquier documento registrado como eliminado
        if (snapDeletions.docs.length > 0) {
          snapDeletions.forEach((d) => {
            const data = d.data();
            if (data.deleteAll) {
              itemsMap.clear();
            } else if (Array.isArray(data.ids) && data.ids.length > 0) {
              data.ids.forEach((id: string) => itemsMap.delete(id));
            } else {
              itemsMap.delete(d.id);
            }
          });
        }
      } else {
        // Carga inicial completa o forzada
        console.log('[Firestore] Descarga completa de evaluaciones...');
        const snap = await getDocs(collection(db, 'evaluaciones'));
        itemsMap.clear();
        snap.forEach((d) => {
          itemsMap.set(d.id, { id: d.id, ...d.data() } as Evaluation);
        });
        console.log(`[Firestore] ${itemsMap.size} evaluaciones descargadas.`);
      }

      const mergedList = Array.from(itemsMap.values());
      // Ordenar cronológicamente descendente
      mergedList.sort((a, b) => {
        const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
        const dbDate = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
        return dbDate.localeCompare(da);
      });

      const nowIso = new Date().toISOString();
      setEvaluations(mergedList);
      setLastSyncTime(nowIso);
      safeStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
      safeStorageSet(LOCAL_STORAGE_SYNC_TIME_KEY, nowIso);
    } catch (err) {
      console.error('Error sincronizando evaluaciones de Firestore:', err);
      // Mantener los datos locales existentes
    } finally {
      setLoading(false);
      setIsSyncing(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    if (user) {
      // Si ya hay datos en caché se muestran instantáneamente en pantalla,
      // y se lanza una sincronización incremental en segundo plano para traer cambios/eliminaciones.
      fetchEvaluations(false);
    } else {
      setEvaluations([]);
    }
  }, [user]);

  // Evaluaciones permitidas según rol de usuario
  const roleAllowedEvaluations = useMemo(() => {
    return evaluations.filter((e) => {
      if (userRole !== 'admin' && !allowedCompanies.includes('all')) {
        return allowedCompanies.includes(e.empresa);
      }
      return true;
    });
  }, [evaluations, userRole, allowedCompanies]);

  // Lista de empresas disponibles
  const companies = useMemo(() => {
    const set = new Set<string>();
    roleAllowedEvaluations.forEach((e) => {
      if (e.empresa) set.add(e.empresa);
    });
    return Array.from(set).sort();
  }, [roleAllowedEvaluations]);

  // Si el usuario es un lector restringido a una empresa específica, inicializar selectedCompany con su empresa
  useEffect(() => {
    if (userRole !== 'admin') {
      const targetCompany =
        (allowedCompanies.length > 0 && !allowedCompanies.includes('all') ? allowedCompanies[0] : null) ||
        (profile?.empresaPermitida && profile.empresaPermitida !== 'all' ? profile.empresaPermitida : null) ||
        (companies.length === 1 ? companies[0] : null);

      if (targetCompany && selectedCompany !== targetCompany) {
        setSelectedCompany(targetCompany);
      }
    }
  }, [userRole, allowedCompanies, profile, companies, selectedCompany]);

  // Resumen analítico por empresa
  const companiesSummaries = useMemo(() => {
    return processCompanySummaries(roleAllowedEvaluations);
  }, [roleAllowedEvaluations]);

  // Resumen analítico por conductor
  const driverSummaries = useMemo(() => {
    return processDriverSummaries(roleAllowedEvaluations);
  }, [roleAllowedEvaluations]);

  // Empresa seleccionada actualmente (o consolidado global de Todas las empresas)
  const selectedCompanySummary = useMemo<CompanySummary | null>(() => {
    // Si el usuario no es admin y solo tiene 1 empresa o está restringido, no mostrar nunca el consolidado global "Todas las empresas"
    if (userRole !== 'admin' && (selectedCompany === 'all' || !selectedCompany)) {
      if (companiesSummaries.length > 0) {
        return companiesSummaries[0];
      }
    }

    if (selectedCompany === 'all') {
      return createCompanySummaryFromEvaluations('Todas las empresas', 'todas-las-empresas', roleAllowedEvaluations);
    }
    return companiesSummaries.find((c) => c.nombre === selectedCompany) || (companiesSummaries.length > 0 ? companiesSummaries[0] : null);
  }, [selectedCompany, roleAllowedEvaluations, companiesSummaries, userRole]);

  // Evaluaciones filtradas según selector de empresa y búsqueda
  const filteredEvaluations = useMemo(() => {
    return roleAllowedEvaluations.filter((e) => {
      if (selectedCompany !== 'all' && e.empresa !== selectedCompany) {
        return false;
      }
      if (searchFilter.trim() !== '') {
        const q = searchFilter.toLowerCase();
        const op = (e.conductor || e.operador || '').toLowerCase();
        const emp = (e.empresa || '').toLowerCase();
        const fol = (e.folio || '').toLowerCase();
        const sed = (e.sede || '').toLowerCase();
        if (!op.includes(q) && !emp.includes(q) && !fol.includes(q) && !sed.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [roleAllowedEvaluations, selectedCompany, searchFilter]);

  const deleteEvaluation = async (id: string) => {
    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      batch.delete(doc(db, 'evaluaciones', id));
      batch.set(doc(db, '_eliminaciones', id), {
        id,
        deletedAt: nowIso
      });
      await batch.commit();
    } catch (e) {
      console.warn('Error eliminando de Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.filter((item) => item.id !== id);
      safeStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const deleteAllEvaluations = async (targetEvaluations?: Evaluation[]): Promise<number> => {
    // Si se especifica una lista (por ejemplo las del rol o filtradas), se eliminan esas; de lo contrario todas las permitidas
    const toDelete = targetEvaluations || roleAllowedEvaluations;
    if (toDelete.length === 0) return 0;

    const isTotalWipe = !targetEvaluations || toDelete.length >= evaluations.length;
    const idsToDelete = toDelete.map((e) => e.id);
    const BATCH_SIZE = 450; // Firestore admite hasta 500 operaciones por batch
    const successfullyDeletedIds: string[] = [];
    let firestoreError: any = null;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, 'evaluaciones', id));
      });

      try {
        await batch.commit();
        successfullyDeletedIds.push(...chunk);
      } catch (e: any) {
        console.error('Error al cometer batch de eliminación en Firestore:', e);
        firestoreError = e;
        break; // Detener para no reportar éxito si Firestore falló
      }
    }

    // Registrar evento de eliminación para sincronizar con los demás clientes
    if (successfullyDeletedIds.length > 0) {
      try {
        const tombstoneId = `del_${Date.now()}`;
        await setDoc(doc(db, '_eliminaciones', tombstoneId), {
          deletedAt: nowIso,
          deleteAll: isTotalWipe,
          ids: isTotalWipe ? [] : successfullyDeletedIds
        });
      } catch (tombErr) {
        console.warn('Error registrando evento de eliminación:', tombErr);
      }
    }

    // Actualizar estado local únicamente con los documentos que realmente se borraron en Firestore
    if (successfullyDeletedIds.length > 0) {
      const deleteSet = new Set(successfullyDeletedIds);
      setEvaluations((prev) => {
        const next = prev.filter((item) => !deleteSet.has(item.id));
        safeStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }

    if (firestoreError) {
      const errorMsg = firestoreError?.message || '';
      const isQuota = firestoreError?.code === 'resource-exhausted' ||
                      /quota|resource-exhausted|exceeded/i.test(errorMsg);
      const customErr: any = new Error(
        isQuota
          ? 'La cuota de Firestore está agotada (Resource Exhausted). Las operaciones de eliminación fueron rechazadas por Firebase en la nube.'
          : `Error en Firestore al eliminar: ${firestoreError?.message || 'Fallo de conexión o permisos'}`
      );
      customErr.code = firestoreError?.code;
      customErr.deletedSoFar = successfullyDeletedIds.length;
      throw customErr;
    }

    return successfullyDeletedIds.length;
  };

  const sanitizeForFirestore = (obj: any): any => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(sanitizeForFirestore);
    }
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned;
  };

  const updateEvaluation = async (id: string, updatedData: Partial<Evaluation>) => {
    const rawUpdates = { ...updatedData, updatedAt: new Date().toISOString() };
    const cleanUpdates = sanitizeForFirestore(rawUpdates);
    try {
      await setDoc(doc(db, 'evaluaciones', id), cleanUpdates, { merge: true });
    } catch (e) {
      console.warn('Error actualizando en Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...cleanUpdates } : item));
      safeStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <DataContext.Provider
      value={{
        evaluations,
        roleAllowedEvaluations,
        loading,
        initialLoaded,
        isSyncing,
        lastSyncTime,
        reloadEvaluations: fetchEvaluations,
        filteredEvaluations,
        companies,
        companiesSummaries,
        driverSummaries,
        selectedCompany,
        setSelectedCompany,
        selectedCompanySummary,
        selectedDriverName,
        setSelectedDriverName,
        searchFilter,
        setSearchFilter,
        deleteEvaluation,
        deleteAllEvaluations,
        updateEvaluation
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
