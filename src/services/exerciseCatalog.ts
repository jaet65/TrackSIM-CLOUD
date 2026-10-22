/**
 * Catálogo oficial de ejercicios de simulador y su descripción.
 */
export interface CatalogExercise {
  nombre: string;
  descripcion: string;
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  {
    nombre: 'Montaña',
    descripcion: 'Conducción en Montaña con enfoque al uso de frenos auxiliares y el correcto uso de los frenos de servicio en condiciones adversas. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Manejo técnico económico',
    descripcion: 'Conducción en Autopista con enfoque de manejo técnico económico. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Manejo defensivo',
    descripcion: 'Conducción en Ciudad con enfoque al manejo a la defensiva y seguridad vial. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Efectos del alcohol',
    descripcion: 'Sensibilización sobre los riesgos del manejo bajo los efectos de sustancias. #NoMásSustanciasAlVolante. (Se entrega retroalimentación al operador.) NO SE CONSIDERA PARA EVALUACIÓN FINAL'
  },
  {
    nombre: 'Enrampe',
    descripcion: 'Ejercicio de entrega en andenes bajo diferentes condiciones. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Maniobras Críticas',
    descripcion: 'En un entorno urbano, simulamos la conducción con un énfasis en ser vistos y escuchados durante maniobras repetitivas. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Sierra',
    descripcion: 'Conducción en Sierra con condiciones adversas, enfocada en técnicas de frenado en condiciones de baja tracción. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Niebla',
    descripcion: 'Conducción en pista con baja visibilidad debido a neblina densa. (Se entrega retroalimentación al operador.)'
  }
];

export function normalizeExerciseName(str?: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca un ejercicio del catálogo por nombre o aproximación
 */
export function findCatalogExercise(name?: string): CatalogExercise | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;

  // 1. Coincidencia exacta normalizada
  const exact = EXERCISE_CATALOG.find((e) => normalizeExerciseName(e.nombre) === key);
  if (exact) return exact;

  // 2. Coincidencia por contención (si el nombre del reporte contiene o es contenido por el catálogo)
  const partial = EXERCISE_CATALOG.find((e) => {
    const catKey = normalizeExerciseName(e.nombre);
    return key.includes(catKey) || catKey.includes(key);
  });

  return partial || null;
}
