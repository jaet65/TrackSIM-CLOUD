// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyAiInsightResult } from '../../services/companyAiInsights';
import { CompanyAiInsightsCard } from '../company/CompanyAiInsightsCard';
import {
  TRACKY_GIF_PATH,
  TRACKY_WEBP_PATH,
  TRACKY_WHEEL_GIF_PATH,
  TRACKY_WHEEL_WEBP_PATH
} from '../company/TrackyAssistant';

function createStructuredInsight(): CompanyAiInsightResult {
  return {
    source: 'gemini',
    model: 'gemini-3.8-flash',
    generatedAt: '19-nov, 11:48 p. m.',
    summary: 'Resumen general de prueba',
    structured: {
      estadoGeneral: {
        nivel: 'bueno',
        titulo: 'Buen desempeño con puntos por pulir',
        resumenSimple: 'La flota mantiene una tendencia favorable.'
      },
      loQueVaBien: [
        {
          titulo: 'Alta aprobación en montaña',
          detalle: 'El 85% de los operadores superó los 8 puntos.'
        }
      ],
      focosDeAtencion: [
        {
          titulo: 'Exceso de aceleración',
          porqueImporta: 'Aumenta el consumo de diésel en ruta.',
          nivel: 'medio'
        }
      ],
      planDeAccion: [
        {
          plazo: '1er ciclo próximo año',
          accion: 'Reforzar manejo en zona verde',
          impacto: 'Menor consumo de combustible.'
        }
      ],
      metasSimples: [{ indicador: 'Promedio', actual: '7.6 / 10', meta: '≥ 8.2 próximo año' }]
    }
  };
}

describe('CompanyAiInsightsCard', () => {
  it('no renderiza el modal ni a Tracky cuando isOpen es false', () => {
    render(
      <CompanyAiInsightsCard
        isOpen={false}
        isLoading={false}
        insight={null}
        companyName="Transcooler"
        periodText="Año 2026"
        onRegenerate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByAltText('Tracky, asistente IA de TrackSIM')).toBeNull();
  });

  it('muestra a TrackyWheel animado en modo carga con WebP y respaldo GIF', () => {
    const { container } = render(
      <CompanyAiInsightsCard
        isOpen={true}
        isLoading={true}
        insight={null}
        companyName="Transcooler"
        periodText="Año 2026"
        onRegenerate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const img = screen.getByAltText('Tracky, asistente IA de TrackSIM');
    expect(img).toHaveAttribute('src', TRACKY_WHEEL_GIF_PATH);
    expect(img.getAttribute('src')).toContain('TrackyWheel.gif');
    const source = container.querySelector('picture source');
    expect(source).not.toBeNull();
    expect(source).toHaveAttribute('srcSet', TRACKY_WHEEL_WEBP_PATH);
    expect(source?.getAttribute('srcSet')).toContain('TrackyWheel.webp');
    expect(screen.getByText(/Estoy leyendo las evaluaciones de Transcooler \(Año 2026\)/)).toBeInTheDocument();
  });

  it('muestra a Tracky a la derecha de los consejos en modo listo y cambia al siguiente consejo al hacer clic', () => {
    const { container } = render(
      <CompanyAiInsightsCard
        isOpen={true}
        isLoading={false}
        insight={createStructuredInsight()}
        companyName="Transcooler"
        periodText="Año 2026"
        onRegenerate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const img = screen.getByAltText('Tracky, asistente IA de TrackSIM');
    expect(img).toHaveAttribute('src', TRACKY_GIF_PATH);
    expect(img.getAttribute('src')).toContain('Tracky.gif');
    const source = container.querySelector('picture source');
    expect(source).not.toBeNull();
    expect(source).toHaveAttribute('srcSet', TRACKY_WEBP_PATH);
    expect(source?.getAttribute('srcSet')).toContain('Tracky.webp');

    const tipText = screen.getByText(/Revisé los datos de Transcooler \(Año 2026\)/);
    expect(tipText.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const nextBtn = screen.getByRole('button', { name: /Siguiente consejo \(1\/4\)/ });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/Lo más positivo: Alta aprobación en montaña/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente consejo \(2\/4\)/ })).toBeInTheDocument();
  });
});
