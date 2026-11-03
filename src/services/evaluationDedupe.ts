interface EvaluationIdentity {
  id: string;
  folio?: string;
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
