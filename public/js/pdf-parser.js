/**
 * TrackSIM CLOUD - PDF Parser Engine
 * Extrae y estructura automáticamente los datos de evaluaciones de operadores
 * desde reportes PDF generados por el simulador de autotransporte.
 */

// Helper para concatenar el contenido de texto manteniendo el orden y saltos de línea
export async function extractTextFromPDF(pdfDoc) {
  const pagesText = [];
  const numPages = pdfDoc.numPages;
  let page1Items = [];
  let page4Items = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    // Guardar items originales de la Página 1 y Página 4 para análisis posicional
    if (pageNum === 1) {
      page1Items = content.items || [];
    } else if (pageNum === 4) {
      page4Items = content.items || [];
    }

    // Agrupar items por línea basándose en la posición Y
    let lastY = null;
    let pageString = '';

    // Ordenar items de arriba hacia abajo y de izquierda a derecha
    const items = content.items.slice().sort((a, b) => {
      const diffY = b.transform[5] - a.transform[5];
      if (Math.abs(diffY) > 4) return diffY;
      return a.transform[4] - b.transform[4];
    });

    for (const item of items) {
      const currentY = item.transform[5];
      if (lastY !== null && Math.abs(currentY - lastY) > 5) {
        pageString += '\n';
      } else if (pageString.length > 0 && !pageString.endsWith('\n') && !pageString.endsWith(' ')) {
        pageString += ' ';
      }
      pageString += item.str;
      lastY = currentY;
    }

    pagesText.push(pageString);
  }

  // Adjuntar items crudos de las páginas 1 y 4 para el parser
  pagesText.page1Items = page1Items;
  pagesText.page4Items = page4Items;
  return pagesText;
}

/**
 * Catálogo de Estados de la República Mexicana para identificar la Sede de evaluación
 */
export const ESTADOS_MEXICO = [
  { regex: /(?:Estado\s+de\s+M[eé]xico|Edo\.?\s*de\s*M[eé]xico|Edomex)(?![a-záéíóúñ])/i, name: 'Estado de México' },
  { regex: /(?:Ciudad\s+de\s+M[eé]xico|CDMX|Distrito\s+Federal|D\.?F\.?)(?![a-záéíóúñ])/i, name: 'Ciudad de México' },
  { regex: /(?:Baja\s+California\s+Sur)(?![a-záéíóúñ])/i, name: 'Baja California Sur' },
  { regex: /(?:Baja\s+California)(?![a-záéíóúñ])/i, name: 'Baja California' },
  { regex: /(?:Nuevo\s+Le[oó]n)(?![a-záéíóúñ])/i, name: 'Nuevo León' },
  { regex: /(?:San\s+Luis\s+Potos[ií])(?![a-záéíóúñ])/i, name: 'San Luis Potosí' },
  { regex: /(?:Quintana\s+Roo)(?![a-záéíóúñ])/i, name: 'Quintana Roo' },
  { regex: /(?:Aguascalientes)(?![a-záéíóúñ])/i, name: 'Aguascalientes' },
  { regex: /(?:Campeche)(?![a-záéíóúñ])/i, name: 'Campeche' },
  { regex: /(?:Chiapas)(?![a-záéíóúñ])/i, name: 'Chiapas' },
  { regex: /(?:Chihuahua)(?![a-záéíóúñ])/i, name: 'Chihuahua' },
  { regex: /(?:Coahuila(?:\s+de\s+Zaragoza)?)(?![a-záéíóúñ])/i, name: 'Coahuila' },
  { regex: /(?:Colima)(?![a-záéíóúñ])/i, name: 'Colima' },
  { regex: /(?:Durango)(?![a-záéíóúñ])/i, name: 'Durango' },
  { regex: /(?:Guanajuato)(?![a-záéíóúñ])/i, name: 'Guanajuato' },
  { regex: /(?:Guerrero)(?![a-záéíóúñ])/i, name: 'Guerrero' },
  { regex: /(?:Hidalgo)(?![a-záéíóúñ])/i, name: 'Hidalgo' },
  { regex: /(?:Jalisco)(?![a-záéíóúñ])/i, name: 'Jalisco' },
  { regex: /(?:Michoac[aá]n(?:\s+de\s+Ocampo)?)(?![a-záéíóúñ])/i, name: 'Michoacán' },
  { regex: /(?:Morelos)(?![a-záéíóúñ])/i, name: 'Morelos' },
  { regex: /(?:Nayarit)(?![a-záéíóúñ])/i, name: 'Nayarit' },
  { regex: /(?:Oaxaca)(?![a-záéíóúñ])/i, name: 'Oaxaca' },
  { regex: /(?:Puebla)(?![a-záéíóúñ])/i, name: 'Puebla' },
  { regex: /(?:Quer[eé]taro)(?![a-záéíóúñ])/i, name: 'Querétaro' },
  { regex: /(?:Sinaloa)(?![a-záéíóúñ])/i, name: 'Sinaloa' },
  { regex: /(?:Sonora)(?![a-záéíóúñ])/i, name: 'Sonora' },
  { regex: /(?:Tabasco)(?![a-záéíóúñ])/i, name: 'Tabasco' },
  { regex: /(?:Tamaulipas)(?![a-záéíóúñ])/i, name: 'Tamaulipas' },
  { regex: /(?:Tlaxcala)(?![a-záéíóúñ])/i, name: 'Tlaxcala' },
  { regex: /(?:Veracruz(?:\s+de\s+Ignacio\s+de\s+la\s+Llave)?)(?![a-záéíóúñ])/i, name: 'Veracruz' },
  { regex: /(?:Yucat[aá]n)(?![a-záéíóúñ])/i, name: 'Yucatán' },
  { regex: /(?:Zacatecas)(?![a-záéíóúñ])/i, name: 'Zacatecas' }
];

