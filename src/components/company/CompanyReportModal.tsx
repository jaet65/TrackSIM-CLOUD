import React, { useEffect, useRef, useState } from 'react';
import { CompanySummary, Evaluation } from '../../types';
import { logAudit } from '../../services/auditLog';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { createCompanySummaryFromEvaluations, getEvaluationYear } from '../../services/analytics';
import { getHybridEvaluationIncidents, getHybridIncidentSummary } from '../../services/incidentMetrics';

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

    const incidentSummary = getHybridIncidentSummary(allEvaluations);
    const largestIncidentCount = Math.max(0, ...incidentSummary.details.map((item) => item.count));
    const criticalIncidentRows = incidentSummary.details
      .map((item) => `<tr><td>${escapeHtml(item.name)}<div class="incident-bar" aria-hidden="true"><div style="width:${largestIncidentCount ? (item.count / largestIncidentCount) * 100 : 0}%"></div></div></td><td class="number incident-count">${item.count}</td></tr>`)
      .join('');

    const operators = createCompanySummaryFromEvaluations(comp.nombre, comp.slug, allEvaluations).conductores
      .sort((a, b) => b.promedioScore - a.promedioScore);
    const recurrentOperators = operators.filter((operator) => operator.totalEvaluaciones > 1);
    const operatorRows = operators.map((operator, index) => {
      const state = operator.estado || (operator.promedioScore >= 6 ? 'Aprobado' : 'No Aprobado');
      const stateClass = state === 'Sobresaliente' ? 'status-good' : state === 'Aprobado' ? 'status-neutral' : 'status-attention';
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(operator.nombre)}</strong></td>
        <td>${escapeHtml(operator.sede || 'Sede Principal')}</td>
        <td class="number">${operator.totalEvaluaciones}</td>
        <td class="number">${operator.promedioScore.toFixed(2)} / 10</td>
        <td class="number">${operator.ultimoScore.toFixed(2)} / 10</td>
        <td>${escapeHtml(operator.ultimaFecha)}</td>
        <td><span class="status-pill ${stateClass}">${escapeHtml(state)}</span></td>
      </tr>`;
    }).join('');
    const exerciseRows = exerciseStats.map((exercise, index) => {
      const level = exercise.promedio >= 8 ? 'Sobresaliente' : exercise.promedio >= 6 ? 'Aprobado' : 'Requiere Refuerzo';
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(exercise.nombre)}</strong></td>
          <td class="number">${exercise.totalEvaluaciones}</td>
          <td class="number">${exercise.promedio.toFixed(2)} / 10</td>
          <td><span class="status-pill ${exercise.promedio >= 8 ? 'status-good' : exercise.promedio >= 6 ? 'status-neutral' : 'status-attention'}">${level}</span></td>
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
        <td><span class="status-pill ${difference === null ? 'status-muted' : difference > 0.2 ? 'status-good' : difference < -0.2 ? 'status-attention' : 'status-neutral'}">${trend}</span></td>
      </tr>`;
    }).join('');
    const annualData = new Map<string, { score: number; count: number; incidents: number; missing: number; operators: Set<string> }>();
    let undatedEvaluations = 0;
    allEvaluations.forEach((evaluation) => {
      const year = getEvaluationYear(evaluation);
      if (!year) {
        undatedEvaluations += 1;
        return;
      }
      const data = annualData.get(year) || { score: 0, count: 0, incidents: 0, missing: 0, operators: new Set<string>() };
      const incidents = getHybridEvaluationIncidents(evaluation, incidentSummary.modes);
      data.score += getScore(evaluation) ?? 0;
      data.count += 1;
      if (!incidents.complete || incidents.total === null) data.missing += 1;
      else data.incidents += incidents.total;
      data.operators.add((evaluation.conductor || evaluation.operador || 'Sin Asignar').trim());
      annualData.set(year, data);
    });
    const annualRows = Array.from(annualData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({
        year,
        average: Number((data.score / data.count).toFixed(2)),
        rate: data.missing === 0 ? Number((data.incidents / data.operators.size).toFixed(2)) : null
      }));
    const chart = (rows: Array<{ year: string; value: number }>, maximum: number, color: string, label: string) => {
      const left = 55;
      const right = 755;
      const top = 25;
      const bottom = 175;
      const points = rows.map((row, index) => ({
        x: rows.length === 1 ? (left + right) / 2 : left + 24 + index * (right - left - 48) / (rows.length - 1),
        y: bottom - (row.value / maximum) * (bottom - top),
        value: row.value
      }));
      return `<svg viewBox="0 0 810 215" role="img" aria-label="${label}" class="annual-chart">
        <line x1="${left}" y1="${top}" x2="${right}" y2="${top}" stroke="#e2e8f0" stroke-dasharray="4 5"/>
        <line x1="${left}" y1="${(top + bottom) / 2}" x2="${right}" y2="${(top + bottom) / 2}" stroke="#e2e8f0" stroke-dasharray="4 5"/>
        <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#94a3b8"/>
        <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#94a3b8"/>
        <text x="45" y="${top + 4}" text-anchor="end">${maximum.toFixed(2)}</text>
        <text x="45" y="${bottom + 4}" text-anchor="end">0</text>
        <polyline fill="none" stroke="${color}" stroke-width="3" points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"/>
        ${points.map((point, index) => `<g><title>${rows[index].year}: ${point.value.toFixed(2)}</title><circle cx="${point.x}" cy="${point.y}" r="6" fill="white" stroke="${color}" stroke-width="3"/><text x="${point.x}" y="${point.y - 10}" text-anchor="middle">${point.value.toFixed(2)}</text><text x="${point.x}" y="198" text-anchor="middle">${rows[index].year}</text></g>`).join('')}
      </svg>`;
    };
    const rateRows = annualRows.flatMap((row) => row.rate === null ? [] : [{ year: row.year, value: row.rate }]);
    const rateChange = annualRows.length >= 2 && rateRows.length === annualRows.length
      ? rateRows[rateRows.length - 1].value - rateRows[0].value
      : null;
    const rateTrend = rateChange === null
      ? (annualRows.length < 2 ? 'Se necesitan al menos dos años para comparar la tasa.' : 'No se puede comparar la tasa porque faltan datos críticos en algunos años.')
      : rateChange < 0
        ? `Reducción de ${Math.abs(rateChange).toFixed(2)} incidentes por operador entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`
        : rateChange > 0
          ? `Aumento de ${rateChange.toFixed(2)} incidentes por operador entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`
          : `La tasa se mantuvo igual entre ${annualRows[0].year} y ${annualRows[annualRows.length - 1].year}.`;

    const report = `
      <main class="company-report-document">
        <header class="company-report-masthead">
          <div class="company-report-brand"><span class="brand-mark" aria-hidden="true">T</span> TRACKSIM <span>CLOUD</span></div>
          <div class="report-eyebrow">INTELIGENCIA DE FLOTA &nbsp; / &nbsp; REPORTE EJECUTIVO</div>
          <h1>Expediente ejecutivo de flota</h1>
          <div class="company-report-name">${escapeHtml(comp.nombre)}</div>
          <div class="company-report-metadata">
            <span>${escapeHtml(periodText)}</span>
            <span>Emitido el ${escapeHtml(new Date().toLocaleDateString('es-MX'))}</span>
          </div>
        </header>
        <section class="report-section">
          <h2>Resumen ejecutivo</h2>
          <div class="kpi-grid">
            <div class="kpi-card"><span>Operadores</span><strong>${comp.totalConductores}</strong></div>
            <div class="kpi-card"><span>Operadores con más de una evaluación</span><strong>${recurrentOperators.length}</strong></div>
            <div class="kpi-card kpi-blue"><span>Promedio de flota</span><strong>${comp.promedioFinal.toFixed(2)} / 10</strong></div>
            <div class="kpi-card kpi-green"><span>Tasa de aprobación</span><strong>${comp.tasaAprobacion.toFixed(1)}%</strong></div>
            <div class="kpi-card kpi-rose"><span>${incidentSummary.label}</span><strong>${incidentSummary.unavailable === allEvaluations.length && allEvaluations.length > 0 ? 'Sin datos' : incidentSummary.total}</strong></div>
            <div class="kpi-card"><span>Sedes</span><strong>${comp.sedes?.length || 0}</strong></div>
          </div>
        </section>
        <section class="report-section">
          <h2>Desglose de incidencias</h2>
          ${criticalIncidentRows
            ? `<table><thead><tr><th>Tipo de incidencia</th><th class="number">Cantidad</th></tr></thead><tbody>${criticalIncidentRows}</tbody></table>`
            : `<p>${incidentSummary.unavailable ? 'No hay incidencias conocidas en los datos disponibles.' : allEvaluations.length > 0 ? 'No se registraron incidencias en el periodo.' : 'No hay evaluaciones disponibles para el periodo.'}</p>`}
          ${incidentSummary.unavailable ? `<p>Datos de incidencias no disponibles para ${incidentSummary.unavailable} ${incidentSummary.unavailable === 1 ? 'evaluación' : 'evaluaciones'}; el total es parcial.</p>` : ''}
          ${incidentSummary.incomplete ? `<p>Datos de incidencias incompletos o inconsistentes para ${incidentSummary.incomplete} ${incidentSummary.incomplete === 1 ? 'evaluación' : 'evaluaciones'}; el total puede no incluir todas las incidencias.</p>` : ''}
          ${Array.from(incidentSummary.modes.values()).includes('mixed') ? '<p>En clientes mixtos se equiparan los conteos V1 a las categorías V2; las fatalidades V1 no distinguen atropellos de peatón de vuelcos.</p>' : ''}
        </section>
        ${exerciseRows ? `<section class="report-section"><h2>Desempeño por ejercicio</h2><table><thead><tr><th>#</th><th>Ejercicio</th><th class="number">Evaluaciones</th><th class="number">Promedio</th><th>Nivel</th></tr></thead><tbody>${exerciseRows}</tbody></table></section>` : ''}
        ${operatorRows ? `<section class="report-section"><h2>Métricas por operador</h2><table><thead><tr><th>#</th><th>Operador</th><th>Sede</th><th class="number">Evaluaciones</th><th class="number">Promedio</th><th class="number">Última calificación</th><th>Última fecha</th><th>Estado</th></tr></thead><tbody>${operatorRows}</tbody></table></section>` : ''}
        ${recurrentOperatorRows ? `<section class="report-section"><h2>Evolución por operador recurrente</h2><p>Comparación entre la primera y la última evaluación del periodo. Cambio en puntos sobre 10.</p><table><thead><tr><th>#</th><th>Operador</th><th class="number">Evaluaciones</th><th class="number">Primera</th><th class="number">Última</th><th class="number">Cambio</th><th>Tendencia</th></tr></thead><tbody>${recurrentOperatorRows}</tbody></table><p>Sin fechas o calificaciones completas, o con varias evaluaciones en la primera o última fecha, la evolución no es comparable.</p></section>` : ''}
        <section class="report-section">
          <h2>Evolución anual de la flota</h2>
          ${annualRows.length ? `<p>Calificación promedio por evaluación (0 a 10).</p><div class="chart-panel">${chart(annualRows.map((row) => ({ year: row.year, value: row.average })), 10, '#0284c7', 'Calificación promedio anual de la flota')}</div>` : '<p>No hay evaluaciones con año disponible para generar la gráfica.</p>'}
          ${undatedEvaluations ? `<p>${undatedEvaluations} ${undatedEvaluations === 1 ? 'evaluación sin año se excluyó' : 'evaluaciones sin año se excluyeron'} de las gráficas.</p>` : ''}
        </section>
        <section class="report-section">
          <h2>Tasa anual de siniestralidad</h2>
          ${rateRows.length ? `<p>Incidencias por operador evaluado en cada año, según el criterio del cliente en el periodo filtrado.</p><div class="chart-panel chart-panel-rose">${chart(rateRows, Math.max(1, ...rateRows.map((row) => row.value)), '#e11d48', 'Incidencias anuales por operador evaluado')}</div><p class="trend-note">${rateTrend}</p>` : '<p>No hay datos de incidencias completos para generar la gráfica.</p>'}
          ${rateRows.length < annualRows.length ? '<p>Se excluyeron los años con datos de incidencias incompletos.</p>' : ''}
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
            .company-report-document { width: 100%; max-width: 1100px; margin: 0 auto; padding: 30px 34px 40px; background: #fff; }
            .company-report-masthead { position: relative; overflow: hidden; margin-bottom: 26px; padding: 24px 28px 26px; border-radius: 14px; background: linear-gradient(120deg, #10243d, #174968) !important; color: #fff; break-inside: avoid; }
            .company-report-masthead::after { position: absolute; right: -40px; top: -90px; width: 240px; height: 240px; border: 35px solid rgba(125, 211, 252, .10); border-radius: 50%; content: ""; pointer-events: none; }
            .company-report-brand { display: flex; align-items: center; gap: 5px; color: #fff; font-size: 9pt; font-weight: 800; letter-spacing: .12em; }
            .company-report-brand > span:last-child { color: #7dd3fc; }
            .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-right: 4px; border-radius: 6px; background: #0ea5e9; color: #fff; font-size: 12pt; letter-spacing: 0; }
            .report-eyebrow { margin-top: 21px; color: #a7d7ec; font-size: 7pt; font-weight: 700; letter-spacing: .12em; }
            .company-report-masthead h1 { margin: 6px 0; color: #fff !important; font-size: 22pt; font-weight: 750; letter-spacing: -.035em; line-height: 1.15; }
            .company-report-name { color: #e0f2fe; font-size: 12pt; font-weight: 600; overflow-wrap: anywhere; }
            .company-report-metadata { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; color: #e0f2fe; font-size: 8pt; }
            .company-report-metadata span { padding: 4px 9px; border: 1px solid rgba(186, 230, 253, .28); border-radius: 999px; background: rgba(255,255,255,.08); }
            .report-section { margin: 0 0 23px; }
            .report-section h2 { display: flex; align-items: center; gap: 9px; margin: 0 0 11px; padding: 0 0 9px; border-bottom: 1px solid #dce5ef; color: #17314f; font-size: 12pt; break-after: avoid; }
            .report-section h2::before { width: 4px; height: 19px; border-radius: 4px; background: #0ea5e9; content: ""; }
            .report-section p { margin: 8px 0; color: #52657a; font-size: 8.5pt; }
            .kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; break-inside: avoid; }
            .kpi-grid .kpi-card { display: flex; flex-direction: column; justify-content: space-between; gap: 10px; min-height: 79px; padding: 12px 14px; border: 1px solid #dce7f0; border-top: 3px solid #94a3b8; border-radius: 9px; background: #f8fafc; }
            .kpi-grid .kpi-blue { border-top-color: #0ea5e9; background: #f0f9ff; }
            .kpi-grid .kpi-green { border-top-color: #10b981; background: #f0fdf7; }
            .kpi-grid .kpi-rose { border-top-color: #f43f5e; background: #fff5f6; }
            .kpi-grid span { color: #5b6d82; font-size: 7.2pt; font-weight: 700; letter-spacing: .025em; }
            .kpi-grid strong { color: #10233f; font-size: 16pt; line-height: 1.1; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
            th { padding: 9px 6px; border-bottom: 1px solid #cad9e7; background: #edf4fa; color: #435c75; text-align: left; text-transform: uppercase; font-size: 7pt; overflow-wrap: anywhere; }
            td { padding: 8px 6px; border-bottom: 1px solid #e8edf3; color: #34445a; vertical-align: middle; overflow-wrap: anywhere; }
            tbody tr:nth-child(even) { background: #f8fafc; }
            tbody tr { break-inside: avoid; }
            thead { display: table-header-group; }
            .number { text-align: right; }
            .incident-bar { height: 5px; margin-top: 6px; overflow: hidden; border-radius: 5px; background: #e8eff5; }
            .incident-bar > div { height: 100%; border-radius: inherit; background: #38a5d6; }
            .incident-count { color: #17314f; font-weight: 750; font-size: 10pt; }
            .status-pill { display: inline-block; padding: 3px 6px; border-radius: 5px; font-size: 7pt; font-weight: 700; }
            .status-good { color: #087653; background: #dcfce7; }
            .status-neutral { color: #036b9b; background: #e0f2fe; }
            .status-attention { color: #b42338; background: #ffe4e6; }
            .status-muted { color: #64748b; background: #eaf0f5; }
            .chart-panel { padding: 12px 14px 4px; border: 1px solid #dceaf3; border-radius: 10px; background: #f8fcff; break-inside: avoid; }
            .chart-panel-rose { border-color: #f5dfe3; background: #fffafb; }
            .annual-chart { display: block; width: 100%; height: auto; font-size: 11px; fill: #334155; }
            .trend-note { padding: 9px 12px; border-left: 3px solid #38a5d6; border-radius: 0 6px 6px 0; background: #f0f9ff; font-weight: 600; }
            @media (max-width: 700px) {
              .company-report-document { padding: 18px 14px 28px; }
              .company-report-masthead { padding: 20px; }
              .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .company-report-masthead h1 { font-size: 18pt; }
              table { font-size: 7pt; }
              th, td { padding: 6px 3px; }
            }
            @page { size: letter portrait; margin: 12mm 10mm; }
            @media print {
              html, body { background: #fff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              .company-report-document { width: 100%; max-width: none; margin: 0; padding: 0; }
              .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
              .company-report-masthead { padding: 18px 24px; }
              .report-eyebrow { margin-top: 12px; }
              .chart-panel { break-inside: avoid; }
            }
          </style>
        </head>
        <body${themeAttribute}>${report}</body>
      </html>`);
    setPreviewError('');
  }, [isOpen, comp, periodText, exerciseStats, allEvaluations]);

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
