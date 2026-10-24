import { describe, expect, it } from 'vitest';
import { DEMO_EVALUATIONS } from '../demoEvaluations';
import { processDriverSummaries } from '../../services/analytics';

describe('demo evaluations', () => {
  it('provides 100 varied, fictional evaluations with unique records', () => {
    expect(DEMO_EVALUATIONS).toHaveLength(100);
    expect(new Set(DEMO_EVALUATIONS.map((evaluation) => evaluation.id)).size).toBe(100);
    expect(new Set(DEMO_EVALUATIONS.map((evaluation) => evaluation.empresa)).size).toBe(5);
    expect(new Set(DEMO_EVALUATIONS.map((evaluation) => evaluation.conductor)).size).toBe(20);
    expect(new Set(DEMO_EVALUATIONS.map((evaluation) => evaluation.evaluacionFinalPuntos)).size).toBeGreaterThan(30);
    expect(DEMO_EVALUATIONS.every((evaluation) => evaluation.origen === 'demo')).toBe(true);
  });

  it('keeps skill and simulator subscores within their limits and the final score', () => {
    DEMO_EVALUATIONS.forEach((evaluation) => {
      const finalScore = evaluation.evaluacionFinalPuntos ?? 0;
      const handlingScore = evaluation.habilidadesManejoPuntos ?? 0;
      const simulatorScore = evaluation.practicaSimuladorPuntos ?? 0;

      expect(handlingScore).toBeGreaterThanOrEqual(0);
      expect(handlingScore).toBeLessThanOrEqual(3);
      expect(simulatorScore).toBeGreaterThanOrEqual(0);
      expect(simulatorScore).toBeLessThanOrEqual(7);
      expect(handlingScore + simulatorScore).toBeCloseTo(finalScore, 2);
      expect(handlingScore).toBeLessThanOrEqual(finalScore);
      expect(simulatorScore).toBeLessThanOrEqual(finalScore);
    });
  });

  it('orders records newest first for the recent activity panels', () => {
    expect(DEMO_EVALUATIONS[0].fechaCapacitacion?.slice(0, 7)).toBe('2026-08');
    expect(DEMO_EVALUATIONS.every((evaluation, index) =>
      index === 0 || (DEMO_EVALUATIONS[index - 1].fechaCapacitacion || '') >= (evaluation.fechaCapacitacion || '')
    )).toBe(true);
  });

  it('shows distinct operator trajectories, incident histories, and exercise strengths', () => {
    const driverSummaries = processDriverSummaries(DEMO_EVALUATIONS);
    const lucia = driverSummaries.find((driver) => driver.nombre === 'Lucía Martínez');
    const camila = driverSummaries.find((driver) => driver.nombre === 'Camila Torres');

    expect(lucia?.evaluaciones.slice(0, 2).map((evaluation) => evaluation.evaluacionFinalPuntos)).toEqual([5.8, 6.7]);
    expect(camila?.evaluaciones.map((evaluation) => evaluation.colisiones)).toEqual([5, 3, 2, 3, 1]);
    expect(new Set(driverSummaries.map((driver) => driver.tendencia))).toEqual(new Set(['mejora', 'estable']));

    const exerciseAverages = ['Ruta urbana', 'Conducción en carretera', 'Maniobras de precisión', 'Conducción defensiva', 'Reversa en andén']
      .map((name) => {
        const scores = DEMO_EVALUATIONS.flatMap((evaluation) =>
          (evaluation.ejercicios || [])
            .filter((exercise) => exercise.nombre === name)
            .map((exercise) => exercise.calificacion || 0)
        );
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
      });

    expect(Math.max(...exerciseAverages) - Math.min(...exerciseAverages)).toBeGreaterThan(0.3);
  });

  it('gives the competency radar varied scores instead of near-perfect dimensions', () => {
    const andresEvaluations = DEMO_EVALUATIONS.filter((evaluation) => evaluation.conductor === 'Andrés Molina');
    const errorCounts = [1, 2, 3, 4, 5].map((axisId) =>
      andresEvaluations.reduce((total, evaluation) =>
        total + (evaluation.erroresFrecuentes || [])
          .filter((mistake) => mistake.ejeId === axisId)
          .reduce((sessionTotal, mistake) => sessionTotal + mistake.repeticiones, 0), 0)
    );
    const penalties = [0.4, 1.2, 0.3, 0.6, 0.8];
    const radarScores = errorCounts.map((count, index) =>
      Math.max(1, Math.min(10, 10 - (count / andresEvaluations.length) * penalties[index]))
    );
    const averageFinalScore = andresEvaluations.reduce(
      (total, evaluation) => total + (evaluation.evaluacionFinalPuntos || 0),
      0
    ) / andresEvaluations.length;

    expect(radarScores.every((score) => score < 9.5)).toBe(true);
    expect(Math.max(...radarScores) - Math.min(...radarScores)).toBeGreaterThan(2);
    expect(radarScores.every((score) => score <= averageFinalScore)).toBe(true);
  });

  it('aligns annual score changes with changes in fleet incident rates', () => {
    const annualStats = new Map<string, {
      totalScore: number;
      count: number;
      incidents: number;
      drivers: Set<string>;
    }>();
    DEMO_EVALUATIONS.forEach((evaluation) => {
      const year = (evaluation.fechaCapacitacion || '').slice(0, 4);
      const current = annualStats.get(year) || {
        totalScore: 0,
        count: 0,
        incidents: 0,
        drivers: new Set<string>()
      };
      current.totalScore += evaluation.evaluacionFinalPuntos || 0;
      current.count += 1;
      current.incidents += (evaluation.colisiones || 0) + (evaluation.fatalidades || 0) + (evaluation.vehiculoFueraVia || 0);
      current.drivers.add(evaluation.conductor || '');
      annualStats.set(year, current);
    });
    const annualResults = Array.from(annualStats.entries())
      .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
      .map(([year, summary]) => ({
        year,
        averageScore: summary.totalScore / summary.count,
        incidentRate: summary.incidents / summary.drivers.size
      }));

    expect(Math.max(...annualResults.map((result) => result.averageScore)) -
      Math.min(...annualResults.map((result) => result.averageScore))).toBeGreaterThan(0.5);
    annualResults.slice(1).forEach((result, index) => {
      const previous = annualResults[index];
      if (result.incidentRate < previous.incidentRate) {
        expect(result.averageScore).toBeGreaterThan(previous.averageScore);
      } else if (result.incidentRate > previous.incidentRate) {
        expect(result.averageScore).toBeLessThan(previous.averageScore);
      }
    });
  });
});