/**
 * Separa de forma inteligente el nombre de la empresa y la sede (Estado de la República)
 */
export function parseEmpresaYSede(rawText) {
  if (!rawText) return { empresa: '', sede: '' };
  let text = rawText.trim();
  let detectedSede = '';

  for (const estado of ESTADOS_MEXICO) {
    if (estado.regex.test(text)) {
      detectedSede = estado.name;
      text = text.replace(estado.regex, '').trim();
      break;
    }
  }

  let cleanEmpresa = text.replace(/^[\s\-–—,]+|[\s\-–—,]+$/g, '').trim();
  cleanEmpresa = cleanEmpresa.replace(/\s+/g, ' ');

  return {
    empresa: cleanEmpresa || rawText.trim(),
    sede: detectedSede
  };
}

/**
 * Extrae con alta precisión los datos del encabezado tabular (Página 1)
 * analizando la posición cartesiana X,Y de cada celda del reporte de simulación.
 */
export function extractHeaderFromCoordinates(items) {
  if (!items || !items.length) return null;

  const cleanItems = items
    .filter(i => i.str && i.str.trim().length > 0)
    .map(i => ({
      text: i.str.trim(),
      raw: i.str,
      x: i.transform[4],
      y: i.transform[5]
    }));

  const empHdr = cleanItems.find(i => /^empresa$/i.test(i.text));
  const cursoHdr = cleanItems.find(i => /^curso$/i.test(i.text));
  const evalHdr = cleanItems.find(i => /evaluaci/i.test(i.text));
  const fechaHdr = cleanItems.find(i => /^fecha$/i.test(i.text));
  const condHdr = cleanItems.find(i => /^conductor$/i.test(i.text));
  const instHdr = cleanItems.find(i => /^instructor$/i.test(i.text));
  const grupoHdr = cleanItems.find(i => /^grupo$/i.test(i.text));

  const result = {};

  // 1. Empresa y Sede: elementos situados verticalmente entre Fecha y Empresa, en la columna izquierda
  if (empHdr && fechaHdr) {
    const maxX = cursoHdr ? cursoHdr.x - 2 : 130;
    const empItems = cleanItems.filter(i => i.y > fechaHdr.y && i.y < empHdr.y && i.x < maxX);
    empItems.sort((a, b) => b.y - a.y);
    const empName = empItems.map(i => i.text).join(' ').trim();
    if (empName) {
      result.empresaRaw = empName;
      const parsed = parseEmpresaYSede(empName);
      result.empresa = parsed.empresa;
      result.sede = parsed.sede;
    }
  }

  // 2. Curso Código: entre Fecha.Y y Curso.Y, en la columna central
  if (cursoHdr && fechaHdr) {
    const minX = cursoHdr.x - 5;
    const maxX = evalHdr ? evalHdr.x - 5 : 320;
    const cursoItems = cleanItems.filter(i => i.y > fechaHdr.y && i.y < cursoHdr.y && i.x >= minX && i.x < maxX);
    cursoItems.sort((a, b) => b.y - a.y);
    const cursoVal = cursoItems.map(i => i.text).join(' ').trim();
    if (cursoVal) {
      result.cursoCodigo = cursoVal;
    }
  }

  // 3. Curso Nombre / Evaluación: entre Fecha.Y y Evaluacion.Y, en la columna derecha
  if (evalHdr && fechaHdr) {
    const minX = evalHdr.x - 5;
    const evalItems = cleanItems.filter(i => i.y > fechaHdr.y && i.y < evalHdr.y && i.x >= minX);
    evalItems.sort((a, b) => b.y - a.y);
    const evalVal = evalItems.map(i => i.text).join(' ').trim();
    if (evalVal) {
      result.cursoNombre = evalVal;
    }
  }

  // 4. Fecha: debajo de Fecha.Y, en la columna izquierda
  if (fechaHdr) {
    const maxX = condHdr ? condHdr.x - 2 : 130;
    const fechaItems = cleanItems.filter(i => i.y < fechaHdr.y && i.y > (fechaHdr.y - 25) && i.x < maxX);
    fechaItems.sort((a, b) => b.y - a.y);
    const fechaVal = fechaItems.map(i => i.text).join(' ').trim();
    if (fechaVal) {
      result.fecha = fechaVal;
    }
  }

  // 5. Conductor: debajo de Fecha.Y, entre columna Conductor e Instructor
  if (condHdr && fechaHdr) {
    const minX = condHdr.x - 5;
    const maxX = instHdr ? instHdr.x - 5 : 320;
    const condItems = cleanItems.filter(i => i.y < fechaHdr.y && i.y > (fechaHdr.y - 25) && i.x >= minX && i.x < maxX);
    condItems.sort((a, b) => b.y - a.y);
    const condVal = condItems.map(i => i.text).join(' ').trim();
    if (condVal) {
      result.conductor = condVal;
    }
  }

  // 6. Instructor: debajo de Fecha.Y, entre Instructor y Grupo
  if (instHdr && fechaHdr) {
    const minX = instHdr.x - 5;
    const maxX = grupoHdr ? grupoHdr.x - 5 : 500;
    const instItems = cleanItems.filter(i => i.y < fechaHdr.y && i.y > (fechaHdr.y - 25) && i.x >= minX && i.x < maxX);
    instItems.sort((a, b) => b.y - a.y);
    const instVal = instItems.map(i => i.text).join(' ').trim();
    if (instVal) {
      result.instructor = instVal;
    }
  }

  return result;
}

