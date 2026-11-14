import { describe, expect, it } from 'vitest';
import { filterDuplicateEvaluationsByFolio, prepareZeroGroupRefresh } from '../evaluationDedupe';
import type { Evaluation, StagedEvaluation } from '../../types';

describe('filterDuplicateEvaluationsByFolio', () => {
  it('detects folio duplicates regardless of case, including within the incoming batch', () => {
    const result = filterDuplicateEvaluationsByFolio(
      [
        { id: 'new-a', folio: 'EXP-001' },
        { id: 'new-b', folio: 'exp-002' },
        { id: 'new-c', folio: ' EXP-002 ' }
      ],
      [{ id: 'saved', folio: 'exp-001' }]
    );

    expect(result.fresh).toEqual([{ id: 'new-b', folio: 'exp-002' }]);
    expect(result.duplicates).toEqual([
      { id: 'new-a', folio: 'EXP-001' },
      { id: 'new-c', folio: ' EXP-002 ' }
    ]);
  });

  it('continues to detect duplicates by ID when a stored folio is unavailable', () => {
    const result = filterDuplicateEvaluationsByFolio(
      [{ id: 'existing-id', folio: 'EXP-003' }],
      [{ id: 'existing-id' }]
    );

    expect(result.fresh).toEqual([]);
    expect(result.duplicates).toEqual([{ id: 'existing-id', folio: 'EXP-003' }]);
  });
});

describe('prepareZeroGroupRefresh', () => {
  const incoming: StagedEvaluation = {
    id: 'eval_group-1_driver-1',
    folio: 'EXP-NEW-SCORE',
    conductor: 'Conductor Uno',
    empresa: '',
    sede: '',
    evaluacionFinalPuntos: 7.2,
    calificacionExacta: 7.2,
    promedioScore: 7.2,
    observaciones: undefined,
    origen: 'TrackSIM-ZERO-V2',
    zeroGroupId: 'group-1',
    originalEmpresa: '',
    originalSede: '',
    fileName: 'Grupo — Conductor Uno'
  };

  it('updates ZERO-owned fields while retaining CLOUD company, site, and local annotations', () => {
    const saved: Evaluation = {
      ...incoming,
      empresa: 'Empresa local',
      sede: 'Sede local',
      observaciones: 'Nota capturada en CLOUD'
    };

    const result = prepareZeroGroupRefresh([incoming], [saved], { id: 'group-1' });

    expect(result.missingIds).toEqual([]);
    expect(result.obsoleteIds).toEqual([]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({
      folio: 'EXP-NEW-SCORE',
      evaluacionFinalPuntos: 7.2,
      empresa: 'Empresa local',
      sede: 'Sede local',
      originalEmpresa: 'Empresa local',
      originalSede: 'Sede local',
      observaciones: 'Nota capturada en CLOUD'
    });
  });

  it('does not prepare any write when the incoming group does not match the saved records exactly', () => {
    const saved: Evaluation = {
      ...incoming,
      id: 'eval_group-1_old-driver',
      zeroGroupId: 'group-1',
      empresa: 'Empresa local'
    };

    const result = prepareZeroGroupRefresh([incoming], [saved], { id: 'group-1' });

    expect(result.updates).toEqual([]);
    expect(result.missingIds).toEqual([incoming.id]);
    expect(result.obsoleteIds).toEqual([saved.id]);
  });
});
