import { parsePDFFile } from './pdfParserWorkerBridge';
import { ParsedPdfEvaluation, StagedEvaluation } from '../types';

export interface ParseProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * Procesa múltiples archivos PDF en paralelo con control de concurrencia y sin congelar la UI
 */
export async function parsePDFBatch(
  files: File[],
  onProgress?: ParseProgressCallback
): Promise<StagedEvaluation[]> {
  const total = files.length;
  let completed = 0;
  const results: StagedEvaluation[] = [];

  // Límite de concurrencia: 1 a la vez para evitar colapsar la memoria del hilo principal de JS
  const CONCURRENCY_LIMIT = 1;
  const queue = [...files.entries()];

  // Timeout de seguridad por PDF (15 segundos max por archivo)
  const parseWithTimeout = async (file: File, filename: string, timeoutMs = 15000): Promise<ParsedPdfEvaluation> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout de procesamiento excedido (${timeoutMs / 1000}s) para el archivo ${filename}`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([parsePDFFile(file, filename), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  };

  const processNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const [index, file] = item;

      if (onProgress) {
        onProgress(completed, total, `Procesando (${index + 1}/${total}): ${file.name}`);
      }

      // Pequeña pausa (50ms) para que el navegador libere el Event Loop y refresque la pantalla/animaciones
      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        const parsed = await parseWithTimeout(file, file.name);
        results.push({
          ...parsed,
          id: parsed.id || `eval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          originalEmpresa: parsed.empresa || '',
          originalSede: parsed.sede || '',
          fileName: file.name
        });
      } catch (err: unknown) {
        console.error(`Error procesando archivo ${file.name}:`, err);
      } finally {
        completed++;
        if (onProgress) {
          onProgress(completed, total, `Completado (${completed}/${total}): ${file.name}`);
        }
      }
    }
  };

  const pool = Array.from({ length: Math.min(CONCURRENCY_LIMIT, total) }, () => processNext());
  await Promise.all(pool);

  return results;
}
