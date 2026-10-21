/**
 * TrackSIM CLOUD - Interactive Visualizations & Chart Engine
 * Utiliza Chart.js para generar gráficos interactivos de evolución, comparativa y métricas.
 */

import { normalizeExerciseName } from './exercise-catalog.js';

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

/**
 * Gráfico de Línea Temporal: Evolución del Conductor
 */
export function renderEvolutionChart(canvasId, evaluations) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!evaluations || evaluations.length === 0) {
    return;
  }

  // Ordenar cronológicamente
  const sorted = evaluations.slice().sort((a, b) => {
    const da = a.fechaCapacitacion || a.fechaReporte || '';
    const db = b.fechaCapacitacion || b.fechaReporte || '';
    return da.localeCompare(db);
  });

  const labels = sorted.map((e, idx) => {
    return e.fechaCapacitacionFormato || e.fechaCapacitacion || `Sesión ${idx + 1}`;
  });

  const finalScores = sorted.map(e => e.evaluacionFinalPuntos || e.calificacionExacta || 0);
  const simScores = sorted.map(e => e.practicaSimuladorPuntos || 0);
  const habScores = sorted.map(e => e.habilidadesManejoPuntos || 0);

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Evaluación Final (0 - 10)',
          data: finalScores,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        },
        {
          label: 'Práctica Simulador (0 - 7 ptos)',
          data: simScores,
          borderColor: '#a855f7',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#a855f7',
          pointRadius: 4
        },
        {
          label: 'Habilidades Manejo (0 - 3 ptos)',
          data: habScores,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#10b981',
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          callbacks: {
            afterBody: function (context) {
              const idx = context[0].dataIndex;
              const ev = sorted[idx];
              return `\nColisiones: ${ev.colisiones || 0}\nFatalidades: ${ev.fatalidades || 0}\nEstado: ${ev.estado || 'N/A'}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: "'Plus Jakarta Sans', sans-serif" } }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif" } }
        }
      }
    }
  });
}

/**
 * Gráfico Radar: Comparativa Cabeza a Cabeza (Conductor vs Conductor o Promedio)
 */
export function renderComparisonRadarChart(canvasId, driverA, driverB) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  // Dimensiones normalizadas de 0 a 10
  const labels = [
    'Evaluación Final',
    'Habilidades Manejo (% x10)',
    'Simulador (% x10)',
    'Seguridad Vial (Sin Incidentes)',
    'Simulación 3 (Sierra)',
    'Simulación 4 (Críticas)'
  ];

  function getMetrics(driver) {
    if (!driver || !driver.evaluaciones || driver.evaluaciones.length === 0) {
      return [5, 5, 5, 5, 5, 5];
    }
    const latest = driver.evaluaciones[driver.evaluaciones.length - 1];
    const finalScore = latest.evaluacionFinalPuntos || latest.calificacionExacta || 0;
    const habNorm = (latest.habilidadesManejoPct || 50) / 10;
    const simNorm = (latest.practicaSimuladorPct || 50) / 10;
    const seguridadScore = Math.max(0, 10 - ((latest.colisiones || 0) * 2) - ((latest.fatalidades || 0) * 3));
    const sim3 = latest.simulacionesDetalle?.simulacion_3 || 5;
    const sim4 = latest.simulacionesDetalle?.simulacion_4 || 5;

    return [finalScore, habNorm, simNorm, seguridadScore, sim3, sim4];
  }

  const dataA = getMetrics(driverA);
  const dataB = getMetrics(driverB);

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: driverA ? driverA.nombre : 'Operador 1',
          data: dataA,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.25)',
          borderWidth: 2,
          pointBackgroundColor: '#38bdf8',
          pointRadius: 4
        },
        {
          label: driverB ? driverB.nombre : 'Operador 2 / Promedio',
          data: dataB,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.25)',
          borderWidth: 2,
          pointBackgroundColor: '#f59e0b',
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif" } }
        }
      },
      scales: {
        r: {
          min: 0,
          max: 10,
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#cbd5e1', font: { size: 11 } },
          ticks: { backdropColor: 'transparent', color: '#64748b' }
        }
      }
    }
  });
}

/**
 * Gráfico Donut de Distribución General de Evaluaciones
 */
export function renderDistributionChart(canvasId, evaluations) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!evaluations || evaluations.length === 0) {
    return;
  }

  let sobresalientes = 0;
  let aprobados = 0;
  let refuerzo = 0;
  let noAprobados = 0;

  evaluations.forEach(e => {
    const s = e.evaluacionFinalPuntos || e.calificacionExacta || 0;
    if (s >= 8.0) sobresalientes++;
    else if (s >= 6.0) aprobados++;
    else if (s >= 5.0) refuerzo++;
    else noAprobados++;
  });

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Sobresaliente (8-10)', 'Aprobado (6-7.9)', 'Requiere Refuerzo (5-5.9)', 'No Aprobado (<5)'],
      datasets: [
        {
          data: [sobresalientes, aprobados, refuerzo, noAprobados],
          backgroundColor: ['#10b981', '#38bdf8', '#f59e0b', '#ef4444'],
          borderColor: '#111827',
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
        }
      },
      cutout: '68%'
    }
  });
}

/**
 * Gráfico de Barras Horizontal: Ranking de Conductores de la Empresa
 */
export function renderCompanyRankingChart(canvasId, conductores, searchFilter = '') {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!conductores || conductores.length === 0) return;

  // Ordenar todos los operadores por puntaje promedio descendente
  const sorted = [...conductores].sort((a, b) => b.promedioScore - a.promedioScore);
  const total = sorted.length;
  const term = (searchFilter || '').trim().toLowerCase();

  let displayItems = [];

  if (!term || total <= 7) {
    // Sin búsqueda o lista pequeña: mostrar todos con su posición real
    displayItems = sorted.map((c, i) => ({
      conductor: c,
      rank: i + 1,
      isMatch: term ? c.nombre.toLowerCase().includes(term) : false
    }));
  } else {
    // Con búsqueda: 3 mejores ... conductor(es) que coinciden ... 3 peores
    const topIndices = new Set([0, 1, 2].filter(i => i < total));
    const bottomIndices = new Set([total - 3, total - 2, total - 1].filter(i => i >= 0));

    const matchIndices = [];
    sorted.forEach((c, i) => {
      if (c.nombre.toLowerCase().includes(term)) {
        matchIndices.push(i);
      }
    });

    // Combinar índices preservando orden sin duplicados
    const selectedIndices = Array.from(new Set([
      ...topIndices,
      ...matchIndices,
      ...bottomIndices
    ])).sort((a, b) => a - b);

    // Armar items con posición real y detectar cortes con separador
    selectedIndices.forEach((idx, pos) => {
      if (pos > 0 && idx > selectedIndices[pos - 1] + 1) {
        displayItems.push({ isSeparator: true });
      }
      displayItems.push({
        conductor: sorted[idx],
        rank: idx + 1,
        isMatch: matchIndices.includes(idx)
      });
    });
  }

  if (ctx.parentElement) {
    ctx.parentElement.style.height = Math.max(200, displayItems.length * 24 + 40) + 'px';
  }

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const labels = displayItems.map(item => {
    if (item.isSeparator) return '···';
    const c = item.conductor;
    const prefix = medals[item.rank] || `#${item.rank}`;
    const highlight = item.isMatch ? ' 🎯' : '';
    return `${prefix} ${c.nombre}${highlight}`;
  });

  const scores = displayItems.map(item => {
    if (item.isSeparator) return null;
    return parseFloat(item.conductor.promedioScore.toFixed(2));
  });

  const borderColors = displayItems.map(item => {
    if (item.isSeparator) return 'transparent';
    if (item.isMatch) return '#38bdf8'; // Resaltado azul cian brillante si coincide con la búsqueda
    const s = item.conductor.promedioScore;
    if (s >= 8.0) return '#10b981';
    if (s >= 6.0) return '#38bdf8';
    if (s >= 5.0) return '#f59e0b';
    return '#ef4444';
  });

  const bgColors = displayItems.map((item, i) => {
    if (item.isSeparator) return 'transparent';
    if (item.isMatch) return 'rgba(56, 189, 248, 0.7)'; // Resaltado más intenso
    return borderColors[i] + '33';
  });

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calificación Promedio',
          data: scores,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: displayItems.map(item => item.isMatch ? 2.5 : 1.5),
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.9
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements || elements.length === 0) return;
        const idx = elements[0].index;
        const item = displayItems[idx];
        if (item && !item.isSeparator && item.conductor && item.conductor.nombre) {
          if (typeof window.selectCompanyDriverFromChart === 'function') {
            window.selectCompanyDriverFromChart(item.conductor.nombre);
          }
        }
      },
      onHover: (event, elements) => {
        if (event.native && event.native.target) {
          const hasClickable = elements && elements.length > 0 && !displayItems[elements[0].index]?.isSeparator;
          event.native.target.style.cursor = hasClickable ? 'pointer' : 'default';
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          filter: (ctx) => ctx.raw !== null,
          callbacks: {
            title: (items) => {
              const item = displayItems[items[0]?.dataIndex];
              if (!item || item.isSeparator) return '';
              return `#${item.rank} - ${item.conductor.nombre}`;
            },
            label: (ctx) => {
              const item = displayItems[ctx.dataIndex];
              if (!item || item.isSeparator) return '';
              const c = item.conductor;
              const times = c.totalEvaluaciones > 1 ? ` (${c.totalEvaluaciones} sesiones)` : '';
              return [
                `Calificación Promedio: ${ctx.raw} / 10${times}`,
                '👉 Clic para filtrar operador'
              ];
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f1f5f9', autoSkip: false, font: { family: "'Plus Jakarta Sans', sans-serif", weight: '500', size: 10 } }
        }
      }
    }
  });
}

