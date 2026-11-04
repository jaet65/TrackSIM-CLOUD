import type { Evaluation, ExerciseItem, FrequentMistakeItem, StagedEvaluation } from '../types';

export interface ZeroCloudExportGroup {
  id: string;
  groupId: string;
  groupName: string;
  groupFolio?: string;
  sourceSystem: 'TrackSIM-ZERO';
  schemaVersion: string;
  status: 'complete';
  expectedCount: number;
  exportedCount: number;
  closedAt?: string;
  completedAt?: string;
}

export interface ZeroGroupImportStatus {
  importedCount: number;
  stagedCount: number;
  remainingCount: number;
  isImported: boolean;
  isStaged: boolean;
}

type ImportIdentity = Pick<Evaluation, 'id' | 'origen' | 'zeroGroupId' | 'folioGrupo'> & { folio?: string };

function belongsToZeroGroup(
  evaluation: ImportIdentity,
  group: ZeroCloudExportGroup,
  groupEvaluationFolios?: ReadonlySet<string>
): boolean {
  return evaluation.zeroGroupId === group.id ||
    Boolean(evaluation.folio && groupEvaluationFolios?.has(evaluation.folio)) ||
    (evaluation.origen === 'TrackSIM-ZERO-V2' &&
      Boolean(group.groupFolio) &&
      evaluation.folioGrupo === group.groupFolio);
}

export function getZeroGroupImportStatus(
  group: ZeroCloudExportGroup,
  importedEvaluations: readonly ImportIdentity[],
  stagedEvaluations: readonly ImportIdentity[] = [],
  groupEvaluationFolios?: ReadonlySet<string>
): ZeroGroupImportStatus {
  const importedIds = new Set(
    importedEvaluations
      .filter((evaluation) => belongsToZeroGroup(evaluation, group, groupEvaluationFolios))
      .map((evaluation) => evaluation.id)
  );
  const stagedIds = new Set(
    stagedEvaluations
      .filter((evaluation) => belongsToZeroGroup(evaluation, group, groupEvaluationFolios) && !importedIds.has(evaluation.id))
      .map((evaluation) => evaluation.id)
  );
  const availableCount = Math.min(group.expectedCount, importedIds.size + stagedIds.size);

  return {
    importedCount: Math.min(group.expectedCount, importedIds.size),
    stagedCount: Math.min(group.expectedCount - Math.min(group.expectedCount, importedIds.size), stagedIds.size),
    remainingCount: group.expectedCount - availableCount,
    isImported: importedIds.size >= group.expectedCount,
    isStaged: stagedIds.size > 0 && availableCount >= group.expectedCount
  };
}

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`La exportación de ZERO tiene un campo ${field} vacío o inválido.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`El campo ${field} de ZERO debe ser texto o nulo.`);
  return value;
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (isRecord(value) && typeof value.toDate === 'function') {
    const date = (value.toDate as () => unknown)();
    if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString();
  }
  throw new Error(`El campo ${field} de ZERO no es una fecha válida.`);
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`El campo ${field} de ZERO debe ser un número finito o nulo.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = optionalNumber(value, field);
  if (parsed === undefined) throw new Error(`La exportación de ZERO no incluye ${field}.`);
  return parsed;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(`El campo ${field} de ZERO debe ser booleano o nulo.`);
  return value;
}

function parseExercises(value: unknown): ExerciseItem[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('El desglose de ejercicios de ZERO no es válido.');

  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`El ejercicio ${index + 1} de ZERO no es válido.`);
    const nombre = requiredString(entry.nombre, `ejercicios[${index}].nombre`);
    return {
      nombre,
      numero: optionalNumber(entry.numero, `ejercicios[${index}].numero`),
      tiempo: optionalString(entry.tiempo, `ejercicios[${index}].tiempo`),
      distancia: optionalString(entry.distancia, `ejercicios[${index}].distancia`),
      colisiones: optionalNumber(entry.colisiones, `ejercicios[${index}].colisiones`),
      infracciones: optionalNumber(entry.infracciones, `ejercicios[${index}].infracciones`),
      calificacion: optionalNumber(entry.calificacion, `ejercicios[${index}].calificacion`),
      score: optionalNumber(entry.score, `ejercicios[${index}].score`),
      estado: optionalString(entry.estado, `ejercicios[${index}].estado`),
      noRealizado: optionalBoolean(entry.noRealizado, `ejercicios[${index}].noRealizado`),
      comentarios: optionalString(entry.comentarios, `ejercicios[${index}].comentarios`),
      fecha: optionalString(entry.fecha, `ejercicios[${index}].fecha`),
      modulo: optionalString(entry.modulo, `ejercicios[${index}].modulo`),
      instructor: optionalString(entry.instructor, `ejercicios[${index}].instructor`)
    };
  });
}

