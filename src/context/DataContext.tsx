import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { collection, getDocs, doc, setDoc, query, where, writeBatch, db } from '../services/firebaseFirestore';
import { Evaluation, CompanySummary, DriverSummary } from '../types';
import { processCompanySummaries, processDriverSummaries, createCompanySummaryFromEvaluations } from '../services/analytics';
import { initializeActiveCatalog } from '../services/exerciseCatalog';
import { DEMO_EVALUATIONS } from '../data/demoEvaluations';
import { useAuth } from './AuthContext';
import { logAudit, diffSnapshots, snapshotText } from '../services/auditLog';

import { loadEvalCache, saveEvalCache, clearEvalCache, EvalCacheRecord } from '../services/evalCache';

// Claves heredadas de localStorage (versiones anteriores); se eliminan al migrar a IndexedDB
const LEGACY_STORAGE_KEYS = [
  'tracksim_cloud_evaluaciones',
  'tracksim_cloud_last_sync_time',
  'tracksim_cloud_cache_scope'
];

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
  updateEvaluationsBatch: (
    updates: { id: string; fields: Partial<Evaluation> }[],
    onProgress?: (completed: number, total: number) => void
  ) => Promise<void>;
  deleteAllEvaluations: (targetEvaluations?: Evaluation[], onProgress?: (completed: number, total: number) => void) => Promise<number>;
  getEvaluationsBackup: () => Promise<Evaluation[]>;
  restoreEvaluationsBackup: (backupEvaluations: Evaluation[], onProgress?: (completed: number, total: number) => void) => Promise<void>;
  updateEvaluation: (id: string, data: Partial<Evaluation>) => Promise<void>;
  resetCacheAndReload: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, userRole, allowedCompanies, isDemo } = useAuth();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  // Caché en IndexedDB: se carga una vez; fetchEvaluations espera a cacheReadyRef antes de sincronizar
  const cacheRef = useRef<EvalCacheRecord | null>(null);
  const cacheReadyRef = useRef<Promise<void> | null>(null);
  const ensureCache = () => {
    if (!cacheReadyRef.current) {
      cacheReadyRef.current = (async () => {
        try {
          LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
        } catch { /* sin acceso a localStorage */ }
        cacheRef.current = await loadEvalCache();
      })();
    }
    return cacheReadyRef.current;
  };
  const persistItems = (items: Evaluation[]) => {
    const rec: EvalCacheRecord = {
      items,
      syncTime: cacheRef.current?.syncTime ?? null,
      scope: cacheRef.current?.scope ?? null
    };
    cacheRef.current = rec;
    void saveEvalCache(rec);
  };
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Descarga restringida: los no-admin consultan solo sus empresas (las reglas de Firestore lo exigen)
  const isUnrestricted = userRole === 'admin' || allowedCompanies.includes('all');
  const queryEvaluations = async (extra: any[] = []) => {
    if (isUnrestricted) {
      return getDocs(query(collection(db, 'evaluaciones'), ...extra));
    }
    const snaps = await Promise.all(
      allowedCompanies.map((emp) =>
        getDocs(query(collection(db, 'evaluaciones'), where('empresa', '==', emp), ...extra))
      )
    );
    return { docs: snaps.flatMap((s) => s.docs) };
  };

  // Sincronización inteligente (Incremental o Completa)
  const fetchEvaluations = async (forceFull = false) => {
    if (isDemo) return;
    if (!user) return;
    if (!isUnrestricted && allowedCompanies.length === 0) {
      // Aún sin empresa asignada/cargada: no consultar (las reglas lo denegarían)
      setInitialLoaded(true);
      return;
    }
    
    // Esperar la lectura del caché en IndexedDB y validar que corresponde al alcance actual (uid + empresas)
    await ensureCache();
    const scopeKey = `${user.uid}|${isUnrestricted ? 'all' : [...allowedCompanies].sort().join(',')}|sync-v2`;
    const cache = cacheRef.current;
    const scopeChanged = !cache || cache.scope !== scopeKey;
    const cachedItems = !scopeChanged && cache ? cache.items : [];
    const hasLocalData = cachedItems.length > 0;
    if (hasLocalData) {
      // Mostrar de inmediato los datos en caché y sincronizar en segundo plano
      setEvaluations((prev) => (prev.length === 0 ? cachedItems : prev));
      setIsSyncing(true);
    } else {
      setLoading(true);
    }

    try {
      const storedLastSync = !scopeChanged && cache ? cache.syncTime : null;
      const isIncremental = !forceFull && !scopeChanged && hasLocalData && !!storedLastSync;

      let itemsMap = new Map<string, Evaluation>();
      cachedItems.forEach((item) => itemsMap.set(item.id, item));

      if (isIncremental) {
        // Consulta incremental: únicamente documentos actualizados o creados después de la última sincronización
        console.log(`[Firestore Cache] Buscando actualizaciones incrementales desde: ${storedLastSync}`);
        const queryDeletions = async () => {
          const tombstones = collection(db, '_eliminaciones');
          if (isUnrestricted) {
            return getDocs(query(tombstones, where('deletedAt', '>', storedLastSync)));
          }

          const snapshots = await Promise.all(
            allowedCompanies.map((empresa) =>
              getDocs(query(
                tombstones,
                where('empresa', '==', empresa),
                where('deletedAt', '>', storedLastSync)
              ))
            )
          );
          return { docs: snapshots.flatMap((snapshot) => snapshot.docs) };
        };

        const [snapUpdates, snapDeletions] = await Promise.all([
          queryEvaluations([where('updatedAt', '>', storedLastSync)]),
          queryDeletions()
        ]);

        console.log(`[Firestore Sync] ${snapUpdates.docs.length} documentos nuevos/modificados y ${snapDeletions.docs.length} eliminaciones recibidas.`);

        if (snapUpdates.docs.length > 0) {
          snapUpdates.docs.forEach((d: any) => {
            itemsMap.set(d.id, { id: d.id, ...d.data() } as Evaluation);
          });
        }

        // Remover de la memoria y caché local cualquier documento registrado como eliminado
        if (snapDeletions.docs.length > 0) {
          snapDeletions.docs.forEach((d) => {
            const data = d.data();
            if (data.deleteAll) {
              itemsMap.forEach((item, id) => {
                if (item.empresa === data.empresa) itemsMap.delete(id);
              });
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
        const snap = await queryEvaluations();
        itemsMap.clear();
        snap.docs.forEach((d: any) => {
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
      const newRec: EvalCacheRecord = { items: mergedList, syncTime: nowIso, scope: scopeKey };
      cacheRef.current = newRec;
      void saveEvalCache(newRec);
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
    if (isDemo) {
      setEvaluations(DEMO_EVALUATIONS);
      setLoading(false);
      setIsSyncing(false);
      setLastSyncTime(null);
      setInitialLoaded(true);
      return;
    }

    if (user) {
      // Inicializar catálogo de ejercicios
      initializeActiveCatalog();
      // Si ya hay datos en caché se muestran instantáneamente en pantalla,
      // y se lanza una sincronización incremental en segundo plano para traer cambios/eliminaciones.
      fetchEvaluations(false);
    } else {
      setEvaluations([]);
    }
  }, [user, userRole, allowedCompanies.join('|'), isDemo]);

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
    if (isDemo) throw new Error('No se pueden modificar evaluaciones en modo demostración.');
    try {
      const nowIso = new Date().toISOString();
      const evaluation = evaluations.find((item) => item.id === id);
      if (!evaluation) {
        throw new Error(`No se encontró la evaluación ${id} para registrar su empresa.`);
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, 'evaluaciones', id));
      batch.set(doc(db, '_eliminaciones', id), {
        id,
        empresa: evaluation.empresa,
        deletedAt: nowIso
      });
      await batch.commit();
      void logAudit({
        categoria: 'reporte',
        accion: 'eliminar',
        cantidad: 1,
        empresas: [evaluation.empresa],
        detalle: [evaluation.conductor || evaluation.operador, evaluation.folio].filter(Boolean).join(' · ') || id,
        antes: snapshotText({
          conductor: evaluation.conductor || evaluation.operador,
          folio: evaluation.folio,
          empresa: evaluation.empresa,
          sede: evaluation.sede,
          fecha: evaluation.fechaCapacitacion || evaluation.fechaReporte || evaluation.fecha,
          estado: evaluation.estado
        })
      });
    } catch (e) {
      console.warn('Error eliminando de Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistItems(next);
      return next;
    });
  };

  const deleteAllEvaluations = async (
    targetEvaluations?: Evaluation[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<number> => {
    if (isDemo) throw new Error('No se pueden modificar evaluaciones en modo demostración.');
    // Si se especifica una lista (por ejemplo las del rol o filtradas), se eliminan esas; de lo contrario todas las permitidas
    const toDelete = targetEvaluations || roleAllowedEvaluations;
    if (toDelete.length === 0) return 0;

    const isTotalWipe = !targetEvaluations || toDelete.length >= evaluations.length;
    const idsToDelete = toDelete.map((e) => e.id);
    const companyByEvaluationId = new Map(toDelete.map((evaluation) => [evaluation.id, evaluation.empresa]));
    const BATCH_SIZE = 50;
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
        onProgress?.(successfullyDeletedIds.length, idsToDelete.length);
      } catch (e: any) {
        console.error('Error al cometer batch de eliminación en Firestore:', e);
        firestoreError = e;
        break; // Detener para no reportar éxito si Firestore falló
      }
    }

    // Registrar evento de eliminación para sincronizar con los demás clientes
    if (successfullyDeletedIds.length > 0) {
      try {
        const didDeleteAll = isTotalWipe && successfullyDeletedIds.length >= evaluations.length;
        const idsByCompany = new Map<string, string[]>();
        successfullyDeletedIds.forEach((id) => {
          const empresa = companyByEvaluationId.get(id);
          if (!empresa) {
            throw new Error(`No se encontró la empresa de la evaluación eliminada ${id}.`);
          }
          const companyIds = idsByCompany.get(empresa) || [];
          companyIds.push(id);
          idsByCompany.set(empresa, companyIds);
        });

        const tombstoneWrites: Promise<void>[] = [];
        let tombstoneIndex = 0;
        idsByCompany.forEach((ids, empresa) => {
          const idChunks = didDeleteAll ? [[]] : Array.from(
            { length: Math.ceil(ids.length / 400) },
            (_, index) => ids.slice(index * 400, (index + 1) * 400)
          );
          idChunks.forEach((idsChunk) => {
            const tombstoneId = `del_${Date.now()}_${tombstoneIndex++}_${Math.random().toString(36).slice(2, 8)}`;
            tombstoneWrites.push(setDoc(doc(db, '_eliminaciones', tombstoneId), {
              empresa,
              deletedAt: nowIso,
              deleteAll: didDeleteAll,
              ids: idsChunk
            }));
          });
        });
        await Promise.all(tombstoneWrites);
      } catch (tombErr) {
        console.warn('Error registrando evento de eliminación:', tombErr);
      }
    }

    // Actualizar estado local únicamente con los documentos que realmente se borraron en Firestore
    if (successfullyDeletedIds.length > 0) {
      void logAudit({
        categoria: 'reporte',
        accion: 'eliminar',
        cantidad: successfullyDeletedIds.length,
        empresas: successfullyDeletedIds.map((id) => companyByEvaluationId.get(id) || '').filter(Boolean),
        detalle: isTotalWipe ? 'Eliminación masiva de reportes' : undefined
      });
      const deleteSet = new Set(successfullyDeletedIds);
      setEvaluations((prev) => {
        const next = prev.filter((item) => !deleteSet.has(item.id));
        persistItems(next);
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
    if (isDemo) throw new Error('No se pueden modificar evaluaciones en modo demostración.');
    const rawUpdates = { ...updatedData, updatedAt: new Date().toISOString() };
    const cleanUpdates = sanitizeForFirestore(rawUpdates);
    try {
      await setDoc(doc(db, 'evaluaciones', id), cleanUpdates, { merge: true });
      const existing = evaluations.find((item) => item.id === id);
      const diff = diffSnapshots(existing as unknown as Record<string, unknown>, cleanUpdates, Object.keys(updatedData));
      void logAudit({
        categoria: 'reporte',
        accion: 'modificar',
        cantidad: 1,
        empresas: [updatedData.empresa || existing?.empresa || ''].filter(Boolean),
        detalle: `${existing?.conductor || existing?.operador || existing?.folio || id} — campos: ${diff.changed.join(', ') || 'sin cambios de valor'}`,
        antes: diff.antes,
        despues: diff.despues
      });
    } catch (e) {
      console.warn('Error actualizando en Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...cleanUpdates } : item));
      persistItems(next);
      return next;
    });
  };

  const updateEvaluationsBatch = async (
    updates: { id: string; fields: Partial<Evaluation> }[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> => {
    if (isDemo) throw new Error('No se pueden modificar evaluaciones en modo demostración.');
    const BATCH_SIZE = 50;
    const updatedAt = new Date().toISOString();

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      const batchUpdates = chunk.map(({ id, fields }) => {
        const data = sanitizeForFirestore({ ...fields, updatedAt }) as Record<string, unknown>;
        batch.set(doc(db, 'evaluaciones', id), data, { merge: true });
        return { id, data };
      });
      await batch.commit();
      setEvaluations((current) => {
        const updatesById = new Map(batchUpdates.map(({ id, data }) => [id, data]));
        const next = current.map((evaluation) => {
          const data = updatesById.get(evaluation.id);
          return data ? { ...evaluation, ...data } as Evaluation : evaluation;
        });
        persistItems(next);
        return next;
      });
      onProgress?.(Math.min(i + chunk.length, updates.length), updates.length);
    }
    const beforeById: Record<string, Record<string, unknown>> = {};
    const afterById: Record<string, Record<string, unknown>> = {};
    updates.slice(0, 10).forEach(({ id, fields }) => {
      const existing = evaluations.find((e) => e.id === id) as unknown as Record<string, unknown> | undefined;
      const diff = diffSnapshots(existing, fields as Record<string, unknown>, Object.keys(fields));
      if (diff.antes && diff.despues) {
        beforeById[id] = JSON.parse(diff.antes);
        afterById[id] = JSON.parse(diff.despues);
      }
    });
    void logAudit({
      categoria: 'reporte',
      accion: 'modificar',
      cantidad: updates.length,
      empresas: updates.map(({ id, fields }) => fields.empresa || evaluations.find((e) => e.id === id)?.empresa || '').filter(Boolean),
      detalle: `Edición por lote — campos: ${Array.from(new Set(updates.flatMap(({ fields }) => Object.keys(fields)))).join(', ')}${updates.length > 10 ? ' (antes/después de los primeros 10)' : ''}`,
      antes: Object.keys(beforeById).length ? snapshotText(beforeById) : undefined,
      despues: Object.keys(afterById).length ? snapshotText(afterById) : undefined
    });
  };

  const getEvaluationsBackup = async (): Promise<Evaluation[]> => {
    if (isDemo) throw new Error('No se pueden exportar respaldos en modo demostración.');
    if (userRole !== 'admin') {
      throw new Error('Solo el personal administrativo puede exportar un respaldo completo.');
    }

    const snapshot = await queryEvaluations();
    return snapshot.docs.map((evaluationDoc) => ({
      ...evaluationDoc.data(),
      id: evaluationDoc.id
    } as Evaluation));
  };

  const restoreEvaluationsBackup = async (
    backupEvaluations: Evaluation[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<void> => {
    if (isDemo) throw new Error('No se pueden restaurar respaldos en modo demostración.');
    if (userRole !== 'admin') {
      throw new Error('Solo el personal administrativo puede restaurar un respaldo completo.');
    }

    const BATCH_SIZE = 50;
    const restoredAt = new Date().toISOString();
    for (let i = 0; i < backupEvaluations.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      backupEvaluations.slice(i, i + BATCH_SIZE).forEach((evaluation) => {
        const { id, ...data } = evaluation;
        batch.set(doc(db, 'evaluaciones', id), {
          ...data,
          updatedAt: restoredAt
        });
      });
      await batch.commit();
      onProgress?.(Math.min(i + BATCH_SIZE, backupEvaluations.length), backupEvaluations.length);
    }
    void logAudit({
      categoria: 'reporte',
      accion: 'restaurar',
      cantidad: backupEvaluations.length,
      empresas: backupEvaluations.map((e) => e.empresa).filter(Boolean),
      detalle: 'Restauración de respaldo'
    });

    setEvaluations((current) => {
      const restoredById = new Map(current.map((evaluation) => [evaluation.id, evaluation]));
      backupEvaluations.forEach((evaluation) => restoredById.set(evaluation.id, {
        ...evaluation,
        updatedAt: restoredAt
      }));
      const restored = Array.from(restoredById.values());
      persistItems(restored);
      return restored;
    });
  };

  const resetCacheAndReload = async () => {
    if (isDemo) return;
    await ensureCache();
    cacheRef.current = null;
    await clearEvalCache();
    setLastSyncTime(null);
    await fetchEvaluations(true);
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
        updateEvaluationsBatch,
        deleteAllEvaluations,
        getEvaluationsBackup,
        restoreEvaluationsBackup,
        updateEvaluation,
        resetCacheAndReload
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
