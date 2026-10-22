import React from 'react';
import { Bar } from 'react-chartjs-2';

interface CompanyRankingChartCardProps {
  chartData: any;
  chartOptions: any;
  rankingListLength: number;
  pagedRankingLength: number;
  currentRankingPage: number;
  totalRankingPages: number;
  pageSize: number;
  onSetRankingPage: (page: number | ((prev: number) => number)) => void;
  fullRankingList?: any[];
}

export const CompanyRankingChartCard: React.FC<CompanyRankingChartCardProps> = ({
  chartData,
  chartOptions,
  rankingListLength,
  pagedRankingLength,
  currentRankingPage,
  totalRankingPages,
  pageSize,
  onSetRankingPage,
  fullRankingList = []
}) => {
  return (
    <details className="card print-avoid-break" open style={{ marginBottom: '2rem' }}>
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', fontWeight: 700, fontSize: '1.05rem' }}>
        <span>🏆 Ranking de Operadores (Top de la Flota)</span>
        <span className="badge badge-info no-print">▼ Mostrar / ocultar</span>
      </summary>
      <div style={{ padding: '1.25rem' }}>
        {/* Gráfico interactivo visible en pantalla */}
        <div className="screen-only" style={{ height: Math.max(250, pagedRankingLength * 28 + 40) + 'px', width: '100%' }}>
          <Bar data={chartData} options={chartOptions} />
        </div>

        {/* Tabla compacta y limpia del TOP 10 del Ranking para PDF/Impresión */}
        <div className="print-only" style={{ display: 'none' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 700, fontSize: '9pt', color: '#0f172a' }}>
            Cuadro de Honor - Top 10 Mejores Calificaciones
          </div>
          <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '45px' }}>Pos</th>
                <th style={{ padding: '4px 8px', textAlign: 'left' }}>Operador</th>
                <th style={{ padding: '4px 8px', textAlign: 'left' }}>Sede</th>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '70px' }}>Sesiones</th>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '85px' }}>Score Promedio</th>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '80px' }}>Último Score</th>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '80px' }}>Incidentes</th>
                <th style={{ padding: '4px 8px', textAlign: 'center', width: '90px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {fullRankingList.slice(0, 10).map((op, idx) => {
                const rank = idx + 1;
                const totInc = (op.colisiones || 0) + (op.fatalidades || 0) + (op.totalFueraVia || 0);
                const isTop = op.promedioScore >= 8.0;
                const isPass = op.promedioScore >= 6.0;
                const scoreColor = isTop ? '#15803d' : isPass ? '#0369a1' : '#b91c1c';

                return (
                  <tr key={op.nombre + idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>
                      {rank <= 3 ? (rank === 1 ? '🥇 1' : rank === 2 ? '🥈 2' : '🥉 3') : `#${rank}`}
                    </td>
                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{op.nombre}</td>
                    <td style={{ padding: '4px 6px', color: '#475569' }}>{op.sede || 'Principal'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>{op.totalEvaluaciones || 1}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: scoreColor }}>
                      {Number(op.promedioScore).toFixed(2)} pts
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      {typeof op.ultimoScore === 'number' ? Number(op.ultimoScore).toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', color: totInc > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                      {totInc}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, fontSize: '8pt' }}>
                      {op.estado || 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Barra de paginación del Ranking (oculta en impresión) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Mostrando top {(currentRankingPage - 1) * pageSize + 1}-{Math.min(currentRankingPage * pageSize, rankingListLength)} de {rankingListLength} operadores
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSetRankingPage(1)}
              disabled={currentRankingPage === 1}
            >
              ««
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSetRankingPage((p) => p - 1)}
              disabled={currentRankingPage === 1}
            >
              « Ant
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8', padding: '0 0.5rem' }}>
              Página {currentRankingPage} de {totalRankingPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSetRankingPage((p) => p + 1)}
              disabled={currentRankingPage === totalRankingPages}
            >
              Sig »
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSetRankingPage(totalRankingPages)}
              disabled={currentRankingPage === totalRankingPages}
            >
              »»
            </button>
          </div>
        </div>
      </div>
    </details>
  );
};
