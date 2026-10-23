import React from 'react';
import { Evaluation } from '../types';
import { findCatalogExercise } from '../services/exerciseCatalog';
import { SessionRadarWidget } from './SessionRadarWidget';

interface ReportDetailModalProps {
  evaluation: Evaluation | null;
  onClose: () => void;
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({ evaluation, onClose }) => {
  if (!evaluation) return null;

  const score = evaluation.evaluacionFinalPuntos ?? evaluation.calificacionExacta ?? evaluation.promedioScore ?? 0;
  const colisiones = evaluation.colisiones || (evaluation as any).totalColisiones || 0;
  const fatalidades = evaluation.fatalidades || 0;
  const fueraVia = evaluation.vehiculoFueraVia || 0;
  const totalIncidentes = colisiones + fatalidades + fueraVia;

  const isApproved = score >= 6.0;
  const estado = evaluation.estado || (isApproved ? 'Aprobado' : 'No Aprobado');

  return (
    <div
      className="modal-overlay active"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        style={{
          maxWidth: '820px',
          width: '94%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0d1322',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.75)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado del Modal */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.25rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '1rem',
            gap: '1rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.06em' }}>
                📄 Reporte Oficial de Conducción
              </span>
              <span className={`badge badge-${estado === 'Sobresaliente' ? 'success' : isApproved ? 'info' : 'warning'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.55rem' }}>
                {estado}
              </span>
            </div>
            <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#fff' }}>
              {evaluation.conductor || evaluation.operador || 'Sin Asignar'}
            </h2>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              🏢 {evaluation.empresa || 'Empresa'} {evaluation.sede ? `• 📍 ${evaluation.sede}` : ''} • Folio: {evaluation.folio || evaluation.id?.substring(0, 10)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              fontSize: '1.2rem',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease'
            }}
            title="Cerrar reporte"
          >
            ✕
          </button>
        </div>

        {/* Metadatos Generales */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fecha Capacitación</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
              {evaluation.fechaCapacitacionFormato || evaluation.fechaCapacitacion || evaluation.fechaReporte || evaluation.fecha || 'N/A'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Instructor & Folio</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
              {evaluation.instructor || 'Oficial'} {evaluation.folio ? `• Grupo: ${evaluation.folio}` : ''}
            </div>
          </div>
        </div>

        {/* Resumen Principal de Calificaciones */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '0.85rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>HABILIDADES DE MANEJO</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
              {(evaluation.habilidadesManejoPuntos || 0).toFixed(2)} <span style={{ fontSize: '0.75rem' }}>/ 3.0</span>
            </div>
          </div>
          <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', padding: '0.85rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>PRÁCTICA EN SIMULADOR</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c084fc', marginTop: '0.2rem' }}>
              {(evaluation.practicaSimuladorPuntos || 0).toFixed(2)} <span style={{ fontSize: '0.75rem' }}>/ 7.0</span>
            </div>
          </div>
          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '0.85rem', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>CALIFICACIÓN FINAL</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isApproved ? '#38bdf8' : '#ef4444', marginTop: '0.2rem' }}>
              {score.toFixed(2)} <span style={{ fontSize: '0.75rem' }}>/ 10.0</span>
            </div>
          </div>
        </div>

        {/* Bloque de Incidentes y Seguridad Vial */}
        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🚨 Incidentes y Seguridad en Simulador</span>
            <span style={{ fontSize: '0.72rem', color: totalIncidentes === 0 ? '#10b981' : '#f87171' }}>
              {totalIncidentes === 0 ? '✓ Sin Incidentes Graves' : `${totalIncidentes} ${totalIncidentes === 1 ? 'incidencia registrada' : 'incidencias registradas'}`}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.55rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💥 Colisiones</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: colisiones > 0 ? '#ef4444' : '#22c55e', marginTop: '0.15rem' }}>
                {colisiones}
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.55rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💀 Fatalidades</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: fatalidades > 0 ? '#ef4444' : '#22c55e', marginTop: '0.15rem' }}>
                {fatalidades}
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.55rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>🛑 Fuera de Vía</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: fueraVia > 0 ? '#ef4444' : '#22c55e', marginTop: '0.15rem' }}>
                {fueraVia}
              </div>
            </div>
          </div>
        </div>

        {/* Radar de Competencias de la Sesión Específica */}
        <SessionRadarWidget evaluation={evaluation} />

        {/* Ejercicios y Simulaciones Realizadas */}
        {Array.isArray(evaluation.ejercicios) && evaluation.ejercicios.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.6rem' }}>
              🎮 Ejercicios Evaluados ({evaluation.ejercicios.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
              {evaluation.ejercicios.map((ex, exIdx) => {
                const exName = ex.nombre || `Ejercicio ${exIdx + 1}`;
                const catalogItem = findCatalogExercise(exName);
                const desc = catalogItem?.descripcion || ex.comentarios;

                return (
                  <div
                    key={exIdx}
                    style={{
                      padding: '0.65rem 0.9rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      fontSize: '0.84rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 600 }}>
                        {ex.numero ? `#${ex.numero} • ` : ''}{exName}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: (ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado')
                            ? '#94a3b8'
                            : '#38bdf8',
                          background: (ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado')
                            ? 'rgba(148, 163, 184, 0.12)'
                            : 'transparent',
                          padding: (ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado')
                            ? '0.15rem 0.5rem'
                            : '0',
                          borderRadius: '4px',
                          fontSize: (ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado')
                            ? '0.74rem'
                            : '0.84rem'
                        }}
                      >
                        {(ex.noRealizado || ex.estado?.toLowerCase() === 'no realizado')
                          ? '⊘ No Realizado'
                          : typeof ex.calificacion === 'number'
                          ? `${ex.calificacion.toFixed(1)} pts`
                          : typeof (ex as any).score === 'number'
                            ? `${(ex as any).score.toFixed(1)} pts`
                            : 'Realizado'}
                      </span>
                    </div>
                    {desc && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#94a3b8',
                          marginTop: '0.35rem',
                          lineHeight: 1.45,
                          background: 'rgba(15, 23, 42, 0.4)',
                          padding: '0.35rem 0.6rem',
                          borderRadius: '6px',
                          borderLeft: '2px solid rgba(56, 189, 248, 0.5)'
                        }}
                      >
                        {desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer del Modal con Instructor y Cierre */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Instructor a cargo: </span>
            <strong style={{ color: '#fff' }}>{evaluation.instructor || 'Instructor Oficial TrackSIM'}</strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cerrar Reporte
          </button>
        </div>
      </div>
    </div>
  );
};
