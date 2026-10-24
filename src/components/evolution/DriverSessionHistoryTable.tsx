import React from 'react';
import { Evaluation } from '../../types';

interface DriverSessionHistoryTableProps {
  driverEvaluations: Evaluation[];
  onViewReport: (evaluation: Evaluation) => void;
}

export const DriverSessionHistoryTable: React.FC<DriverSessionHistoryTableProps> = ({
  driverEvaluations,
  onViewReport
}) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🕒 Historial Cronológico de Sesiones</h3>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Resumen cronológico detallado de las evaluaciones y pruebas en simulador a lo largo del tiempo ({driverEvaluations.length} sesiones registradas).
          </p>
        </div>
      </div>

      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Sesión #</th>
              <th>Fecha de Sesión</th>
              <th>Sede / Ubicación</th>
              <th>Calificación Final</th>
              <th>Práctica Simulador</th>
              <th>Habilidades Manejo</th>
              <th>Incidentes</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {driverEvaluations.map((ev, idx) => {
              const score = ev.evaluacionFinalPuntos ?? ev.calificacionExacta ?? ev.promedioScore ?? 0;
              const colisiones = ev.colisiones || ev.totalColisiones || 0;
              const fatalidades = ev.fatalidades || 0;
              const fueraVia = ev.vehiculoFueraVia || 0;
              const totalIncidentes = colisiones + fatalidades + fueraVia;
              const dateFormatted = ev.fechaCapacitacionFormato || ev.fechaCapacitacion || ev.fechaReporte || ev.fecha || 'N/A';

              return (
                <tr key={ev.id || idx}>
                  <td>
                    <span
                      style={{
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        color: '#38bdf8',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.82rem'
                      }}
                    >
                      Sesión #{idx + 1}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.86rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    📅 {dateFormatted}
                  </td>
                  <td style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    📍 {ev.sede || ev.ciudad || 'Sede Principal'}
                  </td>
                  <td>
                    <span className="score-pill" style={{ color: score >= 6.0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                      {score.toFixed(2)}
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> / 10</small>
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>
                    {(ev.practicaSimuladorPuntos || 0).toFixed(2)} <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>/ 7 ptos</small>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
                    {(ev.habilidadesManejoPuntos || 0).toFixed(2)} <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>/ 3 ptos</small>
                  </td>
                  <td>
                    {totalIncidentes === 0 ? (
                      <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.85rem' }}>
                        0 (Limpio)
                      </span>
                    ) : (
                      <span
                        style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}
                        title={`💥 ${colisiones} colisiones • 💀 ${fatalidades} fatalidades • 🛑 ${fueraVia} salidas`}
                      >
                        ⚠️ {totalIncidentes} {totalIncidentes === 1 ? 'incidente' : 'incidentes'}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${score >= 8.0 ? 'success' : score >= 6.0 ? 'info' : score >= 5.0 ? 'warning' : 'danger'}`}>
                      {ev.estado || (score >= 6.0 ? 'Aprobado' : 'No Aprobado')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onViewReport(ev)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)'
                      }}
                    >
                      <span>📄</span> Ver Reporte
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
