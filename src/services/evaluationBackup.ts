import { Timestamp } from 'firebase/firestore';
import { Evaluation } from '../types';

export function isEvaluationBackup(value: unknown): value is Evaluation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id.trim() !== '' && typeof record.empresa === 'string';
}

export function serializeEvaluationBackup(evaluation: Evaluation): string {
  return JSON.stringify(evaluation, (_key, value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'firestore/timestamp/1.0' &&
      'seconds' in value &&
      'nanoseconds' in value
    ) {
      return {
        __tracksimBackupType: 'timestamp',
        seconds: value.seconds,
        nanoseconds: value.nanoseconds
      };
    }
    return value;
  });
}

export function parseEvaluationBackup(json: string): unknown {
  return JSON.parse(json, (_key, value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      '__tracksimBackupType' in value &&
      value.__tracksimBackupType === 'timestamp' &&
      'seconds' in value &&
      'nanoseconds' in value &&
      typeof value.seconds === 'number' &&
      typeof value.nanoseconds === 'number'
    ) {
      return Timestamp.fromJSON({
        type: 'firestore/timestamp/1.0',
        seconds: value.seconds,
        nanoseconds: value.nanoseconds
      });
    }
    return value;
  });
}
