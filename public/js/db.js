/**
 * TrackSIM CLOUD - Database Management Service
 * Conexión bidireccional con Cloud Firestore y sincronización con caché local.
 */

import {
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy
} from './firebase-config.js';

const LOCAL_STORAGE_KEY = 'tracksim_cloud_evaluaciones';
const COLLECTION_NAME = 'evaluaciones';

/**
 * Normaliza nombres para IDs
 */
export function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Carga las evaluaciones desde Firestore o caché local de respaldo
 */
export async function getEvaluations() {
  let evaluations = [];

  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('fechaCapacitacion', 'desc'));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      evaluations.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (evaluations.length > 0) {
      // Guardar respaldo local actualizado
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(evaluations));
      return evaluations;
    }
  } catch (error) {
    console.warn('No se pudo consultar Firestore directamente (posible regla o conexión offline). Usando almacenamiento local.', error);
  }

  // Respaldo en localStorage
  const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (localData) {
    try {
      evaluations = JSON.parse(localData);
      if (evaluations.length > 0) return evaluations;
    } catch (e) {
      console.error('Error parseando datos locales:', e);
    }
  }

  // Si no hay datos en Firestore ni en localStorage, retornar arreglo vacío
  return evaluations;
}

/**
 * Limpia los datos locales
 */
export function clearLocalCache() {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

/**
 * Guarda una evaluación tanto en Firestore como en localStorage
 */
export async function saveEvaluation(evaluationData) {
  const evalId = evaluationData.id || `eval_${Date.now()}`;
  const cleanData = { ...evaluationData, id: evalId, updatedAt: new Date().toISOString() };

  // 1. Guardar en localStorage primero para respuesta inmediata
  let list = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    list = [];
  }

  const existingIndex = list.findIndex(e => e.id === evalId || (e.firmaDigital && e.firmaDigital === cleanData.firmaDigital));
  if (existingIndex >= 0) {
    list[existingIndex] = cleanData;
  } else {
    list.unshift(cleanData);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));

  // 2. Guardar en Cloud Firestore
  try {
    const docRef = doc(db, COLLECTION_NAME, evalId);
    await setDoc(docRef, cleanData, { merge: true });
    console.log(`Evaluación ${evalId} sincronizada con Firestore exitosamente.`);
  } catch (err) {
    console.warn(`No se pudo escribir en Firestore para ${evalId}:`, err);
  }

  return cleanData;
}

/**
 * Guarda un lote de evaluaciones extraídas
 */
export async function saveBatchEvaluations(evaluationsArray) {
  const results = [];
  for (const evalData of evaluationsArray) {
    const saved = await saveEvaluation(evalData);
    results.push(saved);
  }
  return results;
}

/**
 * Intenta sincronizar array completo a Firestore
 */
async function syncToFirestore(evals) {
  for (const item of evals) {
    try {
      const docRef = doc(db, COLLECTION_NAME, item.id);
      await setDoc(docRef, item, { merge: true });
    } catch (e) {
      // Ignorar errores silenciosamente en background
    }
  }
}

/**
 * Agrupa las evaluaciones por Conductor y calcula su evolución y estadísticas
 */
export function processDriverSummaries(evaluations) {
  const map = new Map();

  for (const evalItem of evaluations) {
    const name = (evalItem.conductor || 'Sin Asignar').trim();
    if (!map.has(name)) {
      map.set(name, {
        nombre: name,
        slug: slugify(name),
        empresa: evalItem.empresa || '',
        evaluaciones: [],
        totalEvaluaciones: 0,
        primeraCalificacion: 0,
        ultimaCalificacion: 0,
        promedioCalificacion: 0,
        mejorCalificacion: 0,
        peorCalificacion: 0,
        promedioHabilidades: 0,
        promedioSimulador: 0,
        totalFatalidades: 0,
        totalColisiones: 0,
        totalFueraVia: 0,
        cambioPorcentual: 0,
        tendencia: 'neutral', // 'mejora', 'retroceso', 'neutral'
        estadoGeneral: 'Requiere Refuerzo'
      });
    }

    map.get(name).evaluaciones.push(evalItem);
  }

  const summaries = [];
  for (const [name, summary] of map.entries()) {
    // Ordenar cronológicamente (más antiguo al más reciente)
    summary.evaluaciones.sort((a, b) => {
      const dateA = a.fechaCapacitacion || a.fechaReporte || '';
      const dateB = b.fechaCapacitacion || b.fechaReporte || '';
      return dateA.localeCompare(dateB);
    });

    summary.totalEvaluaciones = summary.evaluaciones.length;

    let sumFinal = 0;
    let sumHab = 0;
    let sumSim = 0;
    let best = -1;
    let worst = 999;

    summary.evaluaciones.forEach(ev => {
      const finalScore = ev.evaluacionFinalPuntos || ev.calificacionExacta || 0;
      sumFinal += finalScore;
      sumHab += (ev.habilidadesManejoPuntos || 0);
      sumSim += (ev.practicaSimuladorPuntos || 0);
      summary.totalFatalidades += (ev.fatalidades || 0);
      summary.totalColisiones += (ev.colisiones || 0);
      summary.totalFueraVia += (ev.vehiculoFueraVia || 0);

      if (finalScore > best) best = finalScore;
      if (finalScore < worst) worst = finalScore;
    });

    summary.promedioCalificacion = parseFloat((sumFinal / summary.totalEvaluaciones).toFixed(2));
    summary.promedioHabilidades = parseFloat((sumHab / summary.totalEvaluaciones).toFixed(2));
    summary.promedioSimulador = parseFloat((sumSim / summary.totalEvaluaciones).toFixed(2));
    summary.mejorCalificacion = best > -1 ? parseFloat(best.toFixed(2)) : 0;
    summary.peorCalificacion = worst < 999 ? parseFloat(worst.toFixed(2)) : 0;

    const first = summary.evaluaciones[0];
    const latest = summary.evaluaciones[summary.evaluaciones.length - 1];

    summary.primeraCalificacion = first.evaluacionFinalPuntos || first.calificacionExacta || 0;
    summary.ultimaCalificacion = latest.evaluacionFinalPuntos || latest.calificacionExacta || 0;

    if (summary.totalEvaluaciones > 1) {
      const diff = summary.ultimaCalificacion - summary.primeraCalificacion;
      summary.cambioPorcentual = parseFloat(((diff / (summary.primeraCalificacion || 1)) * 100).toFixed(1));
      summary.tendencia = diff > 0.2 ? 'mejora' : diff < -0.2 ? 'retroceso' : 'estable';
    } else {
      summary.cambioPorcentual = 0;
      summary.tendencia = 'estable';
    }

    if (summary.ultimaCalificacion >= 8.0) {
      summary.estadoGeneral = 'Sobresaliente';
      summary.badgeColor = 'success';
    } else if (summary.ultimaCalificacion >= 6.0) {
      summary.estadoGeneral = 'Aprobado';
      summary.badgeColor = 'info';
    } else if (summary.ultimaCalificacion >= 5.0) {
      summary.estadoGeneral = 'Requiere Refuerzo';
      summary.badgeColor = 'warning';
    } else {
      summary.estadoGeneral = 'No Aprobado';
      summary.badgeColor = 'danger';
    }

    summaries.push(summary);
  }

  // Ordenar por nombre alfabético
  summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return summaries;
}
