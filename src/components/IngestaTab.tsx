import React, { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Evaluation } from '../types';

// Declare global PDF.js lib
declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export const IngestaTab: React.FC = () => {
  const { reloadEvaluations } = useData();

  const [isDragging, setIsDragging] = useState(false);
  const [stagingFiles, setStagingFiles] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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

    // Dynamic import of pdf-parser from public/js to leverage parsing engine
    let parsePDFFile: any;
    try {
      const importDynamic = new Function('modulePath', 'return import(modulePath)');
      const module = await importDynamic('/js/pdf-parser.js');
      parsePDFFile = module.parsePDFFile;
    } catch (e) {
      console.warn('Fallback cargando parser local:', e);
    }

    const results: any[] = [];
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      setProgress({
        current: i + 1,
        total: pdfFiles.length,
        text: `Extrayendo datos de (${i + 1}/${pdfFiles.length}): ${file.name}`
      });

      try {
        if (parsePDFFile) {
          const parsed = await parsePDFFile(file, file.name);
          results.push({
            id: `eval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            ...parsed,
            originalEmpresa: parsed.empresa || '',
            originalSede: parsed.sede || '',
            fileName: file.name
          });
        }
      } catch (err: any) {
        console.error(`Error al procesar ${file.name}:`, err);
      }
    }

    setIsProcessing(false);
    setStagingFiles((prev) => [...prev, ...results]);
    setFeedback({
      message: `¡Se procesaron ${results.length} reporte(s) con éxito! Revisa la información antes de guardar en Firestore.`,
      type: 'success'
    });
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
    setIsSaving(true);
    setProgress({ current: 0, total: stagingFiles.length, text: 'Guardando evaluaciones en Cloud Firestore...' });

    try {
      const { db, setDoc, doc } = await import('../services/firebase');
      for (let i = 0; i < stagingFiles.length; i++) {
        const item = stagingFiles[i];
        setProgress({
          current: i + 1,
          total: stagingFiles.length,
          text: `Guardando (${i + 1}/${stagingFiles.length}): ${item.conductor || item.operador}`
        });

        const evalId = item.id || `eval_${Date.now()}_${i}`;
        const cleanData: Evaluation = {
          ...item,
          id: evalId,
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'evaluaciones', evalId), cleanData, { merge: true });
      }

      await reloadEvaluations();
      setStagingFiles([]);
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
      <div className="section-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>📥 Ingesta y Procesamiento de Reportes PDF</h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Extracción client-side ultra rápida de reportes de simulación TrackSIM
        </p>
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
            if (e.target.files && e.target.files.length > 0) {
              await handleFiles(Array.from(e.target.files));
            }
          }}
        />
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📄</div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
          Arrastra tus reportes PDF aquí o haz clic para explorar
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Soporta carga masiva simultánea de múltiples evaluaciones en formato PDF
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

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Operador Extraído</th>
                  <th>Empresa</th>
                  <th>Sede</th>
                  <th>Fecha</th>
                  <th>Puntaje</th>
                  <th>Incidentes</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {stagingFiles.map((item, idx) => {
                  const score = item.evaluacionFinalPuntos ?? item.calificacionExacta ?? item.promedioScore ?? 0;
                  const incidentes = (item.colisiones || 0) + (item.fatalidades || 0) + (item.vehiculoFueraVia || 0);

                  return (
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{item.conductor || item.operador}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.fileName}</div>
                      </td>
                      <td>{item.empresa || 'N/A'}</td>
                      <td>{item.sede || 'N/A'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {item.fechaCapacitacionFormato || item.fechaCapacitacion || item.fechaReporte || item.fecha || 'N/A'}
                      </td>
                      <td>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                          {score.toFixed(2)}
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> / 10</small>
                        </span>
                      </td>
                      <td>
                        <span style={{ color: incidentes > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                          {incidentes}
                        </span>
                      </td>
                      <td>
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
    </div>
  );
};
