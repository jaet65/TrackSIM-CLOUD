/**
 * Servicio de Generación de Diplomas / Reconocimientos TrackSIM.
 * Utiliza la plantilla oficial (template/RECONOCIMIENTO 6@.jpg)
 * e inscribe dinámicamente el nombre del operador sobre la línea correspondiente.
 */

import { jsPDF } from 'jspdf';

export const DIPLOMA_TEMPLATE_PATH = '/template/diploma_template.jpg';
export const DIPLOMA_TEMPLATE_FALLBACK = '/template/RECONOCIMIENTO 6@.jpg';

// Dimensiones de la plantilla oficial a 300 DPI
export const DIPLOMA_WIDTH = 3300;
export const DIPLOMA_HEIGHT = 2534;

// Coordenadas calculadas de la línea de reconocimiento:
// Línea naranja: x = 634 a 2588, y = 1001 a 1004.
// Centro horizontal de la línea: 1611px.
// Línea base vertical para el texto: y = 985px (justo encima de la línea).
export const DIPLOMA_NAME_CENTER_X = 1611;
export const DIPLOMA_NAME_BASELINE_Y = 985;
export const DIPLOMA_MAX_NAME_WIDTH = 1850;

let cachedTemplateImage: HTMLImageElement | null = null;
let templateLoadPromise: Promise<HTMLImageElement> | null = null;

/**
 * Carga y cachea la imagen de la plantilla del diploma.
 */
export function loadDiplomaTemplateImage(): Promise<HTMLImageElement> {
  if (cachedTemplateImage && cachedTemplateImage.complete && cachedTemplateImage.naturalWidth > 0) {
    return Promise.resolve(cachedTemplateImage);
  }

  if (templateLoadPromise) {
    return templateLoadPromise;
  }

  templateLoadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      cachedTemplateImage = img;
      resolve(img);
    };

    img.onerror = () => {
      // Intento de respaldo con la ruta original con caracteres especiales
      const fallback = new Image();
      fallback.crossOrigin = 'anonymous';
      fallback.onload = () => {
        cachedTemplateImage = fallback;
        resolve(fallback);
      };
      fallback.onerror = (err) => {
        templateLoadPromise = null;
        reject(err);
      };
      fallback.src = DIPLOMA_TEMPLATE_FALLBACK;
    };

    img.src = DIPLOMA_TEMPLATE_PATH;
  });

  return templateLoadPromise;
}

export interface DiplomaRenderOptions {
  name: string;
  fontSize?: number;
  textColor?: string;
}

/**
 * Dibuja la plantilla y el nombre del operador en un elemento HTMLCanvasElement.
 */
export function drawDiplomaOnCanvas(
  canvas: HTMLCanvasElement,
  templateImg: HTMLImageElement,
  options: DiplomaRenderOptions
): void {
  const width = templateImg.naturalWidth || DIPLOMA_WIDTH;
  const height = templateImg.naturalHeight || DIPLOMA_HEIGHT;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Dibujar el fondo del diploma
  ctx.drawImage(templateImg, 0, 0, width, height);

  // 2. Preparar formato del nombre
  const rawName = (options.name || '').trim().toLocaleUpperCase('es-MX');
  if (!rawName) return;

  let fontSize = options.fontSize || 72;
  const textColor = options.textColor || '#111827';

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Configurar tipografía moderna y nítida
  ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

  // 3. Ajuste responsivo de tamaño de fuente si el nombre es muy largo
  let textMetrics = ctx.measureText(rawName);
  if (textMetrics.width > DIPLOMA_MAX_NAME_WIDTH) {
    const scale = DIPLOMA_MAX_NAME_WIDTH / textMetrics.width;
    fontSize = Math.max(38, Math.floor(fontSize * scale));
    ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  }

  // 4. Inscribir el nombre centrado sobre la línea naranja
  ctx.fillText(rawName, DIPLOMA_NAME_CENTER_X, DIPLOMA_NAME_BASELINE_Y);
}

/**
 * Genera el Data URL (JPEG en alta resolución) para un operador.
 */
export async function generateDiplomaDataUrl(
  name: string,
  templateImg?: HTMLImageElement,
  quality = 0.92
): Promise<string> {
  const img = templateImg || (await loadDiplomaTemplateImage());
  const canvas = document.createElement('canvas');
  drawDiplomaOnCanvas(canvas, img, { name });
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Obtiene un nombre de archivo seguro y estandarizado para el diploma.
 */
export function getSafeDiplomaFileName(driverName: string, ext = 'pdf'): string {
  const safeName = (driverName || 'Operador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `Diploma_${safeName || 'Operador'}.${ext}`;
}

/**
 * Dispara la descarga directa de un diploma en el navegador del usuario en formato JPG.
 */
export function downloadDiplomaImage(dataUrl: string, driverName: string): void {
  const fileName = getSafeDiplomaFileName(driverName, 'jpg');
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Genera un documento PDF tamaño Carta horizontal de 1 sola página con el diploma.
 */
export async function generateDiplomaPdfArrayBuffer(
  name: string,
  templateImg?: HTMLImageElement
): Promise<ArrayBuffer> {
  const dataUrl = await generateDiplomaDataUrl(name, templateImg);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: 'letter'
  });

  const imgW = 11;
  const imgH = 11 * (DIPLOMA_HEIGHT / DIPLOMA_WIDTH);
  const posY = (8.5 - imgH) / 2;

  pdf.addImage(dataUrl, 'JPEG', 0, posY, imgW, imgH, undefined, 'FAST');
  return pdf.output('arraybuffer');
}

/**
 * Genera un Blob PDF tamaño Carta horizontal de 1 sola página con el diploma.
 */
export async function generateDiplomaPdfBlob(
  name: string,
  templateImg?: HTMLImageElement
): Promise<Blob> {
  const dataUrl = await generateDiplomaDataUrl(name, templateImg);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: 'letter'
  });

  const imgW = 11;
  const imgH = 11 * (DIPLOMA_HEIGHT / DIPLOMA_WIDTH);
  const posY = (8.5 - imgH) / 2;

  pdf.addImage(dataUrl, 'JPEG', 0, posY, imgW, imgH, undefined, 'FAST');
  return pdf.output('blob');
}

/**
 * Dispara la descarga de un archivo binario Blob en el navegador.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Descarga directamente un diploma individual en formato PDF tamaño Carta.
 */
export async function downloadDiplomaPdf(name: string, templateImg?: HTMLImageElement): Promise<void> {
  const blob = await generateDiplomaPdfBlob(name, templateImg);
  const fileName = getSafeDiplomaFileName(name, 'pdf');
  downloadBlob(blob, fileName);
}
