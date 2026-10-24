import { Evaluation } from '../types';

interface DemoDriver {
  company: string;
  driver: string;
  site: string;
  license: string;
  scores: [number, number, number, number, number];
  collisions: [number, number, number, number, number];
  offRoad: [number, number, number, number, number];
  exerciseStrengths: [number, number, number, number, number];
}

const demoDrivers: DemoDriver[] = [
  { company: 'Transportes Horizonte', driver: 'Lucía Martínez', site: 'Monterrey', license: 'Tipo B', scores: [5.8, 6.7, 6.2, 7.8, 8.3], collisions: [3, 2, 3, 1, 0], offRoad: [1, 0, 1, 0, 0], exerciseStrengths: [0.8, -0.4, 0.3, -0.7, 0] },
  { company: 'Transportes Horizonte', driver: 'Diego Herrera', site: 'Monterrey', license: 'Tipo C', scores: [8.4, 8.1, 8.7, 8.3, 8.9], collisions: [0, 1, 0, 0, 0], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.4, 0.8, -0.6, 0.2, 0.1] },
  { company: 'Transportes Horizonte', driver: 'Paola Sánchez', site: 'Apodaca', license: 'Tipo B', scores: [5.4, 5.9, 6.6, 6.1, 7.5], collisions: [4, 3, 1, 2, 1], offRoad: [1, 1, 0, 1, 0], exerciseStrengths: [-0.5, 0.1, 0.9, -0.2, -0.3] },
  { company: 'Transportes Horizonte', driver: 'Andrés Molina', site: 'Apodaca', license: 'Tipo C', scores: [7.9, 7.3, 8.2, 7.1, 7.8], collisions: [1, 2, 1, 3, 1], offRoad: [0, 1, 0, 1, 0], exerciseStrengths: [0.3, -0.6, 0.2, 0.8, -0.5] },
  { company: 'Logística del Norte', driver: 'Valeria Cruz', site: 'Saltillo', license: 'Tipo B', scores: [6.1, 6.8, 6.5, 7.9, 8.2], collisions: [3, 2, 2, 1, 0], offRoad: [1, 0, 1, 0, 0], exerciseStrengths: [0.9, -0.4, -0.2, 0.3, -0.6] },
  { company: 'Logística del Norte', driver: 'Mateo Ríos', site: 'Saltillo', license: 'Tipo C', scores: [8.7, 8.4, 8.1, 9.1, 8.8], collisions: [0, 0, 1, 0, 0], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.6, 0.3, 0.7, -0.3, 0.2] },
  { company: 'Logística del Norte', driver: 'Fernanda Lozano', site: 'Ramos Arizpe', license: 'Tipo B', scores: [6.7, 7.5, 6.9, 7.2, 6.6], collisions: [2, 1, 2, 2, 3], offRoad: [0, 0, 1, 0, 1], exerciseStrengths: [0.1, 0.9, -0.5, -0.4, -0.1] },
  { company: 'Logística del Norte', driver: 'Jorge Navarro', site: 'Ramos Arizpe', license: 'Tipo C', scores: [7.8, 7.1, 6.4, 6.9, 7.3], collisions: [1, 2, 4, 2, 1], offRoad: [0, 1, 1, 0, 0], exerciseStrengths: [-0.3, -0.5, 0.2, 0.9, -0.3] },
  { company: 'Movilidad Andina', driver: 'Camila Torres', site: 'Querétaro', license: 'Tipo B', scores: [5.2, 5.8, 6.7, 6.0, 7.6], collisions: [5, 3, 2, 3, 1], offRoad: [2, 1, 1, 1, 0], exerciseStrengths: [0.7, -0.5, 0.1, -0.4, 0.1] },
  { company: 'Movilidad Andina', driver: 'Santiago Vega', site: 'Querétaro', license: 'Tipo C', scores: [8.8, 9.1, 8.6, 8.9, 9.4], collisions: [0, 0, 1, 0, 0], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.5, 0.5, -0.3, 0.1, 0.2] },
  { company: 'Movilidad Andina', driver: 'Renata Flores', site: 'El Marqués', license: 'Tipo B', scores: [7.1, 6.6, 7.5, 7.0, 8.1], collisions: [1, 3, 1, 2, 0], offRoad: [0, 1, 0, 0, 0], exerciseStrengths: [0.4, -0.7, -0.4, 0.8, -0.1] },
  { company: 'Movilidad Andina', driver: 'Emilio Paredes', site: 'El Marqués', license: 'Tipo C', scores: [7.6, 7.0, 6.3, 5.9, 6.8], collisions: [1, 2, 3, 4, 2], offRoad: [0, 0, 1, 1, 1], exerciseStrengths: [-0.2, -0.3, 0.8, -0.5, 0.2] },
  { company: 'Carga del Pacífico', driver: 'Mariana Silva', site: 'Guadalajara', license: 'Tipo C', scores: [6.4, 7.2, 7.0, 8.4, 8.0], collisions: [3, 2, 1, 0, 1], offRoad: [1, 1, 0, 0, 0], exerciseStrengths: [0.6, 0, -0.7, -0.2, 0.3] },
  { company: 'Carga del Pacífico', driver: 'Nicolás Reyes', site: 'Guadalajara', license: 'Tipo B', scores: [9.1, 8.8, 9.3, 8.9, 9.5], collisions: [0, 1, 0, 0, 0], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.7, 0.4, 0.4, -0.1, 0] },
  { company: 'Carga del Pacífico', driver: 'Daniela Campos', site: 'Tepic', license: 'Tipo C', scores: [5.9, 6.5, 5.7, 7.0, 6.8], collisions: [4, 2, 4, 1, 2], offRoad: [1, 1, 2, 0, 1], exerciseStrengths: [0.2, -0.6, 0.5, 0.1, -0.2] },
  { company: 'Carga del Pacífico', driver: 'Iván Castillo', site: 'Tepic', license: 'Tipo B', scores: [7.3, 8.0, 7.5, 6.7, 7.1], collisions: [1, 0, 2, 3, 2], offRoad: [0, 0, 0, 1, 0], exerciseStrengths: [-0.1, -0.4, -0.2, 0.6, 0.1] },
  { company: 'Servicios Ruta Segura', driver: 'Sofía Méndez', site: 'San Luis Potosí', license: 'Tipo B', scores: [6.0, 6.4, 7.6, 7.1, 8.5], collisions: [3, 3, 1, 2, 0], offRoad: [1, 0, 0, 1, 0], exerciseStrengths: [0.8, -0.3, -0.1, 0.2, -0.6] },
  { company: 'Servicios Ruta Segura', driver: 'Gabriel Fuentes', site: 'San Luis Potosí', license: 'Tipo C', scores: [8.2, 7.8, 8.5, 8.0, 8.7], collisions: [1, 1, 0, 1, 0], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.5, 0.7, -0.2, -0.1, 0.1] },
  { company: 'Servicios Ruta Segura', driver: 'Elena Robles', site: 'León', license: 'Tipo B', scores: [5.6, 6.3, 6.0, 7.4, 7.0], collisions: [4, 2, 3, 1, 2], offRoad: [2, 1, 1, 0, 1], exerciseStrengths: [0.3, -0.5, 0.6, -0.6, 0.2] },
  { company: 'Servicios Ruta Segura', driver: 'Tomás Aguilar', site: 'León', license: 'Tipo C', scores: [7.5, 7.9, 7.2, 8.4, 8.0], collisions: [1, 0, 2, 0, 1], offRoad: [0, 0, 0, 0, 0], exerciseStrengths: [-0.2, 0, -0.5, 0.5, 0.2] }
];

