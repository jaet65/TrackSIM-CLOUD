import type { ExerciseItem, FrequentMistakeItem, StagedEvaluation } from '../types';
import { loadPdfJs, type PdfJsTextItem } from './pdfJsLoader';
import { countV2Incidents } from './incidentMetrics';

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

export interface PdfTextLine {
  page: number;
  y: number;
  items: PositionedText[];
}

export interface PdfBatchFailure {
  fileName: string;
  error: string;
}

export interface PdfBatchResult {
  results: StagedEvaluation[];
  failures: PdfBatchFailure[];
}

interface ParsedWeakPoint {
  error: string;
  repeticiones: number;
  severidad?: 'critico' | 'grave' | 'moderado' | 'leve';
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function lineText(line: PdfTextLine): string {
  return line.items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
}

function parseNumericText(value: string): number | undefined {
  const match = value.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStableId(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `eval_v2_${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function groupTextItems(page: number, items: PdfJsTextItem[]): PdfTextLine[] {
  const positioned = items
    .filter((item): item is PdfJsTextItem & { str: string; transform: number[] } =>
      typeof item.str === 'string' &&
      item.str.trim() !== '' &&
      Array.isArray(item.transform) &&
      typeof item.transform[4] === 'number' &&
      typeof item.transform[5] === 'number'
    )
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5]
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PdfTextLine[] = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (line) {
      line.items.push(item);
      line.items.sort((a, b) => a.x - b.x);
    } else {
      lines.push({ page, y: item.y, items: [item] });
    }
  }

  return lines;
}

function parseDateValue(value: string): number | undefined {
  const normalized = value.trim();
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const local = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (local) return Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
  return undefined;
}

function extractExerciseRows(lines: PdfTextLine[]): ExerciseItem[] {
  const rows = lines.flatMap((line) => {
    const phaseItem = line.items.find((item) => item.x < 85 && /^F\d+$/i.test(item.text));
    if (!phaseItem) return [];

    const cellText = (minX: number, maxX: number) =>
      line.items
        .filter((item) => item.x >= minX && item.x < maxX)
        .map((item) => item.text)
        .join(' ')
        .trim();

    const exerciseName = cellText(85, 248);
    if (!exerciseName) return [];

    const phase = Number(phaseItem.text.slice(1));
    const date = cellText(248, 322);
    const instructor = cellText(322, 412);
    const duration = cellText(412, 476);
    const errors = parseNumericText(cellText(476, 535)) ?? 0;
    const scoreText = cellText(520, Number.POSITIVE_INFINITY);
    const score = parseNumericText(scoreText) ?? 0;
    const notDone = /no realizado/i.test(exerciseName) || /^[-\u2010-\u2015\u2212]+$/.test(scoreText);
    const cleanName = exerciseName.replace(/\s*\(NO REALIZADO\)\s*/i, '').trim();

    return [{
      numero: 0,
      nombre: cleanName,
      fecha: date && !/^[-\u2010-\u2015\u2212]+$/.test(date) ? date : undefined,
      modulo: `Fase ${phase}`,
      tiempo: duration && !/^[-\u2010-\u2015\u2212]+$/.test(duration) ? duration : undefined,
      instructor: instructor && !/^[-\u2010-\u2015\u2212]+$/.test(instructor) ? instructor : undefined,
      calificacion: notDone ? undefined : score,
      score: notDone ? undefined : score,
      infracciones: errors,
      estado: notDone ? 'No Realizado' : 'Realizado',
      noRealizado: notDone,
    } satisfies ExerciseItem];
  });

  return rows.map((row, index) => ({ ...row, numero: index + 1 }));
}

function extractOverallScore(lines: PdfTextLine[]): number | undefined {
  const label = lines.find((line) =>
    normalizeText(lineText(line)).includes('calificacion global promediada')
  );
  if (!label) return undefined;

  const nearbyItems = lines
    .filter((line) =>
      line.page === label.page &&
      line.y < label.y &&
      label.y - line.y < 50
    )
    .flatMap((line) => line.items)
    .filter((item) => item.x >= 40 && item.x < 155)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  return nearbyItems
    .map((item) => {
      if (!/^\d+(?:[.,]\d+)?$/.test(item.text.trim())) return undefined;
      return parseNumericText(item.text);
    })
    .find((value) => value !== undefined && value >= 0 && value <= 10);
}

function extractLabeledScore(
  lines: PdfTextLine[],
  labelPattern: RegExp
): { score: number; max: number } | undefined {
  const label = lines
    .flatMap((line) => line.items.map((item) => ({ line, item })))
    .find(({ item }) => labelPattern.test(normalizeText(item.text)));
  if (!label) return undefined;

  const candidateLines = lines
    .filter((line) =>
      line.page === label.line.page &&
      line.y < label.line.y &&
      label.line.y - line.y <= 40
    )
    .map((line) => ({
      line,
      items: line.items.filter((item) =>
        item.x >= label.item.x - 2 &&
        item.x < label.item.x + 80
      )
    }))
    .filter(({ items }) =>
      items.some((item) => /^\d+(?:[.,]\d+)?$/.test(item.text.trim()))
    )
    .sort((a, b) => b.line.y - a.line.y);

  const candidate = candidateLines[0];
  if (!candidate) return undefined;

  const scoreItem = candidate.items.find((item) => /^\d+(?:[.,]\d+)?$/.test(item.text.trim()));
  if (!scoreItem) return undefined;
  const score = parseNumericText(scoreItem.text);
  if (score === undefined) return undefined;

  const maxItem = candidate.items.find((item) => /^\s*\/\s*\d+(?:[.,]\d+)?\s*$/.test(item.text));
  const max = maxItem ? parseNumericText(maxItem.text.replace('/', '')) : undefined;
  if (max === undefined || max <= 0 || score > max) return undefined;

  return { score, max };
}

function extractCriticalAccidents(lines: PdfTextLine[]): number | undefined {
  const text = normalizeText(lines.map(lineText).join(' '));
  const labeledCount = text.match(
    /(\d+)\s+(?:accidentes?\s+)?(?:error(?:\(es\)|es)?\s+)?critico(?:\(s\)|s)?(?:\s+acumulados?)?/
  );
  if (labeledCount) return Number(labeledCount[1]);

  const accidentsLabel = text.match(/accidentes?\s+criticos?[^0-9]{0,20}(\d+)/);
  if (accidentsLabel) return Number(accidentsLabel[1]);

  if (/sin\s+(?:faltas|accidentes)\s+criticas?/.test(text)) return 0;
  return undefined;
}

function extractWeakPoints(lines: PdfTextLine[]): ParsedWeakPoint[] {
  const rows: ParsedWeakPoint[] = [];
  let inWeakPoints = false;
  let severity: ParsedWeakPoint['severidad'];

  for (const line of lines) {
    const text = normalizeText(lineText(line));
    if (text.includes('puntos debiles')) {
      inWeakPoints = true;
      continue;
    }
    if (!inWeakPoints) continue;
    if (text.includes('desglose de ejercicios evaluados')) break;

    if (/^nivel\s/.test(text)) {
      if (text.includes('crit')) severity = 'critico';
      else if (text.includes('grav')) severity = 'grave';
      else if (text.includes('moder')) severity = 'moderado';
      else if (text.includes('leve')) severity = 'leve';
      else severity = undefined;
      continue;
    }

    const rowText = line.items.map((item) => item.text).join(' ');
    const countMatch = rowText.match(/(\d+)\s*[×x]\s*veces/i);
    if (!countMatch) continue;

    const countItem = line.items.find((item) => /veces/i.test(item.text));
    const error = line.items
      .filter((item) => item.x >= 12 && item.x < (countItem?.x ?? 170))
      .map((item) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const repeticiones = Number(countMatch[1]);
    if (!error || !Number.isSafeInteger(repeticiones)) continue;

    rows.push({ error, repeticiones, severidad: severity });
  }

  return rows;
}

function aggregateWeakPoints(rows: ParsedWeakPoint[]): FrequentMistakeItem[] {
  const mistakesByError = new Map<string, FrequentMistakeItem>();
  rows.forEach(({ error, repeticiones, severidad }) => {
    const normalizedError = normalizeText(error).replace(/\s+/g, ' ').trim();
    const isCriticalOffRoad = normalizedError === 'salirse de la via' && severidad === 'critico';
    const key = `${normalizedError}:${isCriticalOffRoad ? 'critico' : ''}`;
    const existing = mistakesByError.get(key);
    if (existing) {
      existing.repeticiones += repeticiones;
    } else {
      mistakesByError.set(key, {
        error,
        errorRaw: error,
        repeticiones,
        ...(isCriticalOffRoad ? { severidad: 'CRITICO' } : {})
      });
    }
  });
  return Array.from(mistakesByError.values());
}

function extractDriverName(lines: PdfTextLine[], fileName: string): string {
  const subtitle = lines.find((line) =>
    normalizeText(lineText(line)).includes('expediente de desempeno y telemetria')
  );
  if (subtitle) {
    const header = lines
      .filter((line) =>
        line.page === subtitle.page &&
        line.y > subtitle.y &&
        line.y - subtitle.y < 30 &&
        line.items.some((item) => item.x >= 120 && item.x < 390)
      )
      .sort((a, b) => b.y - a.y)[0];
    const name = header?.items
      .filter((item) => item.x >= 120 && item.x < 390)
      .map((item) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name) return name;
  }

  return fileName.replace(/_expediente\.pdf$/i, '').replace(/\.pdf$/i, '').trim();
}

function extractVerdict(lines: PdfTextLine[]): string {
  const subtitle = lines.find((line) =>
    normalizeText(lineText(line)).includes('expediente de desempeno y telemetria')
  );
  const header = subtitle && lines
    .filter((line) =>
      line.page === subtitle.page &&
      line.y > subtitle.y &&
      line.y - subtitle.y < 30 &&
      /\b(?:no apto|apto|incompleto|no realizado)\b/i.test(lineText(line))
    )
    .sort((a, b) => b.y - a.y)[0];
  const text = normalizeText(header ? lineText(header) : '');
  if (text.includes('apto con observaciones')) return 'Reforzar';
  if (/\bno apto\b/.test(text)) return 'No Aprobado';
  if (/\bincompleto\b/.test(text)) return 'Pendiente';
  if (/\bno realizado\b/.test(text)) return 'No Aprobado';
  if (/\bapto\b/.test(text)) return 'Aprobado';
  return 'Pendiente';
}

function latestExerciseDate(exercises: ExerciseItem[]): string | undefined {
  return exercises
    .filter((exercise) => exercise.fecha && parseDateValue(exercise.fecha) !== undefined)
    .sort((a, b) => (parseDateValue(b.fecha || '') || 0) - (parseDateValue(a.fecha || '') || 0))[0]
    ?.fecha;
}

function extractFolio(lines: PdfTextLine[]): string | undefined {
  const folios = new Set<string>();
  for (const line of lines) {
    const match = lineText(line).match(/\bfolio\s*:\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)\b/i);
    if (match) folios.add(match[1].toUpperCase());
  }

  if (folios.size > 1) {
    throw new Error('El expediente contiene folios distintos en sus páginas.');
  }
  return folios.values().next().value;
}

export function parseTrackSimZeroPdfLines(lines: PdfTextLine[], fileName: string): StagedEvaluation {
  const allText = normalizeText(lines.map(lineText).join(' '));
  if (
    !allText.includes('expediente de desempeno y telemetria') ||
    !allText.includes('calificacion global promediada')
  ) {
    throw new Error('El PDF no tiene el formato de expediente individual V2 de TrackSIM-ZERO.');
  }

  const conductor = extractDriverName(lines, fileName);
  if (!conductor) throw new Error('No se pudo identificar al conductor en el expediente.');

  const folio = extractFolio(lines);
  if (!folio) throw new Error('No se pudo identificar el folio único del expediente.');

  const score = extractOverallScore(lines);
  if (score === undefined) throw new Error('No se pudo extraer la calificación global del expediente.');

  const destreza = extractLabeledScore(lines, /destreza/);
  const ecoDriving = extractLabeledScore(lines, /eco[\s-]*drive/);

  const accidentesCriticos = extractCriticalAccidents(lines);
  if (accidentesCriticos === undefined) {
    throw new Error('No se pudo extraer el conteo de accidentes críticos del expediente.');
  }

  const ejercicios = extractExerciseRows(lines);
  if (ejercicios.length === 0) throw new Error('El expediente no contiene filas de ejercicios evaluados.');

  const estado = extractVerdict(lines);
  const weakPointRows = extractWeakPoints(lines);
  const erroresFrecuentes = aggregateWeakPoints(weakPointRows);
  const incidentCounts = countV2Incidents(erroresFrecuentes);
  const instructor = ejercicios[0]?.instructor;
  const fecha = latestExerciseDate(ejercicios);
  const totalInfracciones = ejercicios.reduce((sum, exercise) => sum + (exercise.infracciones || 0), 0);
  const simulacionesDetalle: Record<string, number> = {};
  const nombresSimulaciones: Record<string, string> = {};
  ejercicios.forEach((exercise, index) => {
    simulacionesDetalle[`simulacion_${index + 1}`] = exercise.calificacion ?? 0;
    nombresSimulaciones[index + 1] = exercise.nombre;
  });

  const stableData = JSON.stringify({
    fileName: fileName.trim().toLowerCase(),
    conductor,
    score,
    estado,
    erroresFrecuentes,
    ejercicios
  });
  const id = toStableId(stableData);

  return {
    id,
    folio,
    conductor,
    empresa: '',
    sede: '',
    fecha,
    fechaCapacitacion: fecha,
    fechaCapacitacionFormato: fecha,
    evaluacionFinalPuntos: score,
    calificacionExacta: score,
    promedioScore: score,
    destrezaPuntos: destreza?.score,
    destrezaMax: destreza?.max,
    ecoDrivingPuntos: ecoDriving?.score,
    ecoDrivingMax: ecoDriving?.max,
    accidentesCriticos,
    colisiones: incidentCounts.colisiones,
    totalColisiones: incidentCounts.colisiones,
    fatalidades: incidentCounts.fatalidades,
    vehiculoFueraVia: incidentCounts.vehiculoFueraVia,
    instructor,
    totalInfracciones,
    erroresFrecuentes,
    ejercicios,
    simulacionesDetalle,
    nombresSimulaciones,
    estado,
    tipoEvaluacion: 'Expediente individual V2',
    cursoNombre: 'Expediente de desempeño y telemetría',
    origen: 'TrackSIM-ZERO-V2',
    originalEmpresa: '',
    originalSede: '',
    fileName
  };
}

async function extractPdfTextLines(file: File): Promise<PdfTextLine[]> {
  await loadPdfJs();
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF.js no está disponible para leer el expediente.');

  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  let pdfDocument: Awaited<typeof loadingTask.promise> | undefined;
  try {
    pdfDocument = await loadingTask.promise;
    const pages: PdfTextLine[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(...groupTextItems(pageNumber, textContent.items || []));
    }
    return pages;
  } finally {
    if (pdfDocument) {
      await pdfDocument.cleanup();
      await pdfDocument.destroy();
    }
    await loadingTask.destroy();
  }
}

export async function parseTrackSimZeroPdfBatch(
  files: File[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<PdfBatchResult> {
  const results: StagedEvaluation[] = [];
  const failures: PdfBatchFailure[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress?.(index, files.length, `Procesando expediente (${index + 1}/${files.length}): ${file.name}`);
    try {
      const lines = await extractPdfTextLines(file);
      results.push(parseTrackSimZeroPdfLines(lines, file.name));
    } catch (error) {
      failures.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Error desconocido al procesar el expediente.'
      });
    }
    onProgress?.(index + 1, files.length, `Procesado (${index + 1}/${files.length}): ${file.name}`);
  }

  return { results, failures };
}
