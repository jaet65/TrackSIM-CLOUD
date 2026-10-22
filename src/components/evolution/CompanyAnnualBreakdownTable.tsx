import React from 'react';

interface AnnualBreakdownRow {
  year: string;
  evalCount: number;
  operatorCount: number;
  avgScore: number;
  passRate: number;
  collisions: number;
  offRoad: number;
  fatalities: number;
  totalIncidents: number;
  accidentRate: number;
  scoreTrend?: {
    diff: number;
    percent: number;
    type: 'mejora' | 'descenso' | 'estable';
  } | null;
  accidentTrend?: {
    diff: number;
    percent: number;
    type: 'mejora' | 'descenso' | 'estable';
  } | null;
}

interface CompanyAnnualBreakdownTableProps {
  consolidatedAnnualRows: AnnualBreakdownRow[];
}

export const CompanyAnnualBreakdownTable: React.FC<CompanyAnnualBreakdownTableProps> = ({
  consolidatedAnnualRows
}) => {
  if (!consolidatedAnnualRows || consolidatedAnnualRows.length === 0) return null;

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📑</span> Desglose Anual Consolidado • Métricas Globales
          </h3>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Historial consolidado por año de evaluaciones, calificaciones, tasa de aprobación, desglose de siniestros y evolución interanual.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Año</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center' }}>Operadores Evaluados</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '180px' }}>Calificación Promedio</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center' }}>Tasa Aprobación</th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '220px' }}>
                Incidentes Totales
              </th>
              <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center', minWidth: '180px' }}>Tasa de Accidentes</th>
            </tr>
          </thead>
          <tbody>
            {consolidatedAnnualRows.map((row) => (
              <tr
                key={row.year}
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {/* 1. Año */}
                <td style={{ padding: '1rem', fontWeight: 800, color: '#38bdf8', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                  📅 Año {row.year}
                </td>

                {/* 2. Operadores Evaluados */}
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: '#f8fafc' }}>
                  <span style={{ fontSize: '1.05rem' }}>{row.operatorCount}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    ({row.evalCount} eval)
                  </span>
                </td>

                {/* 3. Calificación Promedio con comparativo vs año anterior */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        color: row.avgScore >= 8.0 ? '#22c55e' : row.avgScore >= 6.0 ? '#38bdf8' : '#ef4444',
                      }}
                    >
                      {row.avgScore.toFixed(2)} / 10
                    </span>

                    {/* Comparativo vs año anterior */}
                    {row.scoreTrend ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: row.scoreTrend.type === 'mejora'
                            ? '#22c55e'
                            : row.scoreTrend.type === 'descenso'
                              ? '#ef4444'
                              : '#94a3b8',
                        }}
                        title="Tendencia de calificación respecto al año anterior"
                      >
                        <span>
                          {row.scoreTrend.type === 'mejora'
                            ? `+${row.scoreTrend.diff} (${row.scoreTrend.percent > 0 ? `+${row.scoreTrend.percent}%` : `${row.scoreTrend.percent}%`})`
                            : row.scoreTrend.type === 'descenso'
                              ? `${row.scoreTrend.diff} (${row.scoreTrend.percent}%)`
                              : 'Sin cambio'}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontStyle: 'italic' }}>
                        Año Base
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Tasa de Aprobación */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: row.passRate >= 80 ? '#22c55e' : row.passRate >= 60 ? '#fbbf24' : '#ef4444'
                    }}
                  >
                    {row.passRate.toFixed(1)}%
                  </span>
                </td>

                {/* 5. Incidentes Totales a modo de Suma Vertical (Colisiones + Fuera de vía + Fatalidades = Total) */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span title="Colisiones">💥 {row.collisions}</span>
                      <span style={{ color: 'var(--text-muted)' }}>+</span>
                      <span title="Vehículos Fuera de la Vía">🛑 {row.offRoad}</span>
                      <span style={{ color: 'var(--text-muted)' }}>+</span>
                      <span title="Fatalidades">💀 {row.fatalities}</span>
                    </div>
                    <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.15)', width: '100%', marginTop: '4px', paddingTop: '3px', fontWeight: 800, fontSize: '0.95rem', color: row.totalIncidents > 0 ? '#f43f5e' : '#22c55e' }}>
                      = {row.totalIncidents} siniestros
                    </div>
                  </div>
                </td>

                {/* 6. Tasa de Accidentes con comparativo vs año anterior */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: row.accidentRate === 0 ? '#22c55e' : row.accidentRate <= 1.0 ? '#fbbf24' : '#f43f5e'
                      }}
                    >
                      {row.accidentRate.toFixed(2)}
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '3px' }}>
                        / operador
                      </span>
                    </span>

                    {/* Comparativo de accidentalidad vs año anterior */}
                    {row.accidentTrend ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: row.accidentTrend.type === 'mejora'
                            ? '#22c55e'
                            : row.accidentTrend.type === 'descenso'
                              ? '#ef4444'
                              : '#94a3b8',
                        }}
                        title="Tendencia de accidentalidad respecto al año anterior (reducción es positivo)"
                      >
                        <span>
                          {row.accidentTrend.type === 'mejora'
                            ? `${row.accidentTrend.diff} (${row.accidentTrend.percent}%)`
                            : row.accidentTrend.type === 'descenso'
                              ? `+${row.accidentTrend.diff} (+${row.accidentTrend.percent}%)`
                              : 'Sin cambio'}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontStyle: 'italic' }}>
                        Año Base
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
