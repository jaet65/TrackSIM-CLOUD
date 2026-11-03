import { describe, expect, it } from 'vitest';
import { parseTrackSimZeroPdfLines, type PdfTextLine } from '../trackSimZeroPdfParser';
import { calculateSingleSessionRadar } from '../sessionRadar';

function textLine(page: number, y: number, items: { text: string; x: number }[]): PdfTextLine {
  return {
    page,
    y,
    items: items.map((item) => ({ ...item, y }))
  };
}

function individualPdfLines(): PdfTextLine[] {
  return [
    textLine(1, 780, [{ text: 'Ana Conductora', x: 139 }, { text: 'APTO', x: 397 }]),
    textLine(1, 766, [{ text: 'Expediente de Desempeño y Telemetría — TrackSIM', x: 139 }]),
    textLine(1, 740, [{ text: '2 error(es) crítico(s) acumulados', x: 57 }]),
    textLine(1, 714, [{ text: 'DESTREZA (70%)', x: 212.6 }, { text: 'ECO-DRIVE (30%)', x: 297.6 }]),
    textLine(1, 694.5, [{ text: '3.9', x: 212.6 }, { text: '/7.0', x: 246.6 }, { text: '2.0', x: 297.6 }, { text: '/3.0', x: 331.7 }]),
    textLine(1, 700, [{ text: 'CALIFICACIÓN GLOBAL PROMEDIADA', x: 57 }]),
    textLine(1, 663, [{ text: '8.4', x: 57 }, { text: '/ 10 pts', x: 153 }]),
    textLine(1, 646, [{ text: 'Calculada sobre 4 ejercicios esperados en 2 fases', x: 57 }]),
    textLine(1, 25, [{ text: 'Folio: EXP-20261016-F5E6-D51F', x: 340 }]),
    textLine(2, 550, [{ text: 'Puntos Débiles (Análisis por Gravedad)', x: 14 }]),
    textLine(2, 530, [{ text: 'Nivel Críticas', x: 22 }]),
    textLine(2, 518, [{ text: 'Pisar el acotamiento derecho', x: 18 }, { text: '22× veces', x: 175 }]),
    textLine(2, 509, [{ text: 'Frenado brusco', x: 18 }, { text: '4× veces', x: 180 }]),
    textLine(2, 493, [{ text: 'Nivel Graves', x: 22 }]),
    textLine(2, 481, [
      { text: 'No emplear el freno de embrague para engranar la marcha de arranque', x: 18 },
      { text: '3× veces', x: 180 }
    ]),
    textLine(2, 455, [{ text: 'Desglose de Ejercicios Evaluados', x: 14 }]),
    textLine(2, 300, [
      { text: 'F1', x: 48 },
      { text: 'Unidad urbana', x: 91 },
      { text: '2026-10-12', x: 249 },
      { text: 'Mario Agraz', x: 323 },
      { text: '4:32', x: 414 },
      { text: '2', x: 476 },
      { text: '8.4', x: 547 }
    ]),
    textLine(2, 280, [
      { text: 'F2', x: 48 },
      { text: 'Práctica de frenado (NO REALIZADO)', x: 91 },
      { text: '—', x: 249 },
      { text: 'Otro instructor', x: 323 },
      { text: '—', x: 414 },
      { text: '—', x: 476 },
      { text: '0', x: 547 }
    ])
  ];
}

function replaceWeakPointSection(lines: PdfTextLine[], replacement: PdfTextLine[]): void {
  const headingIndex = lines.findIndex((line) => line.items.some((item) =>
    item.text.toLowerCase().includes('puntos débiles')
  ));
  const endIndex = lines.findIndex((line, index) =>
    index > headingIndex && line.items.some((item) =>
      item.text.toLowerCase().includes('desglose de ejercicios evaluados')
    )
  );
  lines.splice(headingIndex + 1, endIndex - headingIndex - 1, ...replacement);
}

