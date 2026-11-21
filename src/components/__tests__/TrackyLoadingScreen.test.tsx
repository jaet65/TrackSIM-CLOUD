// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRACKY_READING_WEBP_PATH, TrackyLoadingScreen } from '../TrackyLoadingScreen';

describe('TrackyLoadingScreen', () => {
  it('renderiza TrackyReading en WebP y el mensaje recibido', () => {
    const { container } = render(<TrackyLoadingScreen message="Cargando registros..." />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(screen.getByText('Cargando registros...')).toBeInTheDocument();

    const source = container.querySelector('picture source');
    expect(source).not.toBeNull();
    expect(source).toHaveAttribute('srcSet', TRACKY_READING_WEBP_PATH);
    expect(source?.getAttribute('srcSet')).toContain('TrackyReading.webp');

    const img = screen.getByAltText('Tracky cargando TrackSIM CLOUD');
    expect(img).toHaveAttribute('src', TRACKY_READING_WEBP_PATH);
    expect(img.getAttribute('src')).toContain('TrackyReading.webp');
  });
});
