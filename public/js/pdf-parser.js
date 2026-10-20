/**
 * TrackSIM CLOUD - PDF Parser Engine
 * Extrae y estructura automáticamente los datos de evaluaciones de operadores
 * desde reportes PDF generados por el simulador de autotransporte.
 */

// Helper para concatenar el contenido de texto manteniendo el orden y saltos de línea
export async function extractTextFromPDF(pdfDoc) {
  const pagesText = [];
  const numPages = pdfDoc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

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

  return pagesText;
}

/**
 * Parsea el texto extraído de las páginas del PDF y genera el objeto de evaluación
 */
export function parseEvaluationData(pagesText, filename = '') {
  const p1 = pagesText[0] || '';
  const p5 = pagesText[pagesText.length - 1] || ''; // Última página (usualmente página 5)
  const fullText = pagesText.join('\n=== PAGINA ===\n');

  const data = {
    id: '',
    filename: filename,
    empresa: '',
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
    fatalidades: 0,
    vehiculoFueraVia: 0,
    colisiones: 0,
    firmaDigital: '',
    estado: 'Requiere Refuerzo',
    badgeColor: 'warning',
    observaciones: '',
    createdAt: new Date().toISOString()
  };

  // 1. Conductor (Página 5 tiene "Conductor: Nombre Apellido")
  const mConductorP5 = p5.match(/Conductor:\s*([^\n\r]+)/i);
  if (mConductorP5 && mConductorP5[1].trim()) {
    data.conductor = mConductorP5[1].trim();
  } else {
    // Buscar en el nombre de archivo ej: "Adrián Godínez Franco - ..."
    const mFilename = filename.match(/^([^-]+)\s*-\s*/);
    if (mFilename) {
      data.conductor = mFilename[1].trim();
    }
  }

  // 2. Empresa
  const mEmpresa = fullText.match(/Empresa\s+Curso\s*\n(.*?)(?=\s+[A-Z0-9\-]+\s*\nFecha)/s);
  if (mEmpresa && mEmpresa[1].trim()) {
    data.empresa = mEmpresa[1].replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  } else if (/Autolineas/i.test(fullText)) {
    data.empresa = '';
  }

  // 3. Curso
  const mCursoCod = p5.match(/Curso:\s*([A-Z0-9\-]+)/i) || p1.match(/(CUR-[A-Z0-9\-]+)/i);
  if (mCursoCod) {
    data.cursoCodigo = mCursoCod[1].trim();
  }

  // 4. Fechas
  // Fecha Reporte (Página 5)
  const mFechaRep = p5.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (mFechaRep) {
    data.fechaReporte = mFechaRep[1];
  }

  // Fecha Capacitación (Página 1 encabezado)
  const mFechaCap = p1.match(/Fecha\s+Conductor[^\n]*\n(\d{2}\/\d{2}\/\d{4})/i) ||
    p1.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (mFechaCap) {
    data.fechaCapacitacionFormato = mFechaCap[1];
    // Convertir DD/MM/YYYY a YYYY-MM-DD para ordenamiento nativo
    const parts = mFechaCap[1].split('/');
    if (parts.length === 3) {
      data.fechaCapacitacion = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  } else if (data.fechaReporte) {
    data.fechaCapacitacionFormato = data.fechaReporte;
    const parts = data.fechaReporte.split('/');
    data.fechaCapacitacion = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // 5. Instructor y Folio
  if (/Mario\s+Agraz/i.test(fullText)) {
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

  // 9. Desglose de Simulaciones (2, 3, 4)
  const simMatches = p5.matchAll(/Simulación\s*(\d+)\.,?\s*([0-9.]+)/gi);
  for (const match of simMatches) {
    const num = match[1];
    const score = parseFloat(match[2]);
    data.simulacionesDetalle[`simulacion_${num}`] = score;
  }

  // 10. Estado y Observaciones
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
  const parsedData = parseEvaluationData(pagesText, name);
  return parsedData;
}
