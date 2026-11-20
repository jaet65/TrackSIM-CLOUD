import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  buildExerciseStatsFromCompany,
  createCompanySummaryFromEvaluations,
  getEvaluationYear
} from '../../services/analytics';
import type { AiExerciseInput, CompanyAiInsightResult } from '../../services/companyAiInsights';
import { CompanyAiInsightsCard } from './CompanyAiInsightsCard';

export const FloatingAiInsightsButton: React.FC = () => {
  const { userRole } = useAuth();
  const { selectedCompany, selectedCompanySummary, filteredEvaluations, selectedYear } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [insight, setInsight] = useState<CompanyAiInsightResult | null>(null);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    filteredEvaluations.forEach((e) => {
      const yr = getEvaluationYear(e);
      if (yr) set.add(yr);
    });
    return Array.from(set).sort().reverse();
  }, [filteredEvaluations]);

  const evaluationsByYear = useMemo(() => {
    if (selectedYear === 'all') return filteredEvaluations;
    return filteredEvaluations.filter((e) => getEvaluationYear(e) === selectedYear);
  }, [filteredEvaluations, selectedYear]);

  const comp = useMemo(() => {
    if (selectedYear === 'all') {
      if (userRole !== 'admin' && selectedCompany === 'all') {
        return createCompanySummaryFromEvaluations('Flotas asignadas', 'flotas-asignadas', filteredEvaluations);
      }
      if (!selectedCompanySummary) return null;
      return selectedCompany === 'all' ? { ...selectedCompanySummary, esGlobal: true } : selectedCompanySummary;
    }

    const companyDisplayName =
      selectedCompany === 'all' ? 'Todas las empresas' : selectedCompanySummary?.nombre || selectedCompany;
    const summary = createCompanySummaryFromEvaluations(
      companyDisplayName,
      selectedCompanySummary?.slug || 'flota',
      evaluationsByYear
    );
    return selectedCompany === 'all' ? { ...summary, esGlobal: true } : summary;
  }, [selectedYear, selectedCompanySummary, selectedCompany, evaluationsByYear, userRole, filteredEvaluations]);

  const periodText = useMemo(() => {
    if (selectedYear && selectedYear !== 'all') {
      return `Año ${selectedYear}`;
    }
    const sorted = [...availableYears].sort();
    if (sorted.length === 0) return 'Histórico general';
    if (sorted.length === 1) return `Año ${sorted[0]}`;
    return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
  }, [selectedYear, availableYears]);

  const { conductoresRecurrentes, pctRecurrentes, exerciseStats } = useMemo(() => {
    if (!comp) {
      return {
        conductoresRecurrentes: 0,
        pctRecurrentes: '0.0',
        exerciseStats: [] as AiExerciseInput[]
      };
    }

    const totalConductores = comp.conductores.length;
    const recurrentes = comp.conductores.filter((d) => d.totalEvaluaciones > 1).length;
    const pctRec = totalConductores > 0 ? ((recurrentes / totalConductores) * 100).toFixed(1) : '0.0';
    const stats: AiExerciseInput[] = buildExerciseStatsFromCompany(comp).map((item) => ({
      nombre: item.nombre,
      promedio: item.promedio,
      totalEvaluaciones: item.totalEvaluaciones
    }));

    return {
      conductoresRecurrentes: recurrentes,
      pctRecurrentes: pctRec,
      exerciseStats: stats
    };
  }, [comp]);

  useEffect(() => {
    void selectedCompany;
    void selectedYear;
    setIsOpen(false);
    setInsight(null);
  }, [selectedCompany, selectedYear]);

  if (!comp) return null;

  const isEmpty = evaluationsByYear.length === 0;
  const isDisabled = isLoading || isEmpty;

  const handleExplainWithAi = async (forceRefresh = false) => {
    if (isDisabled) return;
    setIsOpen(true);
    setIsLoading(true);
    try {
      const { generateCompanyAiInsight } = await import('../../services/companyAiInsights');
      const result = await generateCompanyAiInsight({
        comp,
        periodText,
        selectedYear,
        conductoresRecurrentes,
        pctRecurrentes,
        exerciseStats,
        allEvaluations: evaluationsByYear,
        forceRefresh
      });
      setInsight(result);
    } catch (error) {
      console.error('Error al generar explicación con IA:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="no-print"
        onClick={() => void handleExplainWithAi(false)}
        disabled={isDisabled}
        title={
          isEmpty
            ? 'Sin evaluaciones para los filtros activos'
            : `Abrir análisis IA de ${comp.nombre} (${periodText})`
        }
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 1050,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.2rem',
          borderRadius: '999px',
          border: '1px solid rgba(139, 92, 246, 0.45)',
          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
          color: '#ffffff',
          fontSize: '0.88rem',
          fontWeight: 700,
          letterSpacing: '0.01em',
          boxShadow: '0 10px 28px rgba(109, 40, 217, 0.38)',
          cursor: isLoading ? 'wait' : isEmpty ? 'not-allowed' : 'pointer',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease',
          opacity: isLoading ? 0.85 : isEmpty ? 0.5 : 1
        }}
        onMouseEnter={(e) => {
          if (isDisabled) return;
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 14px 34px rgba(109, 40, 217, 0.48)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 10px 28px rgba(109, 40, 217, 0.38)';
        }}
      >
        <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>✨</span>
        <span>
          {isLoading
            ? 'Analizando...'
            : selectedYear !== 'all'
              ? `Tracky IA · ${selectedYear}`
              : 'Tracky IA'}
        </span>
      </button>

      <CompanyAiInsightsCard
        isOpen={isOpen}
        isLoading={isLoading}
        insight={insight}
        companyName={comp.nombre}
        periodText={periodText}
        onRegenerate={() => void handleExplainWithAi(true)}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
};
