import React, { useEffect, useMemo, useState } from 'react';
import trackyGif from '../../../template/Tracky.gif';
import trackyWebp from '../../../template/Tracky.webp';
import trackyWheelGif from '../../../template/TrackyWheel.gif';
import trackyWheelWebp from '../../../template/TrackyWheel.webp';
import type { CompanyAiStructuredReport } from '../../services/companyAiInsights';

export const TRACKY_WEBP_PATH = trackyWebp;
export const TRACKY_GIF_PATH = trackyGif;
export const TRACKY_WHEEL_WEBP_PATH = trackyWheelWebp;
export const TRACKY_WHEEL_GIF_PATH = trackyWheelGif;

interface TrackyAssistantProps {
  mode: 'loading' | 'ready';
  companyName: string;
  periodText: string;
  subjectType?: 'company' | 'driver';
  elapsedSeconds?: number;
  structured?: CompanyAiStructuredReport;
  warning?: string;
}

function getLoadingMessage(
  elapsedSeconds: number,
  companyName: string,
  periodText: string,
  subjectType: 'company' | 'driver'
): string {
  if (subjectType === 'driver') {
    if (elapsedSeconds < 4) {
      return `¡Hola! Soy Tracky. Estoy revisando el historial de ${companyName} (${periodText})...`;
    }
    if (elapsedSeconds < 9) {
      return 'Analizando sus calificaciones, ejercicios y hábitos de manejo...';
    }
    return 'Preparando su retroalimentación personalizada y metas prácticas...';
  }
  if (elapsedSeconds < 4) {
    return `¡Hola! Soy Tracky. Estoy leyendo las evaluaciones de ${companyName} (${periodText})...`;
  }
  if (elapsedSeconds < 9) {
    return 'Revisando calificaciones, ejercicios e incidentes para darte un resumen claro...';
  }
  return 'Preparando tus puntos clave y el plan de capacitación para el próximo año...';
}

function buildReadyTips(
  companyName: string,
  periodText: string,
  subjectType: 'company' | 'driver',
  structured?: CompanyAiStructuredReport,
  warning?: string
): string[] {
  const tips: string[] = [];

  const nivelGreeting: Record<CompanyAiStructuredReport['estadoGeneral']['nivel'], string> =
    subjectType === 'driver'
      ? {
          sobresaliente: `¡Gran desempeño de ${companyName} (${periodText})! Aquí tienes su retroalimentación lista para revisar juntos.`,
          bueno: `¡Hola! Revisé el historial de ${companyName} (${periodText}): tiene bases sólidas y detalles fáciles de pulir.`,
          atencion: `¡Hola! Ya analicé a ${companyName} (${periodText}) y preparé recomendaciones prácticas para reforzar su manejo.`,
          critico: `Atención con ${companyName} (${periodText}): identifiqué los puntos prioritarios para trabajar en simulador.`
        }
      : {
          sobresaliente: `¡Excelente trabajo en ${companyName} (${periodText})! Aquí tienes el resumen listo para compartir.`,
          bueno: `¡Hola! Revisé los datos de ${companyName} (${periodText}): van por buen camino con oportunidades concretas.`,
          atencion: `¡Hola! Ya analicé ${companyName} (${periodText}) y detecté varios puntos clave que conviene reforzar.`,
          critico: `Atención en ${companyName} (${periodText}): preparé las prioridades urgentes para proteger a la flota.`
        };

  if (structured) {
    tips.push(nivelGreeting[structured.estadoGeneral.nivel]);
    if (structured.loQueVaBien[0]) {
      tips.push(`✅ Lo más positivo: ${structured.loQueVaBien[0].titulo} — ${structured.loQueVaBien[0].detalle}`);
    }
    if (structured.focosDeAtencion[0]) {
      tips.push(`⚠️ Punto clave a atender: ${structured.focosDeAtencion[0].titulo} — ${structured.focosDeAtencion[0].porqueImporta}`);
    }
    if (structured.planDeAccion[0]) {
      tips.push(`🎯 Siguiente paso (${structured.planDeAccion[0].plazo}): ${structured.planDeAccion[0].accion}`);
    }
  } else {
    tips.push(
      subjectType === 'driver'
        ? `¡Listo! Ya preparé la retroalimentación de ${companyName} (${periodText}).`
        : `¡Listo! Ya preparé la interpretación de ${companyName} (${periodText}).`
    );
  }

  if (warning && tips.length === 1) {
    tips.push(`ℹ️ Nota: ${warning}`);
  }

  return tips;
}

