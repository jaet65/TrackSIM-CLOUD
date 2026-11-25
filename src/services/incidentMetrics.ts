import type { Evaluation, FrequentMistakeItem } from '../types';
import { findCatalogMistake } from './mistakeCatalog';

export interface IncidentCounts {
  colisiones: number;
  fatalidades: number;
  vehiculoFueraVia: number;
}

export interface CriticalMistakeDetail {
  error: string;
  repeticiones: number;
  severidad?: string;
}

const COLLISION_MISTAKES = new Set([
  'Atropello de un perro',
  'Colisión con un objeto',
  'Colisión con un vehículo de incidencia',
  'Colisión con un vehículo del tráfico',
  'Colisión con unas piedras'
]);

export function countV2Incidents(mistakes: FrequentMistakeItem[]): IncidentCounts {
  const counts: IncidentCounts = { colisiones: 0, fatalidades: 0, vehiculoFueraVia: 0 };

  mistakes.forEach((mistake) => {
    const catalogMistake = findCatalogMistake(mistake.error || mistake.errorRaw || '');
    const repetitions = Number.isSafeInteger(mistake.repeticiones) && mistake.repeticiones > 0
      ? mistake.repeticiones
      : 0;
    if (!catalogMistake || repetitions === 0) return;

    if (catalogMistake.nombre === 'Salirse de la vía') {
      if (mistake.severidad?.toLowerCase() === 'critico') counts.fatalidades += repetitions;
      else counts.vehiculoFueraVia += repetitions;
    } else if (
      catalogMistake.nombre === 'Atropello de un peatón' ||
      catalogMistake.nombre === 'Vuelco' ||
      catalogMistake.nombre === 'Vuelco del remolque'
    ) {
      counts.fatalidades += repetitions;
    } else if (COLLISION_MISTAKES.has(catalogMistake.nombre)) {
      counts.colisiones += repetitions;
    }
  });

  return counts;
}

/**
 * Identifica errores críticos por el catálogo o por su severidad explícita.
 */
export function getCriticalMistakes(mistakes: FrequentMistakeItem[] = []): CriticalMistakeDetail[] {
  const criticalList: CriticalMistakeDetail[] = [];

  mistakes.forEach((m) => {
    const rawName = (m.error || m.errorRaw || '').trim();
    if (!rawName) return;
    const reps = Number.isSafeInteger(m.repeticiones) && m.repeticiones > 0 ? m.repeticiones : 1;
    const sev = m.severidad?.toLowerCase();
    const catalog = findCatalogMistake(rawName);
    const catName = catalog ? catalog.nombre : rawName;

    const isExplicitCritical = sev?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'critico';
    const isCatalogCritical = catalog?.critico === true;

    if (isExplicitCritical || isCatalogCritical) {
      criticalList.push({
        error: catName,
        repeticiones: reps,
        severidad: m.severidad || 'CRITICO'
      });
    }
  });

  return criticalList;
}

export function getEvaluationCriticalIncidents(evaluation: Pick<Evaluation, 'erroresFrecuentes' | 'accidentesCriticos'>): {
  total: number | null;
  details: CriticalMistakeDetail[];
  complete: boolean;
} {
  const details = getCriticalMistakes(evaluation.erroresFrecuentes || []);
  const savedTotal = evaluation.accidentesCriticos;
  const hasSavedTotal = typeof savedTotal === 'number' && Number.isSafeInteger(savedTotal) && savedTotal >= 0;
  if (details.length > 0) {
    const total = details.reduce((sum, item) => sum + item.repeticiones, 0);
    return {
      total,
      details,
      complete: hasSavedTotal && savedTotal === total
    };
  }
  if (hasSavedTotal) {
    return { total: savedTotal, details: [], complete: true };
  }
  return { total: null, details: [], complete: false };
}

export type IncidentMode = 'v1' | 'v2' | 'mixed';

export interface HybridIncidentResult {
  total: number | null;
  details: Array<{ name: string; count: number }>;
  complete: boolean;
}

export function groupIncidentCollisions(details: HybridIncidentResult['details']): HybridIncidentResult['details'] {
  const grouped: HybridIncidentResult['details'] = [];
  details.forEach((item) => {
    if (/^(?:colisi(?:ón|on|ones)|choques?)(?:\s|$)/i.test(item.name.trim())) {
      const collisions = grouped.find((detail) => detail.name === 'Colisiones');
      if (collisions) collisions.count += item.count;
      else grouped.push({ name: 'Colisiones', count: item.count });
    } else {
      grouped.push({ ...item });
    }
  });
  return grouped;
}

function companyKey(evaluation: Evaluation): string {
  const company = (evaluation.empresa || '').trim().toLowerCase();
  return company || `\0${evaluation.id}`;
}

export function getIncidentModes(evaluations: Evaluation[]): Map<string, IncidentMode> {
  const modes = new Map<string, IncidentMode>();
  evaluations.forEach((evaluation) => {
    const key = companyKey(evaluation);
    const version = evaluation.origen === 'TrackSIM-ZERO-V2' ? 'v2' : 'v1';
    const current = modes.get(key);
    modes.set(key, current && current !== version ? 'mixed' : version);
  });
  return modes;
}

