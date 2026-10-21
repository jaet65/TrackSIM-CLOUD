import { Evaluation, CompanySummary, DriverSummary, DriverConductor } from '../types';

export function slugify(text: string): string {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function normalizeExerciseName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Agrupa las evaluaciones por Conductor y calcula su evolución y estadísticas
 */
export function processDriverSummaries(evaluations: Evaluation[]): DriverSummary[] {
  const map = new Map<string, DriverSummary>();

  for (const evalItem of evaluations) {
    const name = (evalItem.conductor || evalItem.operador || 'Sin Asignar').trim();
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
        tendencia: 'estable',
        estadoGeneral: 'Reforzar',
        badgeColor: 'warning'
      });
    }

    map.get(name)!.evaluaciones.push(evalItem);
  }

  const summaries: DriverSummary[] = [];
  for (const [, summary] of map.entries()) {
    summary.evaluaciones.sort((a, b) => {
      const dateA = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
      const dateB = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
      return dateA.localeCompare(dateB);
    });

    summary.totalEvaluaciones = summary.evaluaciones.length;

    let sumFinal = 0;
    let sumHab = 0;
    let sumSim = 0;
    let best = -1;
    let worst = 999;

    summary.evaluaciones.forEach(ev => {
      const finalScore = ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
      sumFinal += finalScore;
      sumHab += (ev.habilidadesManejoPuntos || 0);
      sumSim += (ev.practicaSimuladorPuntos || 0);
      summary.totalFatalidades += (ev.fatalidades || 0);
      summary.totalColisiones += (ev.colisiones || ev.totalColisiones || 0);
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

    summary.primeraCalificacion = first.evaluacionFinalPuntos ?? first.calificacionExacta ?? first.promedioScore ?? 0;
    summary.ultimaCalificacion = latest.evaluacionFinalPuntos ?? latest.calificacionExacta ?? latest.promedioScore ?? 0;

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

  summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return summaries;
}

/**
 * Agrupa y consolida las evaluaciones por Empresa para inspección de flotas
 */
export function processCompanySummaries(evaluations: Evaluation[]): CompanySummary[] {
  const map = new Map<string, { nombre: string; slug: string; evaluaciones: Evaluation[]; conductoresMap: Map<string, Evaluation[]> }>();

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

    const companyData = map.get(rawEmp)!;
    companyData.evaluaciones.push(ev);

    const condName = (ev.conductor || ev.operador || 'Sin Asignar').trim();
    if (!companyData.conductoresMap.has(condName)) {
      companyData.conductoresMap.set(condName, []);
    }
    companyData.conductoresMap.get(condName)!.push(ev);
  }

  const summaries: CompanySummary[] = [];
  for (const [name, data] of map.entries()) {
    summaries.push(createCompanySummaryFromEvaluations(name, data.slug, data.evaluaciones, data.conductoresMap));
  }

  summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return summaries;
}

/**
 * Genera el resumen consolidado de flota e historial anual para un conjunto dado de evaluaciones y su mapa de conductores.
 */
export function createCompanySummaryFromEvaluations(
  name: string,
  slug: string,
  evaluaciones: Evaluation[],
  conductoresMap: Map<string, Evaluation[]> | null = null
): CompanySummary {
  const evalsList = evaluaciones || [];
  const totalEvals = evalsList.length;

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
  const nombresSimulaciones: Record<string | number, string> = {};
  const sedesSet = new Set<string>();

  evalsList.forEach(ev => {
    const finalScore = ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
    sumFinal += finalScore;
    sumHab += (ev.habilidadesManejoPuntos || 0);
    sumSim += (ev.practicaSimuladorPuntos || 0);
    totalCollisions += (ev.colisiones || ev.totalColisiones || 0);
    totalFatalities += (ev.fatalidades || 0);
    totalOffRoad += (ev.vehiculoFueraVia || 0);
    if (finalScore >= 6.0) approvedCount++;

    if (ev.sede) sedesSet.add(ev.sede);

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

  let cMap = conductoresMap;
  if (!cMap) {
    cMap = new Map();
    evalsList.forEach(ev => {
      const condName = (ev.conductor || ev.operador || 'Sin Asignar').trim();
      if (!cMap!.has(condName)) {
        cMap!.set(condName, []);
      }
      cMap!.get(condName)!.push(ev);
    });
  }

  const conductores: DriverConductor[] = [];
  for (const [condName, evals] of cMap.entries()) {
    evals.sort((a, b) => {
      const da = a.fechaCapacitacion || a.fechaReporte || a.fecha || '';
      const db = b.fechaCapacitacion || b.fechaReporte || b.fecha || '';
      return da.localeCompare(db);
    });

    const latest = evals[evals.length - 1];
    const avgScore = evals.reduce((acc, e) => acc + (e.evaluacionFinalPuntos ?? e.calificacionExacta ?? e.promedioScore ?? 0), 0) / evals.length;
    const latestScore = latest.evaluacionFinalPuntos ?? latest.calificacionExacta ?? latest.promedioScore ?? 0;

    const driverExMap = new Map<string, { nombreDisplay: string; scores: number[]; numero?: number }>();
    evals.forEach(ev => {
      if (Array.isArray(ev.ejercicios) && ev.ejercicios.length > 0) {
        ev.ejercicios.forEach(ex => {
          if (!ex) return;
          const rawName = (ex.nombre || (ex.numero ? (nombresSimulaciones[ex.numero] || `Ejercicio ${ex.numero}`) : '')).trim();
          if (!rawName) return;
          const normKey = normalizeExerciseName(rawName) || rawName.toLowerCase();
          const score = typeof ex.calificacion === 'number' ? ex.calificacion : parseFloat(String(ex.calificacion || ex.score || ''));
          if (!isNaN(score)) {
            if (!driverExMap.has(normKey)) {
              driverExMap.set(normKey, { nombreDisplay: rawName, scores: [], numero: ex.numero });
            }
            driverExMap.get(normKey)!.scores.push(score);
          }
        });
      }
    });

    const promediosEjerciciosConductor: Record<string, { nombre: string; numero?: number; promedio: number; totalVeces: number }> = {};
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

    let estado = 'Reforzar';
    let badgeColor = 'warning';
    if (latestScore >= 8.0) {
      estado = 'Sobresaliente';
      badgeColor = 'success';
    } else if (latestScore >= 6.0) {
      estado = 'Aprobado';
      badgeColor = 'info';
    } else if (latestScore < 5.0) {
      estado = 'No Aprobado';
      badgeColor = 'danger';
    }

    conductores.push({
      nombre: condName,
      empresa: latest.empresa || '',
      totalEvaluaciones: evals.length,
      ultimaFecha: latest.fechaCapacitacionFormato || latest.fechaCapacitacion || latest.fechaReporte || latest.fecha || 'N/A',
      ultimoScore: latestScore,
      promedioScore: avgScore,
      sede: latest.sede || '',
      colisiones: evals.reduce((a, b) => a + (b.colisiones || b.totalColisiones || 0), 0),
      fatalidades: evals.reduce((a, b) => a + (b.fatalidades || 0), 0),
      totalFueraVia: evals.reduce((a, b) => a + (b.vehiculoFueraVia || 0), 0),
      estado,
      badgeColor,
      latestEvalId: latest.id,
      simulaciones: latest.simulacionesDetalle || {},
      simulacionesNombres: latest.nombresSimulaciones || nombresSimulaciones,
      ejercicios: latest.ejercicios || [],
      promediosEjercicios: promediosEjerciciosConductor
    });
  }

  // Ordenar por puntaje promedio descendente
  conductores.sort((a, b) => b.promedioScore - a.promedioScore);

  return {
    nombre: name,
    slug,
    esGlobal: name === 'Todas las empresas',
    totalEvaluaciones: totalEvals,
    totalConductores: conductores.length,
    promedioFinal: totalEvals > 0 ? parseFloat((sumFinal / totalEvals).toFixed(2)) : 0,
    promedioHabilidades: totalEvals > 0 ? parseFloat((sumHab / totalEvals).toFixed(2)) : 0,
    promedioSimulador: totalEvals > 0 ? parseFloat((sumSim / totalEvals).toFixed(2)) : 0,
    tasaAprobacion: totalEvals > 0 ? parseFloat(((approvedCount / totalEvals) * 100).toFixed(1)) : 0,
    totalColisiones: totalCollisions,
    totalFatalidades: totalFatalities,
    totalFueraVia: totalOffRoad,
    sedes: Array.from(sedesSet),
    conductores,
    simulacionesPromedio: {
      simulacion_2: countSim2 > 0 ? parseFloat((sumSim2 / countSim2).toFixed(2)) : 0,
      simulacion_3: countSim3 > 0 ? parseFloat((sumSim3 / countSim3).toFixed(2)) : 0,
      simulacion_4: countSim4 > 0 ? parseFloat((sumSim4 / countSim4).toFixed(2)) : 0
    },
    nombresSimulaciones
  };
}
