export interface ExerciseItem {
  numero?: number;
  nombre: string;
  tiempo?: string;
  distancia?: string;
  colisiones?: number;
  infracciones?: number;
  calificacion?: number;
  score?: number;
  estado?: 'Realizado' | 'No Realizado' | string;
  noRealizado?: boolean;
  comentarios?: string;
  fecha?: string;
  modulo?: string;
  instructor?: string;
}

export interface FrequentMistakeItem {
  error: string;
  errorRaw?: string;
  repeticiones: number;
  severidad?: string;
  ejeId?: number | null;
  ejeNombre?: string;
  ejeShortName?: string;
  ejeIcono?: string;
}

export interface Evaluation {
  id: string;
  folio?: string;
  conductor?: string;
  operador?: string;
  empresa: string;
  sede?: string;
  ciudad?: string;
  fecha?: string;
  fechaReporte?: string;
  fechaCapacitacion?: string;
  fechaCapacitacionFormato?: string;
  tipoLicencia?: string;
  tipoEvaluacion?: string;
  evaluacionFinalPuntos?: number;
  calificacionExacta?: number;
  promedioScore?: number;
  habilidadesManejoPct?: number;
  habilidadesManejoPuntos?: number;
  practicaSimuladorPct?: number;
  practicaSimuladorPuntos?: number;
  destrezaPuntos?: number;
  destrezaMax?: number;
  ecoDrivingPuntos?: number;
  ecoDrivingMax?: number;
  colisiones?: number;
  accidentesCriticos?: number;
  fatalidades?: number;
  vehiculoFueraVia?: number;
  totalColisiones?: number;
  totalInfracciones?: number;
  tiempoTotal?: string;
  distanciaTotal?: string;
  ejercicios?: ExerciseItem[];
  simulacionesDetalle?: Record<string, number>;
  nombresSimulaciones?: Record<string | number, string>;
  erroresFrecuentes?: FrequentMistakeItem[];
  instructor?: string;
  observaciones?: string;
  estado?: 'Sobresaliente' | 'Aprobado' | 'Reforzar' | 'Requiere Refuerzo' | 'No Aprobado' | 'Pendiente' | string;
  clasificacion?: string;
  firmaDigital?: string;
  creadoEn?: any;
  actualizadoEn?: any;
  createdAt?: string;
  updatedAt?: string;
  origen?: string;
  cursoCodigo?: string;
  cursoNombre?: string;
  folioGrupo?: string;
}

export interface ParsedPdfEvaluation extends Omit<Evaluation, 'id'> {
  id?: string;
  filename?: string;
  empresaCompleta?: string;
  cursoCodigo?: string;
  cursoNombre?: string;
  folioGrupo?: string;
  habilidadesManejoMax?: number;
  practicaSimuladorMax?: number;
  evaluacionFinalMax?: number;
  evaluacionFinalPct?: number;
  badgeColor?: string;
}

export interface StagedEvaluation extends Omit<ParsedPdfEvaluation, 'id'> {
  id: string;
  originalEmpresa: string;
  originalSede: string;
  fileName: string;
}

export interface DriverConductor {
  nombre: string;
  empresa: string;
  totalEvaluaciones: number;
  ultimaFecha: string;
  ultimoScore: number;
  promedioScore: number;
  sede: string;
  colisiones?: number;
  fatalidades?: number;
  totalFueraVia?: number;
  estado?: string;
  badgeColor?: string;
  latestEvalId?: string;
  simulaciones?: Record<string, number>;
  simulacionesNombres?: Record<string | number, string>;
  ejercicios?: ExerciseItem[];
  promediosEjercicios?: Record<string, {
    nombre: string;
    numero?: number;
    promedio: number;
    totalVeces: number;
  }>;
}

export interface CompanySummary {
  nombre: string;
  slug: string;
  esGlobal?: boolean;
  totalEvaluaciones: number;
  totalConductores: number;
  promedioFinal: number;
  promedioHabilidades: number;
  promedioSimulador: number;
  tasaAprobacion: number;
  totalColisiones: number;
  totalFatalidades: number;
  totalFueraVia: number;
  sedes: string[];
  conductores: DriverConductor[];
  simulacionesPromedio: {
    simulacion_2: number;
    simulacion_3: number;
    simulacion_4: number;
  };
  nombresSimulaciones: Record<string | number, string>;
  historialAnual?: Record<string, any>;
}

export interface DriverSummary {
  nombre: string;
  slug: string;
  empresa: string;
  evaluaciones: Evaluation[];
  totalEvaluaciones: number;
  primeraCalificacion: number;
  ultimaCalificacion: number;
  promedioCalificacion: number;
  mejorCalificacion: number;
  peorCalificacion: number;
  promedioHabilidades: number;
  promedioSimulador: number;
  totalFatalidades: number;
  totalColisiones: number;
  totalFueraVia: number;
  cambioPorcentual: number;
  tendencia: 'mejora' | 'retroceso' | 'estable';
  estadoGeneral: string;
  badgeColor?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'admin' | 'viewer' | string;
  empresaPermitida?: string;
  empresasPermitidas?: string[];
  metodoAcceso?: string;
  creadoPor?: string;
  autoregistro?: boolean;
  dominioDetectado?: string;
  fechaAlta?: string;
}

export type TabType = 'dashboard' | 'evolucion' | 'empresas' | 'directorio' | 'ingesta' | 'usuarios';
