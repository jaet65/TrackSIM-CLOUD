import { describe, it, expect } from 'vitest';
import {
  normalizeExerciseName,
  findCatalogExercise,
  getActiveCatalog,
  setActiveCatalog,
  EXERCISE_CATALOG,
  parseCatalogCsv,
  serializeCatalogCsv
} from '../exerciseCatalog';

describe('exerciseCatalog service', () => {
  describe('normalizeExerciseName', () => {
    it('debe limpiar acentos, mayúsculas, espacios y caracteres finales', () => {
      expect(normalizeExerciseName('  Montaña: ')).toBe('montana');
      expect(normalizeExerciseName('MANEJO DEFENSIVO.')).toBe('manejo defensivo');
      expect(normalizeExerciseName('  Sierra...  ')).toBe('sierra');
      expect(normalizeExerciseName('03c Autopista')).toBe(normalizeExerciseName('03C - Autopista'));
      expect(normalizeExerciseName('03c Autopista')).toBe(normalizeExerciseName('03C/Autopista'));
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

    it('debe asociar nombres que solo difieren en mayúsculas o separadores', () => {
      const currentCatalog = getActiveCatalog();
      setActiveCatalog([{ nombre: '03C - Autopista', descripcion: 'Ruta' }]);
      try {
        expect(findCatalogExercise('03c Autopista')?.nombre).toBe('03C - Autopista');
        expect(findCatalogExercise('03C/Autopista')?.nombre).toBe('03C - Autopista');
      } finally {
        setActiveCatalog(currentCatalog);
      }
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

  describe('CSV import/export', () => {
    it('debe exportar e importar acentos, comas, comillas y saltos de línea', () => {
      const catalog = [
        { nombre: 'Montaña', descripcion: 'Ruta, segura y "confiable".\nSegunda línea.' },
        { nombre: 'Reparto', descripcion: '' }
      ];
      expect(parseCatalogCsv(serializeCatalogCsv(catalog))).toEqual(catalog);
    });

    it('debe aceptar encabezados en distinto orden y finales de línea de Windows', () => {
      expect(parseCatalogCsv('descripcion,nombre\r\n"Ruta, segura",Montaña')).toEqual([
        { nombre: 'Montaña', descripcion: 'Ruta, segura' }
      ]);
    });

    it('debe rechazar encabezados incorrectos, filas incompletas, comillas inválidas y duplicados', () => {
      expect(() => parseCatalogCsv('nombre,detalle\nMontaña,Ruta')).toThrow('columnas');
      expect(() => parseCatalogCsv('nombre,descripcion\nMontaña')).toThrow('fila');
      expect(() => parseCatalogCsv('nombre,descripcion\n"Montaña,Ruta')).toThrow('sin cerrar');
      expect(() => parseCatalogCsv('nombre,descripcion\n"Montaña"x,Ruta')).toThrow('formato inválido');
      expect(() => parseCatalogCsv('nombre,descripcion\nMontaña,\nMontana,')).toThrow('nombres duplicados');
      expect(() => parseCatalogCsv('nombre,descripcion\n03c Autopista,\n03C - Autopista,')).toThrow('nombres duplicados');
    });
  });
});