const TrackyPicture: React.FC<{ variant: 'wheel' | 'standing' }> = ({ variant }) => {
  const webpSrc = variant === 'wheel' ? TRACKY_WHEEL_WEBP_PATH : TRACKY_WEBP_PATH;
  const gifSrc = variant === 'wheel' ? TRACKY_WHEEL_GIF_PATH : TRACKY_GIF_PATH;

  return (
    <picture style={{ display: 'block', width: '100%', height: '100%' }}>
      <source srcSet={webpSrc} type="image/webp" />
      <img
        src={gifSrc}
        alt="Tracky, asistente IA de TrackSIM"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 8px 16px rgba(15, 23, 42, 0.22))'
        }}
      />
    </picture>
  );
};

export const TrackyAssistant: React.FC<TrackyAssistantProps> = ({
  mode,
  companyName,
  periodText,
  subjectType = 'company',
  elapsedSeconds = 0,
  structured,
  warning
}) => {
  const [tipIndex, setTipIndex] = useState(0);

  const tips = useMemo(
    () => buildReadyTips(companyName, periodText, subjectType, structured, warning),
    [companyName, periodText, subjectType, structured, warning]
  );

  useEffect(() => {
    void companyName;
    void periodText;
    void structured;
    setTipIndex(0);
  }, [companyName, periodText, structured]);

  const activeTip = tips[tipIndex % tips.length] || tips[0];
  const handleNextTip = () => {
    if (tips.length <= 1) return;
    setTipIndex((prev) => (prev + 1) % tips.length);
  };

  return (
    <>
      <style>
        {`
          @keyframes trackyEnter {
            from { opacity: 0; transform: translateY(10px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes aiSpin { to { transform: rotate(360deg); } }
          @keyframes aiPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        `}
      </style>

      {mode === 'loading' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '1.25rem 0.75rem',
            animation: 'trackyEnter 0.3s ease-out'
          }}
        >
          <div
            style={{
              width: 'min(240px, 68vw)',
              aspectRatio: '16 / 9'
            }}
          >
            <TrackyPicture variant="wheel" />
          </div>

          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '0.9rem 1.15rem',
              borderRadius: '14px',
              background: 'rgba(139, 92, 246, 0.10)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.6rem'
            }}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', letterSpacing: '0.03em' }}>
              🐾 TRACKY · ASISTENTE IA
            </span>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                fontWeight: 600,
                lineHeight: 1.5,
                color: 'var(--text-main)',
                animation: 'aiPulse 1.8s ease-in-out infinite'
              }}
            >
              {getLoadingMessage(elapsedSeconds, companyName, periodText, subjectType)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  border: '2.5px solid rgba(139, 92, 246, 0.22)',
                  borderTopColor: '#7c3aed',
                  borderRightColor: '#0284c7',
                  borderRadius: '50%',
                  animation: 'aiSpin 0.75s linear infinite',
                  flexShrink: 0
                }}
              />
              <span>Procesando análisis{elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : '...'}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '14px',
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.26)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.95rem',
            flexWrap: 'wrap',
            animation: 'trackyEnter 0.3s ease-out'
          }}
        >
          <div
            style={{
              flex: '1 1 260px',
              padding: '0.7rem 0.9rem',
              borderRadius: '12px',
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid rgba(139, 92, 246, 0.22)',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#6d28d9' }}>
                🐾 Tracky · Asistente IA
              </span>
              {tips.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextTip}
                  style={{
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    background: 'rgba(139, 92, 246, 0.1)',
                    color: '#6d28d9',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.18rem 0.55rem',
                    borderRadius: '999px',
                    cursor: 'pointer'
                  }}
                >
                  Siguiente consejo ({(tipIndex % tips.length) + 1}/{tips.length}) →
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--text-main)' }}>
              {activeTip}
            </p>
          </div>

          <button
            type="button"
            onClick={handleNextTip}
            title={tips.length > 1 ? 'Haz clic para ver otro consejo de Tracky' : 'Tracky, asistente IA de TrackSIM'}
            style={{
              width: '150px',
              aspectRatio: '16 / 9',
              flexShrink: 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: tips.length > 1 ? 'pointer' : 'default'
            }}
          >
            <TrackyPicture variant="standing" />
          </button>
        </div>
      )}
    </>
  );
};
