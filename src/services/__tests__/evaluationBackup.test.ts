import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { isEvaluationBackup, parseEvaluationBackup, serializeEvaluationBackup } from '../evaluationBackup';

describe('evaluation backup serialization', () => {
  it('round-trips complete nested evaluation data and Firestore timestamps', () => {
    const evaluatedAt = new Timestamp(1_700_000_000, 123_000_000);
    const evaluation = {
      id: 'evaluation-1',
      empresa: 'Empresa Demo',
      erroresFrecuentes: [{ error: 'Frenado brusco', repeticiones: 2 }],
      camposAdicionales: { origenImportacion: 'PDF', aprobado: true },
      creadoEn: evaluatedAt
    };

    const parsed = parseEvaluationBackup(serializeEvaluationBackup(evaluation));

    expect(isEvaluationBackup(parsed)).toBe(true);
    if (!isEvaluationBackup(parsed)) return;
    expect(parsed.id).toBe(evaluation.id);
    expect(parsed.erroresFrecuentes).toEqual(evaluation.erroresFrecuentes);
    expect('camposAdicionales' in parsed && parsed.camposAdicionales).toEqual(evaluation.camposAdicionales);
    expect(parsed.creadoEn).toBeInstanceOf(Timestamp);
    expect((parsed.creadoEn as Timestamp).isEqual(evaluatedAt)).toBe(true);
  });

  it('rejects backup rows without an ID or company', () => {
    expect(isEvaluationBackup({ id: 'evaluation-1' })).toBe(false);
    expect(isEvaluationBackup({ empresa: 'Empresa Demo' })).toBe(false);
  });
});
