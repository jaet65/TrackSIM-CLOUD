import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ExerciseCatalogModal } from './ExerciseCatalogModal';
import { loadPdfJs } from '../services/pdfJsLoader';
import { logAudit } from '../services/auditLog';
import { shortInstructorName } from '../services/instructorName';
import { filterDuplicateEvaluationsByFolio } from '../services/evaluationDedupe';
import type { StagedEvaluation } from '../types';
import { getZeroGroupImportStatus, type ZeroCloudExportGroup } from '../services/zeroExportContract';

export const IngestaTab: React.FC = () => {
  const { userRole, profile, user } = useAuth();
  const { reloadEvaluations, evaluations } = useData();

  if (userRole !== 'admin') {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', margin: '2rem auto', maxWidth: '600px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>Acceso Restringido</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          La ingesta y carga de reportes es una función exclusiva para administradores.
        </p>
      </div>
    );
  }

  const [stagingFiles, setStagingFiles] = useState<StagedEvaluation[]>([]);
  const [ingestSource, setIngestSource] = useState<'zero' | 'pdf'>('zero');
  const [ingestVersion, setIngestVersion] = useState<'v2' | 'legacy'>('v2');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [zeroExports, setZeroExports] = useState<ZeroCloudExportGroup[]>([]);
  const [selectedZeroExportId, setSelectedZeroExportId] = useState('');
  const [zeroConnectedEmail, setZeroConnectedEmail] = useState('');
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [batchEmpresa, setBatchEmpresa] = useState('');
  const [batchSede, setBatchSede] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' });
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [zeroGroupFolios, setZeroGroupFolios] = useState<Record<string, ReadonlySet<string>>>({});

  const loadGroupFolios = async (groups: ZeroCloudExportGroup[], expectedAdmin: NonNullable<typeof user>) => {
    const { loadZeroExportEvaluations } = await import('../services/zeroFirestore');
    for (const entry of groups) {
      try {
        const { evaluations: groupEvaluations } = await loadZeroExportEvaluations(entry.id, expectedAdmin);
        const folios = new Set(groupEvaluations.map((item) => item.folio).filter((folio): folio is string => Boolean(folio)));
        setZeroGroupFolios((previous) => ({ ...previous, [entry.id]: folios }));
      } catch (error) {
        console.warn(`No se pudieron precargar los folios del grupo ${entry.id}:`, error);
      }
    }
  };

  const handleConnectToZero = async () => {
    if (!user?.email) {
      setFeedback({ message: 'No se encontró el correo de la sesión actual.', type: 'error' });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: 0, text: 'Conectando con Firestore de TrackSIM-ZERO...' });
    try {
      const { connectToZeroAndListExports } = await import('../services/zeroFirestore');
      const exports = await connectToZeroAndListExports(user);
      setZeroExports(exports);
      void loadGroupFolios(exports, user);
      setSelectedZeroExportId((current) =>
        exports.some((entry) => entry.id === current) ? current : exports[0]?.id || ''
      );
      setZeroConnectedEmail(user.email);
      setFeedback({
        message: exports.length > 0
          ? `Conexión autorizada a ZERO. Se encontraron ${exports.length} grupo(s) con exportación completa.`
          : 'Conexión autorizada a ZERO, pero no hay grupos con exportación completa.',
        type: exports.length > 0 ? 'success' : 'info'
      });
    } catch (error: unknown) {
      console.error('Error conectando con las exportaciones de ZERO:', error);
      setFeedback({
        message: error instanceof Error ? error.message : 'No se pudo conectar con TrackSIM-ZERO.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportZeroExport = async () => {
    if (!selectedZeroExportId || !user?.email) return;

    const selectedGroup = zeroExports.find((entry) => entry.id === selectedZeroExportId);
    if (!selectedGroup) {
      setFeedback({ message: 'Selecciona un grupo exportado desde ZERO.', type: 'warning' });
      return;
    }

    const importStatus = getZeroGroupImportStatus(selectedGroup, evaluations, stagingFiles);
    if (importStatus.isImported || importStatus.isStaged) {
      setFeedback({
        message: importStatus.isImported
          ? `El grupo ${selectedGroup.groupName} ya está importado en CLOUD.`
          : `Todos los expedientes de ${selectedGroup.groupName} ya están en la bandeja de revisión.`,
        type: 'info'
      });
      return;
    }

    setIsProcessing(true);
    setProgress({
      current: 0,
      total: selectedGroup.expectedCount,
      text: `Leyendo expedientes del grupo ${selectedGroup.groupName} desde ZERO...`
    });
    try {
      const { loadZeroExportEvaluations } = await import('../services/zeroFirestore');
      const { group, evaluations: imported } = await loadZeroExportEvaluations(selectedGroup.id, user);
      const { fresh, duplicates } = filterDuplicateEvaluationsByFolio(imported, [...evaluations, ...stagingFiles]);
      setStagingFiles((previous) => [...previous, ...fresh]);
      setFeedback({
        message: `Se importaron ${fresh.length} de ${imported.length} expedientes del grupo ${group.groupName} desde ZERO.${duplicates.length > 0 ? ` ${duplicates.length} duplicado(s) omitido(s) por folio o ID.` : ''} Asigna empresa y sede antes de guardar.`,
        type: duplicates.length > 0 ? 'warning' : fresh.length > 0 ? 'success' : 'info'
      });
    } catch (error: unknown) {
      console.error('Error importando exportación de ZERO:', error);
      setFeedback({
        message: error instanceof Error ? error.message : 'No se pudo importar la exportación de ZERO.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith('.pdf'));
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
        const { fresh, duplicates } = filterDuplicateEvaluationsByFolio(results, [...evaluations, ...stagingFiles]);
        const instructor = shortInstructorName(profile?.displayName || user?.displayName || user?.email);
        const attributedFresh = fresh.map((item) => instructor ? { ...item, instructor } : item);
        setStagingFiles((previous) => [...previous, ...attributedFresh]);
        const duplicateNames = duplicates.map((item) => item.fileName || item.conductor || item.folio || item.id);
        const failureSummary = failures.length > 0
          ? ` ${failures.length} archivo(s) no se pudieron importar: ${failures.slice(0, 3).map((failure) => `${failure.fileName}: ${failure.error}`).join(' | ')}`
          : '';
        const duplicateSummary = duplicates.length > 0
          ? ` ${duplicates.length} duplicado(s) omitido(s) (folio ya cargado, guardado o repetido en el lote): ${duplicateNames.slice(0, 3).join(', ')}.`
          : '';
        setFeedback({
          message: `Se agregaron ${attributedFresh.length} de ${pdfFiles.length} expedientes V2.${duplicateSummary}${failureSummary} Revisa los datos antes de guardar.`,
          type: failures.length > 0 || duplicates.length > 0 ? 'warning' : attributedFresh.length > 0 ? 'success' : 'error'
        });
      } else {
        await loadPdfJs();
        const { parsePDFBatch } = await import('../services/pdfBatchProcessor');
        const results = await parsePDFBatch(pdfFiles, (current, total, text) => {
          setProgress({ current, total, text });
        });
        setStagingFiles((previous) => [...previous, ...results]);
        setFeedback({
          message: `¡Se procesaron ${results.length} de ${pdfFiles.length} reporte(s) PDF Legacy con éxito! Revisa la información antes de guardar en Firestore.`,
          type: results.length > 0 ? 'success' : 'warning'
        });
      }
    } catch (error: unknown) {
      console.error('Error procesando lote de PDFs:', error);
      setFeedback({
        message: error instanceof Error
          ? `Ocurrió un error al procesar el lote de PDFs: ${error.message}`
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

    setFeedback({ message: `Empresa/Sede asignadas a los ${stagingFiles.length} expedientes.`, type: 'info' });
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
    setFeedback({ message: 'Se restauraron los datos originales de empresa y sede.', type: 'info' });
  };

  const handleConfirmAndSave = async () => {
    if (stagingFiles.length === 0) return;
    if (stagingFiles.some((item) => item.origen === 'TrackSIM-ZERO-V2' && !item.empresa.trim())) {
      setFeedback({
        message: 'Asigna una empresa a todos los expedientes de ZERO antes de guardarlos. Usa la asignación en lote.',
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
      setStagingFiles([]);
      setBatchEmpresa('');
      setBatchSede('');
    } catch (e: any) {
      console.error('Error guardando evaluaciones:', e);
      setFeedback({ message: 'Ocurrió un error al guardar en Firestore. Intenta de nuevo.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedZeroExport = zeroExports.find((entry) => entry.id === selectedZeroExportId);
  const selectedZeroImportStatus = selectedZeroExport
    ? getZeroGroupImportStatus(selectedZeroExport, evaluations, stagingFiles, zeroGroupFolios[selectedZeroExport.id])
    : null;

  const progressBar = (
    <>
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
    </>
  );

  return (
    <div className="view-section active">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
            📥 Ingesta de evaluaciones
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Elige el origen de los datos; después revisa los expedientes antes de guardarlos.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
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

      <div role="tablist" aria-label="Origen de la ingesta" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          role="tab"
          aria-selected={ingestSource === 'zero'}
          className={ingestSource === 'zero' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setIngestSource('zero')}
          disabled={isProcessing || isSaving}
        >
          ☁️ Firestore de ZERO
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ingestSource === 'pdf'}
          className={ingestSource === 'pdf' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setIngestSource('pdf')}
          disabled={isProcessing || isSaving}
        >
          📄 Carga de PDF
        </button>
      </div>

      {ingestSource === 'zero' ? (
      <div className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Importar grupo congelado desde ZERO</h3>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Solo lee exportaciones completas. Conecta con la misma cuenta Google corporativa verificada y asigna empresa/sede antes de guardar.
            </p>
            {zeroConnectedEmail && (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--success)', fontSize: '0.78rem' }}>
                Conectado a ZERO como {zeroConnectedEmail}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleConnectToZero}
              disabled={isProcessing || isSaving}
            >
              {zeroConnectedEmail ? '↻ Actualizar grupos' : '🔐 Conectar con ZERO'}
            </button>
            {zeroExports.length > 0 && (
              <>
                <select
                  aria-label="Grupo congelado exportado desde ZERO"
                  value={selectedZeroExportId}
                  onChange={(event) => setSelectedZeroExportId(event.currentTarget.value)}
                  disabled={isProcessing || isSaving}
                  style={{ maxWidth: '360px', padding: '0.55rem 0.7rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-main)' }}
                >
                  {zeroExports.map((entry) => (
                    (() => {
                      const status = getZeroGroupImportStatus(entry, evaluations, stagingFiles, zeroGroupFolios[entry.id]);
                      const statusLabel = status.isImported
                        ? ' · Ya importado'
                        : status.remainingCount === 0
                          ? ' · En revisión'
                          : status.importedCount > 0
                            ? ` · ${status.importedCount}/${entry.expectedCount} importados`
                            : '';
                      return (
                        <option key={entry.id} value={entry.id}>
                          {entry.groupFolio ? `${entry.groupFolio} · ` : ''}{entry.groupName} ({entry.expectedCount}){statusLabel}
                        </option>
                      );
                    })()
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImportZeroExport}
                  disabled={isProcessing || isSaving || !selectedZeroExportId || Boolean(selectedZeroImportStatus?.isImported || selectedZeroImportStatus?.isStaged)}
                >
                  {selectedZeroImportStatus?.isImported
                    ? 'Ya importado'
                    : selectedZeroImportStatus?.isStaged
                      ? 'En bandeja de revisión'
                      : selectedZeroImportStatus?.importedCount
                        ? `Importar pendientes (${selectedZeroImportStatus.remainingCount})`
                        : 'Importar expedientes'}
                </button>
              </>
            )}
          </div>
        </div>
        {selectedZeroExport && selectedZeroImportStatus && (
          <p style={{ margin: '0.85rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {selectedZeroImportStatus.isImported
              ? `Este grupo ya tiene ${selectedZeroImportStatus.importedCount} de ${selectedZeroExport.expectedCount} expedientes guardados en CLOUD.`
              : selectedZeroImportStatus.remainingCount === 0
                ? `Todos los expedientes ya están en revisión: ${selectedZeroImportStatus.importedCount} guardados y ${selectedZeroImportStatus.stagedCount} pendientes de guardar.`
                : selectedZeroImportStatus.importedCount > 0 || selectedZeroImportStatus.stagedCount > 0
                  ? `Detectados ${selectedZeroImportStatus.importedCount} ya guardados y ${selectedZeroImportStatus.stagedCount} en revisión; faltan ${selectedZeroImportStatus.remainingCount} de ${selectedZeroExport.expectedCount}.`
                  : `Los ${selectedZeroExport.expectedCount} expedientes todavía no aparecen importados en CLOUD.`}
          </p>
        )}
      </div>
      ) : (
        <div className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Importar desde archivo PDF</h3>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Selecciona el formato del reporte que vas a cargar.
              </p>
            </div>
            <div role="tablist" aria-label="Formato PDF" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                role="tab"
                aria-selected={ingestVersion === 'v2'}
                className={ingestVersion === 'v2' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setIngestVersion('v2')}
                disabled={isProcessing || isSaving}
              >
                V2 · Expedientes ZERO
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ingestVersion === 'legacy'}
                className={ingestVersion === 'legacy' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setIngestVersion('legacy')}
                disabled={isProcessing || isSaving}
              >
                V1 · PDF Legacy
              </button>
            </div>
          </div>
          <div
            className={`card ${isDragging ? 'dragover' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDragging(false);
              if (event.dataTransfer.files.length > 0) {
                await handleFiles(Array.from(event.dataTransfer.files));
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: isDragging ? '2px dashed #38bdf8' : '2px dashed rgba(255, 255, 255, 0.15)',
              background: isDragging ? 'rgba(56, 189, 248, 0.05)' : 'var(--bg-card)',
              padding: '2rem 1.25rem',
              textAlign: 'center',
              cursor: 'pointer',
              borderRadius: '12px',
              transition: 'all 0.2s ease'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept=".pdf"
              onClick={(event) => event.stopPropagation()}
              onChange={async (event) => {
                const files = Array.from(event.currentTarget.files || []);
                event.currentTarget.value = '';
                if (files.length > 0) await handleFiles(files);
              }}
            />
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📄</div>
            <h4 style={{ margin: '0 0 0.4rem', fontSize: '1rem', fontWeight: 700 }}>
              Arrastra los PDF aquí o haz clic para seleccionarlos
            </h4>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {ingestVersion === 'v2'
                ? 'Expedientes individuales de TrackSIM-ZERO.'
                : 'Reportes del formato Legacy V1.'}
            </p>
          </div>
        </div>
      )}

      {feedback && stagingFiles.length === 0 && (
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

      {/* Barra de Progreso */}
      {(isProcessing || isSaving) && stagingFiles.length === 0 && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          {progressBar}
        </div>
      )}

      {/* Modal de Previsualización (Staging) */}
      {stagingFiles.length > 0 && (
        <div
          className="modal-overlay active"
          style={{ zIndex: 1100, backgroundColor: 'var(--modal-backdrop)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
        <div
          className="modal-dialog"
          role="dialog"
          aria-modal="true"
          style={{ width: '95%', maxWidth: '1200px', maxHeight: '90vh', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}
        >
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
                disabled={isSaving}
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

          {isSaving && (
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
              {progressBar}
            </div>
          )}

          {feedback && (
            <div
              style={{
                padding: '0.75rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderBottom: '1px solid var(--border-subtle)',
                color: feedback.type === 'error' ? '#f87171' : feedback.type === 'warning' ? '#fbbf24' : feedback.type === 'success' ? '#4ade80' : '#38bdf8',
                background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : feedback.type === 'warning' ? 'rgba(245, 158, 11, 0.12)' : feedback.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <span>{feedback.message}</span>
              <button type="button" onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}>
                ✕
              </button>
            </div>
          )}

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
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{item.conductor || item.operador}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.fileName}</div>
                      </td>
                      <td style={{ color: '#e2e8f0', fontWeight: 500 }}>{item.empresa || 'N/A'}</td>
                      <td>
                        {item.sede ? (
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
