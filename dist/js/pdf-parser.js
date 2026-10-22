/**
 * TrackSIM CLOUD - PDF Parser Engine
 * Extrae y estructura automáticamente los datos de evaluaciones de operadores
 * desde reportes PDF generados por el simulador de autotransporte.
 */
import { findCatalogMistake, getDimensionById } from './mistake-catalog.js';

// Helper para concatenar el contenido de texto manteniendo el orden y saltos de línea
export async function extractTextFromPDF(pdfDoc) {
  const pagesText = [];
  const numPages = pdfDoc.numPages;
  const allPagesItems = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const rawItems = content.items || [];
    allPagesItems.push(rawItems);

    // Agrupar items por línea basándose en la posición Y
    let lastY = null;
    let pageString = '';

    // Ordenar items de arriba hacia abajo y de izquierda a derecha
    const items = rawItems.slice().sort((a, b) => {
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
      pageString += (item.str || '').normalize('NFC');
      lastY = currentY;
    }

    pagesText.push(pageString);
  }

  // Obtener operator list de la última página para análisis gráfico de barras si no hay texto
  let page5OpList = null;
  try {
    const lastPage = await pdfDoc.getPage(numPages);
    page5OpList = await lastPage.getOperatorList();
  } catch (err) {
    console.warn('No se pudo obtener operatorList de la última página:', err);
  }

  // Adjuntar items crudos para análisis posicional de coordenadas
  pagesText.allPagesItems = allPagesItems;
  pagesText.page1Items = allPagesItems[0] || [];
  pagesText.page4Items = allPagesItems[3] || [];
  pagesText.page5Items = allPagesItems[allPagesItems.length - 1] || [];
  pagesText.page5OpList = page5OpList;
  return pagesText;
}

/**
 * Catálogo de Ciudades y Estados de la República Mexicana para identificar la Sede de evaluación
 * Se priorizan las CIUDADES primero para que expresiones como "Irapuato" o "Morelia" no se pierdan.
 */