/**
 * Gráfico de Barras Vertical: Rendimiento por Simulación en la Empresa
 */
/**
 * Paleta de colores armoniosa y dinámica para los ejercicios de simulador
 */
const EXERCISE_CHART_PALETTE = [
  { bg: 'rgba(56, 189, 248, 0.25)', border: '#38bdf8' },   // Sky blue
  { bg: 'rgba(249, 115, 22, 0.25)', border: '#f97316' },   // Orange
  { bg: 'rgba(168, 85, 247, 0.25)', border: '#a855f7' },   // Purple
  { bg: 'rgba(34, 197, 94, 0.25)', border: '#22c55e' },   // Emerald green
  { bg: 'rgba(234, 179, 8, 0.25)', border: '#eab308' },   // Amber
  { bg: 'rgba(244, 63, 94, 0.25)', border: '#f43f5e' },   // Rose
  { bg: 'rgba(20, 184, 166, 0.25)', border: '#14b8a6' },   // Teal
  { bg: 'rgba(99, 102, 241, 0.25)', border: '#6366f1' },   // Indigo
  { bg: 'rgba(236, 72, 153, 0.25)', border: '#ec4899' },   // Pink
  { bg: 'rgba(148, 163, 184, 0.25)', border: '#94a3b8' }   // Slate
];

