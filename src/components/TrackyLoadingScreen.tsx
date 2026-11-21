import React from 'react';
import trackyReadingWebp from '../../template/TrackyReading.webp';

export const TRACKY_READING_WEBP_PATH = trackyReadingWebp;

interface TrackyLoadingScreenProps {
  message?: string;
  compact?: boolean;
}

export const TrackyLoadingScreen: React.FC<TrackyLoadingScreenProps> = ({
  message = 'Conectando con TrackSIM CLOUD...',
  compact = false
}) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      padding: '1.5rem',
      ...(compact
        ? { minHeight: '50vh', background: 'transparent' }
        : { height: '100vh', background: 'var(--bg-app)' }),
      color: 'var(--primary)',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      textAlign: 'center'
    }}
  >
    <div
      style={{
        width: compact ? 'min(210px, 60vw)' : 'min(280px, 72vw)',
        aspectRatio: '16 / 9'
      }}
    >
      <picture style={{ display: 'block', width: '100%', height: '100%' }}>
        <source srcSet={TRACKY_READING_WEBP_PATH} type="image/webp" />
        <img
          src={TRACKY_READING_WEBP_PATH}
          alt="Tracky cargando TrackSIM CLOUD"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            filter: 'drop-shadow(0 10px 20px rgba(15, 23, 42, 0.2))'
          }}
        />
      </picture>
    </div>
    <p
      style={{
        margin: 0,
        color: 'var(--text-secondary)',
        fontWeight: 600,
        fontSize: compact ? '0.88rem' : '0.95rem'
      }}
    >
      {message}
    </p>
  </div>
);