export const SEDES_MEXICO = [
  // Ciudades principales y corredores logísticos de transporte
  { regex: /(?:Irapuato)(?![a-záéíóúñ])/i, name: 'Irapuato' },
  { regex: /(?:Morelia)(?![a-záéíóúñ])/i, name: 'Morelia' },
  { regex: /(?:Celaya)(?![a-záéíóúñ])/i, name: 'Celaya' },
  { regex: /(?:Le[oó]n)(?![a-záéíóúñ])/i, name: 'León' },
  { regex: /(?:Salamanca)(?![a-záéíóúñ])/i, name: 'Salamanca' },
  { regex: /(?:Silao)(?![a-záéíóúñ])/i, name: 'Silao' },
  { regex: /(?:Guadalajara|GDL|Zapopan|Tlaquepaque|Tonal[aá])(?![a-záéíóúñ])/i, name: 'Guadalajara' },
  { regex: /(?:Monterrey|MTY|Apodaca|San\s+Nicol[aá]s|Guadalupe\s+NL|Santa\s+Catarina)(?![a-záéíóúñ])/i, name: 'Monterrey' },
  { regex: /(?:Toluca|Metepec)(?![a-záéíóúñ])/i, name: 'Toluca' },
  { regex: /(?:Tlalnepantla|Naucalpan|Cuautitl[aá]n(?:\s+Izcalli)?|Tultitl[aá]n|Tepotzotl[aá]n|Ecatepec)(?![a-záéíóúñ])/i, name: 'Estado de México' },
  { regex: /(?:Puebla|Tehuac[aá]n)(?![a-záéíóúñ])/i, name: 'Puebla' },
  { regex: /(?:Quer[eé]taro|San\s+Juan\s+del\s+R[ií]o)(?![a-záéíóúñ])/i, name: 'Querétaro' },
  { regex: /(?:San\s+Luis\s+Potos[ií]|SLP)(?![a-záéíóúñ])/i, name: 'San Luis Potosí' },
  { regex: /(?:Aguascalientes)(?![a-záéíóúñ])/i, name: 'Aguascalientes' },
  { regex: /(?:Hermosillo|Nogales|Ciudad\s+Obreg[oó]n)(?![a-záéíóúñ])/i, name: 'Hermosillo' },
  { regex: /(?:Tijuana|Mexicali|Ensenada)(?![a-záéíóúñ])/i, name: 'Tijuana' },
  { regex: /(?:Ciudad\s+Ju[aá]rez|Chihuahua)(?![a-záéíóúñ])/i, name: 'Ciudad Juárez' },
  { regex: /(?:Torre[oó]n|Saltillo|Monclova)(?![a-záéíóúñ])/i, name: 'Torreón' },
  { regex: /(?:Veracruz|C[oó]rdoba|Orizaba|Coatzacoalcos|Xalapa|Poza\s+Rica)(?![a-záéíóúñ])/i, name: 'Veracruz' },
  { regex: /(?:M[eé]rida)(?![a-záéíóúñ])/i, name: 'Mérida' },
  { regex: /(?:Canc[uú]n|Playa\s+del\s+Carmen|Chetumal)(?![a-záéíóúñ])/i, name: 'Cancún' },
  { regex: /(?:Villahermosa)(?![a-záéíóúñ])/i, name: 'Villahermosa' },
  { regex: /(?:Tuxtla(?:\s+Guti[eé]rrez)?|Tapachula)(?![a-záéíóúñ])/i, name: 'Tuxtla Gutiérrez' },
  { regex: /(?:Acapulco|Chilpancingo)(?![a-záéíóúñ])/i, name: 'Acapulco' },
  { regex: /(?:Cuernavaca)(?![a-záéíóúñ])/i, name: 'Cuernavaca' },
  { regex: /(?:Pachuca|Tula)(?![a-záéíóúñ])/i, name: 'Pachuca' },
  { regex: /(?:Culiac[aá]n|Mazatl[aá]n|Los\s+Mochis)(?![a-záéíóúñ])/i, name: 'Culiacán' },
  { regex: /(?:Tepic)(?![a-záéíóúñ])/i, name: 'Tepic' },
  { regex: /(?:Colima|Manzanillo)(?![a-záéíóúñ])/i, name: 'Colima' },
  { regex: /(?:Durango|G[oó]mez\s+Palacio)(?![a-záéíóúñ])/i, name: 'Durango' },
  { regex: /(?:Zacatecas|Fresnillo)(?![a-záéíóúñ])/i, name: 'Zacatecas' },
  { regex: /(?:Reynosa|Matamoros|Nuevo\s+Laredo|Tampico)(?![a-záéíóúñ])/i, name: 'Nuevo Laredo' },
  { regex: /(?:Uruapan|L[aá]zaro\s+C[aá]rdenas|Zamora)(?![a-záéíóúñ])/i, name: 'Michoacán' },

  // Estados de la República (para casos donde solo se indique la entidad federativa)
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

export const ESTADOS_MEXICO = SEDES_MEXICO;
export const NOMBRES_SEDES_MEXICO = Array.from(new Set(SEDES_MEXICO.map(e => e.name))).sort((a, b) => a.localeCompare(b));
export const NOMBRES_ESTADOS_MEXICO = NOMBRES_SEDES_MEXICO;

/**
 * Separa de forma inteligente el nombre de la empresa y la sede (Ciudad o Estado)
 */
export function parseEmpresaYSede(rawText) {
  if (!rawText) return { empresa: '', sede: '' };
  let text = rawText.trim();
  let detectedSede = '';

  for (const item of SEDES_MEXICO) {
    if (item.regex.test(text)) {
      detectedSede = item.name;
      text = text.replace(item.regex, '').trim();
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
 * Extrae dinámicamente los ejercicios de simulador descritos en la Página 4 (u otra página)
 * analizando la columna de nombres (X < 115) y la de descripciones (X >= 115).
 * Omite el ejercicio de 'Reconocimiento' según las especificaciones operativas.
 */
export function extractExercisesFromCoordinates(page4Items, p4Text = '', allPagesItems = [], fullText = '') {
  // 1. Buscar si alguna página contiene la tabla formal de ejercicios
  let foundTable = null;

  const checkItemsForTable = (items) => {
    if (!items || !items.length) return null;
    const clean = items.filter(i => i.str && i.str.trim().length > 0);
    const title = clean.find(i =>
      /ejercicios\s+de\s+simulador/i.test(i.str) ||
      /describen\s+a\s+continuaci[oó]n/i.test(i.str)
    );
    return title ? { titleY: title.transform[5], clean } : null;
  };

  // Verificar primero en page4Items
  foundTable = checkItemsForTable(page4Items);

  // Si no está en page4Items, buscar en todas las páginas disponibles
  if (!foundTable && allPagesItems && allPagesItems.length) {
    for (const pItems of allPagesItems) {
      foundTable = checkItemsForTable(pItems);
      if (foundTable) break;
    }
  }

  // Si se encontró el título formal de ejercicios, extraer por coordenadas de columnas
  if (foundTable) {
    const { titleY, clean } = foundTable;
    const cleanItems = clean.map(i => ({
      text: i.str.trim(),
      raw: i.str,
      x: i.transform[4],
      y: i.transform[5]
    }));

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
        continue;
      }
      candidateExercises.push({
        nombre: cleanName,
        y: g.y
      });
    }

    if (candidateExercises.length > 0) {
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
  }

  // 2. Si NO hay tabla formal en ninguna página, usar fallback textual o predeterminado
  return extractExercisesFromTextFallback(fullText || p4Text);
}

/**
 * Fallback de extracción de ejercicios por regex sobre el texto del reporte
 */
function extractExercisesFromTextFallback(text = '') {
  const normText = (text || '').normalize('NFC');
  const knownExercises = [
    { regex: /Monta[ñn]a[.:]?\s*([^\n\r]+)/i, name: 'Montaña' },
    { regex: /Sierra[.:]?\s*([^\n\r]+)/i, name: 'Sierra' },
    { regex: /Niebla[.:]?\s*([^\n\r]+)/i, name: 'Niebla' },
    { regex: /Maniobras\s+Cr[ií]ticas[.:]?\s*([^\n\r]+)/i, name: 'Maniobras Críticas' }
  ];

  const matched = [];
  let simIndex = 2;
  for (const item of knownExercises) {
    const m = normText.match(item.regex);
    if (m) {
      matched.push({
        numero: simIndex++,
        nombre: item.name,
        descripcion: m[1].trim(),
        calificacion: null
      });
    }
  }

  if (matched.length > 0) {
    return matched;
  }

  // Si no se mencionan nombres específicos, definir limpiamente las simulaciones evaluadas
  return [
    { numero: 2, nombre: 'Simulación 2', descripcion: 'Práctica evaluada de conducción en simulador (Simulación 2).', calificacion: null },
    { numero: 3, nombre: 'Simulación 3', descripcion: 'Práctica evaluada de conducción en simulador (Simulación 3).', calificacion: null },
    { numero: 4, nombre: 'Simulación 4', descripcion: 'Práctica evaluada de conducción en simulador (Simulación 4).', calificacion: null }
  ];
}

/**
 * Extrae las calificaciones individuales de simulaciones (s2, s3, s4...)
 * soportando múltiples formatos visuales, espaciales y de puntuación.
 */
export function extractSimulationsFromItems(page5Items, allPagesItems = [], p5Text = '', fullText = '', opList = null) {
  const result = {
    simulacion_2: null,
    simulacion_3: null,
    simulacion_4: null
  };

  const processItemsList = (items) => {
    if (!items || !items.length) return;
    const cleanItems = items
      .filter(i => i.str && i.str.trim().length > 0)
      .map(i => ({
        str: i.str.normalize('NFC').trim(),
        x: i.transform ? i.transform[4] : 0,
        y: i.transform ? i.transform[5] : 0
      }));

    for (const item of cleanItems) {
      // Caso A: Todo en el mismo item, ej: "Simulación 2: 8.63", "Simulación 2., 6.86", "SIMULACIÓN 2: 8.63", "Simulación 2 - 8.63"
      const mCombined = item.str.match(/(?:Simulaci[oó]n|Sim\.?|S)\s*(\d+)[\s.:,\-—–=]+([0-9]+(?:[.,][0-9]+)?)/i);
      if (mCombined) {
        const num = parseInt(mCombined[1], 10);
        const score = parseFloat(mCombined[2].replace(',', '.'));
        if (!isNaN(score) && score >= 0 && score <= 10) {
          const key = `simulacion_${num}`;
          if (result[key] == null) result[key] = score;
        }
      }

      // Caso B: "Simulación X" en un item y el número al lado en la misma fila horizontal
      const mLabel = item.str.match(/(?:Simulaci[oó]n|Sim\.?|S)\s*(\d+)[:.\s\-—–=]*$/i);
      if (mLabel) {
        const num = parseInt(mLabel[1], 10);
        const key = `simulacion_${num}`;
        if (result[key] == null) {
          const nearby = cleanItems.filter(other =>
            other !== item &&
            Math.abs(other.y - item.y) <= 14 &&
            other.x >= item.x - 5 &&
            /^[0-9]+(?:[.,][0-9]+)?$/.test(other.str)
          );
          if (nearby.length > 0) {
            nearby.sort((a, b) => Math.abs(a.x - item.x) - Math.abs(b.x - item.x));
            const score = parseFloat(nearby[0].str.replace(',', '.'));
            if (!isNaN(score) && score >= 0 && score <= 10) {
              result[key] = score;
            }
          }
        }
      }
    }
  };

  // 1. Procesar items de la Página 5 (donde se ubica la gráfica 'Calificaciones de simulaciones')
  processItemsList(page5Items);

  // 2. Buscar mediante regex exclusivamente sobre el texto de la Página 5 (donde reside la gráfica)
  if ((result.simulacion_2 == null || result.simulacion_3 == null || result.simulacion_4 == null) && p5Text) {
    const normalizedP5 = p5Text.normalize('NFC');
    const simRegex = /(?:Simulaci[oó]n|Sim\.?)\s*(\d+)[\s.:,\-—–=]+([0-9]+(?:[.,][0-9]+)?)/gi;
    const matches = normalizedP5.matchAll(simRegex);
    for (const match of matches) {
      const num = parseInt(match[1], 10);
      const key = `simulacion_${num}`;
      if (result[key] == null) {
        const score = parseFloat(match[2].replace(',', '.'));
        if (!isNaN(score) && score >= 0 && score <= 10) {
          result[key] = score;
        }
      }
    }
  }

  // 3. Fallback gráfico de alta precisión: Si las barras horizontales fueron exportadas como imágenes sin capa de texto
  if (result.simulacion_2 == null || result.simulacion_3 == null || result.simulacion_4 == null) {
    const fromOp = extractSimulationsFromOperatorList(opList, page5Items);
    if (fromOp) {
      if (result.simulacion_2 == null && fromOp.simulacion_2 != null) result.simulacion_2 = fromOp.simulacion_2;
      if (result.simulacion_3 == null && fromOp.simulacion_3 != null) result.simulacion_3 = fromOp.simulacion_3;
      if (result.simulacion_4 == null && fromOp.simulacion_4 != null) result.simulacion_4 = fromOp.simulacion_4;
    }
  }

  // 4. Último recurso: revisar items de otras páginas solo si aún no se detectó nada
  if (result.simulacion_2 == null || result.simulacion_3 == null || result.simulacion_4 == null) {
    if (allPagesItems && allPagesItems.length) {
      for (const pItems of allPagesItems) {
        if (pItems !== page5Items) {
          processItemsList(pItems);
        }
      }
    }
  }

  return result;
}

/**
 * Extrae las calificaciones de simulación calculando la longitud proporcional de las barras
 * cuando el simulador exportó la gráfica como imágenes/trazados sin texto seleccionable.
 */
export function extractSimulationsFromOperatorList(opList, _contentItems = []) {
  if (!opList || !opList.fnArray) return null;

  const pdfjs = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : null;
  const OPS = pdfjs?.OPS || {};
  const fnTransform = OPS.transform ?? 12;
  const fnPaintImage = OPS.paintImageXObject ?? 85;
  const fnPaintInline = OPS.paintInlineImageXObject ?? 86;

  // Escala calibrada TrackSIM: ancho del rango 0 a 10 = 476.8px
  const scaleWidth = 476.8;
  let currentMatrix = [1, 0, 0, 1, 0, 0];
  const barImages = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === fnTransform) {
      currentMatrix = args;
    } else if (fn === fnPaintImage || fn === fnPaintInline) {
      const w = currentMatrix[0];
      const h = currentMatrix[3];
      const x = currentMatrix[4];
      const y = currentMatrix[5];
      // Las barras horizontales del reporte TrackSIM tienen altura h aprox 29.6px e y entre 330 y 425px
      if (h >= 18 && h <= 36 && y >= 330 && y <= 425 && w > 40) {
        barImages.push({ y, w, x });
      }
    }
  }

  if (barImages.length >= 3) {
    // Ordenar de arriba hacia abajo (Y descendente): S2 (arriba), S3 (medio), S4 (abajo)
    barImages.sort((a, b) => b.y - a.y);
    return {
      simulacion_2: parseFloat(((barImages[0].w / scaleWidth) * 10).toFixed(2)),
      simulacion_3: parseFloat(((barImages[1].w / scaleWidth) * 10).toFixed(2)),
      simulacion_4: parseFloat(((barImages[2].w / scaleWidth) * 10).toFixed(2))
    };
  }

  return null;
}

/**
 * Extrae los errores y su frecuencia de la gráfica de barras horizontal
 * 'Errores con mas frecuencia en las simulaciones' ubicada en la Página 1 del reporte.
 */
export function extractMistakesFromCoordinates(page1Items = [], allItems = []) {
  const sourceItems = (page1Items && page1Items.length > 0)
    ? page1Items
    : (allItems && allItems[0] ? allItems[0] : []);

  if (!sourceItems || sourceItems.length === 0) return [];

  const cleanItems = sourceItems
    .filter(item => item.str && item.str.trim().length > 0)
    .map(item => ({
      str: item.str.trim(),
      x: item.transform ? Math.round(item.transform[4]) : 0,
      y: item.transform ? Math.round(item.transform[5]) : 0
    }));

  // Buscar el título del gráfico
  const titleItem = cleanItems.find(it => /errores\s+con\s+m[aá]s\s+frecuencia/i.test(it.str));
  if (!titleItem) return [];

  // Los errores están verticalmente por debajo del título (y < title.y) y por encima de los números de escala X (y > 95)
  const chartItems = cleanItems.filter(it => it.y < titleItem.y && it.y > 95);

  // Agrupar items por línea horizontal similar (tolerancia ±4px en Y)
  const rowMap = new Map();
  for (const it of chartItems) {
    let matchedY = null;
    for (const y of rowMap.keys()) {
      if (Math.abs(y - it.y) <= 4) {
        matchedY = y;
        break;
      }
    }
    if (matchedY !== null) {
      rowMap.get(matchedY).push(it);
    } else {
      rowMap.set(it.y, [it]);
    }
  }

  const results = [];
  const rows = Array.from(rowMap.entries()).sort((a, b) => b[0] - a[0]);

  for (const [, list] of rows) {
    list.sort((a, b) => a.x - b.x);

    // El número de repeticiones está a la derecha del texto (x > 250)
    const countItem = list.find(it => /^\d+$/.test(it.str) && it.x > 250);
    const textItems = list.filter(it => it !== countItem);
    const errorText = textItems.map(it => it.str).join(' ').trim();
    const count = countItem ? parseInt(countItem.str, 10) : null;

    // Descartar filas vacías o líneas que sean solo etiquetas de ejes numéricos
    if (!errorText || count === null || isNaN(count)) continue;
    if (/^[0-9\s]+$/.test(errorText)) continue;

    // Buscar en el catálogo para clasificar por Eje / Dimensión
    const catalogMatch = findCatalogMistake(errorText);
    const ejeId = catalogMatch ? catalogMatch.ejeId : null;
    const dimension = ejeId ? getDimensionById(ejeId) : null;

    results.push({
      error: catalogMatch ? catalogMatch.nombre : errorText,
      errorRaw: errorText,
      repeticiones: count,
      ejeId: ejeId,
      ejeNombre: dimension ? dimension.nombre : 'Sin Clasificar',
      ejeShortName: dimension ? dimension.shortName : 'Otros',
      ejeIcono: dimension ? dimension.icono : '❓'
    });
  }

  return results;
}

/**
 * Parsea el texto extraído de las páginas del PDF y genera el objeto de evaluación
 */
export function parseEvaluationData(pagesText, filename = '', rawPage1Items = null, rawPage4Items = null, rawPage5Items = null, allPagesItems = null, rawOpList = null) {
  const p1 = pagesText[0] || '';
  const p4 = pagesText[3] || '';
  const p5 = pagesText[pagesText.length - 1] || ''; // Última página (usualmente página 5)
  const fullText = pagesText.join('\n=== PAGINA ===\n');

  // Intentar extracción de encabezado y ejercicios con coordenadas espaciales
  const allItems = allPagesItems || pagesText.allPagesItems || [];
  const page1Items = rawPage1Items || pagesText.page1Items || allItems[0] || null;
  const page4Items = rawPage4Items || pagesText.page4Items || allItems[3] || null;
  const page5Items = rawPage5Items || pagesText.page5Items || allItems[allItems.length - 1] || null;
  const page5OpList = rawOpList || pagesText.page5OpList || null;
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
    erroresFrecuentes: [],
    fatalidades: 0,
    vehiculoFueraVia: 0,
    colisiones: 0,
    firmaDigital: '',
    estado: 'Reforzar',
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
      let candidate = mEmp[1].replace(/CUR-[A-Z0-9-]+/gi, '').replace(/Curso avanzado[^\n]*/gi, '').trim();
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
    const mCursoCod = p5.match(/Curso:\s*([A-Z0-9-]+)/i) || p1.match(/(CUR-[A-Z0-9-]+)/i);
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
  const detectedSims = extractSimulationsFromItems(page5Items, allItems, p5, fullText, page5OpList);
  data.simulacionesDetalle = {
    simulacion_2: detectedSims.simulacion_2,
    simulacion_3: detectedSims.simulacion_3,
    simulacion_4: detectedSims.simulacion_4
  };

  // 10. Ejercicios Dinámicos de Simulador (Página 4 - Omitiendo Reconocimiento)
  const ejercicios = extractExercisesFromCoordinates(page4Items, p4, allItems, fullText);
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

  // 11. Errores con más frecuencia en las simulaciones (Página 1)
  data.erroresFrecuentes = extractMistakesFromCoordinates(page1Items, allItems);

  // 12. Estado y Observaciones
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
    data.estado = 'Reforzar';
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
  const parsedData = parseEvaluationData(
    pagesText,
    name,
    pagesText.page1Items,
    pagesText.page4Items,
    pagesText.page5Items,
    pagesText.allPagesItems,
    pagesText.page5OpList
  );
  return parsedData;
}