const sessionDates = [
  ['2023-03-10', '2023-10-15', '2024-05-20', '2025-02-02', '2026-08-07'],
  ['2023-03-16', '2023-10-21', '2024-05-26', '2025-02-08', '2026-08-13'],
  ['2023-03-22', '2023-10-27', '2024-05-14', '2025-02-14', '2026-08-19'],
  ['2023-03-28', '2023-10-09', '2024-05-08', '2025-02-20', '2026-08-25']
];
const exerciseNames = [
  'Ruta urbana',
  'Conducción en carretera',
  'Maniobras de precisión',
  'Conducción defensiva',
  'Reversa en andén'
];
const exerciseBenchmarks = [0.45, -0.3, 0.15, 0.35, -0.65];
const simulationNames = {
  2: 'Ruta urbana',
  3: 'Conducción en carretera',
  4: 'Maniobras de precisión',
  5: 'Conducción defensiva',
  6: 'Reversa en andén'
};
const mistakes = [
  'Distancia de seguimiento insuficiente',
  'Frenado tardío ante obstáculos',
  'Uso inadecuado de espejos',
  'Exceso de velocidad en curva',
  'Señalización tardía de maniobra',
  'Pérdida de trayectoria en reversa'
];
const radarMistakes = [
  'Exceso de velocidad en zona señalizada',
  'No respetar distancia de seguimiento',
  'Cambios de marcha fuera del rango eficiente',
  'Uso incorrecto del embrague en ascenso',
  'Arranque sin revisar el entorno'
];
const radarAxes = [
  'Normas de Tráfico',
  'Dinámica y Seguridad',
  'Eficiencia de Motor',
  'Transmisión y Embrague',
  'Arranque y Preparación'
];
const radarPenalties = [0.4, 1.2, 0.3, 0.6, 0.8];
const radarWeaknesses = [0, 1, 2, 1, 2];
const instructors = ['Equipo de capacitación Norte', 'Centro de formación regional', 'Instructoría TrackSIM'];
const observations = [
  'Buen control del vehículo; reforzar anticipación en cruces.',
  'Mejoró el seguimiento de ruta y el uso de espejos.',
  'Se recomienda práctica adicional de frenado preventivo.',
  'Desempeño consistente durante los ejercicios de carretera.',
  'Reforzar maniobras de reversa y aproximación a andén.',
  'Aplicó correctamente las indicaciones de conducción defensiva.'
];
const roundScore = (score: number) => Math.round(Math.max(4.2, Math.min(9.8, score)) * 10) / 10;

