import { parsePDFFile } from '../services/pdfParserWorkerBridge';

// Definir interfaz del mensaje
export interface WorkerPDFJob {
  id: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
}

export interface WorkerSuccessMessage {
  type: 'SUCCESS';
  id: string;
  fileName: string;
  data: any;
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  id: string;
  fileName: string;
  error: string;
}

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  id: string;
  fileName: string;
  text: string;
}

export type WorkerOutgoingMessage = WorkerSuccessMessage | WorkerErrorMessage | WorkerProgressMessage;

// Escuchar peticiones desde el hilo principal
self.onmessage = async (event: MessageEvent<WorkerPDFJob>) => {
  const { id, fileBuffer, fileName } = event.data;

  try {
    self.postMessage({
      type: 'PROGRESS',
      id,
      fileName,
      text: `Iniciando extracción de texto para ${fileName}...`
    } as WorkerProgressMessage);

    const parsedData = await parsePDFFile(fileBuffer, fileName);

    self.postMessage({
      type: 'SUCCESS',
      id,
      fileName,
      data: parsedData
    } as WorkerSuccessMessage);
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      id,
      fileName,
      error: error?.message || 'Error desconocido procesando el reporte PDF'
    } as WorkerErrorMessage);
  }
};