function parseFrequentMistakes(value: unknown): FrequentMistakeItem[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('La lista de errores frecuentes de ZERO no es válida.');

  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`El error frecuente ${index + 1} de ZERO no es válido.`);
    return {
      error: requiredString(entry.error, `erroresFrecuentes[${index}].error`),
      errorRaw: optionalString(entry.errorRaw, `erroresFrecuentes[${index}].errorRaw`),
      repeticiones: requiredNumber(entry.repeticiones, `erroresFrecuentes[${index}].repeticiones`),
      severidad: optionalString(entry.severidad, `erroresFrecuentes[${index}].severidad`),
      ejeId: optionalNumber(entry.ejeId, `erroresFrecuentes[${index}].ejeId`),
      ejeNombre: optionalString(entry.ejeNombre, `erroresFrecuentes[${index}].ejeNombre`),
      ejeShortName: optionalString(entry.ejeShortName, `erroresFrecuentes[${index}].ejeShortName`),
      ejeIcono: optionalString(entry.ejeIcono, `erroresFrecuentes[${index}].ejeIcono`)
    };
  });
}

function parseStringRecord(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error(`El campo ${field} de ZERO no es válido.`);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== 'string') throw new Error(`El campo ${field}.${key} de ZERO debe ser texto.`);
      return [key, entry];
    })
  );
}

function parseNumberRecord(value: unknown, field: string): Record<string, number> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error(`El campo ${field} de ZERO no es válido.`);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== 'number' || !Number.isFinite(entry)) {
        throw new Error(`El campo ${field}.${key} de ZERO debe ser un número finito.`);
      }
      return [key, entry];
    })
  );
}

function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`El campo ${field} de ZERO debe ser una lista de textos.`);
  }
  return value;
}

export function parseZeroCloudExportGroup(id: string, value: unknown): ZeroCloudExportGroup {
  if (!isRecord(value)) throw new Error(`Los metadatos de la exportación ${id} no son válidos.`);
  const groupId = requiredString(value.groupId, 'groupId');
  if (id !== groupId) throw new Error(`El ID del documento no coincide con groupId en ${id}.`);
  if (value.status !== 'complete') throw new Error(`La exportación del grupo ${id} no está completa.`);

  const schemaVersion = requiredString(value.schemaVersion, 'schemaVersion');
  if (schemaVersion !== '1.0.0') {
    throw new Error(`La exportación del grupo ${id} usa una versión no compatible (${schemaVersion}).`);
  }
  const sourceSystem = requiredString(value.sourceSystem, 'sourceSystem');
  if (sourceSystem !== 'TrackSIM-ZERO') {
    throw new Error(`La exportación del grupo ${id} no proviene de TrackSIM-ZERO.`);
  }

  const expectedCount = requiredNumber(value.expectedCount, 'expectedCount');
  const exportedCount = requiredNumber(value.exportedCount, 'exportedCount');
  if (!Number.isSafeInteger(expectedCount) || !Number.isSafeInteger(exportedCount) || expectedCount !== exportedCount) {
    throw new Error(`La exportación del grupo ${id} tiene conteos incompletos o inválidos.`);
  }

  return {
    id,
    groupId,
    groupName: requiredString(value.groupName, 'groupName'),
    groupFolio: optionalString(value.groupFolio, 'groupFolio'),
    sourceSystem,
    schemaVersion,
    status: 'complete',
    expectedCount,
    exportedCount,
    closedAt: optionalDate(value.closedAt, 'closedAt'),
    completedAt: optionalDate(value.completedAt, 'completedAt')
  };
}

