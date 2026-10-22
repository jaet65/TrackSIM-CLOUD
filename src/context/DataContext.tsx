import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, getDocs, deleteDoc, doc, setDoc } from '../services/firebase';
import { db } from '../services/firebase';
import { Evaluation, CompanySummary, DriverSummary } from '../types';
import { processCompanySummaries, processDriverSummaries, createCompanySummaryFromEvaluations } from '../services/analytics';
import { useAuth } from './AuthContext';

const LOCAL_STORAGE_KEY = 'tracksim_cloud_evaluaciones';

interface DataContextType {
  evaluations: Evaluation[];
  loading: boolean;
  reloadEvaluations: () => Promise<void>;
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
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fetchEvaluations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Consultar la colección completa directamente para asegurar que ningún documento
      // quede filtrado por no tener un campo de ordenamiento específico (como 'fecha' vs 'fechaCapacitacion')
      const snap = await getDocs(collection(db, 'evaluaciones'));
      const items: Evaluation[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ...data
        } as Evaluation);
      });

      // Ordenar por fecha cronológica descendente en memoria de forma segura
      items.sort((a, b) => {
        const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
        const dbDate = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
        return dbDate.localeCompare(da);
      });

      console.log(`[Firestore] ${items.length} evaluaciones cargadas exitosamente.`);
      setEvaluations(items);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('Error cargando evaluaciones de Firestore:', err);
      // Fallback a localStorage si la red falla
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvaluations(parsed);
          }
        }
      } catch (cacheErr) {
        console.warn('Error leyendo caché local:', cacheErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchEvaluations();
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
