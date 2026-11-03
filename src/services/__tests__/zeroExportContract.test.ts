import { describe, expect, it } from 'vitest';
import {
  getZeroGroupImportStatus,
  mapZeroExportEvaluation,
  parseZeroCloudExportGroup
} from '../zeroExportContract';

const groupRecord = {
  groupId: 'group-2026-01',
  groupName: 'Curso de noviembre',
  groupFolio: 'GRP-2026-11',
  sourceSystem: 'TrackSIM-ZERO',
  schemaVersion: '1.0.0',
  status: 'complete',
  expectedCount: 1,
  exportedCount: 1,
  completedAt: '2026-11-03T18:00:00.000Z'
};

const evaluationRecord = {
  id: 'eval_group-2026-01_driver-1',
  folio: 'EXP-20261103-0001-DRIVER',
  conductor: 'Conductor Uno',
  operador: 'Conductor Uno',
  evaluacionFinalPuntos: 8.5,
  calificacionExacta: 8.5,
  promedioScore: 8.5,
  estado: 'Aprobado',
  destrezaPuntos: 6,
  destrezaMax: 7,
  ecoDrivingPuntos: 2.5,
  ecoDrivingMax: 3,
  colisiones: 1,
  accidentesCriticos: 0,
  fatalidades: 0,
  vehiculoFueraVia: 0,
  totalInfracciones: 2,
  ejercicios: [{ numero: 1, nombre: 'Ruta urbana', tiempo: '02:30', estado: 'Realizado' }],
  erroresFrecuentes: [{ error: 'Colisión con objeto', repeticiones: 1, severidad: 'leve' }],
  sourceEvaluationIds: ['source-evaluation-1'],
  origen: 'TrackSIM-ZERO-V2'
};

describe('ZERO export contract', () => {
  it('detects fully imported, partially imported, and staged groups', () => {
    const group = parseZeroCloudExportGroup('group-2026-01', {
      ...groupRecord,
      expectedCount: 3,
      exportedCount: 3
    });

    expect(getZeroGroupImportStatus(group, [
      { id: 'one', zeroGroupId: group.id },
      { id: 'two', zeroGroupId: group.id },
      { id: 'three', zeroGroupId: group.id }
    ] as never[])).toMatchObject({
      importedCount: 3,
      stagedCount: 0,
      remainingCount: 0,
      isImported: true,
      isStaged: false
    });

    expect(getZeroGroupImportStatus(
      group,
      [{ id: 'one', zeroGroupId: group.id }],
      [{ id: 'two', zeroGroupId: group.id }]
    )).toMatchObject({
      importedCount: 1,
      stagedCount: 1,
      remainingCount: 1,
      isImported: false,
      isStaged: false
    });

    expect(getZeroGroupImportStatus(
      group,
      [],
      [
        { id: 'one', zeroGroupId: group.id },
        { id: 'two', zeroGroupId: group.id },
        { id: 'three', zeroGroupId: group.id }
      ]
    )).toMatchObject({
      importedCount: 0,
      stagedCount: 3,
      remainingCount: 0,
      isImported: false,
      isStaged: true
    });
  });

  it('recognizes previously imported ZERO PDF V2 records by group folio', () => {
    const group = parseZeroCloudExportGroup('group-2026-01', groupRecord);
    expect(getZeroGroupImportStatus(group, [{
      id: 'older-import',
      origen: 'TrackSIM-ZERO-V2',
      folioGrupo: group.groupFolio
    }])).toMatchObject({
      importedCount: 1,
      remainingCount: 0,
      isImported: true
    });
  });

  it('accepts only a complete supported group export with matching document identity and counts', () => {
    expect(parseZeroCloudExportGroup('group-2026-01', groupRecord)).toMatchObject({
      id: 'group-2026-01',
      groupId: 'group-2026-01',
      status: 'complete',
      expectedCount: 1,
      exportedCount: 1,
      schemaVersion: '1.0.0'
    });

    expect(() => parseZeroCloudExportGroup('group-2026-01', { ...groupRecord, status: 'pending' }))
      .toThrow('no está completa');
    expect(() => parseZeroCloudExportGroup('wrong-id', groupRecord))
      .toThrow('no coincide');
    expect(() => parseZeroCloudExportGroup('group-2026-01', { ...groupRecord, exportedCount: 0 }))
      .toThrow('conteos incompletos');
    expect(() => parseZeroCloudExportGroup('group-2026-01', { ...groupRecord, schemaVersion: '2.0.0' }))
      .toThrow('no compatible');
    expect(() => parseZeroCloudExportGroup('group-2026-01', { ...groupRecord, sourceSystem: 'other' }))
      .toThrow('no proviene');
  });

  it('maps exported frozen data while leaving company and site for CLOUD review', () => {
    const group = parseZeroCloudExportGroup('group-2026-01', groupRecord);
    const mapped = mapZeroExportEvaluation(evaluationRecord.id, evaluationRecord, group);

    expect(mapped).toMatchObject({
      id: evaluationRecord.id,
      folio: evaluationRecord.folio,
      conductor: 'Conductor Uno',
      operador: 'Conductor Uno',
      empresa: '',
      sede: '',
      evaluacionFinalPuntos: 8.5,
      destrezaPuntos: 6,
      ecoDrivingPuntos: 2.5,
      ejercicios: [{ nombre: 'Ruta urbana', estado: 'Realizado' }],
      erroresFrecuentes: [{ error: 'Colisión con objeto', repeticiones: 1 }],
      cursoNombre: 'Curso de noviembre',
      folioGrupo: 'GRP-2026-11',
      zeroGroupId: 'group-2026-01',
      sourceEvaluationIds: ['source-evaluation-1'],
      sourceSchemaVersion: '1.0.0',
      origen: 'TrackSIM-ZERO-V2'
    });
  });

  it('does not invent optional data and fills equivalent final-score fields consistently', () => {
    const group = parseZeroCloudExportGroup('group-2026-01', groupRecord);
    const mapped = mapZeroExportEvaluation(
      'eval-minimal',
      {
        id: 'eval-minimal',
        folio: 'EXP-20261103-0002-DRIVER',
        conductor: 'Conductor Dos',
        evaluacionFinalPuntos: 7,
        estado: 'Aprobado',
        origen: 'TrackSIM-ZERO-V2',
        empresa: null,
        sede: null,
        distanciaTotal: null
      },
      group
    );

    expect(mapped.empresa).toBe('');
    expect(mapped.sede).toBe('');
    expect(mapped.distanciaTotal).toBeUndefined();
    expect(mapped.calificacionExacta).toBe(7);
    expect(mapped.promedioScore).toBe(7);
  });

  it('rejects mismatched scores and document IDs instead of importing inconsistent records', () => {
    const group = parseZeroCloudExportGroup('group-2026-01', groupRecord);
    expect(() =>
      mapZeroExportEvaluation(
        'eval-mismatch',
        { ...evaluationRecord, id: 'eval-mismatch', promedioScore: 9 },
        group
      )
    ).toThrow('no coinciden');
    expect(() => mapZeroExportEvaluation('wrong-id', evaluationRecord, group))
      .toThrow('no coincide');
  });
});
