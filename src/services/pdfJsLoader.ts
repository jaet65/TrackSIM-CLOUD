declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string };
      verbosity: number;
      getDocument: (options: { data: ArrayBuffer }) => unknown;
    };
  }
}

const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let loadPromise: Promise<void> | null = null;

export function loadPdfJs(): Promise<void> {
  if (window.pdfjsLib) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDF_JS_URL;
    script.async = true;
    script.onload = () => {
      if (!window.pdfjsLib) {
        loadPromise = null;
        reject(new Error('PDF.js se cargó, pero su API no está disponible.'));
        return;
      }

      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
      window.pdfjsLib.verbosity = 0;
      resolve();
    };
    script.onerror = () => {
      script.remove();
      loadPromise = null;
      reject(new Error('No se pudo cargar PDF.js desde el CDN.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