/**
 * Gráfico de Barras: Rendimiento por Ejercicio / Simulación en la Empresa
 * Considera todos los ejercicios realizados en la flota y promedia cuando un conductor
 * ha realizado el mismo ejercicio múltiples veces.
 */
export function renderCompanySimulationsChart(canvasId, company, searchFilter = '') {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!company) return;

  let exerciseList = [];

  if (Array.isArray(company.ejerciciosPromedio) && company.ejerciciosPromedio.length > 0) {
    exerciseList = company.ejerciciosPromedio;
  } else {
    // Respaldo retrospectivo para empresas sin ejerciciosPromedio
    const name2 = company.nombresSimulaciones?.[2] || 'Montaña';
    const name3 = company.nombresSimulaciones?.[3] || 'Sierra';
    const name4 = company.nombresSimulaciones?.[4] || 'Simulación 4';
    exerciseList = [
      { key: 'montana', nombre: name2, numero: 2, promedio: parseFloat((company.promedioSim2 || 0).toFixed(2)), totalConductores: company.totalConductores || 0 },
      { key: 'sierra', nombre: name3, numero: 3, promedio: parseFloat((company.promedioSim3 || 0).toFixed(2)), totalConductores: company.totalConductores || 0 },
      { key: 'simulacion-4', nombre: name4, numero: 4, promedio: parseFloat((company.promedioSim4 || 0).toFixed(2)), totalConductores: company.totalConductores || 0 }
    ].filter(ex => ex.promedio > 0);
  }

  // Detectar si hay un conductor que coincide con la búsqueda
  const term = (searchFilter || '').trim().toLowerCase();
  let matchedDriver = null;
  if (term && Array.isArray(company.conductores)) {
    matchedDriver = company.conductores.find(c => c.nombre.toLowerCase().includes(term)) || null;
  }

  // Función auxiliar para obtener el puntaje del conductor en un ejercicio específico
  const getDriverScoreForExercise = (driver, ex) => {
    if (!driver) return null;
    const targetNorm = normalizeExerciseName(ex.nombre || ex.key);

    // 1. Buscar en promediosEjercicios por clave normalizada
    if (driver.promediosEjercicios) {
      if (driver.promediosEjercicios[ex.key]) {
        return driver.promediosEjercicios[ex.key].promedio;
      }
      for (const [key, p] of Object.entries(driver.promediosEjercicios)) {
        if (key === targetNorm || normalizeExerciseName(p.nombre) === targetNorm) {
          return p.promedio;
        }
      }
    }

    // 2. Buscar en el array de ejercicios del conductor por nombre normalizado
    if (Array.isArray(driver.ejercicios) && driver.ejercicios.length > 0) {
      const found = driver.ejercicios.find(e => normalizeExerciseName(e.nombre) === targetNorm);
      if (found && typeof found.calificacion === 'number') {
        return found.calificacion;
      }
    }

    // 3. Fallback solo si los nombres coinciden explícitamente en simulacionesNombres
    if (ex.numero != null && driver.simulaciones) {
      const simName = driver.simulacionesNombres?.[ex.numero];
      if (simName && normalizeExerciseName(simName) === targetNorm) {
        const val = driver.simulaciones[`simulacion_${ex.numero}`];
        if (typeof val === 'number') return val;
      }
    }

    return null;
  };

  // Si hay un conductor filtrado, filtrar exerciseList para mostrar ÚNICAMENTE
  // los ejercicios que este conductor haya realizado (calificación registrada y > 0)
  if (matchedDriver) {
    exerciseList = exerciseList.filter(ex => {
      const score = getDriverScoreForExercise(matchedDriver, ex);
      return typeof score === 'number' && score > 0;
    });
  }

  // Generar etiquetas formateadas
  const labels = exerciseList.map(ex => {
    if (ex.numero != null) {
      return `${ex.nombre}`;
    }
    return ex.nombre;
  });

  const fleetScores = exerciseList.map(ex => ex.promedio);
  const bgColors = exerciseList.map((_, i) => EXERCISE_CHART_PALETTE[i % EXERCISE_CHART_PALETTE.length].bg);
  const borderColors = exerciseList.map((_, i) => EXERCISE_CHART_PALETTE[i % EXERCISE_CHART_PALETTE.length].border);

  // Armar datasets: si hay conductor seleccionado, mostramos comparativa Conductor vs Flota
  const datasets = [];

  if (matchedDriver) {
    const driverScores = exerciseList.map(ex => getDriverScoreForExercise(matchedDriver, ex));

    datasets.push({
      label: `🎯 ${matchedDriver.nombre}`,
      data: driverScores,
      backgroundColor: 'rgba(56, 189, 248, 0.75)',
      borderColor: '#38bdf8',
      borderWidth: 2,
      borderRadius: 8,
      maxBarThickness: 42
    });

    datasets.push({
      label: 'Promedio Flota',
      data: fleetScores,
      backgroundColor: 'rgba(148, 163, 184, 0.25)',
      borderColor: '#94a3b8',
      borderWidth: 1.5,
      borderRadius: 8,
      maxBarThickness: 42
    });
  } else {
    datasets.push({
      label: 'Promedio Flota',
      data: fleetScores,
      backgroundColor: bgColors,
      borderColor: borderColors,
      borderWidth: 2,
      borderRadius: 8,
      maxBarThickness: 56
    });
  }

  // Actualizar subtítulo con la cantidad y tipo de ejercicios
  const subtitleEl = document.getElementById('companySimChartSubtitle');
  if (subtitleEl) {
    if (exerciseList.length === 0) {
      subtitleEl.textContent = matchedDriver
        ? `No hay ejercicios con calificación registrada para ${matchedDriver.nombre}.`
        : 'No se registran calificaciones de ejercicios en esta flota.';
    } else if (matchedDriver) {
      subtitleEl.innerHTML = `Comparando rendimiento de <strong>${matchedDriver.nombre}</strong> vs Promedio de Flota en sus ${exerciseList.length} ejercicio${exerciseList.length > 1 ? 's realizados' : ' realizado'}.`;
    } else {
      subtitleEl.textContent = `Promedio ponderado de ${exerciseList.length} ejercicio${exerciseList.length > 1 ? 's evaluados' : ' evaluado'} (promediando repeticiones por conductor)`;
    }
  }

  // Ajustar altura del contenedor si hay muchos ejercicios para que se vean cómodos
  const container = ctx.parentElement;
  if (container) {
    if (exerciseList.length > 5) {
      container.style.height = '380px';
    } else {
      container.style.height = '320px';
    }
  }

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: !!matchedDriver,
          position: 'top',
          labels: {
            color: '#cbd5e1',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          padding: 12,
          callbacks: {
            label: (item) => {
              const ex = exerciseList[item.dataIndex];
              const isDriverDataset = matchedDriver && item.datasetIndex === 0;
              const val = item.raw !== null ? item.raw : 'Sin registrar';

              if (isDriverDataset) {
                const driverInfo = [`${matchedDriver.nombre}: ${val} / 10`];
                if (matchedDriver.promediosEjercicios && matchedDriver.promediosEjercicios[ex.key]) {
                  const veces = matchedDriver.promediosEjercicios[ex.key].totalVeces;
                  if (veces > 1) driverInfo.push(`(Promedio de ${veces} sesiones)`);
                }
                return driverInfo;
              }

              const info = [`Promedio Flota: ${val} / 10`];
              if (ex && ex.totalConductores) {
                info.push(`Conductores evaluados: ${ex.totalConductores}`);
              }
              if (ex && ex.totalRealizaciones && ex.totalRealizaciones > ex.totalConductores) {
                info.push(`Total de repeticiones: ${ex.totalRealizaciones}`);
              }
              return info;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: '#cbd5e1',
            font: { family: "'Plus Jakarta Sans', sans-serif" },
            maxRotation: exerciseList.length > 4 ? 25 : 0,
            autoSkip: false
          }
        }
      }
    }
  });
}

