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
import { normalizeExerciseName } from './exercise-catalog.js';

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
      } catch {
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
  } catch {
    console.warn('Error eliminando evaluación de Firestore:', e);
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      const filtered = list.filter(e => e.id !== evalId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
        estadoGeneral: 'Reforzar'
      });
    }

    map.get(name).evaluaciones.push(evalItem);
  }

  const summaries = [];
  for (const [, summary] of map.entries()) {
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
      summary.estadoGeneral = 'Reforzar';
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

      // Calcular promedio de cada ejercicio para ESTE conductor (si hizo el mismo ejercicio varias veces)
      const driverExMap = new Map(); // key: normalizedName -> { nombreDisplay, scores: [], numeroMin }

      evals.forEach(ev => {
        if (Array.isArray(ev.ejercicios) && ev.ejercicios.length > 0) {
          ev.ejercicios.forEach(ex => {
            if (!ex) return;
            const rawName = (ex.nombre || (ex.numero ? (nombresSimulaciones[ex.numero] || `Ejercicio ${ex.numero}`) : '')).trim();
            if (!rawName) return;
            const normKey = normalizeExerciseName(rawName) || rawName.toLowerCase();
            const score = typeof ex.calificacion === 'number' ? ex.calificacion : parseFloat(ex.calificacion);
            if (!isNaN(score)) {
              if (!driverExMap.has(normKey)) {
                driverExMap.set(normKey, { nombreDisplay: rawName, scores: [], numero: ex.numero });
              }
              driverExMap.get(normKey).scores.push(score);
            }
          });
        } else if (ev.simulacionesDetalle && typeof ev.simulacionesDetalle === 'object') {
          Object.keys(ev.simulacionesDetalle).forEach(k => {
            const score = ev.simulacionesDetalle[k];
            if (typeof score !== 'number' || isNaN(score)) return;
            const num = parseInt(k.replace('simulacion_', ''), 10);
            const rawName = (ev.nombresSimulaciones?.[num] || nombresSimulaciones[num] || `Simulación ${num}`).trim();
            const normKey = normalizeExerciseName(rawName) || rawName.toLowerCase();
            if (!driverExMap.has(normKey)) {
              driverExMap.set(normKey, { nombreDisplay: rawName, scores: [], numero: num });
            }
            driverExMap.get(normKey).scores.push(score);
          });
        }
      });

      const promediosEjerciciosConductor = {};
      driverExMap.forEach((val, normKey) => {
        const sum = val.scores.reduce((a, b) => a + b, 0);
        const avg = sum / val.scores.length;
        promediosEjerciciosConductor[normKey] = {
          nombre: val.nombreDisplay,
          numero: val.numero,
          promedio: parseFloat(avg.toFixed(2)),
          totalVeces: val.scores.length
        };
      });

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
        promediosEjercicios: promediosEjerciciosConductor,
        colisiones: evals.reduce((a, b) => a + (b.colisiones || 0), 0),
        fatalidades: evals.reduce((a, b) => a + (b.fatalidades || 0), 0),
        estado: latest.estado || 'Procesado',
        badgeColor: latest.badgeColor || 'info',
        latestEvalId: latest.id
      });
    }

    // Ordenar conductores por puntaje promedio descendente (ranking)
    conductores.sort((a, b) => b.promedioScore - a.promedioScore);

    // Calcular el promedio general de la flota para CADA ejercicio
    // Metodología: si un conductor hizo el mismo ejercicio varias veces, se toma primero su promedio personal,
    // y luego se promedian los conductores que hayan realizado dicho ejercicio.
    const fleetExerciseMap = new Map(); // normKey -> { nombreDisplay, numero, sumDriverAvg: 0, driverCount: 0 }

    conductores.forEach(c => {
      if (!c.promediosEjercicios) return;
      Object.entries(c.promediosEjercicios).forEach(([normKey, exData]) => {
        if (!fleetExerciseMap.has(normKey)) {
          fleetExerciseMap.set(normKey, {
            key: normKey,
            nombre: exData.nombre,
            numero: exData.numero || null,
            sumDriverAvg: 0,
            driverCount: 0,
            totalRealizaciones: 0
          });
        }
        const fleetEx = fleetExerciseMap.get(normKey);
        fleetEx.sumDriverAvg += exData.promedio;
        fleetEx.driverCount += 1;
        fleetEx.totalRealizaciones += (exData.totalVeces || 1);
      });
    });

    const ejerciciosPromedio = [];
    fleetExerciseMap.forEach(fEx => {
      const avg = fEx.driverCount > 0 ? (fEx.sumDriverAvg / fEx.driverCount) : 0;
      ejerciciosPromedio.push({
        key: fEx.key,
        nombre: fEx.nombre,
        numero: fEx.numero,
        promedio: parseFloat(avg.toFixed(2)),
        totalConductores: fEx.driverCount,
        totalRealizaciones: fEx.totalRealizaciones
      });
    });

    // Ordenar ejercicios por número de simulación si existe, o por realizaciones / nombre
    ejerciciosPromedio.sort((a, b) => {
      if (a.numero && b.numero) return a.numero - b.numero;
      if (a.numero) return -1;
      if (b.numero) return 1;
      return a.nombre.localeCompare(b.nombre);
    });

    // ==========================================
    // TRAZABILIDAD Y EVOLUCIÓN ANUAL DE LA EMPRESA
    // ==========================================
    const annualMap = new Map(); // año (string) -> acumulador

    data.evaluaciones.forEach(ev => {
      // Extraer año de fechaCapacitacion (YYYY-MM-DD), fechaCapacitacionFormato (DD/MM/YYYY) o fechaReporte
      let year = null;
      if (ev.fechaCapacitacion && /^\d{4}/.test(ev.fechaCapacitacion)) {
        year = ev.fechaCapacitacion.substring(0, 4);
      } else if (ev.fechaCapacitacionFormato && /\d{4}/.test(ev.fechaCapacitacionFormato)) {
        const m = ev.fechaCapacitacionFormato.match(/(\d{4})/);
        if (m) year = m[1];
      } else if (ev.fechaReporte && /\d{4}/.test(ev.fechaReporte)) {
        const m = ev.fechaReporte.match(/(\d{4})/);
        if (m) year = m[1];
      }

      if (!year) year = 'S/F';

      if (!annualMap.has(year)) {
        annualMap.set(year, {
          year: year,
          evaluaciones: [],
          conductoresSet: new Set(),
          sumFinal: 0,
          sumHab: 0,
          sumSim: 0,
          approvedCount: 0,
          totalCollisions: 0,
          totalFatalities: 0,
          totalOffRoad: 0,
          driverExercisesMap: new Map() // condName -> Map(normKey -> { scores: [], nombre, numero })
        });
      }

      const aData = annualMap.get(year);
      aData.evaluaciones.push(ev);

      const cName = (ev.conductor || 'Sin Asignar').trim();
      aData.conductoresSet.add(cName);

      const fScore = ev.evaluacionFinalPuntos || ev.calificacionExacta || 0;
      aData.sumFinal += fScore;
      aData.sumHab += (ev.habilidadesManejoPuntos || 0);
      aData.sumSim += (ev.practicaSimuladorPuntos || 0);
      aData.totalCollisions += (ev.colisiones || 0);
      aData.totalFatalities += (ev.fatalidades || 0);
      aData.totalOffRoad += (ev.vehiculoFueraVia || 0);
      if (fScore >= 6.0) aData.approvedCount++;

      // Registrar ejercicios para el conductor en este año
      if (!aData.driverExercisesMap.has(cName)) {
        aData.driverExercisesMap.set(cName, new Map());
      }
      const cExMap = aData.driverExercisesMap.get(cName);

      if (Array.isArray(ev.ejercicios) && ev.ejercicios.length > 0) {
        ev.ejercicios.forEach(ex => {
          if (!ex) return;
          const rawName = (ex.nombre || (ex.numero ? (nombresSimulaciones[ex.numero] || `Ejercicio ${ex.numero}`) : '')).trim();
          if (!rawName) return;
          const normKey = normalizeExerciseName(rawName) || rawName.toLowerCase();
          const score = typeof ex.calificacion === 'number' ? ex.calificacion : parseFloat(ex.calificacion);
          if (!isNaN(score)) {
            if (!cExMap.has(normKey)) {
              cExMap.set(normKey, { nombreDisplay: rawName, scores: [], numero: ex.numero });
            }
            cExMap.get(normKey).scores.push(score);
          }
        });
      } else if (ev.simulacionesDetalle && typeof ev.simulacionesDetalle === 'object') {
        Object.keys(ev.simulacionesDetalle).forEach(k => {
          const score = ev.simulacionesDetalle[k];
          if (typeof score !== 'number' || isNaN(score)) return;
          const num = parseInt(k.replace('simulacion_', ''), 10);
          const rawName = (ev.nombresSimulaciones?.[num] || nombresSimulaciones[num] || `Simulación ${num}`).trim();
          const normKey = normalizeExerciseName(rawName) || rawName.toLowerCase();
          if (!cExMap.has(normKey)) {
            cExMap.set(normKey, { nombreDisplay: rawName, scores: [], numero: num });
          }
          cExMap.get(normKey).scores.push(score);
        });
      }
    });

    const evolucionAnual = [];
    const sortedYears = Array.from(annualMap.keys()).sort((a, b) => a.localeCompare(b));

    sortedYears.forEach(year => {
      const a = annualMap.get(year);
      const totalEv = a.evaluaciones.length;
      const totalCond = a.conductoresSet.size;

      // Calcular ejercicios consolidados de este año
      const annualExerciseFleet = new Map();
      a.driverExercisesMap.forEach((cExMap) => {
        cExMap.forEach((val, normKey) => {
          const sum = val.scores.reduce((p, c) => p + c, 0);
          const avg = sum / val.scores.length;

          if (!annualExerciseFleet.has(normKey)) {
            annualExerciseFleet.set(normKey, {
              key: normKey,
              nombre: val.nombreDisplay,
              numero: val.numero,
              sumDriverAvg: 0,
              driverCount: 0,
              totalRealizaciones: 0
            });
          }
          const fEx = annualExerciseFleet.get(normKey);
          fEx.sumDriverAvg += avg;
          fEx.driverCount += 1;
          fEx.totalRealizaciones += val.scores.length;
        });
      });

      const ejerciciosAnuales = [];
      annualExerciseFleet.forEach(fEx => {
        const avg = fEx.driverCount > 0 ? (fEx.sumDriverAvg / fEx.driverCount) : 0;
        ejerciciosAnuales.push({
          key: fEx.key,
          nombre: fEx.nombre,
          numero: fEx.numero,
          promedio: parseFloat(avg.toFixed(2)),
          totalConductores: fEx.driverCount,
          totalRealizaciones: fEx.totalRealizaciones
        });
      });

      ejerciciosAnuales.sort((x, y) => {
        if (x.numero && y.numero) return x.numero - y.numero;
        if (x.numero) return -1;
        if (y.numero) return 1;
        return x.nombre.localeCompare(y.nombre);
      });

      evolucionAnual.push({
        year: year,
        totalEvaluaciones: totalEv,
        totalConductores: totalCond,
        promedioFinal: totalEv > 0 ? parseFloat((a.sumFinal / totalEv).toFixed(2)) : 0,
        promedioHabilidades: totalEv > 0 ? parseFloat((a.sumHab / totalEv).toFixed(2)) : 0,
        promedioSimulador: totalEv > 0 ? parseFloat((a.sumSim / totalEv).toFixed(2)) : 0,
        tasaAprobacion: totalEv > 0 ? parseFloat(((a.approvedCount / totalEv) * 100).toFixed(1)) : 0,
        totalColisiones: a.totalCollisions,
        totalFatalidades: a.totalFatalities,
        totalFueraVia: a.totalOffRoad,
        ejercicios: ejerciciosAnuales
      });
    });

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
      ejerciciosPromedio: ejerciciosPromedio,
      conductores: conductores,
      evolucionAnual: evolucionAnual
    });
  }

  summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return summaries;
}

