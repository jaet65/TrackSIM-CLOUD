import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePDFBatch } from '../pdfBatchProcessor';
import * as workerBridge from '../pdfParserWorkerBridge';

describe('pdfBatchProcessor - Pruebas de estrés y carga masiva', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockFile = (name: string, sizeBytes: number = 1024 * 1024): File => {
    const buffer = new ArrayBuffer(sizeBytes);
    return new File([buffer], name, { type: 'application/pdf' });
  };

  it('procesa lotes grandes sin dejar tareas colgadas', async () => {
    const totalFiles = 25;
    const files = Array.from({ length: totalFiles }, (_, i) =>
      createMockFile(`reporte_${i + 1}.pdf`, 500 * 1024)
    );

    let activeOperations = 0;
    let maxSimultaneous = 0;

    vi.spyOn(workerBridge, 'parsePDFFile').mockImplementation(async (file, filename) => {
      activeOperations++;
      maxSimultaneous = Math.max(maxSimultaneous, activeOperations);

      // Simular latencia de parsing en milisegundos
      await new Promise((r) => setTimeout(r, 20));

      activeOperations--;
      return {
        conductor: `Operador ${filename}`,
        empresa: 'Transportes Test',
        sede: 'Monterrey',
        evaluacionFinalPuntos: 8.5
      };
    });

    const progressUpdates: number[] = [];
    const results = await parsePDFBatch(files, (current, total) => {
      progressUpdates.push(current);
    });

    expect(results.length).toBe(totalFiles);
    // Concurrencia limitada para no saturar memoria ni hilo del navegador
    expect(maxSimultaneous).toBeLessThanOrEqual(2);
    expect(activeOperations).toBe(0);
    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('continúa el procesamiento del lote aunque uno o más archivos fallen o se corrompan', async () => {
    const files = [
      createMockFile('valido_1.pdf'),
      createMockFile('corrupto.pdf'),
      createMockFile('valido_2.pdf')
    ];

    vi.spyOn(workerBridge, 'parsePDFFile').mockImplementation(async (file, filename) => {
      if (filename === 'corrupto.pdf') {
        throw new Error('Formato PDF inválido o dañado');
      }
      return {
        conductor: 'Operador Valido',
        empresa: 'Test S.A.',
        evaluacionFinalPuntos: 7.0
      };
    });

    const results = await parsePDFBatch(files);
    // Debe recuperarse y retornar los 2 exitosos sin bloquear la ejecución
    expect(results.length).toBe(2);
    expect(results.map(r => r.fileName)).toEqual(['valido_1.pdf', 'valido_2.pdf']);
  });

  it('reporta progreso secuencialmente y actualiza los contadores', async () => {
    const files = [
      createMockFile('a.pdf'),
      createMockFile('b.pdf'),
      createMockFile('c.pdf')
    ];

    vi.spyOn(workerBridge, 'parsePDFFile').mockResolvedValue({
      conductor: 'Operador Test',
      empresa: 'Empresa',
      evaluacionFinalPuntos: 9.0
    });

    const progressLog: { current: number; total: number; msg: string }[] = [];
    await parsePDFBatch(files, (current, total, msg) => {
      progressLog.push({ current, total, msg });
    });

    expect(progressLog.length).toBeGreaterThanOrEqual(files.length);
    const lastProgress = progressLog[progressLog.length - 1];
    expect(lastProgress.current).toBe(files.length);
    expect(lastProgress.total).toBe(files.length);
  });
});
