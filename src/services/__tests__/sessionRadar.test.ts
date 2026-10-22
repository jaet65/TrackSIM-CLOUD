import { describe, it, expect } from 'vitest';
import {
  calculateSingleSessionRadar
} from '../sessionRadar';
import { Evaluation } from '../../types';

describe('sessionRadar service', () => {
  it('debe retornar dimensiones predeterminadas y scores por defecto (7.0) si no hay evaluación', () => {
    const result = calculateSingleSessionRadar(null);
    expect(result.scores).toEqual([7.0, 7.0, 7.0, 7.0, 7.0]);
    expect(result.radarDimensions.length).toBe(5);
    expect(result.hasMistakeData).toBe(false);
    expect(result.mistakeDetails).toEqual([]);
  });

  it('debe calcular penalizaciones correctamente cuando hay datos de errores en la sesión', () => {
    const mockEval: Partial<Evaluation> = {
      erroresFrecuentes: [
        {
          error: 'Frenar bruscamente',
          repeticiones: 2,
          ejeId: 2 // Dinámica y Seguridad (penalización 1.2 por repetición = -2.4 => score 7.6)
        },
        {
          error: 'No usar direccional',
          repeticiones: 1,
          ejeId: 1 // Normas de Tráfico (penalización 0.4 por repetición = -0.4 => score 9.6)
        }
      ]
    };

    const result = calculateSingleSessionRadar(mockEval as Evaluation);
    expect(result.hasMistakeData).toBe(true);

    // Eje 1 (Normas de Tráfico): 10 - (1 * 0.4) = 9.6
    expect(result.scores[0]).toBe(9.6);
    // Eje 2 (Dinámica y Seguridad): 10 - (2 * 1.2) = 7.6
    expect(result.scores[1]).toBe(7.6);
    // Ejes sin errores: 10.0
    expect(result.scores[2]).toBe(10.0);
    expect(result.scores[3]).toBe(10.0);
    expect(result.scores[4]).toBe(10.0);

    // Contadores de errores
    expect(result.errorCounts[1]).toBe(1);
    expect(result.errorCounts[2]).toBe(2);
    expect(result.errorCounts[3]).toBe(0);

    // Detalles ordenados por repeticiones descendentes
    expect(result.mistakeDetails[0].error).toBe('Frenar bruscamente');
    expect(result.mistakeDetails[0].repeticiones).toBe(2);
  });

  it('no debe permitir scores menores a 1.0 ni mayores a 10.0 ante exceso de errores', () => {
    const mockEval: Partial<Evaluation> = {
      erroresFrecuentes: [
        {
          error: 'Colisión frontal severa',
          repeticiones: 20, // 20 * 1.2 = 24 de penalización
          ejeId: 2
        }
      ]
    };

    const result = calculateSingleSessionRadar(mockEval as Evaluation);
    expect(result.scores[1]).toBe(1.0);
  });

  it('debe calcular fallback a partir de métricas globales cuando no hay errores catalogados', () => {
    const mockEval: Partial<Evaluation> = {
      evaluacionFinalPuntos: 8.5,
      colisiones: 1,
      fatalidades: 0,
      habilidadesManejoPct: 85,
      practicaSimuladorPct: 90
    };

    const result = calculateSingleSessionRadar(mockEval as Evaluation);
    expect(result.hasMistakeData).toBe(false);
    expect(result.scores[0]).toBe(8.5); // habilidadesManejoPct / 10
    expect(result.scores[1]).toBe(7.5); // 10 - (1 colision * 2.5) = 7.5
    expect(result.scores[2]).toBe(9.0); // practicaSimuladorPct / 10
  });
});
