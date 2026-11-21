import React, { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { AiQuickAnswerResult, CompanyAiInsightResult, CompanyAiStructuredReport } from '../../services/companyAiInsights';
import {
  askTrackyQuickQuestion,
  getQuickQuestionsForSubject,
  type TrackyQuickQuestionId
} from '../../services/trackyQuickQuestions';
import type { Evaluation } from '../../types';
import { TrackyAssistant, type TrackySubjectType } from './TrackyAssistant';

interface CompanyAiInsightsCardProps {
  isOpen: boolean;
  isLoading: boolean;
  insight: CompanyAiInsightResult | null;
  companyName: string;
  periodText: string;
  subjectType?: TrackySubjectType;
  evaluations?: Evaluation[];
  onRegenerate: () => void;
  onClose: () => void;
}

function renderFormattedInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={index} style={{ color: 'var(--text-main)' }}>
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return (
        <em key={index} style={{ color: 'var(--primary)' }}>
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
}

function renderInsightMarkdown(markdown: string): React.ReactNode {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={keyPrefix} style={{ margin: '0.25rem 0 0.85rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {listItems.map((item, idx) => (
          <li key={idx} style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
            {renderFormattedInline(item)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`list-${idx}`);
      return;
    }

    if (line.startsWith('### ') || line.startsWith('## ')) {
      flushList(`list-${idx}`);
      const title = line.replace(/^#{2,3}\s+/, '');
      blocks.push(
        <h4
          key={`h-${idx}`}
          style={{
            margin: blocks.length === 0 ? '0 0 0.45rem' : '1.1rem 0 0.45rem',
            paddingTop: blocks.length === 0 ? 0 : '0.85rem',
            borderTop: blocks.length === 0 ? 'none' : '1px solid var(--border-subtle)',
            fontSize: '0.94rem',
            fontWeight: 700,
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}
        >
          {title}
        </h4>
      );
      return;
    }

    if (line.startsWith('#### ')) {
      flushList(`list-${idx}`);
      blocks.push(
        <h5
          key={`h4-${idx}`}
          style={{
            margin: '0.65rem 0 0.3rem',
            fontSize: '0.86rem',
            fontWeight: 700,
            color: 'var(--text-main)'
          }}
        >
          {line.replace(/^####\s+/, '')}
        </h5>
      );
      return;
    }

    if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s+/.test(line)) {
      listItems.push(line.replace(/^(-|\*|\d+\.)\s+/, '').trim());
      return;
    }

    flushList(`list-${idx}`);
    blocks.push(
      <p key={`p-${idx}`} style={{ margin: '0 0 0.55rem', color: 'var(--text-secondary)', fontSize: '0.89rem', lineHeight: 1.6 }}>
        {renderFormattedInline(line)}
      </p>
    );
  });

  flushList('list-end');
  return blocks;
}

const NIVEL_STYLES: Record<
  CompanyAiStructuredReport['estadoGeneral']['nivel'],
  { emoji: string; label: string; bg: string; border: string; accent: string }
> = {
  sobresaliente: {
    emoji: '🟢',
    label: 'Nivel Sobresaliente',
    bg: 'rgba(16, 185, 129, 0.10)',
    border: 'rgba(16, 185, 129, 0.35)',
    accent: '#047857'
  },
  bueno: {
    emoji: '🔵',
    label: 'Buen Desempeño',
    bg: 'rgba(14, 165, 233, 0.10)',
    border: 'rgba(14, 165, 233, 0.35)',
    accent: '#0369a1'
  },
  atencion: {
    emoji: '🟡',
    label: 'Requiere Atención',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.4)',
    accent: '#b45309'
  },
  critico: {
    emoji: '🔴',
    label: 'Atención Prioritaria',
    bg: 'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.38)',
    accent: '#b91c1c'
  }
};

function renderStructuredVisualReport(report: CompanyAiStructuredReport): React.ReactNode {
  const statusStyle = NIVEL_STYLES[report.estadoGeneral.nivel] || NIVEL_STYLES.atencion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* Semáforo de Estado General */}
      <div
        style={{
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          background: statusStyle.bg,
          border: `1px solid ${statusStyle.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem'
        }}
      >
        <span style={{ fontSize: '1.6rem', lineHeight: 1.1, flexShrink: 0 }}>{statusStyle.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: statusStyle.accent
              }}
            >
              {statusStyle.label}
            </span>
          </div>
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {report.estadoGeneral.titulo}
          </h4>
          <p style={{ margin: 0, fontSize: '0.89rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {report.estadoGeneral.resumenSimple}
          </p>
        </div>
      </div>

      {/* Metas Simples en Tarjetas */}
      {report.metasSimples.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          {report.metasSimples.map((kpi, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '12px',
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {kpi.indicador}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>{kpi.actual}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>→</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#047857' }}>{kpi.meta}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid de Lo que va bien vs Puntos a mejorar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
        {/* Lo que va bien */}
        <div
          style={{
            padding: '1rem 1.05rem',
            borderRadius: '14px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.92rem', color: '#047857' }}>
            <span>✅</span>
            <span>Lo que está funcionando bien</span>
          </div>
          {report.loQueVaBien.map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.75rem 0.85rem',
                borderRadius: '10px',
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid rgba(16, 185, 129, 0.24)',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                {item.titulo}
              </div>
              <div style={{ fontSize: '0.83rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{item.detalle}</div>
            </div>
          ))}
        </div>

        {/* Puntos a mejorar */}
        <div
          style={{
            padding: '1rem 1.05rem',
            borderRadius: '14px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.32)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.92rem', color: '#b45309' }}>
            <span>⚠️</span>
            <span>Puntos a mejorar y por qué importan</span>
          </div>
          {report.focosDeAtencion.map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.75rem 0.85rem',
                borderRadius: '10px',
                background: 'var(--bg-card, #ffffff)',
                border: `1px solid ${item.nivel === 'alto' ? 'rgba(239, 68, 68, 0.34)' : 'rgba(245, 158, 11, 0.3)'}`,
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>{item.titulo}</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '0.12rem 0.5rem',
                    borderRadius: '999px',
                    background: item.nivel === 'alto' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.14)',
                    color: item.nivel === 'alto' ? '#b91c1c' : '#b45309',
                    flexShrink: 0
                  }}
                >
                  {item.nivel === 'alto' ? 'Prioridad alta' : 'Atención'}
                </span>
              </div>
              <div style={{ fontSize: '0.83rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{item.porqueImporta}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan de Acción Paso a Paso */}
      {report.planDeAccion.length > 0 && (
        <div
          style={{
            padding: '1rem 1.05rem',
            borderRadius: '14px',
            background: 'rgba(14, 165, 233, 0.07)',
            border: '1px solid rgba(14, 165, 233, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.92rem', color: '#0369a1' }}>
            <span>🎯</span>
            <span>Qué hacer ahora (Plan paso a paso)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem' }}>
            {report.planDeAccion.map((step, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.8rem 0.9rem',
                  borderRadius: '10px',
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid rgba(14, 165, 233, 0.24)',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}
              >
                <span
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.14rem 0.55rem',
                    borderRadius: '999px',
                    background: 'rgba(14, 165, 233, 0.12)',
                    color: '#0369a1'
                  }}
                >
                  {idx + 1}. {step.plazo}
                </span>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.45 }}>{step.accion}</div>
                <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>💡 {step.impacto}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const CompanyAiInsightsCard: React.FC<CompanyAiInsightsCardProps> = ({
  isOpen,
  isLoading,
  insight,
  companyName,
  periodText,
  subjectType = 'company',
  evaluations,
  onRegenerate,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeQuestionId, setActiveQuestionId] = useState<TrackyQuickQuestionId | null>(null);
  const [quickAnswer, setQuickAnswer] = useState<AiQuickAnswerResult | null>(null);
  const [isLoadingQuick, setIsLoadingQuick] = useState(false);
  const [copiedQuick, setCopiedQuick] = useState(false);
  const quickRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const intervalId = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  const insightStamp = insight?.generatedAt;
  useEffect(() => {
    void isOpen;
    void companyName;
    void periodText;
    void subjectType;
    void insightStamp;
    quickRequestIdRef.current += 1;
    setActiveQuestionId(null);
    setQuickAnswer(null);
    setIsLoadingQuick(false);
    setCopiedQuick(false);
  }, [isOpen, companyName, periodText, subjectType, insightStamp]);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const quickQuestions = getQuickQuestionsForSubject(subjectType);
  const activeQuestion = quickQuestions.find((q) => q.id === activeQuestionId) || null;

  const handleCloseQuickPanel = () => {
    quickRequestIdRef.current += 1;
    setActiveQuestionId(null);
    setQuickAnswer(null);
    setIsLoadingQuick(false);
    setCopiedQuick(false);
  };

  const handleAskQuickQuestion = async (questionId: TrackyQuickQuestionId, forceRefresh = false) => {
    if (!insight) return;
    if (!forceRefresh && activeQuestionId === questionId && !isLoadingQuick && quickAnswer) {
      handleCloseQuickPanel();
      return;
    }

    const reqId = ++quickRequestIdRef.current;
    setActiveQuestionId(questionId);
    setIsLoadingQuick(true);
    setCopiedQuick(false);
    if (!forceRefresh) {
      setQuickAnswer(null);
    }

    try {
      const result = await askTrackyQuickQuestion({
        questionId,
        subjectType,
        companyName,
        periodText,
        insight,
        evaluations,
        forceRefresh
      });
      if (quickRequestIdRef.current === reqId) {
        setQuickAnswer(result);
      }
    } catch (error) {
      console.error('Error al responder pregunta rápida de Tracky:', error);
    } finally {
      if (quickRequestIdRef.current === reqId) {
        setIsLoadingQuick(false);
      }
    }
  };

  const handleCopyQuickAnswer = async () => {
    if (!quickAnswer?.answer || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(quickAnswer.answer);
      setCopiedQuick(true);
      setTimeout(() => setCopiedQuick(false), 2000);
    } catch {
      // Sin acceso al portapapeles
    }
  };

  const handleCopy = async () => {
    if (!insight?.summary || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(insight.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin acceso al portapapeles
    }
  };

  return (
    <div
      className="no-print"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-insights-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem'
      }}
    >
      <div
        className="glass-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(880px, 96vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: '18px',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div
          style={{
            padding: '1rem 1.4rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.16), rgba(56, 189, 248, 0.09))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.35rem' }}>🐾</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 id="ai-insights-modal-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {subjectType === 'driver'
                    ? 'Tracky · Retroalimentación del Operador'
                    : subjectType === 'evolution'
                      ? 'Tracky · Evolución Histórica de la Flota'
                      : 'Tracky · Interpretación Ejecutiva con IA'}
                </h3>
                {insight && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.55rem',
                      borderRadius: '999px',
                      background: insight.source === 'gemini' ? 'rgba(139, 92, 246, 0.14)' : 'rgba(14, 165, 233, 0.14)',
                      color: insight.source === 'gemini' ? '#6d28d9' : '#0369a1',
                      border: `1px solid ${insight.source === 'gemini' ? 'rgba(139, 92, 246, 0.35)' : 'rgba(14, 165, 233, 0.35)'}`
                    }}
                  >
                    {insight.source === 'gemini' ? `${insight.model}` : insight.model}
                  </span>
                )}
                {insight?.fromCache && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '999px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#047857',
                      border: '1px solid rgba(16, 185, 129, 0.32)'
                    }}
                    title="Análisis guardado en las últimas 24 horas"
                  >
                    ⚡ Guardado (&lt; 24h)
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {companyName} • {periodText}
                {insight ? ` • Generado ${insight.generatedAt}` : ''}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {insight && !isLoading && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopy}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                >
                  {copied ? '✓ Copiado' : '📋 Copiar'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onRegenerate}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                >
                  🔄 Regenerar
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              title="Cerrar modal (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <TrackyAssistant
              mode="loading"
              companyName={companyName}
              periodText={periodText}
              subjectType={subjectType}
              elapsedSeconds={elapsedSeconds}
            />
          ) : insight ? (
            <div>
              <TrackyAssistant
                mode="ready"
                companyName={companyName}
                periodText={periodText}
                subjectType={subjectType}
                structured={insight.structured}
                warning={insight.warning}
                isQuickQuestionActive={Boolean(activeQuestionId) || isLoadingQuick}
              />

              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.8rem 0.95rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-subtle, rgba(148, 163, 184, 0.06))'
                }}
              >
                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-muted)',
                    marginBottom: '0.55rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <span>⚡</span>
                  <span>Preguntas rápidas a Tracky</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {quickQuestions.map((q) => {
                    const isActive = activeQuestionId === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        aria-pressed={isActive}
                        disabled={isLoadingQuick && isActive}
                        onClick={() => void handleAskQuickQuestion(q.id, false)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.38rem 0.72rem',
                          borderRadius: '999px',
                          fontSize: '0.77rem',
                          fontWeight: 600,
                          border: isActive
                            ? '1px solid rgba(139, 92, 246, 0.55)'
                            : '1px solid var(--border-subtle)',
                          background: isActive
                            ? 'rgba(139, 92, 246, 0.14)'
                            : 'var(--bg-card, #ffffff)',
                          color: isActive ? '#6d28d9' : 'var(--text-main)',
                          cursor: isLoadingQuick && isActive ? 'wait' : 'pointer',
                          transition: 'all 0.16s ease'
                        }}
                      >
                        <span>{q.icon}</span>
                        <span>{q.label}</span>
                      </button>
                    );
                  })}
                </div>

                {activeQuestionId && activeQuestion && (
                  <div
                    role="region"
                    aria-label={`Respuesta rápida: ${activeQuestion.label}`}
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.85rem 0.95rem',
                      borderRadius: '10px',
                      background: 'var(--bg-card, #ffffff)',
                      border: '1px solid rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: '0.6rem',
                        paddingBottom: '0.45rem',
                        borderBottom: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span>{activeQuestion.icon}</span>
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {activeQuestion.label}
                        </span>
                        {quickAnswer && !isLoadingQuick && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '0.12rem 0.45rem',
                              borderRadius: '999px',
                              background:
                                quickAnswer.source === 'gemini'
                                  ? 'rgba(139, 92, 246, 0.12)'
                                  : 'rgba(14, 165, 233, 0.12)',
                              color: quickAnswer.source === 'gemini' ? '#6d28d9' : '#0369a1'
                            }}
                          >
                            {quickAnswer.model}
                          </span>
                        )}
                        {quickAnswer?.fromCache && !isLoadingQuick && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              padding: '0.12rem 0.42rem',
                              borderRadius: '999px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#047857'
                            }}
                          >
                            ⚡ Guardado (&lt; 24h)
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {quickAnswer && !isLoadingQuick && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleCopyQuickAnswer}
                              style={{ fontSize: '0.74rem', padding: '0.25rem 0.55rem' }}
                            >
                              {copiedQuick ? '✓ Copiado' : activeQuestion.copyLabel}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => void handleAskQuickQuestion(activeQuestion.id, true)}
                              style={{ fontSize: '0.74rem', padding: '0.25rem 0.5rem' }}
                              title="Regenerar respuesta rápida"
                            >
                              🔄
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleCloseQuickPanel}
                          aria-label="Cerrar respuesta rápida"
                          title="Cerrar respuesta rápida"
                          style={{ fontSize: '0.74rem', padding: '0.25rem 0.5rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {isLoadingQuick ? (
                      <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                        🐾 Tracky está preparando tu respuesta...
                      </div>
                    ) : quickAnswer ? (
                      <>
                        {quickAnswer.warning && (
                          <div
                            style={{
                              marginBottom: '0.55rem',
                              padding: '0.45rem 0.65rem',
                              borderRadius: '6px',
                              background: 'rgba(245, 158, 11, 0.1)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              color: '#b45309',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                          >
                            ℹ️ {quickAnswer.warning}
                          </div>
                        )}
                        {activeQuestion.id === 'whatsapp' ? (
                          <div
                            style={{
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.86rem',
                              lineHeight: 1.55,
                              color: 'var(--text-main)',
                              background: 'rgba(34, 197, 94, 0.08)',
                              border: '1px solid rgba(34, 197, 94, 0.25)',
                              borderRadius: '8px',
                              padding: '0.75rem 0.85rem'
                            }}
                          >
                            {quickAnswer.answer}
                          </div>
                        ) : (
                          <div>{renderInsightMarkdown(quickAnswer.answer)}</div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              {insight.warning && (
                <div
                  style={{
                    marginBottom: '0.95rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#b45309',
                    fontWeight: 600,
                    fontSize: '0.78rem'
                  }}
                >
                  ℹ️ {insight.warning}
                </div>
              )}
              {insight.structured ? renderStructuredVisualReport(insight.structured) : renderInsightMarkdown(insight.summary)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
