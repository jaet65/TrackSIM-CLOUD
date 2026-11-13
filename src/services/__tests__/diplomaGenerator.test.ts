import { describe, it, expect, vi } from 'vitest';
import {
  DIPLOMA_WIDTH,
  DIPLOMA_HEIGHT,
  DIPLOMA_NAME_CENTER_X,
  DIPLOMA_NAME_BASELINE_Y,
  DIPLOMA_MAX_NAME_WIDTH,
  drawDiplomaOnCanvas,
  downloadDiplomaImage,
  getSafeDiplomaFileName
} from '../diplomaGenerator';

describe('diplomaGenerator - Dimensiones y configuración', () => {
  it('debe tener las dimensiones correctas de la plantilla oficial', () => {
    expect(DIPLOMA_WIDTH).toBe(3300);
    expect(DIPLOMA_HEIGHT).toBe(2534);
    expect(DIPLOMA_NAME_CENTER_X).toBe(1611);
    expect(DIPLOMA_NAME_BASELINE_Y).toBe(985);
    expect(DIPLOMA_MAX_NAME_WIDTH).toBe(1850);
  });

  it('debe dibujar el nombre del operador sobre el canvas con el centrado y línea base correcta', () => {
    const mockCtx = {
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 600 }),
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: ''
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx)
    } as unknown as HTMLCanvasElement;

    const mockImg = {
      naturalWidth: 3300,
      naturalHeight: 2534
    } as HTMLImageElement;

    drawDiplomaOnCanvas(mockCanvas, mockImg, { name: 'Juan Carlos Pérez' });

    expect(mockCanvas.width).toBe(3300);
    expect(mockCanvas.height).toBe(2534);
    expect(mockCtx.drawImage).toHaveBeenCalledWith(mockImg, 0, 0, 3300, 2534);
    expect(mockCtx.textAlign).toBe('center');
    expect(mockCtx.textBaseline).toBe('alphabetic');
    expect(mockCtx.fillText).toHaveBeenCalledWith(
      'JUAN CARLOS PÉREZ',
      DIPLOMA_NAME_CENTER_X,
      DIPLOMA_NAME_BASELINE_Y
    );
  });

  it('debe ajustar dinámicamente el tamaño de la tipografía si el nombre es muy largo', () => {
    let callCount = 0;
    const mockCtx = {
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockImplementation(() => {
        callCount++;
        // Primer cálculo retorna un ancho mayor a DIPLOMA_MAX_NAME_WIDTH
        if (callCount === 1) return { width: 2500 };
        return { width: 1700 };
      }),
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: ''
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx)
    } as unknown as HTMLCanvasElement;

    const mockImg = {
      naturalWidth: 3300,
      naturalHeight: 2534
    } as HTMLImageElement;

    drawDiplomaOnCanvas(mockCanvas, mockImg, {
      name: 'OPERADOR CON UN NOMBRE EXTRAORDINARIAMENTE EXTENSO Y APELLIDOS COMPUESTOS'
    });

    expect(mockCtx.fillText).toHaveBeenCalled();
    // Debe haber reducido el tamaño de fuente inicial de 72px
    expect(mockCtx.font).toContain('px');
    const matched = mockCtx.font.match(/bold (\d+)px/);
    expect(matched).toBeTruthy();
    if (matched) {
      const parsedSize = parseInt(matched[1], 10);
      expect(parsedSize).toBeLessThan(72);
      expect(parsedSize).toBeGreaterThanOrEqual(38);
    }
  });

  it('debe sanear el nombre del archivo al disparar la descarga', () => {
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');

    let clickedDownload = '';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = vi.fn().mockImplementation(() => {
          clickedDownload = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    downloadDiplomaImage('data:image/jpeg;base64,mock', 'José María Rodríguez / Especial');

    expect(clickedDownload).toBe('Diploma_Jose_Maria_Rodriguez_Especial.jpg');

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('debe generar nombres seguros para archivos PDF y ZIP con getSafeDiplomaFileName', () => {
    expect(getSafeDiplomaFileName('María González')).toBe('Diploma_Maria_Gonzalez.pdf');
    expect(getSafeDiplomaFileName('Carlos & Roberto / Norte', 'pdf')).toBe('Diploma_Carlos_Roberto_Norte.pdf');
    expect(getSafeDiplomaFileName('', 'pdf')).toBe('Diploma_Operador.pdf');
  });
});

