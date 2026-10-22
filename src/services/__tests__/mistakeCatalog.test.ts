import { describe, it, expect } from 'vitest';
import {
  MISTAKE_DIMENSIONS,
  findCatalogMistake
} from '../mistakeCatalog';

describe('mistakeCatalog service', () => {
  it('debe tener las 5 dimensiones clave definidas correctamente', () => {
    expect(Object.keys(MISTAKE_DIMENSIONS).length).toBe(5);
    expect(MISTAKE_DIMENSIONS.EJE_1.id).toBe(1);
    expect(MISTAKE_DIMENSIONS.EJE_2.id).toBe(2);
    expect(MISTAKE_DIMENSIONS.EJE_3.id).toBe(3);
    expect(MISTAKE_DIMENSIONS.EJE_4.id).toBe(4);
    expect(MISTAKE_DIMENSIONS.EJE_5.id).toBe(5);
  });

  it('debe encontrar un error por nombre o alias común', () => {
    // Eje 1: Normas de tráfico
    const stopError = findCatalogMistake('No parar en un stop');
    expect(stopError).not.toBeNull();
    expect(stopError?.ejeId).toBe(1);

    // Eje 2: Colisión / Seguridad
    const collisionError = findCatalogMistake('Colisión con un objeto');
    expect(collisionError).not.toBeNull();
    expect(collisionError?.ejeId).toBe(2);
  });

  it('debe devolver null o mapeo seguro ante cadenas vacías o no string', () => {
    expect(findCatalogMistake('')).toBeNull();
  });
});