/**
 * Gráfico de Línea Temporal: Evolución de Calificación Promedio Anual de la Empresa
 * Compara Calificación Final, Simulador y Habilidades a través de los años.
 */
export function renderCompanyEvolutionChart(canvasId, evolucionAnual) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!evolucionAnual || evolucionAnual.length === 0) return;

  const labels = evolucionAnual.map(item => `Año ${item.year}`);
  const finalScores = evolucionAnual.map(item => item.promedioFinal);
  const simScores = evolucionAnual.map(item => item.promedioSimulador);
  const habScores = evolucionAnual.map(item => item.promedioHabilidades);

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calificación Final Promedio (0 - 10)',
          data: finalScores,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        },
        {
          label: 'Práctica Simulador (0 - 7 ptos)',
          data: simScores,
          borderColor: '#a855f7',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#a855f7',
          pointRadius: 5
        },
        {
          label: 'Habilidades Manejo (0 - 3 ptos)',
          data: habScores,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: '#10b981',
          pointRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          callbacks: {
            afterBody: function (items) {
              const idx = items[0].dataIndex;
              const yData = evolucionAnual[idx];
              if (!yData) return '';
              return [
                '',
                `👥 Operadores Evaluados: ${yData.totalConductores}`,
                `📑 Reportes / Evaluaciones: ${yData.totalEvaluaciones}`,
                `🎯 Tasa de Aprobación: ${yData.tasaAprobacion}%`,
                `⚠️ Incidentes: ${yData.totalColisiones + yData.totalFatalidades} (${yData.totalColisiones} col. / ${yData.totalFatalidades} fat.)`
              ].join('\n');
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: "'Plus Jakarta Sans', sans-serif" } }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } }
        }
      }
    }
  });
}

