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
 * Obtiene la lista de errores críticos de una evaluación proveniente de Zero / Ingesta V2.
 * Considera errores marcados explícitamente con severidad 'critico' o pertenecientes
 * a siniestros viales críticos (fatalidades, vuelcos, atropellos, colisiones).
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

    const isExplicitCritical = sev === 'critico';
    const isCriticalAccident =
      catName === 'Atropello de un peatón' ||
      catName === 'Vuelco' ||
      catName === 'Vuelco del remolque' ||
      (catName === 'Salirse de la vía' && sev === 'critico') ||
      COLLISION_MISTAKES.has(catName);

    if (isExplicitCritical || isCriticalAccident) {
      criticalList.push({
        error: catName,
        repeticiones: reps,
        severidad: m.severidad || 'CRITICO'
      });
    }
  });

  return criticalList;
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