const annualBaseline = new Map<string, { totalScore: number; count: number; incidents: number; drivers: Set<string> }>();
demoDrivers.forEach((driver, driverIndex) => {
  driver.scores.forEach((score, sessionIndex) => {
    const year = sessionDates[driverIndex % sessionDates.length][sessionIndex].slice(0, 4);
    const stats = annualBaseline.get(year) || { totalScore: 0, count: 0, incidents: 0, drivers: new Set<string>() };
    stats.totalScore += score;
    stats.count += 1;
    stats.incidents += driver.collisions[sessionIndex] + driver.offRoad[sessionIndex];
    stats.drivers.add(driver.driver);
    annualBaseline.set(year, stats);
  });
});
const referenceYear = annualBaseline.get('2023')!;
const referenceAverage = referenceYear.totalScore / referenceYear.count;
const referenceIncidentRate = referenceYear.incidents / referenceYear.drivers.size;
const annualAdjustments = new Map(
  Array.from(annualBaseline, ([year, stats]) => [
    year,
    referenceAverage -
      stats.totalScore / stats.count +
      (referenceIncidentRate - stats.incidents / stats.drivers.size) * 0.5
  ])
);

export const DEMO_EVALUATIONS: Evaluation[] = demoDrivers
  .flatMap((driver, driverIndex) =>
    driver.scores.map((baseScore, sessionIndex) => {
      const date = sessionDates[driverIndex % sessionDates.length][sessionIndex];
      const collisions = driver.collisions[sessionIndex];
      const offRoad = driver.offRoad[sessionIndex];
      const year = date.slice(0, 4);
      const score = roundScore(baseScore + (annualAdjustments.get(year) || 0));
      const exercises = exerciseNames.map((name, exerciseIndex) => {
        const exerciseScore = roundScore(
          score +
          exerciseBenchmarks[exerciseIndex] +
          driver.exerciseStrengths[exerciseIndex] +
          (((driverIndex + sessionIndex * 2 + exerciseIndex) % 3) - 1) * 0.18
        );
        const notCompleted = (driverIndex * 3 + sessionIndex + exerciseIndex * 2) % 19 === 0;

        return {
          numero: exerciseIndex + 2,
          nombre: name,
          calificacion: exerciseScore,
          score: exerciseScore * 10,
          estado: notCompleted ? 'No Realizado' : 'Realizado',
          noRealizado: notCompleted,
          tiempo: `${String(5 + (driverIndex + exerciseIndex * 2) % 8).padStart(2, '0')}:${String((sessionIndex * 13 + exerciseIndex * 11) % 60).padStart(2, '0')}`,
          distancia: `${(2.4 + exerciseIndex * 1.8 + (driverIndex % 4) * 0.6).toFixed(1)} km`,
          colisiones: Math.max(0, collisions - (exerciseIndex % 2)),
          infracciones: (driverIndex + sessionIndex * 2 + exerciseIndex) % 4,
          fecha: date
        };
      });
      const mistakeIndex = (driverIndex + sessionIndex * 2) % mistakes.length;
      const frequentMistakes = [
        {
          error: mistakes[mistakeIndex],
          repeticiones: 1 + ((driverIndex + sessionIndex) % 4),
          ejeId: (mistakeIndex % 5) + 1,
          ejeNombre: radarAxes[mistakeIndex % 5]
        }
      ];
      if (collisions >= 2 || offRoad > 0) {
        const secondaryMistakeIndex = (mistakeIndex + 2 + sessionIndex) % mistakes.length;
        frequentMistakes.push({
          error: mistakes[secondaryMistakeIndex],
          repeticiones: 1 + ((driverIndex + sessionIndex) % 2),
          ejeId: (secondaryMistakeIndex % 5) + 1,
          ejeNombre: radarAxes[secondaryMistakeIndex % 5]
        });
      }
      const radarErrorCounts = radarPenalties.map((penalty, axisIndex) =>
        Math.ceil((10 - score) / penalty) +
        radarWeaknesses[(axisIndex + driverIndex + sessionIndex) % radarWeaknesses.length] +
        (axisIndex === 1 ? collisions + offRoad : 0)
      );
      radarErrorCounts.forEach((count, axisIndex) => {
        const error = radarMistakes[axisIndex];
        const existing = frequentMistakes.find((item) => item.error === error);
        if (existing) {
          existing.repeticiones += count;
          existing.ejeId = axisIndex + 1;
          existing.ejeNombre = radarAxes[axisIndex];
        } else {
          frequentMistakes.push({
            error,
            repeticiones: count,
            ejeId: axisIndex + 1,
            ejeNombre: radarAxes[axisIndex]
          });
        }
      });

      const practicePoints = Math.round(
        Math.max(
          score - 3,
          Math.min(
            7,
            score * 0.7 + driver.exerciseStrengths[1] * 0.25 + ((driverIndex + sessionIndex) % 5 - 2) * 0.05
          )
        ) * 100
      ) / 100;
      const handlingPoints = Math.round((score - practicePoints) * 100) / 100;

      return {
        id: `demo-${String(driverIndex + 1).padStart(2, '0')}-${sessionIndex + 1}`,
        folio: `DEMO-${String(driverIndex * driver.scores.length + sessionIndex + 1).padStart(4, '0')}`,
        conductor: driver.driver,
        empresa: driver.company,
        sede: driver.site,
        ciudad: driver.site,
        fecha: date,
        fechaReporte: date,
        fechaCapacitacion: date,
        fechaCapacitacionFormato: new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        }),
        tipoLicencia: driver.license,
        tipoEvaluacion: sessionIndex === 0 ? 'Evaluación inicial' : sessionIndex === 4 ? 'Evaluación de seguimiento' : 'Evaluación periódica',
        evaluacionFinalPuntos: score,
        calificacionExacta: score,
        promedioScore: score,
        habilidadesManejoPct: Math.round((handlingPoints / 3) * 100),
        habilidadesManejoPuntos: handlingPoints,
        practicaSimuladorPct: Math.round((practicePoints / 7) * 100),
        practicaSimuladorPuntos: practicePoints,
        colisiones: collisions,
        fatalidades: 0,
        vehiculoFueraVia: offRoad,
        totalColisiones: collisions,
        totalInfracciones: exercises.reduce((total, exercise) => total + (exercise.infracciones || 0), 0),
        tiempoTotal: `00:${String(34 + (driverIndex + sessionIndex * 3) % 25).padStart(2, '0')}:${String((driverIndex * 7 + sessionIndex * 13) % 60).padStart(2, '0')}`,
        distanciaTotal: `${(14.2 + (driverIndex % 8) * 2.1 + sessionIndex * 0.7).toFixed(1)} km`,
        ejercicios: exercises,
        simulacionesDetalle: {
          simulacion_2: Math.round(exercises[0].calificacion! * 10),
          simulacion_3: Math.round(exercises[1].calificacion! * 10),
          simulacion_4: Math.round(exercises[2].calificacion! * 10),
          simulacion_5: Math.round(exercises[3].calificacion! * 10),
          simulacion_6: Math.round(exercises[4].calificacion! * 10)
        },
        nombresSimulaciones: simulationNames,
        erroresFrecuentes: frequentMistakes,
        instructor: instructors[(driverIndex + sessionIndex * 2) % instructors.length],
        observaciones: observations[(driverIndex * 2 + sessionIndex) % observations.length],
        estado: score >= 8 ? 'Sobresaliente' : score >= 6 ? 'Aprobado' : 'Reforzar',
        clasificacion: score >= 8 ? 'Avanzado' : score >= 6 ? 'Competente' : 'En desarrollo',
        cursoCodigo: `CAP-${String(2023 + sessionIndex).slice(-2)}-${String((driverIndex % 5) + 1).padStart(2, '0')}`,
        cursoNombre: sessionIndex === 0 ? 'Inducción de conducción segura' : 'Actualización de conducción preventiva',
        folioGrupo: `GRP-${String((driverIndex % 10) + 1).padStart(3, '0')}`,
        origen: 'demo'
      };
    })
  )
  .sort((a, b) => (b.fechaCapacitacion || '').localeCompare(a.fechaCapacitacion || ''));
