import type { Evaluation, StagedEvaluation } from '../types';

interface EvaluationIdentity {
  id: string;
  folio?: string;
}

export interface ZeroGroupRefreshResult {
  updates: StagedEvaluation[];
  missingIds: string[];
  obsoleteIds: string[];
}

export function filterDuplicateEvaluationsByFolio<T extends EvaluationIdentity>(
  candidates: readonly T[],
  existing: readonly EvaluationIdentity[]
): { fresh: T[]; duplicates: T[] } {
  const knownIds = new Set(existing.map((item) => item.id));
  const knownFolios = new Set(
    existing.map((item) => item.folio?.trim().toUpperCase()).filter((folio): folio is string => Boolean(folio))
  );
  const fresh: T[] = [];
  const duplicates: T[] = [];

  for (const candidate of candidates) {
    const folio = candidate.folio?.trim().toUpperCase();
    if (knownIds.has(candidate.id) || (folio && knownFolios.has(folio))) {
      duplicates.push(candidate);
      continue;
    }

    knownIds.add(candidate.id);
    if (folio) knownFolios.add(folio);
    fresh.push(candidate);
  }

  return { fresh, duplicates };
}

export function prepareZeroGroupRefresh(
  incoming: readonly StagedEvaluation[],
  existing: readonly Evaluation[],
  group: { id: string; groupFolio?: string }
): ZeroGroupRefreshResult {
  const groupEvaluations = existing.filter(
    (evaluation) =>
      evaluation.zeroGroupId === group.id ||
      (Boolean(group.groupFolio) &&
        evaluation.origen === 'TrackSIM-ZERO-V2' &&
        evaluation.folioGrupo === group.groupFolio)
  );
  const existingById = new Map(groupEvaluations.map((evaluation) => [evaluation.id, evaluation]));
  const incomingIds = new Set(incoming.map((evaluation) => evaluation.id));
  const missingIds = incoming.filter((evaluation) => !existingById.has(evaluation.id)).map((evaluation) => evaluation.id);
  const obsoleteIds = groupEvaluations.filter((evaluation) => !incomingIds.has(evaluation.id)).map((evaluation) => evaluation.id);

  if (missingIds.length > 0 || obsoleteIds.length > 0) {
    return { updates: [], missingIds, obsoleteIds };
  }

  const updates = incoming.map((evaluation) => {
    const saved = existingById.get(evaluation.id);
    if (!saved) throw new Error(`No se encontró el expediente ${evaluation.id} para actualizar.`);
    const empresa = saved.empresa || '';
    const sede = saved.sede || '';
    return {
      ...saved,
      ...evaluation,
      empresa,
      sede,
      observaciones: evaluation.observaciones ?? saved.observaciones,
      originalEmpresa: empresa,
      originalSede: sede
    };
  });

  return { updates, missingIds, obsoleteIds };
}
