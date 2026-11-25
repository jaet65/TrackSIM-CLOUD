import { describe, expect, it } from 'vitest';
import { getEvaluationCriticalIncidents, getHybridDriverIncidents, getHybridEvaluationIncidents, getHybridIncidentSummary, getIncidentModes, groupIncidentCollisions } from '../incidentMetrics';
import type { Evaluation } from '../../types';

describe('incidencias críticas', () => {
  it('agrupa colisiones sin alterar otros tipos ni los datos originales', () => {
    const details = [
      { name: 'Colisiones', count: 2 },
      { name: 'Colisión con un objeto', count: 3 },
      { name: 'Colisión con unas piedras', count: 4 },
      { name: 'Colisión con un vehículo de incidencia', count: 5 },
      { name: 'Colisión con un vehículo del tráfico', count: 6 },
      { name: 'Choque frontal', count: 1 },
      { name: 'Atropello de un perro', count: 7 },
      { name: 'Sin desglose disponible', count: 8 }
    ];
    expect(groupIncidentCollisions(details)).toEqual([
      { name: 'Colisiones', count: 21 }, { name: 'Atropello de un perro', count: 7 },
      { name: 'Sin desglose disponible', count: 8 }
    ]);
    expect(details[0].count).toBe(2);
  });

  it('reconoce los nueve errores críticos del catálogo', () => {
    const errors = [
      'Atropello de un peatón', 'Atropello de un perro', 'Colisión con un objeto',
      'Colisión con un vehículo de incidencia', 'Colisión con un vehículo del tráfico',
      'Colisión con unas piedras', 'Saltarse un semáforo en rojo', 'Vuelco', 'Vuelco del remolque'
    ];
    const result = getEvaluationCriticalIncidents({
      erroresFrecuentes: errors.map((error, index) => ({ error, repeticiones: index + 1 }))
    });
    expect(result.total).toBe(45);
    expect(result.details.map((item) => item.error)).toEqual(errors);
  });

    describe('criterio híbrido por cliente', () => {
      const legacy: Evaluation = {
        id: 'legacy', empresa: 'Flota', colisiones: 2, fatalidades: 3, vehiculoFueraVia: 4,
        erroresFrecuentes: [{ error: 'Colisión con un objeto', repeticiones: 2 }]
      };
      const v2: Evaluation = {
        id: 'v2', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 9,
        erroresFrecuentes: [
          { error: 'Colisión con un vehículo del tráfico', repeticiones: 4 },
          { error: 'Atropello de un perro', repeticiones: 2 },
          { error: 'Atropello de un peatón', repeticiones: 1 },
          { error: 'Vuelco del remolque', repeticiones: 2 },
          { error: 'Salirse de la vía', repeticiones: 10 }
        ]
      };

      it('usa solamente los tres contadores históricos para clientes V1', () => {
        const result = getHybridIncidentSummary([legacy]);
        expect(result.label).toBe('Incidentes en el simulador');
        expect(result.total).toBe(9);
        expect(result.details).toEqual(expect.arrayContaining([
          { name: 'Colisiones', count: 2 }, { name: 'Fatalidades', count: 3 }, { name: 'Fuera de vía', count: 4 }
        ]));
      });

      it('usa el catálogo para V2 y agrega las equivalencias solo al mezclar versiones', () => {
        const onlyV2 = getHybridIncidentSummary([v2]);
        expect(onlyV2.total).toBe(9);
        expect(onlyV2.details.some((item) => item.name === 'Salirse de la vía')).toBe(false);
        const mixed = getHybridIncidentSummary([legacy, v2]);
        expect(mixed.total).toBe(28);
        expect(mixed.details).toEqual(expect.arrayContaining([
          { name: 'Colisiones', count: 6 },
          { name: 'Atropello de peatón y vuelcos', count: 6 },
          { name: 'Atropello de un perro', count: 2 },
          { name: 'Salirse de la vía', count: 14 }
        ]));
        expect(mixed.details).toHaveLength(4);
      });

      it('suma los distintos tipos de colisión V2 sin modificar los errores de origen', () => {
        const evaluation: Evaluation = {
          id: 'multiple', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 10,
          erroresFrecuentes: [
            { error: 'Colisión con un objeto', repeticiones: 2 },
            { error: 'Colisión con unas piedras', repeticiones: 3 },
            { error: 'Colisión con un vehículo del tráfico', repeticiones: 4 },
            { error: 'Atropello de un perro', repeticiones: 1 }
          ]
        };
        const result = getHybridIncidentSummary([evaluation]);
        expect(result.total).toBe(10);
        expect(result.incomplete).toBe(0);
        expect(result.details).toEqual([
          { name: 'Colisiones', count: 9 }, { name: 'Atropello de un perro', count: 1 }
        ]);
        expect(evaluation.erroresFrecuentes?.map((item) => item.error)).toEqual([
          'Colisión con un objeto', 'Colisión con unas piedras',
          'Colisión con un vehículo del tráfico', 'Atropello de un perro'
        ]);
      });

      it('elige el criterio por cliente y por las evaluaciones filtradas', () => {
        const separate = getHybridIncidentSummary([legacy, { ...v2, empresa: 'Otra' }]);
        expect(separate.total).toBe(18);
        expect(separate.details).toEqual(expect.arrayContaining([{ name: 'Colisiones', count: 6 }]));
        expect(separate.details.some((item) => item.name === 'Salirse de la vía')).toBe(false);
        expect(getHybridIncidentSummary([{ ...legacy, empresa: ' FLOTA ' }, v2]).total).toBe(28);
        const modes = getHybridIncidentSummary([legacy, v2]).modes;
        const legacyYear = getHybridIncidentSummary([legacy], modes);
        expect(legacyYear.details).toContainEqual({ name: 'Colisiones', count: 2 });
        expect(legacyYear.details).toContainEqual({ name: 'Atropello de peatón y vuelcos', count: 3 });
        expect(getHybridEvaluationIncidents(legacy, getIncidentModes([legacy])).details)
          .toContainEqual({ name: 'Fatalidades', count: 3 });
      });

      it('no inventa contadores V1 ausentes ni salidas V2 no desglosadas', () => {
        const partial = getHybridIncidentSummary([
          { id: 'v1', empresa: 'Flota', colisiones: 2 },
          { id: 'v2', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 3 }
        ]);
        expect(partial.total).toBe(5);
        expect(partial.incomplete).toBe(2);
        expect(partial.details).toEqual(expect.arrayContaining([
          { name: 'Colisiones', count: 2 }, { name: 'Sin desglose disponible', count: 3 }
        ]));
      });

      it('no cuenta dos veces una salida de vía V2 marcada crítica', () => {
        const result = getHybridIncidentSummary([
          legacy,
          { id: 'v2-offroad', empresa: 'Flota', origen: 'TrackSIM-ZERO-V2', accidentesCriticos: 3,
            erroresFrecuentes: [{ error: 'Salirse de la vía', repeticiones: 3, severidad: 'CRITICO' }] }
        ]);
        expect(result.total).toBe(12);
        expect(result.details).toContainEqual({ name: 'Salirse de la vía', count: 7 });
      });

      it('mantiene el criterio del cliente al calcular incidencias por operador', () => {
        const evaluations = [
          { ...legacy, conductor: 'Ana' },
          { ...v2, conductor: 'Luis' },
          { id: 'missing', empresa: 'Flota', conductor: 'Eva', colisiones: 1 }
        ];
        const summary = getHybridIncidentSummary(evaluations);
        const drivers = getHybridDriverIncidents(evaluations, summary.modes);
        expect(drivers.get('ana')).toBe(9);
        expect(drivers.get('luis')).toBe(19);
        expect(drivers.get('eva')).toBeNull();
      });
    });
  it('reconoce variantes de nombres sin artículos y suma sus repeticiones', () => {
    const result = getEvaluationCriticalIncidents({
      erroresFrecuentes: [
        { error: 'Colisión con objeto', repeticiones: 4 },
        { error: 'Colisión con vehículo del tráfico', repeticiones: 3 },
        { error: 'Colisión con vehículo de incidencia', repeticiones: 2 },
        { error: 'Colisión con piedras', repeticiones: 1 },
        { error: 'Atropello de peatón', repeticiones: 2 },
        { error: 'Atropello de perro', repeticiones: 1 }
      ]
    });
    expect(result.total).toBe(13);
    expect(result.details.map((item) => item.error)).toEqual([
      'Colisión con un objeto', 'Colisión con un vehículo del tráfico',
      'Colisión con un vehículo de incidencia', 'Colisión con unas piedras',
      'Atropello de un peatón', 'Atropello de un perro'
    ]);
  });

  it('identifica errores críticos por nombre y severidad sin usar los totales antiguos', () => {
    const result = getEvaluationCriticalIncidents({
      erroresFrecuentes: [
        { error: 'semaforo en rojo', repeticiones: 2 },
        { error: 'Vuelco', repeticiones: 3 },
        { error: 'Otra falta', repeticiones: 4, severidad: 'Crítico' },
        { error: 'Exceso de velocidad', repeticiones: 10 }
      ],
      accidentesCriticos: 99
    });
    expect(result.total).toBe(9);
    expect(result.details.map((item) => item.error)).toEqual([
      'Saltarse un semáforo en rojo', 'Vuelco', 'Otra falta'
    ]);
  });

  it('usa el total guardado cuando no hay desglose y distingue datos ausentes de cero', () => {
    expect(getEvaluationCriticalIncidents({ accidentesCriticos: 5 })).toEqual({ total: 5, details: [], complete: true });
    expect(getEvaluationCriticalIncidents({ accidentesCriticos: 0 })).toEqual({ total: 0, details: [], complete: true });
    expect(getEvaluationCriticalIncidents({ erroresFrecuentes: [] })).toEqual({ total: null, details: [], complete: false });
    expect(getEvaluationCriticalIncidents({})).toEqual({ total: null, details: [], complete: false });
  });

  it('marca como incompleto un listado de errores frecuentes sin total crítico y no convierte colisiones anteriores', () => {
    const legacy = {
      colisiones: 10,
      erroresFrecuentes: [
        { error: 'Colisión con un objeto', repeticiones: 2 },
        { error: 'Semáforo en rojo', repeticiones: 3 },
        { error: 'Salirse de la vía', repeticiones: 4 }
      ]
    };
    expect(getEvaluationCriticalIncidents(legacy)).toMatchObject({
      total: 5,
      complete: false,
      details: [
        { error: 'Colisión con un objeto', repeticiones: 2 },
        { error: 'Saltarse un semáforo en rojo', repeticiones: 3 }
      ]
    });
    expect(getEvaluationCriticalIncidents({ ...legacy, erroresFrecuentes: [] })).toEqual({
      total: null, details: [], complete: false
    });
    expect(getEvaluationCriticalIncidents({ ...legacy, erroresFrecuentes: [{ error: 'Frenado brusco', repeticiones: 3 }] }))
      .toEqual({ total: null, details: [], complete: false });
  });

  it('detecta diferencias entre el desglose y el total crítico guardado', () => {
    const erroresFrecuentes = [{ error: 'Colisión con un objeto', repeticiones: 2 }];
    expect(getEvaluationCriticalIncidents({ erroresFrecuentes, accidentesCriticos: 2 }).complete).toBe(true);
    expect(getEvaluationCriticalIncidents({ erroresFrecuentes, accidentesCriticos: 5 })).toMatchObject({
      total: 2, complete: false
    });
  });
});