/**
 * Extrae dinámicamente los ejercicios de simulador descritos en la Página 4
 * analizando la columna de nombres (X < 115) y la de descripciones (X >= 115).
 * Omite el ejercicio de 'Reconocimiento' según las especificaciones operativas.
 */
export function extractExercisesFromCoordinates(page4Items, p4Text = '') {
  if (!page4Items || !page4Items.length) {
    return extractExercisesFromTextFallback(p4Text);
  }

  const cleanItems = page4Items
    .filter(i => i.str && i.str.trim().length > 0)
    .map(i => ({
      text: i.str.trim(),
      raw: i.str,
      x: i.transform[4],
      y: i.transform[5]
    }));

  // Buscar el título de la sección de ejercicios
  const titleItem = cleanItems.find(i =>
    /ejercicios\s+de\s+simulador/i.test(i.text) ||
    /describen\s+a\s+continuacion/i.test(i.text)
  );
  const titleY = titleItem ? titleItem.y : 325;

  // Filtrar elementos de la tabla: debajo del título y arriba del pie de página (Y > 55)
  const tableItems = cleanItems.filter(i => i.y < titleY && i.y > 55);

  // Columna izquierda: Nombres (X < 115)
  // Columna derecha: Descripciones (X >= 115)
  const rawNameItems = tableItems.filter(i => i.x < 115);
  const descItems = tableItems.filter(i => i.x >= 115);

  // Agrupar nombres por líneas cercanas (diff Y <= 8) por si un nombre ocupa más de una línea o token
  rawNameItems.sort((a, b) => b.y - a.y);
  const nameGroups = [];
  for (const item of rawNameItems) {
    const existing = nameGroups.find(g => Math.abs(g.y - item.y) <= 8);
    if (existing) {
      existing.text += ' ' + item.text;
    } else {
      nameGroups.push({ text: item.text, y: item.y });
    }
  }

  nameGroups.sort((a, b) => b.y - a.y);

  // Filtrar y omitir "Reconocimiento"
  const candidateExercises = [];
  for (const g of nameGroups) {
    const cleanName = g.text.replace(/[.:]+$/, '').trim();
    if (/reconocimiento/i.test(cleanName)) {
      continue; // Omitir reconocimiento según requerimiento
    }
    candidateExercises.push({
      nombre: cleanName,
      y: g.y
    });
  }

  if (candidateExercises.length === 0) {
    return extractExercisesFromTextFallback(p4Text);
  }

  // Asociar descripciones según rango vertical Y
  const exercises = [];
  candidateExercises.forEach((cand, idx) => {
    const nextY = idx + 1 < candidateExercises.length ? candidateExercises[idx + 1].y : 55;
    const matchingDescs = descItems.filter(d => (d.y <= cand.y + 8) && (d.y > nextY + 8));
    matchingDescs.sort((a, b) => {
      const diffY = b.y - a.y;
      if (Math.abs(diffY) > 3) return diffY;
      return a.x - b.x;
    });

    const descText = matchingDescs.map(d => d.text).join(' ').trim();
    exercises.push({
      numero: idx + 2, // Simulación 2, Simulación 3, Simulación 4...
      nombre: cand.nombre,
      descripcion: descText,
      calificacion: null
    });
  });

  return exercises;
}

