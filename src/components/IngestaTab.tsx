import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ExerciseCatalogModal } from './ExerciseCatalogModal';
import { loadPdfJs } from '../services/pdfJsLoader';
import { logAudit } from '../services/auditLog';
import { shortInstructorName } from '../services/instructorName';
import { filterDuplicateEvaluationsByFolio, prepareZeroGroupRefresh } from '../services/evaluationDedupe';
import type { StagedEvaluation } from '../types';
import {
  filterZeroCloudExportGroups,
  getZeroGroupImportStatus,
  type ZeroCloudExportGroup
} from '../services/zeroExportContract';

type ZeroGroupListFilter = 'all' | 'pending' | 'review' | 'imported';

const ZERO_GROUP_PAGE_SIZE = 20;

function formatZeroGroupDate(value?: string): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

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
  const [zeroGroupSearch, setZeroGroupSearch] = useState('');
  const [zeroGroupListFilter, setZeroGroupListFilter] = useState<ZeroGroupListFilter>('all');
  const [zeroGroupPage, setZeroGroupPage] = useState(1);
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
      setZeroGroupSearch('');
      setZeroGroupListFilter('all');
      setZeroGroupPage(1);
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

  const handleRefreshZeroImport = async () => {
    if (!selectedZeroExportId || !user?.email) return;
    if (stagingFiles.length > 0) {
      setFeedback({
        message: 'Guarda o descarta primero el lote que está en revisión antes de actualizar un grupo importado.',
        type: 'warning'
      });
      return;
    }

    const selectedGroup = zeroExports.find((entry) => entry.id === selectedZeroExportId);
    if (!selectedGroup) {
      setFeedback({ message: 'Selecciona un grupo exportado desde ZERO.', type: 'warning' });
      return;
    }

    const status = getZeroGroupImportStatus(
      selectedGroup,
      evaluations,
      stagingFiles,
      zeroGroupFolios[selectedGroup.id]
    );
    if (!status.isImported) {
      setFeedback({
        message: 'El grupo debe estar completamente importado antes de actualizarlo.',
        type: 'warning'
      });
      return;
    }

    const confirmed = window.confirm(
      `Se actualizarán ${status.importedCount} expedientes con la exportación más reciente de «${selectedGroup.groupName}» en ZERO. ` +
      'Se conservarán la empresa, la sede y las anotaciones locales de CLOUD. ¿Deseas continuar?'
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setProgress({
      current: 0,
      total: selectedGroup.expectedCount,
      text: `Leyendo la exportación actualizada de ${selectedGroup.groupName} desde ZERO...`
    });

    let completed = 0;
    try {
      const { loadZeroExportEvaluations } = await import('../services/zeroFirestore');
      const { group, evaluations: incoming } = await loadZeroExportEvaluations(selectedGroup.id, user);
      const { updates, missingIds, obsoleteIds } = prepareZeroGroupRefresh(incoming, evaluations, group);
      if (missingIds.length > 0 || obsoleteIds.length > 0) {
        throw new Error(
          `No se actualizó ningún expediente: la lista de CLOUD y ZERO no coincide ` +
          `(faltantes en CLOUD: ${missingIds.length}; registros adicionales en CLOUD: ${obsoleteIds.length}).`
        );
      }

      const { db, doc, writeBatch } = await import('../services/firebaseFirestore');
      const chunkSize = 400;
      for (let offset = 0; offset < updates.length; offset += chunkSize) {
        const chunk = updates.slice(offset, offset + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((item, index) => {
          setProgress({
            current: offset + index + 1,
            total: updates.length,
            text: `Actualizando (${offset + index + 1}/${updates.length}): ${item.conductor || item.operador}`
          });
          const cleanPayload = JSON.parse(JSON.stringify({
            ...item,
            id: item.id,
            updatedAt: new Date().toISOString()
          }));
          batch.set(doc(db, 'evaluaciones', item.id), cleanPayload);
        });
        await batch.commit();
        completed += chunk.length;
      }

      await reloadEvaluations();
      setZeroExports((previous) => previous.map((entry) => entry.id === group.id ? group : entry));
      void logAudit({
        categoria: 'reporte',
        accion: 'modificar',
        cantidad: updates.length,
        empresas: updates.map((item) => item.empresa),
        detalle: `Actualización desde ZERO del grupo ${group.groupName}; se conservaron empresa y sede de CLOUD.`
      });
      setFeedback({
        message: `Se actualizaron ${updates.length} expedientes de «${group.groupName}» con las notas vigentes de ZERO. Se conservaron empresa y sede.`,
        type: 'success'
      });
    } catch (error: unknown) {
      console.error('Error actualizando expedientes importados desde ZERO:', error);
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      setFeedback({
        message: completed > 0
          ? `La actualización se detuvo después de guardar ${completed} expedientes: ${detail}`
          : detail,
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
  const filteredZeroExports = filterZeroCloudExportGroups(zeroExports, zeroGroupSearch);
  const zeroExportRows = filteredZeroExports.map((group) => ({
    group,
    status: getZeroGroupImportStatus(group, evaluations, stagingFiles, zeroGroupFolios[group.id])
  }));
  const zeroGroupFilterCounts = {
    all: zeroExportRows.length,
    pending: zeroExportRows.filter(({ status }) => status.remainingCount > 0).length,
    review: zeroExportRows.filter(({ status }) => status.isStaged).length,
    imported: zeroExportRows.filter(({ status }) => status.isImported).length
  };
  const visibleZeroExportRows = zeroExportRows.filter(({ status }) => {
    if (zeroGroupListFilter === 'pending') return status.remainingCount > 0;
    if (zeroGroupListFilter === 'review') return status.isStaged;
    if (zeroGroupListFilter === 'imported') return status.isImported;
    return true;
  });
  const zeroGroupPageCount = Math.max(1, Math.ceil(visibleZeroExportRows.length / ZERO_GROUP_PAGE_SIZE));
  const currentZeroGroupPage = Math.min(zeroGroupPage, zeroGroupPageCount);
  const paginatedZeroExportRows = visibleZeroExportRows.slice(
    (currentZeroGroupPage - 1) * ZERO_GROUP_PAGE_SIZE,
    currentZeroGroupPage * ZERO_GROUP_PAGE_SIZE
  );
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
              Para un grupo ya importado, actualiza primero la lista y luego usa «Actualizar desde ZERO»; no necesitas eliminarlo.
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
          </div>
        </div>
        {zeroExports.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <input
                type="search"
                aria-label="Buscar grupos de ZERO"
                placeholder="Buscar por nombre, folio o ID..."
                value={zeroGroupSearch}
                onChange={(event) => {
                  setZeroGroupSearch(event.currentTarget.value);
                  setSelectedZeroExportId('');
                  setZeroGroupPage(1);
                }}
                disabled={isProcessing || isSaving}
                style={{ width: '320px', maxWidth: '100%', padding: '0.6rem 0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-main)' }}
              />
              <span aria-live="polite" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {visibleZeroExportRows.length} de {zeroExportRows.length} resultados · {zeroExports.length} grupos
              </span>
            </div>

            <div role="group" aria-label="Filtrar grupos por estado" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {([
                ['all', 'Todos'],
                ['pending', 'Pendientes'],
                ['review', 'En revisión'],
                ['imported', 'Importados']
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  className={`btn btn-sm ${zeroGroupListFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={zeroGroupListFilter === filter}
                  onClick={() => {
                    setZeroGroupListFilter(filter);
                    setSelectedZeroExportId('');
                    setZeroGroupPage(1);
                  }}
                  disabled={isProcessing || isSaving}
                >
                  {label} ({zeroGroupFilterCounts[filter]})
                </button>
              ))}
            </div>

            {visibleZeroExportRows.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', fontSize: '0.78rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th scope="col" style={{ padding: '0.7rem', fontWeight: 600 }}>Grupo</th>
                        <th scope="col" aria-sort="descending" style={{ padding: '0.7rem', fontWeight: 600 }}>Fecha</th>
                        <th scope="col" style={{ padding: '0.7rem', fontWeight: 600 }}>Expedientes</th>
                        <th scope="col" style={{ padding: '0.7rem', fontWeight: 600 }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedZeroExportRows.map(({ group, status }) => {
                        const isSelected = selectedZeroExportId === group.id;
                        const stateLabel = status.isImported
                          ? 'Importado'
                          : status.isStaged
                            ? 'En revisión'
                            : status.importedCount > 0 || status.stagedCount > 0
                              ? 'Parcial'
                              : 'Pendiente';
                        const stateColor = status.isImported
                          ? 'var(--success)'
                          : status.isStaged
                            ? 'var(--primary)'
                            : status.importedCount > 0 || status.stagedCount > 0
                              ? 'var(--warning)'
                              : 'var(--text-muted)';
                        const stateBackground = status.isImported
                          ? 'var(--success-bg)'
                          : status.isStaged
                            ? 'var(--primary-glow)'
                            : status.importedCount > 0 || status.stagedCount > 0
                              ? 'var(--warning-bg)'
                              : 'transparent';
                        const date = group.completedAt || group.closedAt;

                        return (
                          <tr
                            key={group.id}
                            style={{
                              background: isSelected ? 'var(--bg-card-hover)' : 'transparent',
                              borderBottom: '1px solid var(--border-subtle)'
                            }}
                          >
                            <td style={{ padding: '0.65rem 0.7rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name="selected-zero-group"
                                  aria-label={`Seleccionar grupo ${group.groupName}`}
                                  checked={isSelected}
                                  onChange={() => setSelectedZeroExportId(group.id)}
                                  disabled={isProcessing || isSaving}
                                />
                                <span>
                                  <strong style={{ display: 'block', fontSize: '0.88rem' }}>{group.groupName}</strong>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                    {group.groupFolio || group.id}
                                  </span>
                                </span>
                              </label>
                            </td>
                            <td style={{ padding: '0.65rem 0.7rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              {formatZeroGroupDate(date)}
                            </td>
                            <td style={{ padding: '0.65rem 0.7rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              {status.importedCount + status.stagedCount}/{group.expectedCount}
                            </td>
                            <td style={{ padding: '0.65rem 0.7rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', color: stateColor, background: stateBackground, fontSize: '0.75rem', fontWeight: 600 }}>
                                {stateLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {zeroGroupPageCount > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setZeroGroupPage((page) => Math.max(1, page - 1))}
                      disabled={currentZeroGroupPage === 1}
                    >
                      Anterior
                    </button>
                    <span aria-live="polite" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Página {currentZeroGroupPage} de {zeroGroupPageCount}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setZeroGroupPage((page) => Math.min(zeroGroupPageCount, page + 1))}
                      disabled={currentZeroGroupPage === zeroGroupPageCount}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p role="status" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {filteredZeroExports.length === 0
                  ? 'No hay grupos que coincidan con la búsqueda.'
                  : 'No hay grupos con este estado.'}
              </p>
            )}

            {selectedZeroExport && selectedZeroImportStatus ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  <strong>{selectedZeroExport.groupName}:</strong>{' '}
                  {selectedZeroImportStatus.isImported
                    ? `${selectedZeroImportStatus.importedCount} de ${selectedZeroExport.expectedCount} expedientes guardados en CLOUD.`
                    : selectedZeroImportStatus.remainingCount === 0
                      ? `${selectedZeroImportStatus.importedCount} guardados y ${selectedZeroImportStatus.stagedCount} en revisión.`
                      : selectedZeroImportStatus.importedCount > 0 || selectedZeroImportStatus.stagedCount > 0
                        ? `${selectedZeroImportStatus.importedCount} guardados y ${selectedZeroImportStatus.stagedCount} en revisión; faltan ${selectedZeroImportStatus.remainingCount} de ${selectedZeroExport.expectedCount}.`
                        : `Los ${selectedZeroExport.expectedCount} expedientes aún no aparecen importados en CLOUD.`}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImportZeroExport}
                    disabled={isProcessing || isSaving || Boolean(selectedZeroImportStatus.isImported || selectedZeroImportStatus.isStaged)}
                  >
                    {selectedZeroImportStatus.isImported
                      ? 'Ya importado'
                      : selectedZeroImportStatus.isStaged
                        ? 'En bandeja de revisión'
                        : selectedZeroImportStatus.importedCount
                          ? `Importar pendientes (${selectedZeroImportStatus.remainingCount})`
                          : 'Importar expedientes'}
                  </button>
                  {selectedZeroImportStatus.isImported && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleRefreshZeroImport}
                      disabled={isProcessing || isSaving || stagingFiles.length > 0}
                      title="Actualizar las notas y datos desde ZERO conservando empresa, sede y anotaciones locales"
                    >
                      ↻ Actualizar desde ZERO
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: '0.85rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Selecciona un grupo de la lista para ver sus acciones.
              </p>
            )}
          </div>
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
