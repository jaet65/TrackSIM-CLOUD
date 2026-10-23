/**
 * Bridge helper para parsear PDFs delegando en el motor de parseo existente
 */
export async function parsePDFFile(fileOrBuffer: File | ArrayBuffer, filename: string = ''): Promise<any> {
  let parseFn: any;
  try {
    const importDynamic = new Function('modulePath', 'return import(modulePath)');
    const module = await importDynamic('/js/pdf-parser.js');
    parseFn = module.parsePDFFile;
  } catch (err) {
    console.warn('No se pudo cargar /js/pdf-parser.js:', err);
  }

  if (!parseFn) {
    throw new Error('El motor de análisis de reportes PDF no está disponible.');
  }

  return await parseFn(fileOrBuffer, filename);
}