describe('TrackSIM-ZERO individual PDF parser', () => {
  it('maps the individual dossier summary and exercise history', () => {
    const parsed = parseTrackSimZeroPdfLines(individualPdfLines(), 'Ana_Conductora_expediente.pdf');

    expect(parsed.conductor).toBe('Ana Conductora');
    expect(parsed.folio).toBe('EXP-20261016-F5E6-D51F');
    expect(parsed.evaluacionFinalPuntos).toBe(8.4);
    expect(parsed.destrezaPuntos).toBe(3.9);
    expect(parsed.destrezaMax).toBe(7);
    expect(parsed.ecoDrivingPuntos).toBe(2);
    expect(parsed.ecoDrivingMax).toBe(3);
    expect(parsed.habilidadesManejoPuntos).toBeUndefined();
    expect(parsed.practicaSimuladorPuntos).toBeUndefined();
    expect(parsed.estado).toBe('Aprobado');
    expect(parsed.instructor).toBe('Mario Agraz');
    expect(parsed.fechaCapacitacion).toBe('2026-10-12');
    expect(parsed.accidentesCriticos).toBe(2);
    expect(parsed.colisiones).toBe(0);
    expect(parsed.totalColisiones).toBe(0);
    expect(parsed.fatalidades).toBe(0);
    expect(parsed.vehiculoFueraVia).toBe(0);
    expect(parsed.totalInfracciones).toBe(2);
    expect(parsed.erroresFrecuentes).toEqual([
      { error: 'Pisar el acotamiento derecho', errorRaw: 'Pisar el acotamiento derecho', repeticiones: 22 },
      { error: 'Frenado brusco', errorRaw: 'Frenado brusco', repeticiones: 4 },
      {
        error: 'No emplear el freno de embrague para engranar la marcha de arranque',
        errorRaw: 'No emplear el freno de embrague para engranar la marcha de arranque',
        repeticiones: 3
      }
    ]);
    const radar = calculateSingleSessionRadar(parsed);
    expect(radar.hasMistakeData).toBe(true);
    expect(radar.errorCounts[1]).toBe(22);
    expect(radar.errorCounts[2]).toBe(4);
    expect(radar.errorCounts[3]).toBe(0);
    expect(radar.errorCounts[4]).toBe(3);
    expect(parsed.ejercicios).toMatchObject([
      { numero: 1, nombre: 'Unidad urbana', modulo: 'Fase 1', instructor: 'Mario Agraz', calificacion: 8.4, infracciones: 2 },
      { numero: 2, nombre: 'Práctica de frenado', modulo: 'Fase 2', instructor: 'Otro instructor', noRealizado: true }
    ]);
    expect(parsed.origen).toBe('TrackSIM-ZERO-V2');
    expect(parseTrackSimZeroPdfLines(individualPdfLines(), 'Ana_Conductora_expediente.pdf').id).toBe(parsed.id);
  });

  it('rejects legacy or unrelated PDF text instead of staging a partial evaluation', () => {
    expect(() => parseTrackSimZeroPdfLines([
      textLine(1, 700, [{ text: 'Reporte Individual de Habilidades de Operador', x: 10 }])
    ], 'reporte.pdf')).toThrow('El PDF no tiene el formato de expediente individual V2 de TrackSIM-ZERO.');
  });

  it('maps the official observation verdict without confusing it with incomplete exercises', () => {
    const lines = individualPdfLines();
    lines[0].items[1].text = 'APTO CON OBSERVACIONES';

    expect(parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf').estado).toBe('Reforzar');
  });

  it('reads the driver name and verdict from the top header around a separate avatar row', () => {
    const lines = individualPdfLines();
    lines.splice(
      0,
      1,
      textLine(1, 785.2, [{ text: 'Raul Alexis Susano Vargas', x: 138.9 }]),
      textLine(1, 780.9, [{ text: 'NO APTO', x: 458 }]),
      textLine(1, 779.5, [{ text: 'R', x: 106.6 }]),
      textLine(1, 771, [{ text: 'Expediente de Desempeño y Telemetría — TrackSIM', x: 138.9 }])
    );

    const parsed = parseTrackSimZeroPdfLines(lines, 'otro_nombre_expediente.pdf');

    expect(parsed.conductor).toBe('Raul Alexis Susano Vargas');
    expect(parsed.estado).toBe('No Aprobado');
  });

  it('counts V2 incidents from weak-point repetitions rather than the critical-accident total', () => {
    const lines = individualPdfLines();
    replaceWeakPointSection(lines, [
      textLine(2, 530, [{ text: 'Nivel Graves', x: 22 }]),
      textLine(2, 518, [{ text: 'Salirse de la vía', x: 18 }, { text: '2× veces', x: 180 }]),
      textLine(2, 509, [{ text: 'Atropello de un peatón', x: 18 }, { text: '3× veces', x: 180 }]),
      textLine(2, 500, [{ text: 'Vuelco', x: 18 }, { text: '4× veces', x: 180 }]),
      textLine(2, 491, [{ text: 'Vuelco del remolque', x: 18 }, { text: '5× veces', x: 180 }]),
      textLine(2, 482, [{ text: 'Colisión con un objeto', x: 18 }, { text: '6× veces', x: 180 }]),
      textLine(2, 473, [{ text: 'Atropello de un perro', x: 18 }, { text: '7× veces', x: 180 }])
    ]);

    const parsed = parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf');

    expect(parsed.accidentesCriticos).toBe(2);
    expect(parsed.colisiones).toBe(13);
    expect(parsed.totalColisiones).toBe(13);
    expect(parsed.fatalidades).toBe(12);
    expect(parsed.vehiculoFueraVia).toBe(2);
  });

  it('counts critical off-road errors as fatalities and noncritical ones as off-road incidents', () => {
    const lines = individualPdfLines();
    replaceWeakPointSection(lines, [
      textLine(2, 530, [{ text: 'Nivel Crítico', x: 22 }]),
      textLine(2, 518, [{ text: 'Salirse de la vía', x: 18 }, { text: '2× veces', x: 180 }]),
      textLine(2, 493, [{ text: 'Nivel Grave', x: 22 }]),
      textLine(2, 481, [{ text: 'Salirse de la vía', x: 18 }, { text: '3× veces', x: 180 }])
    ]);

    const parsed = parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf');

    expect(parsed.fatalidades).toBe(2);
    expect(parsed.vehiculoFueraVia).toBe(3);
    expect(parsed.erroresFrecuentes).toEqual(expect.arrayContaining([
      { error: 'Salirse de la vía', errorRaw: 'Salirse de la vía', repeticiones: 2, severidad: 'CRITICO' },
      { error: 'Salirse de la vía', errorRaw: 'Salirse de la vía', repeticiones: 3 }
    ]));
  });

  it('keeps split error labels intact and combines repeated rows', () => {
    const lines = individualPdfLines();
    replaceWeakPointSection(lines, [
      textLine(2, 530, [{ text: 'Incidencias de Riesgo', x: 51 }]),
      textLine(2, 518, [{ text: 'Colisión con un vehículo', x: 51 }, { text: 'del tráfico', x: 180 }, { text: '2× veces', x: 513 }]),
      textLine(2, 509, [{ text: 'Colisión con un vehículo del tráfico', x: 51 }, { text: '1× veces', x: 513 }])
    ]);

    const parsed = parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf');

    expect(parsed.erroresFrecuentes).toEqual([
      {
        error: 'Colisión con un vehículo del tráfico',
        errorRaw: 'Colisión con un vehículo del tráfico',
        repeticiones: 3
      }
    ]);
    expect(parsed.colisiones).toBe(3);
  });

  it('uses zero when the dossier explicitly reports no critical accidents', () => {
    const lines = individualPdfLines();
    lines[2].items[0].text = 'Sin faltas críticas en su historial';
    replaceWeakPointSection(lines, [
      textLine(2, 530, [{ text: 'Conducción Segura: Sin faltas críticas ni graves registradas', x: 18 }])
    ]);

    const parsed = parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf');

    expect(parsed.accidentesCriticos).toBe(0);
    expect(parsed.colisiones).toBe(0);
    expect(parsed.erroresFrecuentes).toEqual([]);
  });

  it('rejects dossiers that do not include a critical-accident count', () => {
    const lines = individualPdfLines();
    lines.splice(2, 1);

    expect(() => parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf'))
      .toThrow('No se pudo extraer el conteo de accidentes críticos del expediente.');
  });

  it('rejects dossiers without the unique folio needed for duplicate validation', () => {
    const lines = individualPdfLines().filter((line) =>
      !line.items.some((item) => item.text.startsWith('Folio:'))
    );

    expect(() => parseTrackSimZeroPdfLines(lines, 'Ana_Conductora_expediente.pdf'))
      .toThrow('No se pudo identificar el folio único del expediente.');
  });
});