/**
 * Fallback de extracción de ejercicios por regex sobre el texto de la Página 4
 */
function extractExercisesFromTextFallback(p4Text = '') {
  if (!p4Text) {
    return [
      { numero: 2, nombre: 'Montaña', descripcion: 'Conducción en Montaña con enfoque al uso de frenos auxiliares.', calificacion: null },
      { numero: 3, nombre: 'Sierra', descripcion: 'Conducción en Sierra con condiciones adversas.', calificacion: null },
      { numero: 4, nombre: 'Simulación 4', descripcion: 'Práctica avanzada en condiciones críticas.', calificacion: null }
    ];
  }

  const exercises = [];
  const knownExercises = [
    { regex: /Monta[ñn]a[.:]?\s*([^\n\r]+)/i, name: 'Montaña' },
    { regex: /Sierra[.:]?\s*([^\n\r]+)/i, name: 'Sierra' },
    { regex: /Niebla[.:]?\s*([^\n\r]+)/i, name: 'Niebla' },
    { regex: /Maniobras\s+Cr[ií]ticas[.:]?\s*([^\n\r]+)/i, name: 'Maniobras Críticas' }
  ];

  let simIndex = 2;
  for (const item of knownExercises) {
    const m = p4Text.match(item.regex);
    if (m) {
      exercises.push({
        numero: simIndex++,
        nombre: item.name,
        descripcion: m[1].trim(),
        calificacion: null
      });
    }
  }

  if (exercises.length === 0) {
    return [
      { numero: 2, nombre: 'Montaña', descripcion: 'Conducción en Montaña con enfoque al uso de frenos auxiliares.', calificacion: null },
      { numero: 3, nombre: 'Sierra', descripcion: 'Conducción en Sierra con condiciones adversas.', calificacion: null },
      { numero: 4, nombre: 'Simulación 4', descripcion: 'Práctica avanzada en condiciones críticas.', calificacion: null }
    ];
  }

  return exercises;
}

/**
 * Parsea el texto extraído de las páginas del PDF y genera el objeto de evaluación
 */
