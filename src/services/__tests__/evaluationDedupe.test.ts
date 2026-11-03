import { describe, expect, it } from 'vitest';
import { filterDuplicateEvaluationsByFolio } from '../evaluationDedupe';

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
