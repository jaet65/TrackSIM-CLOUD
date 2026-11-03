import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ExerciseCatalogModal } from './ExerciseCatalogModal';
import { loadPdfJs } from '../services/pdfJsLoader';
import { logAudit } from '../services/auditLog';
import { StagedEvaluation } from '../types';

export const IngestaTab: React.FC = () => {
  const { userRole } = useAuth();
  const { reloadEvaluations } = useData();

  if (userRole !== 'admin') {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', margin: '2rem auto', maxWidth: '600px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>Acceso Restringido</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          La ingesta y carga de reportes PDF es una función exclusiva para administradores.
        </p>
      </div>
    );
  }

  const [isDragging, setIsDragging] = useState(false);
  const [stagingFiles, setStagingFiles] = useState<StagedEvaluation[]>([]);
  const [ingestVersion, setIngestVersion] = useState<'v2' | 'legacy'>('v2');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [batchEmpresa, setBatchEmpresa] = useState('');
  const [batchSede, setBatchSede] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' });
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      setFeedback({ message: 'Por favor selecciona archivos en formato PDF.', type: 'warning' });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: pdfFiles.length, text: 'Iniciando procesamiento de reportes...' });
    try {
      if (ingestVersion === 'v2') {
        const { parseTrackSimZeroPdfBatch } = await import('../services/trackSimZeroPdfParser');
        const { results, failures } = await parseTrackSimZeroPdfBatch(pdfFiles, (current, total, text) => {
          setProgress({ current, total, text });
        });
        setStagingFiles((prev) => [...prev, ...results]);
        const failureSummary = failures.length > 0
          ? ` ${failures.length} archivo(s) no se pudieron importar: ${failures.slice(0, 3).map((failure) => `${failure.fileName}: ${failure.error}`).join(' | ')}`
          : '';
        setFeedback({
          message: `Se procesaron ${results.length} de ${pdfFiles.length} expedientes V2.${failureSummary} Revisa los datos antes de guardar.`,
          type: failures.length > 0 ? 'warning' : results.length > 0 ? 'success' : 'error'
        });
      } else {
        await loadPdfJs();
        const { parsePDFBatch } = await import('../services/pdfBatchProcessor');
        const results = await parsePDFBatch(pdfFiles, (current, total, text) => {
          setProgress({ current, total, text });
        });
        setStagingFiles((prev) => [...prev, ...results]);
        setFeedback({
          message: `¡Se procesaron ${results.length} de ${pdfFiles.length} reporte(s) PDF Legacy con éxito! Revisa la información antes de guardar en Firestore.`,
          type: results.length > 0 ? 'success' : 'warning'
        });
      }
    } catch (err: unknown) {
      console.error('Error procesando lote de PDFs:', err);
      setFeedback({
        message: err instanceof Error
          ? `Ocurrió un error al procesar el lote de PDFs: ${err.message}`
          : 'Ocurrió un error desconocido al procesar el lote de PDFs.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyBatch = () => {
    if (stagingFiles.length === 0) return;
    if (!batchEmpresa.trim() && !batchSede.trim()) {
      setFeedback({ message: 'Ingresa una empresa o sede para asignar al lote.', type: 'warning' });
      return;
    }

    setStagingFiles((prev) =>
      prev.map((item) => ({
        ...item,
        empresa: batchEmpresa.trim() || item.empresa,
        sede: batchSede.trim() || item.sede
      }))
    );

    setFeedback({ message: `Empresa/Sede asignadas a los ${stagingFiles.length} reportes del lote.`, type: 'info' });
  };

  const handleResetToOriginal = () => {
    setStagingFiles((prev) =>
      prev.map((item) => ({
        ...item,
        empresa: item.originalEmpresa || '',
        sede: item.originalSede || ''
      }))
    );
    setBatchEmpresa('');
    setBatchSede('');
    setFeedback({ message: 'Se restauraron los datos detectados originalmente de cada PDF.', type: 'info' });
  };

  const handleConfirmAndSave = async () => {
    if (stagingFiles.length === 0) return;
    if (stagingFiles.some((item) => item.origen === 'TrackSIM-ZERO-V2' && !item.empresa.trim())) {
      setFeedback({
        message: 'Asigna una empresa a todos los expedientes V2 antes de guardarlos. Usa la asignación en lote.',
        type: 'warning'
      });
      return;
    }

    setIsSaving(true);
    setProgress({ current: 0, total: stagingFiles.length, text: 'Guardando evaluaciones en Cloud Firestore...' });

    try {
      const { db, setDoc, doc } = await import('../services/firebaseFirestore');
      for (let i = 0; i < stagingFiles.length; i++) {
        const item = stagingFiles[i];
        setProgress({
          current: i + 1,
          total: stagingFiles.length,
          text: `Guardando (${i + 1}/${stagingFiles.length}): ${item.conductor || item.operador}`
        });

        const evalId = item.id || `eval_${Date.now()}_${i}`;
        const cleanPayload = JSON.parse(JSON.stringify({
          ...item,
          id: evalId,
          updatedAt: new Date().toISOString()
        }));
        await setDoc(doc(db, 'evaluaciones', evalId), cleanPayload, { merge: true });
      }

      await reloadEvaluations();
      void logAudit({
        categoria: 'reporte',
        accion: 'crear',
        cantidad: stagingFiles.length,
        empresas: stagingFiles.map((f) => f.empresa).filter(Boolean),
        detalle: stagingFiles.slice(0, 5).map((f) => f.conductor || f.operador || f.folio || f.id).filter(Boolean).join(', ')
      });
      setFeedback({ message: `¡Se han guardado ${stagingFiles.length} evaluaciones en Firestore exitosamente!`, type: 'success' });
    } catch (e: any) {
      console.error('Error guardando evaluaciones:', e);
      setFeedback({ message: 'Ocurrió un error al guardar en Firestore. Intenta de nuevo.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="view-section active">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
            {ingestVersion === 'v2' ? '📥 Ingesta V2 — Expedientes individuales' : '📥 Ingesta PDF Legacy (V1)'}
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {ingestVersion === 'v2'
              ? 'Carga expedientes individuales exportados desde TrackSIM-ZERO.'
              : 'Compatibilidad con reportes PDF del formato anterior de TrackSIM CLOUD.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className={ingestVersion === 'v2' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setIngestVersion('v2')}
            disabled={isProcessing || isSaving}
          >
            V2 · Expedientes individuales
          </button>
          <button
            type="button"
            className={ingestVersion === 'legacy' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setIngestVersion('legacy')}
            disabled={isProcessing || isSaving}
          >
            V1 · PDF Legacy
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsCatalogModalOpen(true)}
            title="Administrar los ejercicios reconocidos por el sistema y sus descripciones oficiales"
          >
            📚 Catálogo de Ejercicios
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            background:
              feedback.type === 'success'
                ? 'rgba(34, 197, 94, 0.15)'
                : feedback.type === 'warning'
                ? 'rgba(245, 158, 11, 0.15)'
                : feedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(34, 197, 94, 0.3)'
                : feedback.type === 'warning'
                ? 'rgba(245, 158, 11, 0.3)'
                : feedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.3)'
                : 'rgba(56, 189, 248, 0.3)'
            }`,
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Zona de Arrastre de PDFs (Dropzone) */}
      <div
        className={`card ${isDragging ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleFiles(Array.from(e.dataTransfer.files));
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed #38bdf8' : '2px dashed rgba(255, 255, 255, 0.15)',
          background: isDragging ? 'rgba(56, 189, 248, 0.05)' : 'var(--bg-card)',
          padding: '3rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          borderRadius: '12px',
          marginBottom: '2rem',
          transition: 'all 0.2s ease'
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept=".pdf"
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            e.currentTarget.value = '';
            if (files.length > 0) await handleFiles(files);
          }}
        />
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📄</div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
          Arrastra tus expedientes PDF aquí o haz clic para explorar
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          {ingestVersion === 'v2'
            ? 'Carga múltiple de expedientes individuales TrackSIM-ZERO; asigna empresa antes de guardar.'
            : 'Carga múltiple de reportes PDF del formato Legacy V1.'}
        </p>
      </div>

      {/* Barra de Progreso */}
      {(isProcessing || isSaving) && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            <span>{progress.text}</span>
            <span>{progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : ''}</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                transition: 'width 0.2s ease'
              }}
            />
          </div>
        </div>
      )}

      {/* Bandeja de Previsualización (Staging) */}
      {stagingFiles.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                📋 Evaluaciones Procesadas para Guardar ({stagingFiles.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Verifica los datos extraídos antes de confirmar el guardado en la base de datos
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStagingFiles([])}
              >
                Descartar Lote
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmAndSave}
                disabled={isSaving}
              >
                {isSaving ? 'Guardando...' : '💾 Confirmar y Guardar en Firestore'}
              </button>
            </div>
          </div>

          {/* Asignación en Lote */}
          <div style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Asignar en lote:</span>
            <input
              type="text"
              placeholder="Empresa para todo el lote..."
              value={batchEmpresa}
              onChange={(e) => setBatchEmpresa(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
            />
            <input
              type="text"
              placeholder="Sede (ej: Irapuato, Morelia...)"
              value={batchSede}
              onChange={(e) => setBatchSede(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleApplyBatch}>
              Aplicar al Lote
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetToOriginal}>
              ↺ Restaurar Originales
            </button>
          </div>

          <div className="table-responsive" style={{ width: '100%', overflowX: 'auto' }}>
            <table className="custom-table" style={{ width: '100%', minWidth: '950px' }}>
              <thead>
                <tr>
                  <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                  <th>Operador Extraído</th>
                  <th>Empresa</th>
                  <th>Sede</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'center' }}>Puntaje</th>
                  <th style={{ textAlign: 'center' }}>Incidentes</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {stagingFiles.map((item, idx) => {
                  const score = item.evaluacionFinalPuntos ?? item.calificacionExacta ?? item.promedioScore ?? 0;
                  const incidentes = (item.colisiones || 0) + (item.fatalidades || 0) + (item.vehiculoFueraVia || 0);

                  return (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{item.conductor || item.operador}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.fileName}</div>
                      </td>
                      <td style={{ color: '#e2e8f0', fontWeight: 500 }}>
                        {item.origen === 'TrackSIM-ZERO-V2' ? (
                          <input
                            type="text"
                            aria-label={`Empresa de ${item.conductor || item.fileName}`}
                            value={item.empresa}
                            onChange={(event) => {
                              const empresa = event.currentTarget.value;
                              setStagingFiles((prev) =>
                                prev.map((staged) => staged.id === item.id ? { ...staged, empresa } : staged)
                              );
                            }}
                            style={{ minWidth: '140px', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.82rem' }}
                          />
                        ) : item.empresa || 'N/A'}
                      </td>
                      <td>
                        {item.origen === 'TrackSIM-ZERO-V2' ? (
                          <input
                            type="text"
                            aria-label={`Sede de ${item.conductor || item.fileName}`}
                            value={item.sede || ''}
                            onChange={(event) => {
                              const sede = event.currentTarget.value;
                              setStagingFiles((prev) =>
                                prev.map((staged) => staged.id === item.id ? { ...staged, sede } : staged)
                              );
                            }}
                            style={{ minWidth: '120px', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#fff', fontSize: '0.82rem' }}
                          />
                        ) : item.sede ? (
                          <span style={{ fontSize: '0.78rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            📍 {item.sede}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte || item.fecha || 'N/A'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: score >= 6.0 ? '#38bdf8' : '#f87171', fontWeight: 700, fontSize: '0.92rem' }}>
                          {score.toFixed(2)}
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: incidentes > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                          {incidentes}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-info">{item.estado || 'Procesado'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Catálogo de Ejercicios */}
      <ExerciseCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
      />
    </div>
  );
};
