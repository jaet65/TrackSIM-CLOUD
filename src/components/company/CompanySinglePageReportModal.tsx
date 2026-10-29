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
  allEvaluations: _allEvaluations
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

  // Top 5 conductores del ranking
  const topRanked = topConductores.slice(0, 5);

  const handlePrint = () => {
    const prevTitle = document.title;
    const safeCompany = (comp.nombre || 'Flota').trim();
    const safeYear = selectedYear && selectedYear !== 'all' ? `Ano_${selectedYear}` : 'Historico';
    document.title = `Reporte_Ejecutivo_TrackSIM_${safeCompany}_${safeYear}`;

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
          maxWidth: '920px',
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
              <span>Imprimir / Guardar 1 Página PDF</span>
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
              maxWidth: '820px',
              minHeight: '1050px',
              background: '#ffffff',
              color: '#0f172a',
              boxSizing: 'border-box',
              padding: '1.5rem 1.75rem',
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
                paddingBottom: '0.75rem',
                marginBottom: '1rem',
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
                    TRACK<span style={{ color: '#0284c7' }}>SIM</span> <span style={{ fontSize: '1.35rem', color: '#64748b', fontWeight: 600 }}>CLOUD</span>
                  </span>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
                  INFORME EJECUTIVO DE RENDIMIENTO DE FLOTA
                </div>
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.15rem' }}>
                  Resumen de competencias en simulación de conducción y prevención vial
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#475569' }}>
                <div style={{ fontWeight: 700, color: '#0284c7', fontSize: '0.85rem' }}>FICHA OFICIAL</div>
                <div>Emisión: <strong>{fechaGeneracion}</strong></div>
                <div>Estado: <strong style={{ color: '#16a34a' }}>Validado</strong></div>
              </div>
            </div>

            {/* BARRA DE FILTROS APLICADOS */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                marginBottom: '1rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                fontSize: '0.8rem'
              }}
            >
              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.68rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Flota / Empresa
                </span>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{comp.nombre}</strong>
                {comp.esGlobal && <span style={{ fontSize: '0.72rem', color: '#0284c7', display: 'block' }}>(Consolidado)</span>}
              </div>

              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.68rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Periodo Evaluado
                </span>
                <strong style={{ fontSize: '0.92rem', color: '#0284c7' }}>{periodText}</strong>
              </div>

              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.68rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
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
                gap: '0.5rem',
                marginBottom: '1rem'
              }}
            >
              {/* KPI 1: Operadores */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  Operadores
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7', marginTop: '0.1rem' }}>
                  {comp.totalConductores}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{comp.totalEvaluaciones} reportes</span>
              </div>

              {/* KPI 2: Calificación Promedio */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
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
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Escala 0 - 10</span>
              </div>

              {/* KPI 3: Aprobación */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
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
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Calif. ≥ 6.0 pts</span>
              </div>

              {/* KPI 4: Recurrencia */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
                  {selectedYear && selectedYear !== 'all' ? 'Con Historial' : 'Recurrentes'}
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea', marginTop: '0.1rem' }}>
                  {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio
                    ? `${operadoresConHistorialPrevio.pct}%`
                    : `${pctRecurrentes}%`}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                  {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio
                    ? `${operadoresConHistorialPrevio.count} op. previos`
                    : `${conductoresRecurrentes} con >1 eval`}
                </span>
              </div>

              {/* KPI 5: Tasa Incidentes */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block' }}>
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
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{totalIncidentes} tot / operador</span>
              </div>
            </div>

            {/* DISTRIBUCIÓN DE APTITUD VISUAL (BARRA SEGMENTADA) */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>Distribución de Aptitud de la Flota</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Total: {totalConductores} operadores calificados</span>
              </div>
              <div style={{ display: 'flex', height: '14px', borderRadius: '6px', overflow: 'hidden', background: '#e2e8f0' }}>
                <div style={{ width: `${pctSobresalientes}%`, background: '#16a34a' }} title={`Sobresalientes: ${sobresalientes} (${pctSobresalientes}%)`} />
                <div style={{ width: `${pctAprobados}%`, background: '#0284c7' }} title={`Aprobados: ${aprobados} (${pctAprobados}%)`} />
                <div style={{ width: `${pctRefuerzo}%`, background: '#dc2626' }} title={`Requiere Refuerzo: ${refuerzo} (${pctRefuerzo}%)`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.7rem' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>● Sobresaliente (≥8.0): {sobresalientes} ({pctSobresalientes}%)</span>
                <span style={{ color: '#0284c7', fontWeight: 700 }}>● Aprobado (6.0 - 7.9): {aprobados} ({pctAprobados}%)</span>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>● Requiere Refuerzo (&lt;6.0): {refuerzo} ({pctRefuerzo}%)</span>
              </div>
            </div>

            {/* SECCIÓN 2: 2 COLUMNAS (RENDIMIENTO EN EJERCICIOS + TOP CONDUCTORES) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
              {/* Columna Izquierda: Ejercicios Realizados */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.75rem', background: '#ffffff' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.45rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📊 Rendimiento por Ejercicio</span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>{exerciseStats.length} ej. registrados</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Ejercicio</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '40px' }}>Evals</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '55px' }}>Promedio</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '65px' }}>Estado</th>
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
                            <td style={{ padding: '3px 4px', fontWeight: 600, color: '#334155' }}>{ex.nombre}</td>
                            <td style={{ padding: '3px 4px', textAlign: 'center', color: '#64748b' }}>{ex.totalEvaluaciones}</td>
                            <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                              {ex.promedio.toFixed(2)}
                            </td>
                            <td style={{ padding: '3px 4px', textAlign: 'center', fontSize: '7pt', fontWeight: 700, color: scoreColor }}>
                              {estado}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                          Sin ejercicios registrados en este periodo
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Columna Derecha: Top Cuadro de Honor */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.75rem', background: '#ffffff' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.45rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🏆 Cuadro de Honor (Top Operadores)</span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>Top 5</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '28px' }}>#</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Operador</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left' }}>Sede</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '55px' }}>Score</th>
                      <th style={{ padding: '3px 4px', textAlign: 'center', width: '45px' }}>Siniestros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRanked.length > 0 ? (
                      topRanked.map((c, idx) => {
                        const scoreColor = c.promedioScore >= 8.0 ? '#16a34a' : '#0284c7';
                        const medals = ['🥇', '🥈', '🥉'];
                        const rankLabel = medals[idx] || `${idx + 1}`;
                        const totIncidentes = (c.colisiones || 0) + (c.fatalidades || 0) + (c.totalFueraVia || 0);

                        return (
                          <tr key={c.nombre + idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 700 }}>{rankLabel}</td>
                            <td style={{ padding: '3px 4px', fontWeight: 600, color: '#0f172a' }}>{c.nombre}</td>
                            <td style={{ padding: '3px 4px', color: '#64748b' }}>{c.sede || 'Principal'}</td>
                            <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                              {c.promedioScore.toFixed(2)}
                            </td>
                            <td style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 600, color: totIncidentes > 0 ? '#dc2626' : '#16a34a' }}>
                              {totIncidentes}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                          Sin operadores registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN 3: DIAGNÓSTICO Y CONCLUSIONES RECOMENDADAS */}
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                background: '#f8fafc',
                padding: '0.65rem 0.85rem',
                marginBottom: '0.85rem'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📋</span>
                <span>Diagnóstico Operativo y Recomendaciones de Seguridad</span>
              </div>
              <div style={{ fontSize: '7.5pt', color: '#334155', lineHeight: 1.45 }}>
                <p style={{ margin: '0 0 0.35rem 0' }}>
                  • <strong>Alineación Técnica:</strong> La flota alcanzó una calificación media de <strong>{comp.promedioFinal.toFixed(2)}/10</strong> con un <strong>{comp.tasaAprobacion.toFixed(1)}%</strong> de operadores aprobados. {comp.promedioFinal >= 7.5 ? 'El rendimiento demuestra solidez en el control vehicular y maniobrabilidad.' : 'Se recomienda reforzar prácticas en simulator para estandarizar el dominio técnico.'}
                </p>
                <p style={{ margin: '0 0 0.35rem 0' }}>
                  • <strong>Control de Incidentes:</strong> Se registraron {totalIncidentes} siniestros acumulados ({incidentRate} por conductor). {Number(incidentRate) <= 0.5 ? 'Excelente índice de seguridad y baja siniestralidad durante los escenarios simulados.' : 'Priorizar ejercicios de distancia de seguimiento y control de velocidad en curvas.'}
                </p>
                <p style={{ margin: 0 }}>
                  • <strong>Continuidad de Capacitación:</strong> {selectedYear && selectedYear !== 'all' && operadoresConHistorialPrevio ? `El ${operadoresConHistorialPrevio.pct}% del grupo cuenta con registros previos en años anteriores, lo que facilita el análisis de evolución y retención de destrezas.` : `El ${pctRecurrentes}% de los conductores registra más de una sesión, facilitando el seguimiento preventivo continuo.`}
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
                <div style={{ fontWeight: 700, color: '#334155' }}>TrackSIM Cloud • Plataforma de Telemetría y Seguimiento</div>
                <div>Documento generado para fines de evaluación interna y acreditación técnica.</div>
                <div>ID Reporte: TS-{comp.slug?.toUpperCase().slice(0, 6) || 'FLOTA'}-{selectedYear || 'ALL'}-{Math.random().toString(36).substring(2, 7).toUpperCase()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
