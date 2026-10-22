import React from 'react';
import { Radar } from 'react-chartjs-2';
import { DriverSummary } from '../../types';
import { MISTAKE_DIMENSIONS } from '../../services/mistakeCatalog';

interface RadarDimension {
  id: number;
  nombre: string;
  shortName: string;
  icono: string;
  color: string;
  descripcion: string;
}

interface MistakeDetail {
  error: string;
  ejeId: number;
  repeticiones: number;
}

interface DriverRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverSummary | null;
  radarData: any;
  radarOptions: any;
  radarDimensions: RadarDimension[];
  axisStats: {
    scores: number[];
    errorCounts: Record<number, number>;
    hasMistakeData: boolean;
    mistakeDetails: MistakeDetail[];
  };
  selectedRadarAxisId: number | 'all';
  onSelectRadarAxisId: (id: number | 'all') => void;
}

export const DriverRadarModal: React.FC<DriverRadarModalProps> = ({
  isOpen,
  onClose,
  driver,
  radarData,
  radarOptions,
  radarDimensions,
  axisStats,
  selectedRadarAxisId,
  onSelectRadarAxisId
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop active"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          maxWidth: '920px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#0d1322',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: '18px',
          padding: '1.75rem',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.75)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.06em' }}>
              Análisis Diagnóstico Multidimensional
            </span>
            <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🕸️ Radar de Competencias: {driver ? driver.nombre : 'Operador'}
            </h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Desglose detallado de los errores de simulación agrupados en las 5 dimensiones clave de conducción.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ fontSize: '1.2rem', lineHeight: 1, padding: '0.4rem 0.75rem' }}
          >
            ✕
          </button>
        </div>

        {/* Grid con Radar Ampliado y Resumen de Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Radar Ampliado */}
          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', width: '100%' }}>
              Vista Ampliada del Radar
            </div>
            <div style={{ height: '360px', width: '100%' }}>
              <Radar data={radarData} options={radarOptions} />
            </div>
          </div>

          {/* Resumen de Calificaciones por Dimensión */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.2rem' }}>
              Puntajes por Dimensión Clave (0 - 10)
            </div>
            {radarDimensions.map((dim, idx) => {
              const score = axisStats.scores[idx] || 0;
              const count = axisStats.errorCounts[dim.id] || 0;
              const isSelected = selectedRadarAxisId === dim.id;

              return (
                <div
                  key={dim.id}
                  onClick={() => onSelectRadarAxisId(isSelected ? 'all' : dim.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${isSelected ? dim.color : 'rgba(255, 255, 255, 0.06)'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{dim.icono}</span>
                      <span>{dim.nombre}</span>
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: dim.color }}>
                      {score.toFixed(1)} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>/10</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Incidencias registradas: <strong style={{ color: count > 0 ? '#f8fafc' : '#10b981' }}>{count}</strong></span>
                    <span style={{ color: isSelected ? '#38bdf8' : '#64748b', fontSize: '0.72rem' }}>
                      {isSelected ? 'Mostrando sólo este eje ▾' : 'Filtrar errores ▸'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filtros de la Lista de Errores */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            📋 Desglose de Errores Detectados en Simulador
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              ({axisStats.mistakeDetails.filter(m => selectedRadarAxisId === 'all' || m.ejeId === selectedRadarAxisId).length} tipos de error)
            </span>
          </h4>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${selectedRadarAxisId === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.74rem', padding: '0.2rem 0.55rem' }}
              onClick={() => onSelectRadarAxisId('all')}
            >
              Todos los Ejes
            </button>
            {radarDimensions.map(dim => (
              <button
                key={dim.id}
                type="button"
                className={`btn btn-sm ${selectedRadarAxisId === dim.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: '0.74rem',
                  padding: '0.2rem 0.55rem',
                  borderColor: selectedRadarAxisId === dim.id ? dim.color : undefined
                }}
                onClick={() => onSelectRadarAxisId(dim.id)}
              >
                {dim.icono} {dim.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla Desglose de Errores */}
        {axisStats.mistakeDetails.length > 0 ? (
          <div className="table-responsive" style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px' }}>
            <table className="custom-table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.9)' }}>
                  <th style={{ width: '50px' }}>#</th>
                  <th>Error Comprobado en Simulación</th>
                  <th style={{ width: '220px' }}>Dimensión / Eje Asignado</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Repeticiones</th>
                </tr>
              </thead>
              <tbody>
                {axisStats.mistakeDetails
                  .filter(m => selectedRadarAxisId === 'all' || m.ejeId === selectedRadarAxisId)
                  .map((m, idx) => {
                    const dim = radarDimensions.find(d => d.id === m.ejeId) || MISTAKE_DIMENSIONS.EJE_1;
                    return (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{idx + 1}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.86rem' }}>
                            {m.error}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              background: `${dim.color}18`,
                              color: dim.color,
                              border: `1px solid ${dim.color}40`,
                              fontWeight: 600
                            }}
                          >
                            <span>{dim.icono}</span>
                            <span>{dim.shortName}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background: m.repeticiones >= 10 ? 'rgba(239, 68, 68, 0.2)' : m.repeticiones >= 5 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                              color: m.repeticiones >= 10 ? '#ef4444' : m.repeticiones >= 5 ? '#f59e0b' : '#38bdf8',
                              border: `1px solid ${m.repeticiones >= 10 ? 'rgba(239, 68, 68, 0.4)' : m.repeticiones >= 5 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.6rem'
                            }}
                          >
                            {m.repeticiones} {m.repeticiones === 1 ? 'vez' : 'veces'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>✨</span>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No se registran errores específicos de simulación en los reportes de este conductor.
            </p>
          </div>
        )}

        {/* Footer del Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Entendido, Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
