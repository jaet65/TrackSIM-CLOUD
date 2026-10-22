import { describe, it, expect } from 'vitest';
import { normalizeExerciseName, findCatalogExercise, EXERCISE_CATALOG } from '../exerciseCatalog';

describe('exerciseCatalog service', () => {
  describe('normalizeExerciseName', () => {
    it('debe limpiar acentos, mayúsculas, espacios y caracteres finales', () => {
      expect(normalizeExerciseName('  Montaña: ')).toBe('montana');
      expect(normalizeExerciseName('MANEJO DEFENSIVO.')).toBe('manejo defensivo');
      expect(normalizeExerciseName('  Sierra...  ')).toBe('sierra');
      expect(normalizeExerciseName('')).toBe('');
      expect(normalizeExerciseName(undefined)).toBe('');
    });
  });

  describe('findCatalogExercise', () => {
    it('debe encontrar ejercicios por coincidencia exacta normalizada', () => {
      const ex = findCatalogExercise('montana');
      expect(ex).not.toBeNull();
      expect(ex?.nombre).toBe('Montaña');
      expect(ex?.descripcion).toContain('auxiliares');
    });

    it('debe encontrar ejercicios con acentos y mayúsculas desordenadas', () => {
      const ex = findCatalogExercise('Manejo Técnico Económico.');
      expect(ex).not.toBeNull();
      expect(ex?.nombre).toBe('Manejo técnico económico');
    });

    it('debe encontrar ejercicios por coincidencia parcial si el reporte contiene el nombre', () => {
      const ex = findCatalogExercise('Ejercicio de Niebla en pista');
      expect(ex).not.toBeNull();
      expect(ex?.nombre).toBe('Niebla');
    });

    it('debe retornar null para nombres inexistentes o vacíos', () => {
      expect(findCatalogExercise('Ejercicio Desconocido 999')).toBeNull();
      expect(findCatalogExercise('')).toBeNull();
      expect(findCatalogExercise(undefined)).toBeNull();
    });

    it('debe cubrir todos los ejercicios del catálogo oficial', () => {
      EXERCISE_CATALOG.forEach(catalogItem => {
        const found = findCatalogExercise(catalogItem.nombre);
        expect(found).not.toBeNull();
        expect(found?.nombre).toBe(catalogItem.nombre);
      });
    });
  });
});
