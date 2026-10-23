/**
 * Bridge helper para parsear PDFs delegando en el motor de parseo existente
 */
import { ParsedPdfEvaluation } from '../types';

interface PdfParserModule {
  parsePDFFile(fileOrBuffer: File | ArrayBuffer, filename?: string): Promise<unknown>;
}

function isPdfParserModule(value: unknown): value is PdfParserModule {
  return typeof value === 'object' &&
    value !== null &&
    'parsePDFFile' in value &&
    typeof value.parsePDFFile === 'function';
}

function isParsedPdfEvaluation(value: unknown): value is ParsedPdfEvaluation {
  if (typeof value !== 'object' || value === null) return false;
  return 'empresa' in value &&
    typeof value.empresa === 'string' &&
    (!('id' in value) || typeof value.id === 'string');
}

export async function parsePDFFile(fileOrBuffer: File | ArrayBuffer, filename = ''): Promise<ParsedPdfEvaluation> {
  let parserModule: PdfParserModule;
  try {
    const parserModuleUrl = '/js/pdf-parser.js';
    const loadedModule: unknown = await import(/* @vite-ignore */ parserModuleUrl);
    if (!isPdfParserModule(loadedModule)) {
      throw new Error('El módulo no exporta parsePDFFile.');
    }
    parserModule = loadedModule;
  } catch (err) {
    console.warn('No se pudo cargar /js/pdf-parser.js:', err);
    throw new Error('El motor de análisis de reportes PDF no está disponible.', { cause: err });
  }

  const parsed = await parserModule.parsePDFFile(fileOrBuffer, filename);
  if (!isParsedPdfEvaluation(parsed)) {
    throw new Error('El motor PDF devolvió una evaluación con formato inválido.');
  }
  return parsed;
}
