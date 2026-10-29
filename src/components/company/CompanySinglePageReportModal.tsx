import React from 'react';
import { CompanySummary, Evaluation } from '../../types';
import { logAudit } from '../../services/auditLog';

interface ExerciseStatItem {
  key: string;
  nombre: string;
  numero?: number;
  promedio: number;
  totalEvaluaciones: number;
}

interface CompanySinglePageReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  comp: CompanySummary & { esGlobal?: boolean };
  selectedYear: string;
  periodText: string;
  conductoresRecurrentes: number;
  pctRecurrentes: string;
  operadoresConHistorialPrevio?: { count: number; pct: string };
  exerciseStats: ExerciseStatItem[];
  topConductores: any[];
  allEvaluations?: Evaluation[];
}

export const CompanySinglePageReportModal: React.FC<CompanySinglePageReportModalProps> = ({
  isOpen,
  onClose,
  comp,
  selectedYear,
  periodText,
  conductoresRecurrentes,
  pctRecurrentes,
  operadoresConHistorialPrevio,
  exerciseStats,
  topConductores,
  allEvaluations = []
}) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.classList.add('single-page-report-active');
    } else {
      document.body.classList.remove('single-page-report-active');
    }
    return () => {
      document.body.classList.remove('single-page-report-active');
    };
  }, [isOpen]);

  // Top 5 operadores con menor puntaje / Red Flags (declarado antes de condicionales)
  const bottomRanked = React.useMemo(() => {
    if (!isOpen || !comp?.conductores || comp.conductores.length === 0) return [];
    const sortedAsc = [...comp.conductores].sort((a, b) => {
      if (a.promedioScore !== b.promedioScore) {
        return a.promedioScore - b.promedioScore;
      }
      const incA = (a.colisiones || 0) + (a.fatalidades || 0) + (a.totalFueraVia || 0);
      const incB = (b.colisiones || 0) + (b.fatalidades || 0) + (b.totalFueraVia || 0);
      return incB - incA;
    });
    return sortedAsc.slice(0, 5);
  }, [isOpen, comp?.conductores]);

  // Análisis de errores más recurrentes de la flota a partir de las evaluaciones
  const topRecurringMistakes = React.useMemo(() => {
    if (!isOpen || !allEvaluations || allEvaluations.length === 0) return [];

    const map = new Map<string, { error: string; repeticiones: number }>();
    allEvaluations.forEach((ev) => {
      if (Array.isArray(ev.erroresFrecuentes)) {
        ev.erroresFrecuentes.forEach((m) => {
          const rawName = (m.error || m.errorRaw || '').trim();
          if (!rawName) return;
          const key = rawName.toLowerCase();
          const current = map.get(key) || { error: rawName, repeticiones: 0 };
          current.repeticiones += m.repeticiones || 1;
          map.set(key, current);
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => b.repeticiones - a.repeticiones)
      .slice(0, 3);
  }, [isOpen, allEvaluations]);

  // Generación dinámica y contextual del Plan de Acción Recomendado
  const dynamicActionPlan = React.useMemo(() => {
    if (!isOpen) return '';

    // 1. Si hay errores recurrentes detectados, correlacionamos con focos de entrenamiento específicos
    if (topRecurringMistakes.length > 0) {
      const errText = topRecurringMistakes.map((m) => m.error.toLowerCase()).join(' ');
      const actions: string[] = [];

      if (/velocidad|aceleraci|l[ií]mite|r[aá]pido|frenad|distancia|freno/.test(errText)) {
        actions.push('gestión de velocidad regulada, anticipación visual y calibración de distancias de frenado');
      }
      if (/curva|derrap|peralte|giro|viraje/.test(errText)) {
        actions.push('control de transferencia de masas, velocidad de entrada a curvas y trazado seguro');
      }
      if (/carril|inva|l[ií]nea|orilla|salida|v[ií]a/.test(errText)) {
        actions.push('mantenimiento de carril, lectura de bordes de calzada y corrección de deriva lateral');
      }
      if (/intersecci|sem[aá]foro|alto|pare|cruce|prioridad|ceda/.test(errText)) {
        actions.push('lectura de zonas de conflicto en intersecciones, respeto a la señalización y cruces seguros');
      }
      if (/espejo|reversa|estaciona|punto ciego|retrovisor|aculat/.test(errText)) {
        actions.push('maniobras en reversa asistida, verificación de ángulos muertos y gestión del espacio perimetral');
      }
      if (/embrague|clutch|marcha|cambio|revoluci|motor|transmisi/.test(errText)) {
        actions.push('optimización en el uso de la transmisión, operación de marchas y conducción técnica económica');
      }
      if (/impacto|choque|colisi|alcance/.test(errText)) {
        actions.push('técnicas de frenado de emergencia y maniobras evasivas controladas');
      }

      // Si se encontraron 1 o más focos específicos mapeados
      if (actions.length > 0) {
        const uniqueActions = Array.from(new Set(actions));
        if (uniqueActions.length === 1) {
          return `Diseñar módulos de refuerzo intensivo focalizados en ${uniqueActions[0]}, respaldados por telemetría en simulador.`;
        }
        const lastAction = uniqueActions.pop();
        return `Implementar sesiones prácticas dirigidas prioritariamente a ${uniqueActions.join(', ')} y ${lastAction}.`;
      }

      // Si los errores tienen otros nombres no contemplados en el diccionario
      const nombresErrores = topRecurringMistakes.map((m) => `"${m.error}"`).join(' y ');
      return `Estructurar clínicas correctivas de simulación enfocadas en mitigar incidencias de ${nombresErrores}, reforzando la toma de decisiones preventiva.`;
    }

    // 2. Fallback inteligente según siniestralidad o calificaciones si no hay errores específicos desglosados
    const tieneSiniestros = (comp.totalColisiones || 0) + (comp.totalFueraVia || 0) > 0;
    if (tieneSiniestros) {
      return 'Priorizar talleres de conducción defensiva en simulador orientados a control de colisiones, maniobras de evasión y prevención de salidas de camino.';
    }

    if (comp.promedioFinal < 7.0) {
      return 'Programar sesiones de seguimiento técnico focalizadas en el grupo de operadores con bandera roja (Red Flags), estandarizando hábitos de conducción preventiva y maniobrabilidad.';
    }

    return 'Continuar con el programa preventivo anual, incorporando escenarios de complejidad climática adversa y maniobras de precisión para preservar el estándar sobresaliente de la flota.';
  }, [isOpen, topRecurringMistakes, comp.totalColisiones, comp.totalFueraVia, comp.promedioFinal]);

  if (!isOpen) return null;

  // Fecha y hora formateada para la emisión ejecutiva
  const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Tasa de incidentes general
  const totalIncidentes = (comp.totalColisiones || 0) + (comp.totalFatalidades || 0) + (comp.totalFueraVia || 0);
  const incidentRate = comp.totalConductores > 0 ? (totalIncidentes / comp.totalConductores).toFixed(2) : '0.00';

  // Distribución de niveles de aptitud
  const totalConductores = comp.conductores?.length || 0;
  const sobresalientes = comp.conductores?.filter((c) => c.promedioScore >= 8.0).length || 0;
  const aprobados = comp.conductores?.filter((c) => c.promedioScore >= 6.0 && c.promedioScore < 8.0).length || 0;
  const refuerzo = comp.conductores?.filter((c) => c.promedioScore < 6.0).length || 0;

  const pctSobresalientes = totalConductores > 0 ? Math.round((sobresalientes / totalConductores) * 100) : 0;
  const pctAprobados = totalConductores > 0 ? Math.round((aprobados / totalConductores) * 100) : 0;
  const pctRefuerzo = totalConductores > 0 ? Math.round((refuerzo / totalConductores) * 100) : 0;

  // Filtrar top ejercicios (hasta 6 ejercicios más representativos)
  const topExercises = exerciseStats.slice(0, 6);

  // Top 5 conductores del ranking (Honor)
  const topRanked = topConductores.slice(0, 5);

  const handlePrint = () => {
    const prevTitle = document.title;
    const safeCompany = (comp.nombre || 'Flota').trim().replace(/\s+/g, '_');
    const safeYear = selectedYear && selectedYear !== 'all' ? selectedYear : 'Historico';
    document.title = `Single-Page_${safeCompany}_${safeYear}`;

    void logAudit({
      categoria: 'datos',
      accion: 'imprimir',
      empresas: [comp.nombre],
      detalle: `Reporte Single-Page PDF de ${comp.nombre} (${periodText})`
    });

    try {
      window.print();
    } finally {
      setTimeout(() => {
        document.title = prevTitle;
      }, 1000);
    }
  };

  return (
    <div
      className="modal-overlay active"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        className="single-page-modal-dialog"
        style={{
          width: '100%',
          maxWidth: '940px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--border-glow, #38bdf8)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior de controles (no se imprime) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-app, #f8fafc)',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main, #0f172a)' }}>
                Reporte Ejecutivo Single-Page (1 Página)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                Filtros activos: <strong>{comp.nombre}</strong> • <strong>{periodText}</strong>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <span>🖨️</span>
              <span>Imprimir Single-Page</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Hoja Single-Page en formato carta A4/Letter optimizado */}
        <div
          className="single-page-scroll-wrapper"
          style={{
            overflowY: 'auto',
            padding: '1.5rem',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <div
            id="single-page-report-sheet"
            className="single-page-sheet"
            style={{
              width: '100%',
              maxWidth: '840px',
              minHeight: '1060px',
              background: '#ffffff',
              color: '#0f172a',
              boxSizing: 'border-box',
              padding: '1.5rem 1.85rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
            }}
          >
            {/* CABECERA CORPORATIVA */}
            <div
              style={{
                borderBottom: '2.5px solid #0284c7',
                paddingBottom: '0.65rem',
                marginBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img
                    src="/Logo%20NN.png"
                    alt="TrackSIM Logo"
                    style={{
                      height: '38px',
                      maxWidth: '140px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                  <span style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>
                    TRACK<span style={{ color: '#0284c7' }}>SIM</span> <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>CLOUD</span>
                  </span>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  INFORME EJECUTIVO DE RENDIMIENTO DE FLOTA
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.1rem' }}>
                  Resumen de competencias en simulación de conducción y prevención vial
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#475569' }}>
                <div style={{ fontWeight: 700, color: '#0284c7', fontSize: '0.85rem' }}>FICHA OFICIAL</div>
                <div style={{ marginTop: '0.1rem' }}>Emisión: <strong>{fechaGeneracion}</strong></div>
                <div style={{ marginTop: '0.1rem' }}>Estado: <strong style={{ color: '#16a34a' }}>Validado</strong></div>
              </div>
            </div>

            {/* BARRA DE FILTROS APLICADOS */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                marginBottom: '0.75rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                fontSize: '0.8rem'
              }}
            >
              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.66rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Flota / Empresa
                </span>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{comp.nombre}</strong>
                {comp.esGlobal && <span style={{ fontSize: '0.72rem', color: '#0284c7', display: 'block' }}>(Consolidado)</span>}
              </div>

              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.66rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Periodo Evaluado
                </span>
                <strong style={{ fontSize: '0.92rem', color: '#0284c7' }}>{periodText}</strong>
              </div>

              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.66rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Cobertura Geográfica
                </span>
                <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                  {comp.sedes && comp.sedes.length > 0 ? comp.sedes.join(', ') : 'Sede Principal'}
                </span>
              </div>
            </div>

            {/* SECCIÓN 1: 5 KPIS EJECUTIVOS */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '0.55rem',
                marginBottom: '0.75rem'
              }}
            >
              {/* KPI 1: Operadores */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.45rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Operadores
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7', marginTop: '0.1rem' }}>
                  {comp.totalConductores}
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b', display: 'block' }}>{comp.totalEvaluaciones} reportes</span>
              </div>

              {/* KPI 2: Calificación Promedio */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.45rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Promedio Global
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: comp.promedioFinal >= 8.0 ? '#16a34a' : comp.promedioFinal >= 6.0 ? '#0284c7' : '#dc2626',
                    marginTop: '0.1rem'
                  }}
                >
                  {comp.promedioFinal.toFixed(2)}
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b', display: 'block' }}>Escala 0 - 10</span>
              </div>

              {/* KPI 3: Aprobación */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.45rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Tasa Aprobación
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: comp.tasaAprobacion >= 80 ? '#16a34a' : comp.tasaAprobacion >= 60 ? '#d97706' : '#dc2626',
                    marginTop: '0.1rem'
                  }}
                >
                  {comp.tasaAprobacion.toFixed(1)}%
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b', display: 'block' }}>Calif. ≥ 6.0 pts</span>
              </div>

              {/* KPI 4: Recurrencia */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.45rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  {selectedYear && selectedYear !== 'all' ? 'Con Historial' : 'Recurrentes'}
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea', marginTop: '0.1rem' }}>
                  {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio
                    ? `${operadoresConHistorialPrevio.pct}%`
                    : `${pctRecurrentes}%`}
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b', display: 'block' }}>
                  {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio
                    ? `${operadoresConHistorialPrevio.count} op. previos`
                    : `${conductoresRecurrentes} con >1 eval`}
                </span>
              </div>

              {/* KPI 5: Tasa Incidentes */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.45rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Tasa Siniestros
                </span>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: Number(incidentRate) > 1.0 ? '#dc2626' : Number(incidentRate) > 0 ? '#d97706' : '#16a34a',
                    marginTop: '0.1rem'
                  }}
                >
                  {incidentRate}
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b', display: 'block' }}>{totalIncidentes} tot / operador</span>
              </div>
            </div>

            {/* BARRA DE DESGLOSE DE SINIESTROS POR TIPO */}
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '8px',
                padding: '0.45rem 0.8rem',
                marginBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.4rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.95rem' }}>🚨</span>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: '#9f1239' }}>
                  Desglose de Siniestros Acumulados ({totalIncidentes} eventos en total):
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.35rem', fontSize: '0.76rem' }}>
                <span style={{ color: '#be123c', fontWeight: 600 }}>
                  💥 <strong>{comp.totalColisiones || 0}</strong> Colisiones
                </span>
                <span style={{ color: '#c2410c', fontWeight: 600 }}>
                  ⚠️ <strong>{comp.totalFueraVia || 0}</strong> Salidas de Vía
                </span>
                <span style={{ color: '#881337', fontWeight: 700 }}>
                  🛑 <strong>{comp.totalFatalidades || 0}</strong> Fatalidades
                </span>
              </div>
            </div>

            {/* DISTRIBUCIÓN DE APTITUD VISUAL (BARRA SEGMENTADA) */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.85rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.76rem' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>Distribución de Aptitud de la Flota</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Total: {totalConductores} operadores calificados</span>
              </div>
              <div style={{ display: 'flex', height: '13px', borderRadius: '5px', overflow: 'hidden', background: '#e2e8f0' }}>
                <div style={{ width: `${pctSobresalientes}%`, background: '#16a34a' }} title={`Sobresalientes: ${sobresalientes} (${pctSobresalientes}%)`} />
                <div style={{ width: `${pctAprobados}%`, background: '#0284c7' }} title={`Aprobados: ${aprobados} (${pctAprobados}%)`} />
                <div style={{ width: `${pctRefuerzo}%`, background: '#dc2626' }} title={`Requiere Refuerzo: ${refuerzo} (${pctRefuerzo}%)`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.7rem' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>● Sobresaliente (≥8.0): {sobresalientes} ({pctSobresalientes}%)</span>
                <span style={{ color: '#0284c7', fontWeight: 700 }}>● Aprobado (6.0 - 7.9): {aprobados} ({pctAprobados}%)</span>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>● Requiere Refuerzo (&lt;6.0): {refuerzo} ({pctRefuerzo}%)</span>
              </div>
            </div>

            {/* SECCIÓN 2: 3 COLUMNAS (EJERCICIOS + CUADRO DE HONOR + RED FLAGS) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
              {/* Columna 1: Ejercicios Realizados */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.65rem', background: '#ffffff' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#0f172a', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📊 Rendimiento Ejercicios</span>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>{exerciseStats.length} reg.</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Ejercicio</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '28px' }}>Evs</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '40px' }}>Score</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '48px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topExercises.length > 0 ? (
                      topExercises.map((ex, idx) => {
                        const isTop = ex.promedio >= 8.0;
                        const isPass = ex.promedio >= 6.0;
                        const scoreColor = isTop ? '#16a34a' : isPass ? '#0284c7' : '#dc2626';
                        const estado = isTop ? 'Excelente' : isPass ? 'Aprobado' : 'Refuerzo';

                        return (
                          <tr key={ex.key} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '2.5px 3px', fontWeight: 600, color: '#334155', maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ex.nombre}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', color: '#64748b' }}>{ex.totalEvaluaciones}</td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                              {ex.promedio.toFixed(1)}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontSize: '6.8pt', fontWeight: 700, color: scoreColor }}>
                              {estado}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                          Sin ejercicios
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Columna 2: Cuadro de Honor (Top 5 Mejores) */}
              <div style={{ border: '1px solid #dcfce7', borderRadius: '8px', padding: '0.55rem 0.65rem', background: '#f0fdf4' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#166534', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🏆 Cuadro de Honor</span>
                  <span style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 600 }}>Top 5</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt' }}>
                  <thead>
                    <tr style={{ background: '#dcfce7', borderBottom: '1.5px solid #86efac' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '22px' }}>#</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Operador</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '40px' }}>Score</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '32px' }}>Siniest.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRanked.length > 0 ? (
                      topRanked.map((c, idx) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        const rankLabel = medals[idx] || `${idx + 1}`;
                        const totIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                        return (
                          <tr key={c.nombre + idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f0fdf4' }}>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700 }}>{rankLabel}</td>
                            <td style={{ padding: '2.5px 3px', fontWeight: 600, color: '#0f172a', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.nombre}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700, color: '#15803d' }}>
                              {c.promedioScore.toFixed(1)}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 600, color: totIncidentes > 0 ? '#dc2626' : '#15803d' }}>
                              {totIncidentes}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                          Sin operadores
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Columna 3: Red Flags (Top 5 con Menor Calificación / Atención Prioritaria) */}
              <div style={{ border: '1px solid #fee2e2', borderRadius: '8px', padding: '0.55rem 0.65rem', background: '#fff5f5' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#991b1b', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚩 Red Flags (Atención Prioritaria)</span>
                  <span style={{ fontSize: '0.68rem', color: '#b91c1c', fontWeight: 600 }}>Top 5</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt' }}>
                  <thead>
                    <tr style={{ background: '#fee2e2', borderBottom: '1.5px solid #fca5a5' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '22px' }}>#</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Operador</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '40px' }}>Score</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '32px' }}>Siniest.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottomRanked.length > 0 ? (
                      bottomRanked.map((c, idx) => {
                        const totIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                        return (
                          <tr key={c.nombre + idx} style={{ borderBottom: '1px solid #fee2e2', background: idx % 2 === 0 ? '#ffffff' : '#fff5f5' }}>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                              ⚠️{idx + 1}
                            </td>
                            <td style={{ padding: '2.5px 3px', fontWeight: 600, color: '#7f1d1d', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.nombre}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                              {c.promedioScore.toFixed(1)}
                            </td>
                            <td style={{ padding: '2.5px 3px', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                              {totIncidentes}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                          Sin operadores
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN 3: DIAGNÓSTICO OPERATIVO */}
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                background: '#f8fafc',
                padding: '0.65rem 0.95rem',
                marginBottom: '0.65rem'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📋</span>
                <span>Diagnóstico Operativo y Estado de la Flota</span>
              </div>
              <div style={{ fontSize: '7.6pt', color: '#334155', lineHeight: 1.45 }}>
                <p style={{ margin: '0 0 0.3rem 0' }}>
                  • <strong>Alineación Técnica:</strong> La flota alcanzó una calificación media de <strong>{comp.promedioFinal.toFixed(2)}/10</strong> con un <strong>{comp.tasaAprobacion.toFixed(1)}%</strong> de operadores aprobados. {comp.promedioFinal >= 7.5 ? 'El rendimiento demuestra solidez en el control vehicular y maniobrabilidad.' : 'Se recomienda reforzar prácticas en simulador para estandarizar el dominio técnico.'}
                </p>
                <p style={{ margin: '0 0 0.3rem 0' }}>
                  • <strong>Control de Incidentes:</strong> Se registraron {totalIncidentes} siniestros acumulados ({incidentRate} por conductor) con {comp.totalColisiones || 0} colisiones y {comp.totalFueraVia || 0} salidas de vía registradas en el simulador.
                </p>
                <p style={{ margin: 0 }}>
                  • <strong>Continuidad de Capacitación:</strong> {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio ? `El ${operadoresConHistorialPrevio.pct}% del grupo cuenta con registros previos en años anteriores, lo que facilita el análisis de evolución y retención de destrezas.` : `El ${pctRecurrentes}% de los conductores registra más de una sesión, facilitando el seguimiento preventivo continuo.`}
                </p>
              </div>
            </div>

            {/* SECCIÓN 4: RECOMENDACIONES PREVENTIVAS BASADAS EN ERRORES RECURRENTES */}
            <div
              style={{
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                background: '#eff6ff',
                padding: '0.65rem 0.95rem',
                marginBottom: '0.75rem'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e40af', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>💡</span>
                <span>Recomendaciones Preventivas (Basadas en Errores Más Recurrentes)</span>
              </div>
              <div style={{ fontSize: '7.6pt', color: '#1e3a8a', lineHeight: 1.45 }}>
                {topRecurringMistakes.length > 0 && (
                  <p style={{ margin: '0 0 0.25rem 0' }}>
                    • <strong>Patrones de Falla Detectados:</strong> Las incidencias con mayor frecuencia en la flota son:{' '}
                    <strong>{topRecurringMistakes.map((m) => `"${m.error}" (${m.repeticiones} repeticiones)`).join(', ')}</strong>.
                  </p>
                )}
                <p style={{ margin: 0 }}>
                  • <strong>Plan de Acción Recomendado:</strong> {dynamicActionPlan}
                </p>
              </div>
            </div>

            {/* PIE DE PÁGINA FORMAL Y FIRMAS */}
            <div
              style={{
                borderTop: '1.5px solid #cbd5e1',
                paddingTop: '0.65rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                fontSize: '7pt',
                color: '#64748b'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#334155', fontSize: '7.6pt' }}>TrackSIM Cloud • Plataforma de Telemetría y Seguimiento</div>
                <div style={{ marginTop: '0.1rem' }}>Documento emitido para fines de análisis de seguridad patrimonial y acreditación técnica.</div>
                <div style={{ marginTop: '0.1rem' }}>ID Reporte: TS-{comp.slug?.toUpperCase().slice(0, 6) || 'FLOTA'}-{selectedYear || 'ALL'}-{Math.random().toString(36).substring(2, 7).toUpperCase()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
