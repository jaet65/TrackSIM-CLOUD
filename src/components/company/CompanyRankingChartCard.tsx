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
}

export const CompanyRankingChartCard: React.FC<CompanyRankingChartCardProps> = ({
  chartData,
  chartOptions,
  rankingListLength,
  pagedRankingLength,
  currentRankingPage,
  totalRankingPages,
  pageSize,
  onSetRankingPage
}) => {
  return (
    <details className="card" open style={{ marginBottom: '2rem' }}>
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', fontWeight: 700, fontSize: '1.05rem' }}>
        <span>🏆 Ranking de Operadores (Top 30 por página)</span>
        <span className="badge badge-info">▼ Mostrar / ocultar</span>
      </summary>
      <div style={{ padding: '1.25rem' }}>
        <div style={{ height: Math.max(250, pagedRankingLength * 28 + 40) + 'px', width: '100%' }}>
          <Bar data={chartData} options={chartOptions} />
        </div>

        {/* Barra de paginación del Ranking */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '0.75rem' }}>
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
