import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, getDocs, deleteDoc, doc, setDoc, query, where } from '../services/firebase';
import { db } from '../services/firebase';
import { Evaluation, CompanySummary, DriverSummary } from '../types';
import { processCompanySummaries, processDriverSummaries, createCompanySummaryFromEvaluations } from '../services/analytics';
import { useAuth } from './AuthContext';

const LOCAL_STORAGE_KEY = 'tracksim_cloud_evaluaciones';
const LOCAL_STORAGE_SYNC_TIME_KEY = 'tracksim_cloud_last_sync_time';
// Tiempo de validez de la caché antes de consultar cambios (ej. 30 minutos)
const CACHE_TTL_MS = 30 * 60 * 1000;

interface DataContextType {
  evaluations: Evaluation[];
  loading: boolean;
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
        const snap = await getDocs(incrementalQuery);
        console.log(`[Firestore Sync] ${snap.docs.length} documentos nuevos/modificados recibidos.`);

        if (snap.docs.length > 0) {
          snap.forEach((d) => {
            itemsMap.set(d.id, { id: d.id, ...d.data() } as Evaluation);
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
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
      localStorage.setItem(LOCAL_STORAGE_SYNC_TIME_KEY, nowIso);
    } catch (err) {
      console.error('Error sincronizando evaluaciones de Firestore:', err);
      // Mantener los datos locales existentes
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (user) {
      // Verificar si tenemos datos locales y si el TTL sigue vigente
      const storedLastSync = localStorage.getItem(LOCAL_STORAGE_SYNC_TIME_KEY);
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      const hasCached = cached && cached !== '[]';

      if (hasCached && storedLastSync) {
        const lastSyncDate = new Date(storedLastSync).getTime();
        const now = Date.now();
        const isCacheValid = now - lastSyncDate < CACHE_TTL_MS;

        if (isCacheValid) {
          console.log('[Cache] Datos locales activos dentro del TTL (no se consulta Firestore en esta recarga).');
          return;
        } else {
          // Si el TTL expiró, consultar únicamente cambios incrementales de forma transparente en background
          fetchEvaluations(false);
        }
      } else {
        // Primera vez o caché vacía: carga completa
        fetchEvaluations(false);
      }
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
      await deleteDoc(doc(db, 'evaluaciones', id));
    } catch (e) {
      console.warn('Error eliminando de Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateEvaluation = async (id: string, updatedData: Partial<Evaluation>) => {
    const cleanUpdates = { ...updatedData, updatedAt: new Date().toISOString() };
    try {
      await setDoc(doc(db, 'evaluaciones', id), cleanUpdates, { merge: true });
    } catch (e) {
      console.warn('Error actualizando en Firestore:', e);
    }
    setEvaluations((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...cleanUpdates } : item));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <DataContext.Provider
      value={{
        evaluations,
        loading,
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
        updateEvaluation
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
