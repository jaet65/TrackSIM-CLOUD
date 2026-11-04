/**
 * Catálogo oficial de ejercicios de simulador y su descripción.
 */
export interface CatalogExercise {
  nombre: string;
  descripcion: string;
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  {
    nombre: 'Montaña',
    descripcion: 'Conducción en Montaña con enfoque al uso de frenos auxiliares y el correcto uso de los frenos de servicio en condiciones adversas. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Manejo técnico económico',
    descripcion: 'Conducción en Autopista con enfoque de manejo técnico económico. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Manejo defensivo',
    descripcion: 'Conducción en Ciudad con enfoque al manejo a la defensiva y seguridad vial. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Efectos del alcohol',
    descripcion: 'Sensibilización sobre los riesgos del manejo bajo los efectos de sustancias. #NoMásSustanciasAlVolante. (Se entrega retroalimentación al operador.) NO SE CONSIDERA PARA EVALUACIÓN FINAL'
  },
  {
    nombre: 'Enrampe',
    descripcion: 'Ejercicio de entrega en andenes bajo diferentes condiciones. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Maniobras Críticas',
    descripcion: 'En un entorno urbano, simulamos la conducción con un énfasis en ser vistos y escuchados durante maniobras repetitivas. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Sierra',
    descripcion: 'Conducción en Sierra con condiciones adversas, enfocada en técnicas de frenado en condiciones de baja tracción. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Niebla',
    descripcion: 'Conducción en pista con baja visibilidad debido a neblina densa. (Se entrega retroalimentación al operador.)'
  },
  {
    nombre: 'Reparto',
    descripcion: 'Reparto Urbano con enfoque de manejo técnico económico y seguridad vial con paradas continuas en diferentes ubicaciones. (Se entrega retroalimentación al operador.)'
  }
];

// Almacén mutable en memoria que combina los valores por defecto y los personalizados
let activeExerciseCatalog: CatalogExercise[] = [...EXERCISE_CATALOG];

export function getActiveCatalog(): CatalogExercise[] {
  return activeExerciseCatalog;
}

export function setActiveCatalog(exercises: CatalogExercise[]): void {
  activeExerciseCatalog = exercises;
}

export function normalizeExerciseName(str?: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function serializeCatalogCsv(exercises: CatalogExercise[]): string {
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ['nombre', 'descripcion'],
    ...exercises.map(({ nombre, descripcion }) => [nombre, descripcion])
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
}

export function parseCatalogCsv(content: string): CatalogExercise[] {
  const csvContent = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteClosed = false;

  for (let i = 0; i < csvContent.length; i++) {
    const character = csvContent[i];
    if (inQuotes) {
      if (character === '"' && csvContent[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        inQuotes = false;
        quoteClosed = true;
      } else {
        field += character;
      }
    } else if (quoteClosed && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error('El archivo CSV contiene comillas con formato inválido.');
    } else if (character === '"' && field.length === 0 && !quoteClosed) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
      quoteClosed = false;
    } else if (character === '\r' || character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      quoteClosed = false;
      if (character === '\r' && csvContent[i + 1] === '\n') i++;
    } else if (character === '"') {
      throw new Error('El archivo CSV contiene comillas con formato inválido.');
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error('El archivo CSV contiene comillas sin cerrar.');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((csvRow) => csvRow.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length < 2) {
    throw new Error('El CSV debe incluir encabezados y al menos un ejercicio.');
  }

  const headers = nonEmptyRows[0].map((header) => header.replace(/^\uFEFF/, '').trim().toLowerCase());
  const nameColumn = headers.indexOf('nombre');
  const descriptionColumn = headers.indexOf('descripcion');
  if (headers.length !== 2 || nameColumn < 0 || descriptionColumn < 0) {
    throw new Error('El CSV debe incluir las columnas "nombre" y "descripcion".');
  }

  const names = new Set<string>();
  return nonEmptyRows.slice(1).map((csvRow, index) => {
    if (csvRow.length !== headers.length) {
      throw new Error(`La fila ${index + 2} debe contener nombre y descripción.`);
    }

    const nombre = csvRow[nameColumn].trim();
    const descripcion = csvRow[descriptionColumn].trim();
    if (!nombre) {
      throw new Error(`El ejercicio de la fila ${index + 2} debe incluir un nombre.`);
    }

    const normalizedName = normalizeExerciseName(nombre);
    if (names.has(normalizedName)) {
      throw new Error(`El catálogo contiene nombres duplicados: "${nombre}".`);
    }
    names.add(normalizedName);
    return { nombre, descripcion };
  });
}

const LOCAL_STORAGE_KEY_EXERCISES = 'tracksim_custom_exercises';

/**
 * Carga los ejercicios personalizados de Firestore o localStorage si existen
 */
export function initializeActiveCatalog(customExercises?: CatalogExercise[]): CatalogExercise[] {
  if (customExercises && customExercises.length > 0) {
    activeExerciseCatalog = customExercises;
    return activeExerciseCatalog;
  }

  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_EXERCISES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeExerciseCatalog = parsed;
        return activeExerciseCatalog;
      }
    }
  } catch {
    // localStorage no disponible o JSON inválido
  }

  activeExerciseCatalog = [...EXERCISE_CATALOG];
  return activeExerciseCatalog;
}

/**
 * Guarda en localStorage como respaldo offline
 */
export function persistCatalogLocally(exercises: CatalogExercise[]): void {
  activeExerciseCatalog = exercises;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_EXERCISES, JSON.stringify(exercises));
  } catch {
    // almacenamiento no disponible
  }
}

/**
 * Busca un ejercicio del catálogo por nombre o aproximación
 */
export function findCatalogExercise(name?: string): CatalogExercise | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;

  // 1. Coincidencia exacta normalizada
  const exact = activeExerciseCatalog.find((e) => normalizeExerciseName(e.nombre) === key);
  if (exact) return exact;

  // 2. Coincidencia por contención (si el nombre del reporte contiene o es contenido por el catálogo)
  const partial = activeExerciseCatalog.find((e) => {
    const catKey = normalizeExerciseName(e.nombre);
    return key.includes(catKey) || catKey.includes(key);
  });

  return partial || null;
}
