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
  deleteDoc,
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

    // Firestore es la fuente primaria de la verdad cuando la consulta tiene éxito.
    // Si la colección se vació o se eliminaron registros en Firestore, actualizamos el almacenamiento local inmediatamente.
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(evaluations));
    return evaluations;
  } catch (error) {
    console.warn('No se pudo consultar Firestore directamente (posible regla o conexión offline). Usando almacenamiento local.', error);

    // Respaldo en localStorage SOLO si falló la conexión con Firestore (modo offline)
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parseando datos locales:', e);
      }
    }
    return [];
  }
}

/**
 * Elimina una evaluación específica de Firestore y del almacenamiento local
 */
export async function deleteEvaluation(evalId) {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, evalId));
  } catch (e) {
    console.warn('Error eliminando evaluación de Firestore:', e);
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      const filtered = list.filter(e => e.id !== evalId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.error('Error actualizando almacenamiento local tras borrado:', e);
  }
}

/**
 * Elimina todas las evaluaciones en Firestore y vacía el almacenamiento local
 */
export async function clearAllEvaluations() {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (e) {
    console.warn('Error vaciando colección en Firestore:', e);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
}

/**
 * Limpia los datos locales
 */
export function clearLocalCache() {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

/**
 * Actualiza la empresa y/o sede de un conjunto de evaluaciones en Firestore y almacenamiento local
 */
export async function updateEvaluationsBatchEmpresaSede(evalIds, newEmpresa, newSede) {
  if (!evalIds || evalIds.length === 0) return [];

  let list = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    list = [];
  }

  const updatedResults = [];

  for (const id of evalIds) {
    const updates = { updatedAt: new Date().toISOString() };
    if (newEmpresa !== null && newEmpresa !== undefined && newEmpresa.trim() !== '') {
      updates.empresa = newEmpresa.trim();
    }
    if (newSede !== '__KEEP__' && newSede !== undefined) {
      updates.sede = newSede ? newSede.trim() : '';
    }

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, updates, { merge: true });
    } catch (err) {
      console.warn(`Error actualizando Firestore para ${id}:`, err);
    }

    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      updatedResults.push(list[idx]);
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  return updatedResults;
}

/**
 * Actualiza todos los campos de una evaluación individual en Firestore y almacenamiento local
 */
export async function updateSingleEvaluation(evalId, updatedData) {
  if (!evalId) throw new Error('ID de evaluación no válido.');

  // Eliminar undefined para evitar que Firestore lance error
  const cleanUpdates = {};
  for (const [key, value] of Object.entries(updatedData)) {
    if (value !== undefined) {
      cleanUpdates[key] = value;
    }
  }
  cleanUpdates.updatedAt = new Date().toISOString();

  // 1. Guardar en localStorage
  let list = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    list = [];
  }

  const idx = list.findIndex(e => e.id === evalId);
  let mergedData = { id: evalId, ...cleanUpdates };
  if (idx >= 0) {
    mergedData = { ...list[idx], ...cleanUpdates };
    list[idx] = mergedData;
  } else {
    list.unshift(mergedData);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));

  // 2. Guardar en Cloud Firestore
  try {
    const docRef = doc(db, COLLECTION_NAME, evalId);
    await setDoc(docRef, mergedData, { merge: true });
    console.log(`Evaluación ${evalId} actualizada en Firestore exitosamente.`);
  } catch (err) {
    console.warn(`Error al actualizar Firestore para ${evalId}:`, err);
  }

  return mergedData;
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

/**
 * Agrupa y consolida las evaluaciones por Empresa para inspección de flotas
 */