export function parseEvaluationData(pagesText, filename = '', rawPage1Items = null, rawPage4Items = null) {
  const p1 = pagesText[0] || '';
  const p4 = pagesText[3] || '';
  const p5 = pagesText[pagesText.length - 1] || ''; // Última página (usualmente página 5)
  const fullText = pagesText.join('\n=== PAGINA ===\n');

  // Intentar extracción de encabezado y ejercicios con coordenadas espaciales
  const page1Items = rawPage1Items || pagesText.page1Items || null;
  const page4Items = rawPage4Items || pagesText.page4Items || null;
  const headerMeta = page1Items ? extractHeaderFromCoordinates(page1Items) : null;

  const data = {
    id: '',
    filename: filename,
    empresa: '',
    sede: '',
    empresaCompleta: '',
    cursoCodigo: '',
    cursoNombre: '',
    conductor: '',
    instructor: '',
    folioGrupo: '',
    fechaCapacitacion: '',
    fechaCapacitacionFormato: '',
    fechaReporte: '',
    habilidadesManejoPuntos: 0,
    habilidadesManejoMax: 3.0,
    habilidadesManejoPct: 0,
    practicaSimuladorPuntos: 0,
    practicaSimuladorMax: 7.0,
    practicaSimuladorPct: 0,
    evaluacionFinalPuntos: 0,
    evaluacionFinalMax: 10.0,
    evaluacionFinalPct: 0,
    calificacionExacta: 0,
    simulacionesDetalle: {
      simulacion_2: 0,
      simulacion_3: 0,
      simulacion_4: 0
    },
    ejercicios: [],
    nombresSimulaciones: {},
    fatalidades: 0,
    vehiculoFueraVia: 0,
    colisiones: 0,
    firmaDigital: '',
    estado: 'Requiere Refuerzo',
    badgeColor: 'warning',
    observaciones: '',
    createdAt: new Date().toISOString()
  };

  // 1. Conductor (Página 5 tiene "Conductor: Nombre Apellido", o encabezado P1)
  const mConductorP5 = p5.match(/Conductor:\s*([^\n\r]+)/i);
  if (mConductorP5 && mConductorP5[1].trim()) {
    data.conductor = mConductorP5[1].trim();
  } else if (headerMeta && headerMeta.conductor) {
    data.conductor = headerMeta.conductor;
  } else {
    // Buscar en el nombre de archivo ej: "Adrián Godínez Franco - ..."
    const mFilename = filename.match(/^([^-]+)\s*-\s*/);
    if (mFilename) {
      data.conductor = mFilename[1].trim();
    }
  }

  // 2. Empresa y Sede (El estado de la república representa la sede donde se aplicó la evaluación)
  let rawEmpresa = '';
  if (headerMeta && (headerMeta.empresaRaw || headerMeta.empresa)) {
    rawEmpresa = headerMeta.empresaRaw || headerMeta.empresa;
  }

  if (!rawEmpresa) {
    // Fallback 1: Buscar texto entre "Empresa" y "Fecha" en la página 1
    const fechaIdx = p1.search(/\bFecha\b/i);
    const p1Head = fechaIdx !== -1 ? p1.substring(0, fechaIdx) : p1.substring(0, 450);
    const mEmp = p1Head.match(/Empresa[^\n]*\n+([\s\S]*?)(?=\n\s*(?:CUR-|Fecha|Curso))/i);
    if (mEmp && mEmp[1].trim()) {
      let candidate = mEmp[1].replace(/CUR-[A-Z0-9\-]+/gi, '').replace(/Curso avanzado[^\n]*/gi, '').trim();
      candidate = candidate.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (candidate.length > 2) {
        rawEmpresa = candidate;
      }
    }
  }

  if (!rawEmpresa) {
    // Fallback 2: Buscar en el nombre del archivo (ej. "... - Jarritos-EDOMEX - CUR-RIG-3C .pdf")
    const mFileEmp = filename.match(/^[^-]+-\s*(.*?)\s*-\s*CUR/i) || filename.match(/-\s*([^-]+?)\s*-\s*CUR/i);
    if (mFileEmp && mFileEmp[1].trim()) {
      rawEmpresa = mFileEmp[1].trim();
    }
  }

  // Separar Empresa y Sede
  const parsedEmp = parseEmpresaYSede(rawEmpresa);
  data.empresa = parsedEmp.empresa || rawEmpresa;
  data.sede = parsedEmp.sede || (headerMeta?.sede || '');
  data.empresaCompleta = rawEmpresa;

  // 3. Curso Código y Nombre
  if (headerMeta && headerMeta.cursoCodigo) {
    data.cursoCodigo = headerMeta.cursoCodigo;
  } else {
    const mCursoCod = p5.match(/Curso:\s*([A-Z0-9\-]+)/i) || p1.match(/(CUR-[A-Z0-9\-]+)/i);
    if (mCursoCod) {
      data.cursoCodigo = mCursoCod[1].trim();
    }
  }

  if (headerMeta && headerMeta.cursoNombre) {
    data.cursoNombre = headerMeta.cursoNombre;
  } else {
    data.cursoNombre = 'Curso avanzado para operadores(as) de unidades rígidas y articuladas';
  }

  // 4. Fechas
  // Fecha Reporte (Página 5)
  const mFechaRep = p5.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (mFechaRep) {
    data.fechaReporte = mFechaRep[1];
  }

  // Fecha Capacitación (Encabezado Página 1)
  if (headerMeta && headerMeta.fecha) {
    data.fechaCapacitacionFormato = headerMeta.fecha;
    const parts = headerMeta.fecha.split('/');
    if (parts.length === 3) {
      data.fechaCapacitacion = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  } else {
    const mFechaCap = p1.match(/Fecha\s+Conductor[^\n]*\n(\d{2}\/\d{2}\/\d{4})/i) ||
      p1.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (mFechaCap) {
      data.fechaCapacitacionFormato = mFechaCap[1];
      const parts = mFechaCap[1].split('/');
      if (parts.length === 3) {
        data.fechaCapacitacion = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    } else if (data.fechaReporte) {
      data.fechaCapacitacionFormato = data.fechaReporte;
      const parts = data.fechaReporte.split('/');
      data.fechaCapacitacion = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  // 5. Instructor y Folio
  if (headerMeta && headerMeta.instructor) {
    data.instructor = headerMeta.instructor;
  } else if (/Mario\s+Agraz/i.test(fullText)) {
    data.instructor = 'Mario Agraz';
  }
  const mFolio = p1.match(/AUTOTRANSPORTE DE CARGA\s*\n(\d+)/i) || p5.match(/AUTOTRANSPORTE DE CARGA\s*\n(\d+)/i);
  if (mFolio) {
    data.folioGrupo = mFolio[1].trim();
  }

  // 6. Calificaciones de la Tabla Resumen (Página 5)
  // Formato: Habilidades de manejo (Valor 3 ptos) 1.96 65.36
  const mHab = p5.match(/Habilidades de manejo[^\n\r]*?\)\s*([0-9.]+)\s+([0-9.]+)/i);
  if (mHab) {
    data.habilidadesManejoPuntos = parseFloat(mHab[1]);
    data.habilidadesManejoPct = parseFloat(mHab[2]);
  }

  // Formato: Práctica de simulador* (Valor 7 ptos) 3.06 43.72
  const mSim = p5.match(/Práctica de simulador[^\n\r]*?\)\s*([0-9.]+)\s+([0-9.]+)/i);
  if (mSim) {
    data.practicaSimuladorPuntos = parseFloat(mSim[1]);
    data.practicaSimuladorPct = parseFloat(mSim[2]);
  }

  // Formato: Evaluación Final (a+b)= 5.02 50.21
  const mEval = p5.match(/Evaluación Final[^\n\r]*?=\s*([0-9.]+)\s+([0-9.]+)/i);
  if (mEval) {
    data.evaluacionFinalPuntos = parseFloat(mEval[1]);
    data.evaluacionFinalPct = parseFloat(mEval[2]);
  }

  // Calificación exacta
  const mCalExact = p5.match(/Calificación:\s*([0-9.]+)/i);
  if (mCalExact) {
    data.calificacionExacta = parseFloat(parseFloat(mCalExact[1]).toFixed(4));
    if (!data.evaluacionFinalPuntos) {
      data.evaluacionFinalPuntos = parseFloat(data.calificacionExacta.toFixed(2));
      data.evaluacionFinalPct = parseFloat((data.calificacionExacta * 10).toFixed(2));
    }
  }

  // 7. Firma Digital
  const mFirma = p5.match(/Firma Digital:\s*([a-f0-9]{32,64})/i);
  if (mFirma) {
    data.firmaDigital = mFirma[1].toLowerCase().trim();
    data.id = `eval_${data.firmaDigital.substring(0, 16)}`;
  } else {
    // Generar un ID único basado en conductor y fecha
    const slug = (data.conductor || 'eval').replace(/\s+/g, '_').toLowerCase();
    data.id = `eval_${slug}_${Date.now()}`;
    data.firmaDigital = Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2);
  }

  // 8. Incidentes y Fatalidades
  const mFat = p5.match(/FATALIDADES DURANTE LAS SIMULACIONES:\s*(\d+)/i);
  if (mFat) data.fatalidades = parseInt(mFat[1], 10);

  const mVia = p5.match(/VEHICULO FUERA DE LA VIA:\s*(\d+)/i);
  if (mVia) data.vehiculoFueraVia = parseInt(mVia[1], 10);

  const mCol = p5.match(/COLISIONES DURANTE LA CONDUCCIÓN:\s*(\d+)/i);
  if (mCol) data.colisiones = parseInt(mCol[1], 10);

  // 9. Desglose de Calificaciones de Simulaciones (Simulación 2, 3, 4...)
  // Ubicadas en la gráfica horizontal 'Calificaciones de simulaciones' (Página 5)
  const simRegex = /Simulaci[oó\u00f3\ufffd]n\s*(\d+)[.:,\s]+([0-9]+(?:\.[0-9]+)?)/gi;
  const searchSource = p5 && /Simulaci/i.test(p5) ? p5 : fullText;
  const simMatches = searchSource.matchAll(simRegex);
  for (const match of simMatches) {
    const num = match[1];
    const score = parseFloat(match[2]);
    if (!isNaN(score)) {
      data.simulacionesDetalle[`simulacion_${num}`] = score;
    }
  }

  // 10. Ejercicios Dinámicos de Simulador (Página 4 - Omitiendo Reconocimiento)
  const ejercicios = extractExercisesFromCoordinates(page4Items, p4);
  ejercicios.forEach(e => {
    const key = `simulacion_${e.numero}`;
    if (data.simulacionesDetalle[key] != null) {
      e.calificacion = data.simulacionesDetalle[key];
    }
  });

  data.ejercicios = ejercicios;
  data.nombresSimulaciones = {};
  ejercicios.forEach(e => {
    data.nombresSimulaciones[e.numero] = e.nombre;
  });

  // 11. Estado y Observaciones
  const score = data.evaluacionFinalPuntos || data.calificacionExacta || 0;
  if (score >= 8.0) {
    data.estado = 'Sobresaliente';
    data.badgeColor = 'success';
    data.observaciones = 'Operador demuestra alto dominio del vehículo en simulador y conocimientos de seguridad vial.';
  } else if (score >= 6.0) {
    data.estado = 'Aprobado';
    data.badgeColor = 'info';
    data.observaciones = 'Aprobado satisfactoriamente. Mantener buenas prácticas y monitorear hábitos de frenado.';
  } else if (score >= 5.0) {
    data.estado = 'Requiere Refuerzo';
    data.badgeColor = 'warning';
    data.observaciones = 'Requiere sesión de refuerzo en simulador para corregir errores críticos y disminuir colisiones.';
  } else {
    data.estado = 'No Aprobado';
    data.badgeColor = 'danger';
    data.observaciones = 'No aprobado. Presenta incidencias graves durante las simulaciones. Se recomienda curso intensivo.';
  }

  return data;
}

/**
 * Función principal para procesar un archivo PDF completo (File o ArrayBuffer)
 */
export async function parsePDFFile(fileOrBuffer, filename = '') {
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error('La librería PDF.js no se ha cargado en el navegador.');
  }

  let arrayBuffer;
  let name = filename;

  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if (fileOrBuffer instanceof Blob || fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
    name = filename || fileOrBuffer.name;
  } else {
    throw new Error('Tipo de archivo no soportado para análisis.');
  }

  // Cargar documento en PDF.js
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  // Extraer texto
  const pagesText = await extractTextFromPDF(pdfDoc);

  // Parsear campos
  const parsedData = parseEvaluationData(pagesText, name, pagesText.page1Items, pagesText.page4Items);
  return parsedData;
}