export function getEvaluationIncidentMode(evaluation: Evaluation, modes: Map<string, IncidentMode>): IncidentMode {
  const mode = modes.get(companyKey(evaluation));
  if (!mode) throw new Error('No se encontró el criterio de incidencias de la empresa.');
  return mode;
}

export function getHybridEvaluationIncidents(evaluation: Evaluation, modes: Map<string, IncidentMode>): HybridIncidentResult {
  const mode = getEvaluationIncidentMode(evaluation, modes);
  if (evaluation.origen !== 'TrackSIM-ZERO-V2') {
    const fields = [evaluation.colisiones ?? evaluation.totalColisiones, evaluation.fatalidades, evaluation.vehiculoFueraVia];
    const names = mode === 'mixed'
      ? ['Colisión con un vehículo del tráfico', 'Atropello de peatón y vuelcos', 'Salirse de la vía']
      : ['Colisiones', 'Fatalidades', 'Fuera de vía'];
    const details: HybridIncidentResult['details'] = [];
    let available = 0;
    fields.forEach((value, index) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return;
      available += 1;
      details.push({ name: names[index], count: value });
    });
    return {
      total: available ? details.reduce((sum, item) => sum + item.count, 0) : null,
      details: groupIncidentCollisions(details),
      complete: available === fields.length
    };
  }

  const critical = getEvaluationCriticalIncidents(evaluation);
  const details = critical.details.map((item) => ({
    name: mode === 'mixed' && ['Atropello de un peatón', 'Vuelco', 'Vuelco del remolque'].includes(item.error)
      ? 'Atropello de peatón y vuelcos'
      : item.error,
    count: item.repeticiones
  }));
  if (critical.details.length === 0 && critical.total !== null && critical.total > 0) {
    details.push({ name: 'Sin desglose disponible', count: critical.total });
  }
  if (mode === 'mixed') {
    (evaluation.erroresFrecuentes || []).forEach((mistake) => {
      if (findCatalogMistake(mistake.error || mistake.errorRaw || '')?.nombre !== 'Salirse de la vía') return;
      if (getCriticalMistakes([mistake]).length > 0) return;
      if (Number.isSafeInteger(mistake.repeticiones) && mistake.repeticiones > 0) {
        details.push({ name: 'Salirse de la vía', count: mistake.repeticiones });
      }
    });
  }
  const total = details.reduce((sum, item) => sum + item.count, 0);
  return {
    total: critical.total === null && total === 0 ? null : total,
    details: groupIncidentCollisions(details),
    complete: critical.complete && (mode !== 'mixed' || Array.isArray(evaluation.erroresFrecuentes))
  };
}

export function getHybridIncidentSummary(evaluations: Evaluation[], modes = getIncidentModes(evaluations)) {
  const details = new Map<string, { name: string; count: number }>();
  let total = 0;
  let unavailable = 0;
  let incomplete = 0;
  evaluations.forEach((evaluation) => {
    const incidents = getHybridEvaluationIncidents(evaluation, modes);
    if (incidents.total === null) {
      unavailable += 1;
      return;
    }
    if (!incidents.complete) incomplete += 1;
    total += incidents.total;
    incidents.details.forEach((item) => {
      if (item.count === 0) return;
      const current = details.get(item.name) || { name: item.name, count: 0 };
      current.count += item.count;
      details.set(item.name, current);
    });
  });
  const versions = new Set(modes.values());
  return {
    modes,
    label: versions.size === 1 && versions.has('v1') ? 'Incidentes en el simulador'
      : versions.has('v1') ? 'Incidencias por cliente' : 'Incidencias críticas',
    total,
    unavailable,
    incomplete,
    details: Array.from(details.values()).sort((a, b) => b.count - a.count)
  };
}

export function getHybridDriverIncidents(evaluations: Evaluation[], modes: Map<string, IncidentMode>): Map<string, number | null> {
  const totals = new Map<string, number | null>();
  evaluations.forEach((evaluation) => {
    const name = (evaluation.conductor || evaluation.operador || '').trim().toLowerCase();
    if (!name) return;
    const result = getHybridEvaluationIncidents(evaluation, modes);
    if (!result.complete || result.total === null || (totals.has(name) && totals.get(name) === null)) {
      totals.set(name, null);
    } else {
      totals.set(name, (totals.get(name) || 0) + result.total);
    }
  });
  return totals;
}

export function getEvaluationIncidentCounts(evaluation: Evaluation): IncidentCounts {
  if (evaluation.origen === 'TrackSIM-ZERO-V2') {
    return countV2Incidents(evaluation.erroresFrecuentes || []);
  }

  return {
    colisiones: evaluation.colisiones ?? evaluation.totalColisiones ?? 0,
    fatalidades: evaluation.fatalidades ?? 0,
    vehiculoFueraVia: evaluation.vehiculoFueraVia ?? 0
  };
}
