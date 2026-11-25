import React, { useEffect, useRef, useState } from 'react';
import { CompanySummary, Evaluation } from '../../types';
import { logAudit } from '../../services/auditLog';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { createCompanySummaryFromEvaluations, getEvaluationYear } from '../../services/analytics';
import { getCriticalMistakes, getEvaluationIncidentCounts } from '../../services/incidentMetrics';

interface ExerciseStatItem {
  key: string;
  nombre: string;
  promedio: number;
  totalEvaluaciones: number;
}

const EMPTY_EXERCISE_STATS: ExerciseStatItem[] = [];

interface CompanyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  comp: CompanySummary;
  selectedYear: string;
  periodText: string;
  exerciseStats?: ExerciseStatItem[];
  allEvaluations: Evaluation[];
}

export const CompanyReportModal: React.FC<CompanyReportModalProps> = ({
  isOpen,
  onClose,
  comp,
  selectedYear,
  periodText,
  exerciseStats = EMPTY_EXERCISE_STATS,
  allEvaluations
}) => {
  useEscapeKey(isOpen, onClose);

  const [previewDocument, setPreviewDocument] = useState('');
  const [previewError, setPreviewError] = useState('');
  const previewFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewDocument('');
      setPreviewError('');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const criticalIncidents = new Map<string, { name: string; count: number }>();
    const addCriticalIncident = (name: string, count: number) => {
      if (count <= 0) return;
      const key = name.toLowerCase();
      const item = criticalIncidents.get(key) || { name, count: 0 };
      item.count += count;
      criticalIncidents.set(key, item);
    };
    allEvaluations.forEach((evaluation) => {
      if (evaluation.origen === 'TrackSIM-ZERO-V2') {
        const mistakes = getCriticalMistakes(evaluation.erroresFrecuentes || []);
        if (mistakes.length > 0) {
          mistakes.forEach((mistake) => addCriticalIncident(mistake.error, mistake.repeticiones));
        } else {
          addCriticalIncident('Sin desglose disponible', evaluation.accidentesCriticos || 0);
        }
      } else {
        const incidents = getEvaluationIncidentCounts(evaluation);
        addCriticalIncident('Colisiones', incidents.colisiones);
        addCriticalIncident('Fatalidades', incidents.fatalidades);
        addCriticalIncident('Salidas de vía', incidents.vehiculoFueraVia);
      }
    });
    const criticalIncidentItems = Array.from(criticalIncidents.values()).sort((a, b) => b.count - a.count);
    const criticalIncidentCount = criticalIncidentItems.reduce((total, item) => total + item.count, 0);
    const criticalIncidentRows = criticalIncidentItems
      .map((item) => `<tr><td>${escapeHtml(item.name)}</td><td class="number">${item.count}</td></tr>`)
      .join('');

    const operators = createCompanySummaryFromEvaluations(comp.nombre, comp.slug, allEvaluations).conductores
      .sort((a, b) => b.promedioScore - a.promedioScore);
    const recurrentOperators = operators.filter((operator) => operator.totalEvaluaciones > 1);
    const operatorRows = operators.map((operator, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(operator.nombre)}</strong></td>
        <td>${escapeHtml(operator.sede || 'Sede Principal')}</td>
        <td class="number">${operator.totalEvaluaciones}</td>
        <td class="number">${operator.promedioScore.toFixed(2)} / 10</td>
        <td class="number">${operator.ultimoScore.toFixed(2)} / 10</td>
        <td>${escapeHtml(operator.ultimaFecha)}</td>
        <td>${escapeHtml(operator.estado || (operator.promedioScore >= 6 ? 'Aprobado' : 'No Aprobado'))}</td>
      </tr>`).join('');
    const exerciseRows = exerciseStats.map((exercise, index) => {
      const level = exercise.promedio >= 8 ? 'Sobresaliente' : exercise.promedio >= 6 ? 'Aprobado' : 'Requiere Refuerzo';
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(exercise.nombre)}</strong></td>
          <td class="number">${exercise.totalEvaluaciones}</td>
          <td class="number">${exercise.promedio.toFixed(2)} / 10</td>
          <td>${level}</td>
        </tr>`;
    }).join('');

    const getDate = (evaluation: Evaluation) => {
      const raw = evaluation.fechaCapacitacion || evaluation.fechaReporte || evaluation.fecha || evaluation.fechaCapacitacionFormato || '';
      const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
      const local = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!iso && !local) return null;
      const year = Number(iso ? iso[1] : local![3]);
      const month = Number(iso ? iso[2] : local![2]);
      const day = Number(iso ? iso[3] : local![1]);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date.getTime()
        : null;
    };
    const getScore = (evaluation: Evaluation) => {
      const score = evaluation.evaluacionFinalPuntos ?? evaluation.calificacionExacta ?? evaluation.promedioScore;
      return typeof score === 'number' && Number.isFinite(score) ? score : null;
    };
    const evaluationsByOperator = new Map<string, Evaluation[]>();
    allEvaluations.forEach((evaluation) => {
      const name = (evaluation.conductor || evaluation.operador || 'Sin Asignar').trim();
      const evaluations = evaluationsByOperator.get(name) || [];
      evaluations.push(evaluation);
      evaluationsByOperator.set(name, evaluations);
    });
    const histories = recurrentOperators.map((operator) => {
      const evaluations = [...(evaluationsByOperator.get(operator.nombre) || [])]
        .sort((a, b) => (getDate(a) ?? Infinity) - (getDate(b) ?? Infinity));
      const comparable =
        evaluations.every((evaluation) => getDate(evaluation) !== null && getScore(evaluation) !== null) &&
        getDate(evaluations[0]) !== getDate(evaluations[1]) &&
        getDate(evaluations[evaluations.length - 2]) !== getDate(evaluations[evaluations.length - 1]);
      const first = comparable ? getScore(evaluations[0]) : null;
      const last = comparable ? getScore(evaluations[evaluations.length - 1]) : null;
      const difference = first !== null && last !== null ? last - first : null;
      return { operator, first, last, difference };
    });
    const recurrentOperatorRows = histories.map(({ operator, first, last, difference }, index) => {
      const trend = difference === null ? 'No comparable' : difference > 0.2 ? 'Mejora' : difference < -0.2 ? 'Retroceso' : 'Estable';
      const change = difference === null ? '—' : `${difference > 0 ? '+' : ''}${difference.toFixed(2)} pts`;
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(operator.nombre)}</strong></td>
        <td class="number">${operator.totalEvaluaciones}</td>
        <td class="number">${first === null ? '—' : first.toFixed(2)}</td>
        <td class="number">${last === null ? '—' : last.toFixed(2)}</td>
        <td class="number">${change}</td>
        <td>${trend}</td>
      </tr>`;
    }).join('');
    const annualData = new Map<string, { score: number; count: number; incidents: number; operators: Set<string> }>();
    let undatedEvaluations = 0;
    allEvaluations.forEach((evaluation) => {
      const year = getEvaluationYear(evaluation);
      if (!year) {
        undatedEvaluations += 1;
        return;
      }
      const data = annualData.get(year) || { score: 0, count: 0, incidents: 0, operators: new Set<string>() };
      const incidents = getEvaluationIncidentCounts(evaluation);
      data.score += getScore(evaluation) ?? 0;
      data.count += 1;
      data.incidents += incidents.colisiones + incidents.fatalidades + incidents.vehiculoFueraVia;
      data.operators.add((evaluation.conductor || evaluation.operador || 'Sin Asignar').trim());
      annualData.set(year, data);
    });
    const annualRows = Array.from(annualData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({
        year,
        average: Number((data.score / data.count).toFixed(2)),
        rate: Number((data.incidents / data.operators.size).toFixed(2))
      }));
    const chart = (values: number[], maximum: number, color: string, label: string) => {
      const left = 55;
      const right = 755;
      const top = 25;
      const bottom = 175;
      const points = values.map((value, index) => ({
        x: values.length === 1 ? (left + right) / 2 : left + index * (right - left) / (values.length - 1),
        y: bottom - (value / maximum) * (bottom - top),
        value
      }));
      return `<svg viewBox="0 0 810 215" role="img" aria-label="${label}" class="annual-chart">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#94a3b8"/>
        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#94a3b8"/>
        <text x="45" y="${top + 4}" text-anchor="end">${maximum.toFixed(2)}</text>
        <text x="45" y="${bottom + 4}" text-anchor="end">0</text>
        <polyline fill="none" stroke="${color}" stroke-width="3" points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"/>
        ${points.map((point, index) => `<g><title>${annualRows[index].year}: ${point.value.toFixed(2)}</title><circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"/><text x="${point.x}" y="${point.y - 9}" text-anchor="middle">${point.value.toFixed(2)}</text><text x="${point.x}" y="198" text-anchor="middle">${annualRows[index].year}</text></g>`).join('')}
      </svg>`;
    };
    const rateChange = annualRows.length >= 2 ? annualRows[annualRows.length - 1].rate - annualRows[0].rate : null;
    const rateTrend = rateChange === null
      ? 'Se necesitan al menos dos años para comparar la tasa.'
      : rateChange < 0
        ? `Reducción de ${Math.abs(rateChange).toFixed(2)} incidentes por operador entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`
        : rateChange > 0
          ? `Aumento de ${rateChange.toFixed(2)} incidentes por operador entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`
          : `La tasa se mantuvo igual entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`;

    const report = `
      <main class="company-report-document">
        <header class="company-report-masthead">
          <div class="company-report-brand">TRACKSIM CLOUD</div>
          <h1>Expediente ejecutivo de flota</h1>
          <div class="company-report-metadata">
            <span>${escapeHtml(comp.nombre)}</span>
            <span>${escapeHtml(periodText)}</span>
            <span>Emitido el ${escapeHtml(new Date().toLocaleDateString('es-MX'))}</span>
          </div>
        </header>
        <section class="report-section">
          <h2>Resumen ejecutivo</h2>
          <div class="kpi-grid">
            <div><span>Operadores</span><strong>${comp.totalConductores}</strong></div>
            <div><span>Operadores con más de una evaluación</span><strong>${recurrentOperators.length}</strong></div>
            <div><span>Promedio de flota</span><strong>${comp.promedioFinal.toFixed(2)} / 10</strong></div>
            <div><span>Tasa de aprobación</span><strong>${comp.tasaAprobacion.toFixed(1)}%</strong></div>
            <div><span>Incidencias críticas</span><strong>${criticalIncidentCount}</strong></div>
            <div><span>Sedes</span><strong>${comp.sedes?.length || 0}</strong></div>
          </div>
        </section>
        <section class="report-section">
          <h2>Desglose de incidencias críticas</h2>
          ${criticalIncidentRows
            ? `<table><thead><tr><th>Tipo de incidencia</th><th class="number">Cantidad</th></tr></thead><tbody>${criticalIncidentRows}</tbody></table>`
            : `<p>${allEvaluations.length > 0 ? 'No se registraron incidencias críticas en el periodo.' : 'No hay evaluaciones disponibles para el periodo.'}</p>`}
        </section>
        ${exerciseRows ? `<section class="report-section"><h2>Desempeño por ejercicio</h2><table><thead><tr><th>#</th><th>Ejercicio</th><th class="number">Evaluaciones</th><th class="number">Promedio</th><th>Nivel</th></tr></thead><tbody>${exerciseRows}</tbody></table></section>` : ''}
        ${operatorRows ? `<section class="report-section"><h2>Métricas por operador</h2><table><thead><tr><th>#</th><th>Operador</th><th>Sede</th><th class="number">Evaluaciones</th><th class="number">Promedio</th><th class="number">Última calificación</th><th>Última fecha</th><th>Estado</th></tr></thead><tbody>${operatorRows}</tbody></table></section>` : ''}
        ${recurrentOperatorRows ? `<section class="report-section"><h2>Evolución por operador recurrente</h2><p>Comparación entre la primera y la última evaluación del periodo. Cambio en puntos sobre 10.</p><table><thead><tr><th>#</th><th>Operador</th><th class="number">Evaluaciones</th><th class="number">Primera</th><th class="number">Última</th><th class="number">Cambio</th><th>Tendencia</th></tr></thead><tbody>${recurrentOperatorRows}</tbody></table><p>Sin fechas o calificaciones completas, o con varias evaluaciones en la primera o última fecha, la evolución no es comparable.</p></section>` : ''}
        <section class="report-section">
          <h2>Evolución anual de la flota</h2>
          ${annualRows.length ? `<p>Calificación promedio por evaluación (0 a 10).</p>${chart(annualRows.map((row) => row.average), 10, '#0284c7', 'Calificación promedio anual de la flota')}` : '<p>No hay evaluaciones con año disponible para generar la gráfica.</p>'}
          ${undatedEvaluations ? `<p>${undatedEvaluations} ${undatedEvaluations === 1 ? 'evaluación sin año se excluyó' : 'evaluaciones sin año se excluyeron'} de las gráficas.</p>` : ''}
        </section>
        <section class="report-section">
          <h2>Tasa anual de siniestralidad</h2>
          ${annualRows.length ? `<p>Incidentes viales (colisiones, fatalidades y salidas de vía) por operador evaluado en cada año.</p>${chart(annualRows.map((row) => row.rate), Math.max(1, ...annualRows.map((row) => row.rate)), '#e11d48', 'Incidentes viales anuales por operador evaluado')}<p>${rateTrend}</p>` : '<p>No hay evaluaciones con año disponible para generar la gráfica.</p>'}
        </section>
      </main>`;

    const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map((stylesheet) => stylesheet.outerHTML)
      .join('');
    const inlineStyles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.outerHTML)
      .join('');
    const theme = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    const themeAttribute = theme ? ` data-theme="${theme}"` : '';

    setPreviewDocument(`<!doctype html>
      <html${themeAttribute}>
        <head>
          <base href="${document.baseURI}">
          <meta charset="utf-8">
          ${stylesheets}
          ${inlineStyles}
          <title>TrackSIM Cloud - Expediente ejecutivo</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; }
            html, body { width: 100%; min-height: 100%; margin: 0; padding: 0; background: #f1f5f9 !important; color: #172033 !important; font: 9pt/1.45 "Segoe UI", Arial, sans-serif !important; overflow: visible !important; }
            .no-print, .navbar, .subnav-tabs, button, .badge-info, .screen-only { display: none !important; }
            .print-only { display: block !important; }
            .company-report-document { width: 100%; max-width: 1100px; margin: 0 auto; padding: 28px 34px 40px; background: #fff; }
            .company-report-masthead { position: relative; margin-bottom: 22px; padding: 2px 0 17px; border-bottom: 2px solid #dce5ef; }
            .company-report-masthead::after { position: absolute; bottom: -2px; left: 0; width: 74px; height: 3px; background: #0284c7; content: ""; }
            .company-report-brand { color: #0284c7; font-size: 8pt; font-weight: 800; letter-spacing: .16em; }
            .company-report-masthead h1 { margin: 7px 0 10px; color: #10233f; font-size: 22pt; font-weight: 750; letter-spacing: -.035em; line-height: 1.15; }
            .company-report-metadata { display: flex; flex-wrap: wrap; gap: 7px; color: #53647a; font-size: 8.5pt; }
            .company-report-metadata span { padding: 4px 9px; border: 1px solid #dbe5ef; border-radius: 999px; background: #f8fafc; }
            .report-section { margin: 0 0 18px; break-inside: avoid; }
            .report-section h2 { margin: 0 0 9px; color: #17314f; font-size: 12pt; border-bottom: 1px solid #dce5ef; padding-bottom: 6px; }
            .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
            .kpi-grid div { display: flex; flex-direction: column; gap: 3px; padding: 10px; border: 1px solid #dce5ef; border-radius: 8px; background: #f8fafc; }
            .kpi-grid span { color: #64748b; font-size: 7pt; text-transform: uppercase; }
            .kpi-grid strong { color: #10233f; font-size: 11pt; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
            th { padding: 7px 6px; border-bottom: 2px solid #bfcddd; background: #edf4fa; color: #314760; text-align: left; text-transform: uppercase; }
            td { padding: 6px; border-bottom: 1px solid #e8edf3; color: #34445a; vertical-align: middle; }
            tbody tr:nth-child(even) { background: #f8fafc; }
            tbody tr { break-inside: avoid; }
            .number { text-align: right; }
            .annual-chart { display: block; width: 100%; height: auto; font-size: 11px; fill: #334155; }
            .continuation { color: #64748b; font-size: 8pt; }
            .company-report-document .view-section { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
            .company-report-document .company-executive-card { margin: 0 0 18px !important; padding: 15px 17px !important; border: 1px solid #d8e3ee !important; border-left: 4px solid #0284c7 !important; border-radius: 11px !important; background: linear-gradient(135deg, #f8fbff, #fff 72%) !important; box-shadow: 0 3px 12px rgba(16, 35, 63, .05) !important; }
            .company-report-document .company-executive-heading { padding-bottom: 12px !important; border-bottom: 1px solid #dce5ef !important; }
            .company-report-document .company-executive-heading h2 { color: #10233f !important; font-size: 15pt !important; }
            .company-report-document .company-executive-card > div:last-child { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px !important; }
            .company-report-document .company-executive-card > div:last-child > div { min-width: 0; padding: 9px 10px !important; border: 1px solid #e0e8f0; border-radius: 8px; background: #fff; }
            .company-report-document .company-executive-card > div:last-child > div > div:first-child { margin-bottom: 3px; color: #718096 !important; font-size: 7pt !important; letter-spacing: .055em; }
            .company-report-document .card { width: 100% !important; max-width: 100% !important; margin: 0 0 16px !important; padding: 0 !important; overflow: visible !important; border: 1px solid #dce5ef !important; border-radius: 10px !important; background: #fff !important; box-shadow: 0 2px 8px rgba(16, 35, 63, .035) !important; }
            .company-report-document .card > div:first-child, .company-report-document .card > summary { padding: 12px 15px !important; border-bottom: 1px solid #e7edf4 !important; background: #f8fafc !important; }
            .company-report-document .card h3, .company-report-document .card summary { color: #17314f !important; font-size: 10pt !important; font-weight: 750 !important; }
            .company-report-document .card > div:not(:first-child) { padding: 12px 15px !important; }
            .company-report-document .table-responsive { width: 100% !important; max-width: 100% !important; overflow: visible !important; }
            .company-report-document table.print-table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: separate !important; border-spacing: 0 !important; font-size: 7.5pt !important; }
            .company-report-document table.print-table th { padding: 7px 6px !important; border-bottom: 1px solid #d5e0eb !important; background: #edf4fa !important; color: #314760 !important; font-size: 7pt !important; font-weight: 750 !important; letter-spacing: .035em; text-align: left; text-transform: uppercase; }
            .company-report-document table.print-table td { padding: 6px !important; border-bottom: 1px solid #e8edf3 !important; color: #34445a !important; vertical-align: middle; }
            .company-report-document table.print-table tbody tr:nth-child(even) { background: #f8fafc !important; }
            .company-report-document .print-avoid-break, .company-report-document table.print-table tr { break-inside: avoid; }
            .company-report-document img { display: block; max-width: 100% !important; height: auto !important; }
            @media (max-width: 700px) {
              .company-report-document { padding: 18px 14px 28px; }
              .company-report-document .company-executive-card > div:last-child { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .company-report-masthead h1 { font-size: 18pt; }
            }
            @page { size: letter portrait; margin: 12mm 10mm; }
            @media print {
              html, body { background: #fff !important; }
              .company-report-document { width: 100%; max-width: none; margin: 0; padding: 0; }
              .company-report-document .card { box-shadow: none !important; }
              .company-report-document .company-executive-card { box-shadow: none !important; }
              .company-report-document .card > div:first-child, .company-report-document .card > summary { break-after: avoid; }
            }
          </style>
        </head>
        <body${themeAttribute}>${report}</body>
      </html>`);
    setPreviewError('');
  }, [isOpen, comp, periodText, selectedYear, exerciseStats, allEvaluations]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const previousTitle = document.title;
    const safeCompany = (comp.nombre || 'Flota').trim();
    const safePeriod = periodText.replace(/\s*[–—]\s*/g, '-').replace(/\s+/g, '_');
    const printTitle = `TrackSIM Cloud_${safeCompany}_${safePeriod}`;
    const frameDocument = previewFrame.current?.contentDocument;
    const frameWindow = previewFrame.current?.contentWindow;
    if (!frameDocument || !frameWindow) {
      setPreviewError('La vista previa aún no está lista para imprimir. Inténtalo de nuevo.');
      return;
    }

    document.title = printTitle;
    frameDocument.title = printTitle;

    void logAudit({
      categoria: 'datos',
      accion: 'imprimir',
      empresas: [comp.nombre],
      detalle: `Impresión / PDF del resumen de ${comp.nombre}${selectedYear && selectedYear !== 'all' ? ` (Año ${selectedYear})` : ''}`
    });

    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      setTimeout(() => {
        document.title = previousTitle;
      }, 1000);
    }
  };

  return (
    <div
      className="modal-overlay active no-print"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-backdrop)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
          maxWidth: '900px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-glow)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-app)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                Vista previa completa del Expediente
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {comp.nombre} • {periodText}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
              <span>🖨️</span> Imprimir Expediente
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '1rem', background: 'var(--bg-app)' }}>
          {previewDocument ? (
            <iframe
              ref={previewFrame}
              title="Vista previa completa del expediente PDF"
              srcDoc={previewDocument}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                minHeight: '70vh',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                background: '#ffffff'
              }}
              onLoad={(event) => {
                event.currentTarget.contentDocument?.addEventListener('keydown', (keyboardEvent) => {
                  if (keyboardEvent.key !== 'Escape') return;
                  keyboardEvent.preventDefault();
                  onClose();
                });
              }}
            />
          ) : (
            <div role="status" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {previewError || 'Cargando vista previa completa...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