export function mapZeroExportEvaluation(
  id: string,
  value: unknown,
  group: ZeroCloudExportGroup
): StagedEvaluation {
  if (!isRecord(value)) throw new Error(`El expediente ${id} de ZERO no es válido.`);
  const evaluationId = requiredString(value.id, 'id');
  if (evaluationId !== id) throw new Error(`El ID del documento no coincide con el expediente ${id}.`);
  if (requiredString(value.origen, `origen de ${id}`) !== 'TrackSIM-ZERO-V2') {
    throw new Error(`El expediente ${id} no está identificado como TrackSIM-ZERO-V2.`);
  }
  const folio = requiredString(value.folio, `folio de ${id}`);
  const conductor = requiredString(value.conductor ?? value.operador, `conductor de ${id}`);
  const score = requiredNumber(value.evaluacionFinalPuntos ?? value.calificacionExacta ?? value.promedioScore, `calificación final de ${id}`);
  const scores = [value.evaluacionFinalPuntos, value.calificacionExacta, value.promedioScore]
    .filter((entry) => entry !== undefined && entry !== null)
    .map((entry) => requiredNumber(entry, `calificación de ${id}`));
  if (scores.some((entry) => Math.abs(entry - score) > 0.001)) {
    throw new Error(`Las calificaciones finales del expediente ${id} no coinciden.`);
  }
  const estado = requiredString(value.estado, `estado de ${id}`);
  const sourceEvaluationIds = parseStringArray(value.sourceEvaluationIds, `sourceEvaluationIds de ${id}`);
  const sourceSchemaVersion = optionalString(value.schemaVersion, `schemaVersion de ${id}`) || group.schemaVersion;
  if (sourceSchemaVersion !== group.schemaVersion) {
    throw new Error(`El expediente ${id} usa una versión distinta a la exportación del grupo.`);
  }

  return {
    id: evaluationId,
    folio,
    conductor,
    operador: optionalString(value.operador, `operador de ${id}`) || conductor,
    empresa: '',
    sede: '',
    ciudad: optionalString(value.ciudad, `ciudad de ${id}`),
    fecha: optionalDate(value.fecha, `fecha de ${id}`),
    fechaReporte: optionalDate(value.fechaReporte, `fechaReporte de ${id}`),
    fechaCapacitacion: optionalDate(value.fechaCapacitacion, `fechaCapacitacion de ${id}`),
    fechaCapacitacionFormato: optionalDate(value.fechaCapacitacionFormato, `fechaCapacitacionFormato de ${id}`),
    tipoLicencia: optionalString(value.tipoLicencia, `tipoLicencia de ${id}`),
    tipoEvaluacion: optionalString(value.tipoEvaluacion, `tipoEvaluacion de ${id}`) || 'Expediente individual V2',
    evaluacionFinalPuntos: score,
    calificacionExacta: optionalNumber(value.calificacionExacta, `calificacionExacta de ${id}`) ?? score,
    promedioScore: optionalNumber(value.promedioScore, `promedioScore de ${id}`) ?? score,
    habilidadesManejoPct: optionalNumber(value.habilidadesManejoPct, `habilidadesManejoPct de ${id}`),
    habilidadesManejoPuntos: optionalNumber(value.habilidadesManejoPuntos, `habilidadesManejoPuntos de ${id}`),
    practicaSimuladorPct: optionalNumber(value.practicaSimuladorPct, `practicaSimuladorPct de ${id}`),
    practicaSimuladorPuntos: optionalNumber(value.practicaSimuladorPuntos, `practicaSimuladorPuntos de ${id}`),
    destrezaPuntos: optionalNumber(value.destrezaPuntos, `destrezaPuntos de ${id}`),
    destrezaMax: optionalNumber(value.destrezaMax, `destrezaMax de ${id}`),
    ecoDrivingPuntos: optionalNumber(value.ecoDrivingPuntos, `ecoDrivingPuntos de ${id}`),
    ecoDrivingMax: optionalNumber(value.ecoDrivingMax, `ecoDrivingMax de ${id}`),
    colisiones: optionalNumber(value.colisiones, `colisiones de ${id}`),
    accidentesCriticos: optionalNumber(value.accidentesCriticos, `accidentesCriticos de ${id}`),
    fatalidades: optionalNumber(value.fatalidades, `fatalidades de ${id}`),
    vehiculoFueraVia: optionalNumber(value.vehiculoFueraVia, `vehiculoFueraVia de ${id}`),
    totalColisiones: optionalNumber(value.totalColisiones, `totalColisiones de ${id}`),
    totalInfracciones: optionalNumber(value.totalInfracciones, `totalInfracciones de ${id}`),
    tiempoTotal: optionalString(value.tiempoTotal, `tiempoTotal de ${id}`),
    distanciaTotal: optionalString(value.distanciaTotal, `distanciaTotal de ${id}`),
    ejercicios: parseExercises(value.ejercicios),
    simulacionesDetalle: parseNumberRecord(value.simulacionesDetalle, `simulacionesDetalle de ${id}`),
    nombresSimulaciones: parseStringRecord(value.nombresSimulaciones, `nombresSimulaciones de ${id}`),
    erroresFrecuentes: parseFrequentMistakes(value.erroresFrecuentes),
    instructor: optionalString(value.instructor, `instructor de ${id}`),
    observaciones: optionalString(value.observaciones, `observaciones de ${id}`),
    estado,
    clasificacion: optionalString(value.clasificacion, `clasificacion de ${id}`),
    creadoEn: optionalDate(value.creadoEn, `creadoEn de ${id}`),
    actualizadoEn: optionalDate(value.actualizadoEn, `actualizadoEn de ${id}`),
    createdAt: optionalDate(value.createdAt, `createdAt de ${id}`),
    updatedAt: optionalDate(value.updatedAt, `updatedAt de ${id}`),
    origen: 'TrackSIM-ZERO-V2',
    cursoCodigo: optionalString(value.cursoCodigo, `cursoCodigo de ${id}`),
    cursoNombre: optionalString(value.cursoNombre, `cursoNombre de ${id}`) || group.groupName,
    folioGrupo: optionalString(value.folioGrupo, `folioGrupo de ${id}`) || group.groupFolio,
    zeroGroupId: group.groupId,
    sourceEvaluationIds,
    sourceSchemaVersion,
    originalEmpresa: '',
    originalSede: '',
    fileName: `${group.groupName} — ${conductor}`
  };
}