/**
 * Gráfico de Barras Agrupadas por Año:
 * Renderiza barras continuas agrupadas por año (sin espacios vacíos para ejercicios no impartidos),
 * con el nombre de cada ejercicio escrito verticalmente dentro de la barra y el rótulo del año centrado abajo.
 */
export function renderCompanyExercisesAnnualChart(canvasId, evolucionAnual) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!evolucionAnual || evolucionAnual.length === 0) return;

  // Mapa global para mantener colores consistentes por ejercicio
  const exerciseColorMap = new Map();
  let nextColorIdx = 0;

  // Aplanar todos los ejercicios evaluados año por año (solo barras existentes)
  const flatBars = [];
  const yearGroupMap = new Map(); // year -> { startIndex, count }

  evolucionAnual.forEach(yearItem => {
    const validExercises = (yearItem.ejercicios || []).filter(
      ex => typeof ex.promedio === 'number' && ex.promedio > 0
    );

    if (validExercises.length === 0) return;

    const startIndex = flatBars.length;
    validExercises.forEach(ex => {
      if (!exerciseColorMap.has(ex.key)) {
        exerciseColorMap.set(ex.key, EXERCISE_CHART_PALETTE[nextColorIdx % EXERCISE_CHART_PALETTE.length]);
        nextColorIdx++;
      }
      const palette = exerciseColorMap.get(ex.key);

      flatBars.push({
        year: yearItem.year,
        key: ex.key,
        nombre: ex.nombre,
        promedio: ex.promedio,
        colorBg: palette.bg.replace('0.25', '0.80'),
        colorBorder: palette.border
      });
    });

    yearGroupMap.set(yearItem.year, {
      startIndex: startIndex,
      count: validExercises.length
    });
  });

  if (flatBars.length === 0) return;

  const barLabels = flatBars.map(b => b.nombre);
  const dataScores = flatBars.map(b => b.promedio);
  const bgColors = flatBars.map(b => b.colorBg);
  const borderColors = flatBars.map(b => b.colorBorder);

  const customAnnualBarPlugin = {
    id: 'customAnnualBarPlugin',
    afterDatasetsDraw(chart) {
      const { ctx: chartCtx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      chartCtx.save();

      // 1. TEXTO VERTICAL AL INTERIOR DE CADA BARRA
      meta.data.forEach((element, index) => {
        if (!element || element.height <= 0) return;
        const barItem = flatBars[index];
        if (!barItem) return;

        const { x, y, base, width } = element;
        const barHeight = Math.abs(base - y);
        if (barHeight < 24) return;

        chartCtx.save();
        chartCtx.translate(x, (y + base) / 2);
        chartCtx.rotate(-Math.PI / 2);

        const fontSize = Math.min(12, Math.max(9, Math.floor(width * 0.44)));
        chartCtx.font = `600 ${fontSize}px 'Outfit', 'Plus Jakarta Sans', sans-serif`;
        chartCtx.textAlign = 'center';
        chartCtx.textBaseline = 'middle';
        chartCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        chartCtx.shadowBlur = 4;
        chartCtx.shadowOffsetX = 1;
        chartCtx.shadowOffsetY = 1;
        chartCtx.fillStyle = '#ffffff';

        const maxTextWidth = barHeight - 10;
        let textToDraw = barItem.nombre;
        if (chartCtx.measureText(textToDraw).width > maxTextWidth) {
          while (textToDraw.length > 2 && chartCtx.measureText(textToDraw + '…').width > maxTextWidth) {
            textToDraw = textToDraw.slice(0, -1);
          }
          textToDraw += '…';
        }

        chartCtx.fillText(textToDraw, 0, 0);
        chartCtx.restore();
      });

      // 2. DIBUJAR LOS RÓTULOS DE AÑO CENTRADOS Y LÍNEAS SEPARADORAS SUAVES
      const bottomY = chartArea.bottom + 22;
      chartCtx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
      chartCtx.textAlign = 'center';
      chartCtx.textBaseline = 'middle';
      chartCtx.fillStyle = '#cbd5e1';

      yearGroupMap.forEach((grp, year) => {
        const firstEl = meta.data[grp.startIndex];
        const lastEl = meta.data[grp.startIndex + grp.count - 1];
        if (!firstEl || !lastEl) return;

        const groupCenterX = (firstEl.x + lastEl.x) / 2;
        chartCtx.fillText(`Año ${year}`, groupCenterX, bottomY);

        // Línea sutil divisoria entre años
        const nextIndex = grp.startIndex + grp.count;
        if (nextIndex < meta.data.length) {
          const nextEl = meta.data[nextIndex];
          if (nextEl) {
            const separatorX = (lastEl.x + nextEl.x) / 2;
            chartCtx.save();
            chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            chartCtx.lineWidth = 1;
            chartCtx.setLineDash([4, 4]);
            chartCtx.beginPath();
            chartCtx.moveTo(separatorX, chartArea.top + 8);
            chartCtx.lineTo(separatorX, chartArea.bottom + 6);
            chartCtx.stroke();
            chartCtx.restore();
          }
        }
      });

      chartCtx.restore();
    }
  };

  if (ctx.parentElement) {
    ctx.parentElement.style.height = '380px';
  }

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: [
        {
          data: dataScores,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 6,
          categoryPercentage: 0.96,
          barPercentage: 0.94,
          maxBarThickness: 54
        }
      ]
    },
    plugins: [customAnnualBarPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          bottom: 34
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          padding: 12,
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              const barItem = flatBars[idx];
              return barItem ? `📅 Año ${barItem.year}` : '';
            },
            label: (item) => {
              const barItem = flatBars[item.dataIndex];
              const score = item.raw !== null ? `${item.raw} / 10` : 'Sin calificación';
              return barItem ? `${barItem.nombre}: ${score}` : '';
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          ticks: {
            display: false
          }
        }
      }
    }
  });
}
