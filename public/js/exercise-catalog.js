/**
 * Catálogo oficial de ejercicios de simulador y su descripción.
 */
export const EXERCISE_CATALOG = [
  { nombre: 'Montaña', descripcion: 'Conducción en Montaña con enfoque al uso de frenos auxiliares y el correcto uso de los frenos de servicio en condiciones adversas. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Manejo técnico económico', descripcion: 'Conducción en Autopista con enfoque de manejo técnico económico. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Manejo defensivo', descripcion: 'Conducción en Ciudad con enfoque al manejo a la defensiva y seguridad vial. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Efectos del alcohol', descripcion: 'Sensibilización sobre los riesgos del manejo bajo los efectos de sustancias. #NoMásSustanciasAlVolante. (Se entrega retroalimentación al operador.) NO SE CONSIDERA PARA EVALUACIÓN FINAL' },
  { nombre: 'Enrampe', descripcion: 'Ejercicio de entrega en andenes bajo diferentes condiciones. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Maniobras Críticas', descripcion: 'En un entorno urbano, simulamos la conducción con un énfasis en ser vistos y escuchados durante maniobras repetitivas. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Sierra', descripcion: 'Conducción en Sierra con condiciones adversas, enfocada en técnicas de frenado en condiciones de baja tracción. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Niebla', descripcion: 'Conducción en pista con baja visibilidad debido a neblina densa. (Se entrega retroalimentación al operador.)' },
  { nombre: 'Reparto', descripcion: 'Reparto Urbano con enfoque de manejo técnico económico y seguridad vial con paradas continuas en diferentes ubicaciones. (Se entrega retroalimentación al operador.)' }
];

export function normalizeExerciseName(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[.:]+$/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Busca un ejercicio del catálogo por nombre (sin acentos, mayúsculas ni punto final)
 */
export function findCatalogExercise(name) {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return EXERCISE_CATALOG.find(e => normalizeExerciseName(e.nombre) === key) || null;
}

/**
 * Crea (una sola vez) el datalist con los nombres del catálogo
 */
export function ensureExerciseDatalist() {
  if (document.getElementById('exerciseCatalogList')) return;
  const dl = document.createElement('datalist');
  dl.id = 'exerciseCatalogList';
  dl.innerHTML = EXERCISE_CATALOG.map(e => `<option value="${e.nombre}"></option>`).join('');
  document.body.appendChild(dl);
}
