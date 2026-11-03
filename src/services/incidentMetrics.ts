import type { Evaluation, FrequentMistakeItem } from '../types';
import { findCatalogMistake } from './mistakeCatalog';

export interface IncidentCounts {
  colisiones: number;
  fatalidades: number;
  vehiculoFueraVia: number;
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
