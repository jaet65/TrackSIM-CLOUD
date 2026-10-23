import { parsePDFFile } from './pdfParserWorkerBridge';

export interface ParseProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * Procesa múltiples archivos PDF en paralelo con control de concurrencia y sin congelar la UI
 */
export async function parsePDFBatch(
  files: File[],
  onProgress?: ParseProgressCallback
): Promise<any[]> {
  const total = files.length;
  let completed = 0;
  const results: any[] = [];

  // Límite de concurrencia para evitar saturar memoria en lotes de 50+ archivos
  const CONCURRENCY_LIMIT = 2;
  const queue = [...files.entries()];

  const processNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [index, file] = item;

      if (onProgress) {
        onProgress(completed, total, `Procesando (${index + 1}/${total}): ${file.name}`);
      }

      try {
        // En navegadores modernos se pasa a través de parsePDFFile
        const parsed = await parsePDFFile(file, file.name);
        results.push({
          id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          ...parsed,
          originalEmpresa: parsed.empresa || '',
          originalSede: parsed.sede || '',
          fileName: file.name
        });
      } catch (err) {
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
