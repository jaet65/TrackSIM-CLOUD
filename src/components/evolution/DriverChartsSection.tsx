import React from 'react';
import { Line, Radar } from 'react-chartjs-2';

interface DriverChartsSectionProps {
  evolutionChartData: any;
  accidentChartData: any;
  radarData: any;
  chartOptions: any;
  radarOptions: any;
  onOpenRadarModal: () => void;
}

export const DriverChartsSection: React.FC<DriverChartsSectionProps> = ({
  evolutionChartData,
  accidentChartData,
  radarData,
  chartOptions,
  radarOptions,
  onOpenRadarModal
}) => {
  return (
    <>
      {/* Gráficos de Evolución de Operador */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Curva de Puntajes */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>📈 Curva de Aprendizaje y Puntaje</h3>
          <div style={{ height: '300px', width: '100%' }}>
            <Line data={evolutionChartData} options={chartOptions} />
          </div>
        </div>

        {/* Radar de Competencias */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            cursor: 'pointer',
            transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
            position: 'relative'
          }}
          onClick={onOpenRadarModal}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(56, 189, 248, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = '';
            e.currentTarget.style.boxShadow = '';
          }}
          title="Haz clic para ampliar el gráfico y ver el desglose de errores"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🕸️ Radar Multidimensional de Competencias
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 500 }}>🔍 (Clic para ampliar)</span>
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Desempeño en 5 dimensiones clave calculado a partir de errores e incidencias en simulador.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenRadarModal();
                }}
              >
                🔍 Desglosar Errores
              </button>
            </div>
          </div>
          <div style={{ height: '300px', width: '100%' }}>
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>
      </div>

      {/* Curva de Accidentes e Incidentes */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>🚨 Historial y Tendencia de Incidentes</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Comportamiento de colisiones, fatalidades y salidas de vía registradas en el simulador a lo largo del tiempo.
        </p>
        <div style={{ height: '280px', width: '100%' }}>
          <Line data={accidentChartData} options={chartOptions} />
        </div>
      </div>
    </>
  );
};
