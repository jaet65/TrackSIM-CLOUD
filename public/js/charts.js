/**
 * TrackSIM CLOUD - Interactive Visualizations & Chart Engine
 * Utiliza Chart.js para generar gráficos interactivos de evolución, comparativa y métricas.
 */

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
            afterBody: function(context) {
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
export function renderCompanyRankingChart(canvasId, conductores) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!conductores || conductores.length === 0) return;

  // Mostrar todos los operadores (puntaje = evaluación final; promedio si tiene varias sesiones)
  const sorted = [...conductores].sort((a, b) => b.promedioScore - a.promedioScore);
  if (ctx.parentElement) {
    ctx.parentElement.style.height = Math.max(200, sorted.length * 20 + 30) + 'px';
  }
  const medals = ['🥇', '🥈', '🥉'];
  const labels = sorted.map((c, i) => `${medals[i] || '#' + (i + 1)} ${i < 3 ? (i + 1) + '. ' : ''}${c.nombre}`);
  const scores = sorted.map(c => parseFloat(c.promedioScore.toFixed(2)));
  const colors = sorted.map(c => {
    if (c.promedioScore >= 8.0) return '#10b981';
    if (c.promedioScore >= 6.0) return '#38bdf8';
    if (c.promedioScore >= 5.0) return '#f59e0b';
    return '#ef4444';
  });

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calificación Promedio',
          data: scores,
          backgroundColor: colors.map(c => c + '33'),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 4,
          barPercentage: 0.8,
          categoryPercentage: 0.9
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          callbacks: {
            label: (ctx) => `Promedio: ${ctx.raw} / 10`
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
export function renderCompanySimulationsChart(canvasId, company) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || !window.Chart) return;

  destroyChart(canvasId);

  if (!company) return;

  const name2 = company.nombresSimulaciones?.[2] || 'Montaña';
  const name3 = company.nombresSimulaciones?.[3] || 'Sierra';
  const name4 = company.nombresSimulaciones?.[4] || 'Simulación 4';
  const labels = [`S2: ${name2}`, `S3: ${name3}`, `S4: ${name4}`];

  const subtitleEl = document.getElementById('companySimChartSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `Promedio en ${name2} (S2), ${name3} (S3) y ${name4} (S4)`;
  }

  const scores = [
    parseFloat((company.promedioSim2 || 0).toFixed(2)),
    parseFloat((company.promedioSim3 || 0).toFixed(2)),
    parseFloat((company.promedioSim4 || 0).toFixed(2))
  ];

  chartInstances[canvasId] = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Promedio Flota',
          data: scores,
          backgroundColor: ['rgba(148, 163, 184, 0.25)', 'rgba(249, 115, 22, 0.25)', 'rgba(59, 130, 246, 0.25)'],
          borderColor: ['#94a3b8', '#f97316', '#3b82f6'],
          borderWidth: 2,
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          callbacks: {
            label: (ctx) => `Promedio Flota: ${ctx.raw} / 10`
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
          ticks: { color: '#cbd5e1', font: { family: "'Plus Jakarta Sans', sans-serif" } }
        }
      }
    }
  });
}

