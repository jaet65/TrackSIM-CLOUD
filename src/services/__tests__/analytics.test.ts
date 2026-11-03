import { describe, it, expect } from 'vitest';
import {
  slugify,
  normalizeExerciseName,
  processDriverSummaries,
  processCompanySummaries,
  createCompanySummaryFromEvaluations
} from '../analytics';
import { Evaluation } from '../../types';

describe('analytics service - Cálculos y Métricas de Flotas y Conductores', () => {
  describe('slugify & normalizeExerciseName', () => {
    it('debe transformar cadenas con tildes, mayúsculas y espacios a slugs URL seguros', () => {
      expect(slugify('Embotelladora Mexicana S.A.')).toBe('embotelladora-mexicana-sa');
      expect(slugify('  Puebla, Estado de México  ')).toBe('puebla-estado-de-mexico');
      expect(slugify('')).toBe('');
    });

    it('debe normalizar nombres de ejercicios eliminando tildes y diacríticos', () => {
      expect(normalizeExerciseName('Montaña')).toBe('montana');
      expect(normalizeExerciseName('MANEJO TÉCNICO ECONÓMICO')).toBe('manejo tecnico economico');
      expect(normalizeExerciseName('')).toBe('');
    });
  });

  describe('processDriverSummaries', () => {
    const mockEvaluations: Evaluation[] = [
      {
        id: 'ev_1',
        conductor: 'Juan Pérez',
        empresa: 'Transportes Norte',
        sede: 'Monterrey',
        fechaCapacitacion: '2025-01-15',
        evaluacionFinalPuntos: 7.5,
        habilidadesManejoPuntos: 8.0,
        practicaSimuladorPuntos: 7.0,
        colisiones: 1,
        fatalidades: 0,
        vehiculoFueraVia: 0
      },
      {
        id: 'ev_2',
        conductor: 'Juan Pérez',
        empresa: 'Transportes Norte',
        sede: 'Monterrey',
        fechaCapacitacion: '2025-06-20',
        evaluacionFinalPuntos: 8.5,
        habilidadesManejoPuntos: 9.0,
        practicaSimuladorPuntos: 8.0,
        colisiones: 0,
        fatalidades: 0,
        vehiculoFueraVia: 0
      },
      {
        id: 'ev_3',
        conductor: 'Carlos Ruiz',
        empresa: 'Transportes Norte',
        sede: 'Monterrey',
        fechaCapacitacion: '2025-03-10',
        evaluacionFinalPuntos: 4.8,
        habilidadesManejoPuntos: 5.0,
        practicaSimuladorPuntos: 4.6,
        colisiones: 2,
        fatalidades: 1,
        vehiculoFueraVia: 1
      }
    ];

    it('debe agrupar evaluaciones por conductor y calcular promedios exactos', () => {
      const drivers = processDriverSummaries(mockEvaluations);
      expect(drivers).toHaveLength(2);

      const juan = drivers.find((d) => d.nombre === 'Juan Pérez');
      expect(juan).toBeDefined();
      expect(juan?.totalEvaluaciones).toBe(2);
      expect(juan?.primeraCalificacion).toBe(7.5);
      expect(juan?.ultimaCalificacion).toBe(8.5);
      expect(juan?.promedioCalificacion).toBe(8.0); // (7.5 + 8.5) / 2
      expect(juan?.mejorCalificacion).toBe(8.5);
      expect(juan?.peorCalificacion).toBe(7.5);
      expect(juan?.totalColisiones).toBe(1);
      expect(juan?.totalFatalidades).toBe(0);
      expect(juan?.tendencia).toBe('mejora');
      expect(juan?.estadoGeneral).toBe('Sobresaliente'); // última calif >= 8.0
    });

    it('debe catalogar conductores con score < 5.0 como No Aprobado', () => {
      const drivers = processDriverSummaries(mockEvaluations);
      const carlos = drivers.find((d) => d.nombre === 'Carlos Ruiz');

      expect(carlos).toBeDefined();
      expect(carlos?.totalEvaluaciones).toBe(1);
      expect(carlos?.promedioCalificacion).toBe(4.8);
      expect(carlos?.totalFatalidades).toBe(1);
      expect(carlos?.totalColisiones).toBe(2);
      expect(carlos?.totalFueraVia).toBe(1);
      expect(carlos?.estadoGeneral).toBe('No Aprobado');
      expect(carlos?.badgeColor).toBe('danger');
    });
  });

  describe('processCompanySummaries & createCompanySummaryFromEvaluations', () => {
    const mockFleetEvaluations: Evaluation[] = [
      {
        id: 'ev_10',
        conductor: 'Conductor A',
        empresa: 'Bimbo',
        sede: 'Puebla',
        fechaCapacitacion: '2025-04-10',
        evaluacionFinalPuntos: 8.5,
        colisiones: 0,
        fatalidades: 0,
        vehiculoFueraVia: 0,
        ejercicios: [{ numero: 1, nombre: 'Montaña', calificacion: 8.5 }]
      },
      {
        id: 'ev_11',
        conductor: 'Conductor B',
        empresa: 'Bimbo',
        sede: 'CDMX',
        fechaCapacitacion: '2025-05-12',
        evaluacionFinalPuntos: 5.5,
        colisiones: 1,
        fatalidades: 0,
        vehiculoFueraVia: 1,
        ejercicios: [{ numero: 1, nombre: 'Montaña', calificacion: 5.5 }]
      }
    ];

    it('debe calcular métricas agregadas de empresa, sedes y tasa de aprobación', () => {
      const companies = processCompanySummaries(mockFleetEvaluations);
      expect(companies).toHaveLength(1);

      const bimbo = companies[0];
      expect(bimbo.nombre).toBe('Bimbo');
      expect(bimbo.totalEvaluaciones).toBe(2);
      expect(bimbo.totalConductores).toBe(2);
      expect(bimbo.sedes).toEqual(expect.arrayContaining(['Puebla', 'CDMX']));
      expect(bimbo.promedioFinal).toBe(7.0); // (8.5 + 5.5) / 2
      expect(bimbo.tasaAprobacion).toBe(50); // 1 de 2 aprobado (>= 6.0)
      expect(bimbo.totalColisiones).toBe(1);
      expect(bimbo.totalFueraVia).toBe(1);
      expect(bimbo.totalFatalidades).toBe(0);
    });

    it('debe registrar el historial de ejercicios por conductor en conductores', () => {
      const summary = createCompanySummaryFromEvaluations('Bimbo', 'bimbo', mockFleetEvaluations);
      expect(summary.conductores).toHaveLength(2);

      const condA = summary.conductores.find((c) => c.nombre === 'Conductor A');
      expect(condA).toBeDefined();
      expect(condA?.promedioScore).toBe(8.5);
      expect(condA?.estado).toBe('Sobresaliente');
      expect(condA?.sede).toBe('Puebla');
    });

    it('calculates V2 fleet incident rates only from collision, off-road, and fatality errors', () => {
      const v2Evaluation: Evaluation = {
        id: 'v2_1',
        conductor: 'Conductor V2',
        empresa: 'Bimbo',
        origen: 'TrackSIM-ZERO-V2',
        accidentesCriticos: 9,
        colisiones: 9,
        totalColisiones: 9,
        fatalidades: 0,
        vehiculoFueraVia: 0,
        erroresFrecuentes: [
          { error: 'Colisión con un vehículo del tráfico', repeticiones: 2 },
          { error: 'Atropello de un peatón', repeticiones: 3 },
          { error: 'Salirse de la vía', repeticiones: 4, severidad: 'CRITICO' },
          { error: 'Salirse de la vía', repeticiones: 1, severidad: 'GRAVE' },
          { error: 'Superar la zona roja de las rpm', repeticiones: 25 }
        ]
      };

      const summary = createCompanySummaryFromEvaluations('Bimbo', 'bimbo', [v2Evaluation]);

      expect(summary.totalColisiones).toBe(2);
      expect(summary.totalFatalidades).toBe(7);
      expect(summary.totalFueraVia).toBe(1);
    });
  });
});
