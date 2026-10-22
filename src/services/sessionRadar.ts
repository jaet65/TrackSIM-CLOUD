import { Evaluation } from '../types';
import { MISTAKE_DIMENSIONS, MistakeDimension, findCatalogMistake } from './mistakeCatalog';

export interface SingleSessionRadarResult {
  scores: number[];
  errorCounts: Record<number, number>;
  hasMistakeData: boolean;
  mistakeDetails: Array<{ error: string; repeticiones: number; ejeId: number }>;
  radarDimensions: MistakeDimension[];
}

export const RADAR_ORDERED_DIMENSIONS: MistakeDimension[] = [
  MISTAKE_DIMENSIONS.EJE_1, // Normas de Tráfico
  MISTAKE_DIMENSIONS.EJE_2, // Dinámica y Seguridad
  MISTAKE_DIMENSIONS.EJE_3, // Eficiencia de Motor
  MISTAKE_DIMENSIONS.EJE_4, // Transmisión y Embrague
  MISTAKE_DIMENSIONS.EJE_5  // Arranque y Preparación
];

/**
 * Calcula los puntajes de radar (1 a 10) para UNA ÚNICA sesión / evaluación.
 * Considera únicamente los errores e incidencias ocurridos en esa sesión específica.
 */
export function calculateSingleSessionRadar(evaluation: Evaluation | null | undefined): SingleSessionRadarResult {
  const errorCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const mistakeMap = new Map<string, { error: string; repeticiones: number; ejeId: number }>();
  let hasMistakeData = false;

  if (evaluation && Array.isArray(evaluation.erroresFrecuentes) && evaluation.erroresFrecuentes.length > 0) {
    hasMistakeData = true;
    evaluation.erroresFrecuentes.forEach(item => {
      let ejeId = item.ejeId;
      const match = findCatalogMistake(item.error || item.errorRaw || '');
      if (!ejeId && match) ejeId = match.ejeId;
      const finalEjeId = ejeId || 1;
      const errorName = match ? match.nombre : (item.error || item.errorRaw || 'Error no clasificado');

      if (errorCounts[finalEjeId] != null) {
        errorCounts[finalEjeId] += (item.repeticiones || 1);
      }

      const existing = mistakeMap.get(errorName);
      if (existing) {
        existing.repeticiones += (item.repeticiones || 1);
      } else {
        mistakeMap.set(errorName, {
          error: errorName,
          repeticiones: item.repeticiones || 1,
          ejeId: finalEjeId
        });
      }
    });
  }

  const mistakeDetails = Array.from(mistakeMap.values()).sort((a, b) => b.repeticiones - a.repeticiones);

  // Penalizaciones por error en sesión única:
  // Eje 1 (Normas): -0.4 por error
  // Eje 2 (Dinámica/Seguridad): -1.2 por error
  // Eje 3 (Eficiencia Motor): -0.3 por error
  // Eje 4 (Transmisión/Embrague): -0.6 por error
  // Eje 5 (Arranque): -0.8 por error
  const penalties: Record<number, number> = {
    1: 0.4,
    2: 1.2,
    3: 0.3,
    4: 0.6,
    5: 0.8
  };

  const scores = RADAR_ORDERED_DIMENSIONS.map(dim => {
    if (!evaluation) return 7.0;

    if (hasMistakeData) {
      const count = errorCounts[dim.id] || 0;
      // En una sola sesión no dividimos por numEvals (numEvals = 1)
      const score = Math.max(1.0, Math.min(10.0, 10.0 - (count * (penalties[dim.id] || 0.5))));
      return parseFloat(score.toFixed(1));
    } else {
      // Fallback si la evaluación no tiene errores extraídos
      const finalScore = evaluation.evaluacionFinalPuntos ?? evaluation.calificacionExacta ?? 7.0;
      const colFactor = Math.max(0, 10 - ((evaluation.colisiones || 0) * 2.5) - ((evaluation.fatalidades || 0) * 4));
      if (dim.id === 1) return parseFloat(Math.min(10, Math.max(2, (evaluation.habilidadesManejoPct ? evaluation.habilidadesManejoPct / 10 : finalScore))).toFixed(1));
      if (dim.id === 2) return parseFloat(Math.min(10, Math.max(1, colFactor)).toFixed(1));
      if (dim.id === 3) return parseFloat(Math.min(10, Math.max(2, (evaluation.practicaSimuladorPct ? evaluation.practicaSimuladorPct / 10 : finalScore))).toFixed(1));
      if (dim.id === 4) return parseFloat(Math.min(10, Math.max(2, finalScore * 0.95)).toFixed(1));
      return parseFloat(Math.min(10, Math.max(2, finalScore)).toFixed(1));
    }
  });

  return {
    scores,
    errorCounts,
    hasMistakeData,
    mistakeDetails,
    radarDimensions: RADAR_ORDERED_DIMENSIONS
  };
}