export function processCompanySummaries(evaluations) {
  const map = new Map();

  for (const ev of evaluations) {
    const rawEmp = (ev.empresa || '').trim();
    if (!rawEmp) continue;

    if (!map.has(rawEmp)) {
      map.set(rawEmp, {
        nombre: rawEmp,
        slug: slugify(rawEmp),
        evaluaciones: [],
        conductoresMap: new Map()
      });
    }

    const companyData = map.get(rawEmp);
    companyData.evaluaciones.push(ev);

    const condName = (ev.conductor || 'Sin Asignar').trim();
    if (!companyData.conductoresMap.has(condName)) {
      companyData.conductoresMap.set(condName, []);
    }
    companyData.conductoresMap.get(condName).push(ev);
  }

  const summaries = [];

  for (const [name, data] of map.entries()) {
    const totalEvals = data.evaluaciones.length;
    let sumFinal = 0;
    let sumHab = 0;
    let sumSim = 0;
    let sumSim2 = 0;
    let countSim2 = 0;
    let sumSim3 = 0;
    let countSim3 = 0;
    let sumSim4 = 0;
    let countSim4 = 0;
    let totalCollisions = 0;
    let totalFatalities = 0;
    let totalOffRoad = 0;
    let approvedCount = 0;
    const nombresSimulaciones = {};
    const sedesSet = new Set();

    data.evaluaciones.forEach(ev => {
      const finalScore = ev.evaluacionFinalPuntos || ev.calificacionExacta || 0;
      sumFinal += finalScore;
      sumHab += (ev.habilidadesManejoPuntos || 0);
      sumSim += (ev.practicaSimuladorPuntos || 0);
      totalCollisions += (ev.colisiones || 0);
      totalFatalities += (ev.fatalidades || 0);
      totalOffRoad += (ev.vehiculoFueraVia || 0);
      if (finalScore >= 6.0) approvedCount++;

      if (ev.sede) {
        sedesSet.add(ev.sede);
      }

      // Recopilar nombres dinámicos de los ejercicios evaluados
      if (Array.isArray(ev.ejercicios)) {
        ev.ejercicios.forEach(e => {
          if (e.numero && e.nombre && !nombresSimulaciones[e.numero]) {
            nombresSimulaciones[e.numero] = e.nombre;
          }
        });
      } else if (ev.nombresSimulaciones) {
        Object.assign(nombresSimulaciones, ev.nombresSimulaciones);
      }

      if (typeof ev.simulacionesDetalle?.simulacion_2 === 'number' && !isNaN(ev.simulacionesDetalle.simulacion_2)) {
        sumSim2 += ev.simulacionesDetalle.simulacion_2;
        countSim2++;
      }
      if (typeof ev.simulacionesDetalle?.simulacion_3 === 'number' && !isNaN(ev.simulacionesDetalle.simulacion_3)) {
        sumSim3 += ev.simulacionesDetalle.simulacion_3;
        countSim3++;
      }
      if (typeof ev.simulacionesDetalle?.simulacion_4 === 'number' && !isNaN(ev.simulacionesDetalle.simulacion_4)) {
        sumSim4 += ev.simulacionesDetalle.simulacion_4;
        countSim4++;
      }
    });

    const conductores = [];
    for (const [condName, evals] of data.conductoresMap.entries()) {
      evals.sort((a, b) => {
        const da = a.fechaCapacitacion || a.fechaReporte || '';
        const db = b.fechaCapacitacion || b.fechaReporte || '';
        return da.localeCompare(db);
      });

      const latest = evals[evals.length - 1];
      const avgScore = evals.reduce((acc, e) => acc + (e.evaluacionFinalPuntos || e.calificacionExacta || 0), 0) / evals.length;
      const latestScore = latest.evaluacionFinalPuntos || latest.calificacionExacta || 0;

      conductores.push({
        nombre: condName,
        totalEvaluaciones: evals.length,
        ultimaFecha: latest.fechaCapacitacionFormato || latest.fechaCapacitacion || latest.fechaReporte,
        ultimoScore: latestScore,
        promedioScore: avgScore,
        sede: latest.sede || '',
        simulaciones: latest.simulacionesDetalle || {},
        simulacionesNombres: latest.nombresSimulaciones || nombresSimulaciones,
        ejercicios: latest.ejercicios || [],
        colisiones: evals.reduce((a, b) => a + (b.colisiones || 0), 0),
        fatalidades: evals.reduce((a, b) => a + (b.fatalidades || 0), 0),
        estado: latest.estado || 'Procesado',
        badgeColor: latest.badgeColor || 'info',
        latestEvalId: latest.id
      });
    }

    // Ordenar conductores por puntaje promedio descendente (ranking)
    conductores.sort((a, b) => b.promedioScore - a.promedioScore);

    summaries.push({
      nombre: name,
      slug: data.slug,
      sedes: Array.from(sedesSet),
      totalConductores: conductores.length,
      totalEvaluaciones: totalEvals,
      promedioFinal: totalEvals > 0 ? (sumFinal / totalEvals) : 0,
      promedioHabilidades: totalEvals > 0 ? (sumHab / totalEvals) : 0,
      promedioSimulador: totalEvals > 0 ? (sumSim / totalEvals) : 0,
      tasaAprobacion: totalEvals > 0 ? ((approvedCount / totalEvals) * 100) : 0,
      totalColisiones: totalCollisions,
      totalFatalidades: totalFatalities,
      totalFueraVia: totalOffRoad,
      promedioSim2: countSim2 > 0 ? (sumSim2 / countSim2) : 0,
      promedioSim3: countSim3 > 0 ? (sumSim3 / countSim3) : 0,
      promedioSim4: countSim4 > 0 ? (sumSim4 / countSim4) : 0,
      nombresSimulaciones: nombresSimulaciones,
      conductores: conductores
    });
  }

  summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return summaries;
}

