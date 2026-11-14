import React, { useState, useEffect, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { CompanySummary, DriverConductor } from '../../types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { logAudit } from '../../services/auditLog';
import { useSystemDialogs } from '../../context/SystemDialogContext';
import {
  loadDiplomaTemplateImage,
  drawDiplomaOnCanvas,
  generateDiplomaDataUrl,
  generateDiplomaPdfArrayBuffer,
  downloadBlob,
  getSafeDiplomaFileName
} from '../../services/diplomaGenerator';

interface CompanyDiplomasModalProps {
  isOpen: boolean;
  onClose: () => void;
  comp: CompanySummary & { esGlobal?: boolean };
  selectedYear: string;
  periodText: string;
  initialDriverName?: string;
}

export const CompanyDiplomasModal: React.FC<CompanyDiplomasModalProps> = ({
  isOpen,
  onClose,
  comp,
  selectedYear,
  periodText,
  initialDriverName
}) => {
  const { showAlert } = useSystemDialogs();
  useEscapeKey(isOpen, onClose);

  // Lista de operadores del periodo filtrado
  const allDrivers: DriverConductor[] = useMemo(() => {
    if (!comp?.conductores) return [];
    return comp.conductores;
  }, [comp]);

  // Selección de operadores
  const [selectedDriverNames, setSelectedDriverNames] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'aprobados' | 'sobresalientes'>('all');
  const [activeDriverIndex, setActiveDriverIndex] = useState(0);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  // Estado de carga y generación
  const [templateImg, setTemplateImg] = useState<HTMLImageElement | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const cancelDownloadRef = useRef(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Inicializar selección con todos los operadores al abrir
  useEffect(() => {
    if (isOpen && allDrivers.length > 0) {
      const initialSet = new Set(allDrivers.map((d) => d.nombre));
      setSelectedDriverNames(initialSet);

      if (initialDriverName) {
        const foundIdx = allDrivers.findIndex((d) => d.nombre.toLowerCase() === initialDriverName.toLowerCase());
        if (foundIdx >= 0) {
          setActiveDriverIndex(foundIdx);
        } else {
          setActiveDriverIndex(0);
        }
      } else {
        setActiveDriverIndex(0);
      }
    }
  }, [isOpen, allDrivers, initialDriverName]);

  // Cargar plantilla al abrir
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingTemplate(true);
    setTemplateError(null);

    loadDiplomaTemplateImage()
      .then((img) => {
        if (isMounted) {
          setTemplateImg(img);
          setIsLoadingTemplate(false);
        }
      })
      .catch((err) => {
        console.error('Error al cargar la plantilla del diploma:', err);
        if (isMounted) {
          setTemplateError('No se pudo cargar la imagen de la plantilla del diploma.');
          setIsLoadingTemplate(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filtrado de operadores en la barra lateral
  const displayedDrivers = useMemo(() => {
    let list = [...allDrivers];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((d) => d.nombre.toLowerCase().includes(q));
    }

    if (statusFilter === 'aprobados') {
      list = list.filter((d) => (d.promedioScore ?? 0) >= 6.0 || d.estado === 'Aprobado' || d.estado === 'Sobresaliente');
    } else if (statusFilter === 'sobresalientes') {
      list = list.filter((d) => (d.promedioScore ?? 0) >= 8.0 || d.estado === 'Sobresaliente');
    }

    return list;
  }, [allDrivers, searchQuery, statusFilter]);

  // Operador activo para vista previa
  const activeDriver = displayedDrivers[activeDriverIndex] || displayedDrivers[0] || allDrivers[0] || null;
  const activeDriverDisplayName = activeDriver
    ? customNames[activeDriver.nombre] ?? activeDriver.nombre
    : '';

  // Redibujar la vista previa cuando cambie el operador activo o la plantilla
  useEffect(() => {
    if (!previewCanvasRef.current || !templateImg || !activeDriverDisplayName) return;

    const animId = requestAnimationFrame(() => {
      if (previewCanvasRef.current && templateImg) {
        drawDiplomaOnCanvas(previewCanvasRef.current, templateImg, {
          name: activeDriverDisplayName
        });
      }
    });

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [templateImg, activeDriverDisplayName]);

  if (!isOpen) return null;

  // Manejo de selecciones
  const toggleSelectDriver = (name: string) => {
    setSelectedDriverNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedDriverNames(new Set(displayedDrivers.map((d) => d.nombre)));
  };

  const deselectAll = () => {
    setSelectedDriverNames(new Set());
  };

  const handleNameChange = (newName: string) => {
    if (!activeDriver) return;
    setCustomNames((prev) => ({
      ...prev,
      [activeDriver.nombre]: newName
    }));
  };

  const handleResetName = () => {
    if (!activeDriver) return;
    setCustomNames((prev) => {
      const next = { ...prev };
      delete next[activeDriver.nombre];
      return next;
    });
  };

  const handleCancelDownload = () => {
    cancelDownloadRef.current = true;
    setBatchProgress((prev) =>
      prev ? { ...prev, message: 'Abortando descarga de PDFs...' } : null
    );
  };

  // Descarga en lote de todos los seleccionados en formato PDF dentro de un archivo ZIP
  const handleDownloadAllSelected = async () => {
    const selectedList = allDrivers.filter((d) => selectedDriverNames.has(d.nombre));
    if (selectedList.length === 0) {
      await showAlert('Por favor selecciona al menos un operador para descargar.');
      return;
    }

    cancelDownloadRef.current = false;
    setIsDownloadingAll(true);

    const loadedImg = templateImg || (await loadDiplomaTemplateImage());
    setBatchProgress({ current: 0, total: selectedList.length, message: 'Iniciando generación de PDFs...' });

    let downloadedCount = 0;
    try {
      const zip = new JSZip();

      for (let i = 0; i < selectedList.length; i++) {
        if (cancelDownloadRef.current) {
          break;
        }

        const driver = selectedList[i];
        const nameToUse = customNames[driver.nombre] ?? driver.nombre;
        setBatchProgress({
          current: i + 1,
          total: selectedList.length,
          message: `Generando PDF (${i + 1}/${selectedList.length}): ${nameToUse}`
        });

        const pdfBuffer = await generateDiplomaPdfArrayBuffer(nameToUse, loadedImg);
        if (cancelDownloadRef.current) {
          break;
        }

        const safeFileName = getSafeDiplomaFileName(nameToUse, 'pdf');
        zip.file(safeFileName, pdfBuffer);
        downloadedCount++;

        // Ceder el control brevemente para permitir cancelación y refresco de interfaz
        await new Promise((r) => setTimeout(r, 60));
      }

      if (cancelDownloadRef.current) {
        const periodDetail = selectedYear && selectedYear !== 'all' ? `Año ${selectedYear}` : periodText;
        void logAudit({
          categoria: 'datos',
          accion: 'imprimir',
          empresas: [comp.nombre],
          detalle: `Generación de ZIP de diplomas en PDF cancelada por usuario (${downloadedCount} de ${selectedList.length} procesados en ${comp.nombre}, ${periodDetail})`
        });
        return;
      }

      setBatchProgress({
        current: selectedList.length,
        total: selectedList.length,
        message: 'Comprimiendo archivo ZIP con todos los diplomas en PDF...'
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      if (cancelDownloadRef.current) {
        return;
      }

      const safeCompany = (comp.nombre || 'Empresa')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      const safePeriod = periodText.replace(/[^a-zA-Z0-9_-]/g, '_');
      const zipFileName = `Diplomas_PDF_${safeCompany}_${safePeriod}.zip`;

      downloadBlob(zipBlob, zipFileName);

      const periodDetail = selectedYear && selectedYear !== 'all' ? `Año ${selectedYear}` : periodText;
      void logAudit({
        categoria: 'datos',
        accion: 'imprimir',
        empresas: [comp.nombre],
        detalle: `Descarga de archivo ZIP con ${downloadedCount} diplomas en PDF (${comp.nombre}, ${periodDetail})`
      });
    } catch (err) {
      console.error('Error durante la generación del ZIP de diplomas PDF:', err);
      await showAlert('Ocurrió un error al compilar el archivo ZIP.');
    } finally {
      setIsDownloadingAll(false);
      setBatchProgress(null);
      cancelDownloadRef.current = false;
    }
  };

  // Impresión en lote (Multi-página PDF / Impresión del navegador)
  const handlePrintBatch = async () => {
    const selectedList = allDrivers.filter((d) => selectedDriverNames.has(d.nombre));
    if (selectedList.length === 0) {
      await showAlert('Por favor selecciona al menos un operador para imprimir.');
      return;
    }

    const frameDoc = printIframeRef.current?.contentDocument;
    const frameWin = printIframeRef.current?.contentWindow;
    if (!frameDoc || !frameWin) {
      await showAlert('El servicio de impresión no está listo.');
      return;
    }

    const loadedImg = templateImg || (await loadDiplomaTemplateImage());
    setBatchProgress({ current: 0, total: selectedList.length, message: 'Preparando diplomas para impresión...' });

    try {
      const diplomasData: { name: string; dataUrl: string }[] = [];

      for (let i = 0; i < selectedList.length; i++) {
        const driver = selectedList[i];
        const nameToUse = customNames[driver.nombre] ?? driver.nombre;
        setBatchProgress({
          current: i + 1,
          total: selectedList.length,
          message: `Renderizando diploma ${i + 1} de ${selectedList.length}: ${nameToUse}`
        });

        const dataUrl = await generateDiplomaDataUrl(nameToUse, loadedImg);
        diplomasData.push({ name: nameToUse, dataUrl });
      }

      setBatchProgress({
        current: selectedList.length,
        total: selectedList.length,
        message: 'Abriendo cuadro de diálogo de impresión...'
      });

      const safeCompany = comp.nombre || 'Empresa';
      const printTitle = `Diplomas_${safeCompany}_${periodText.replace(/\s+/g, '_')}`;

      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>${printTitle}</title>
          <style>
            @page {
              size: letter landscape;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: 100% !important;
              background: #ffffff !important;
            }
            .diploma-page {
              width: 11in !important;
              height: 8.5in !important;
              max-width: 11in !important;
              max-height: 8.5in !important;
              margin: 0 auto !important;
              padding: 0 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              break-after: page !important;
              break-inside: avoid !important;
              overflow: hidden !important;
            }
            .diploma-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .diploma-img {
              width: 100% !important;
              height: 100% !important;
              max-width: 11in !important;
              max-height: 8.5in !important;
              object-fit: contain !important;
              display: block !important;
              margin: auto !important;
            }
            @media screen {
              body {
                background: #0f172a;
              }
              .diploma-page {
                padding: 1rem 0;
              }
              .diploma-img {
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                border-radius: 4px;
              }
            }
          </style>
        </head>
        <body>
          ${diplomasData
            .map(
              (item) => `
            <div class="diploma-page">
              <img class="diploma-img" src="${item.dataUrl}" alt="${item.name}" />
            </div>
          `
            )
            .join('')}
        </body>
        </html>
      `);
      frameDoc.close();

      void logAudit({
        categoria: 'datos',
        accion: 'imprimir',
        empresas: [comp.nombre],
        detalle: `Impresión/PDF de ${selectedList.length} diplomas tamaño carta (${comp.nombre}, ${periodText})`
      });

      // Esperar brevemente a que las imágenes se carguen en el DOM del iframe
      setTimeout(() => {
        setBatchProgress(null);
        frameWin.focus();
        frameWin.print();
      }, 600);
    } catch (err) {
      console.error('Error al preparar la impresión:', err);
      await showAlert('Ocurrió un error al generar la vista previa de impresión.');
      setBatchProgress(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '1240px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface, #1e293b)',
          borderRadius: '18px',
          border: '1px solid var(--border-glow, rgba(56, 189, 248, 0.3))',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden'
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '1.15rem 1.75rem',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.25), rgba(234, 88, 12, 0.15))',
                border: '1px solid rgba(249, 115, 22, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}
            >
              🎓
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main, #f8fafc)' }}>
                  Generador de Diplomas de Conducción
                </h2>
                <span
                  style={{
                    background: 'rgba(249, 115, 22, 0.15)',
                    border: '1px solid rgba(249, 115, 22, 0.4)',
                    color: '#fb923c',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.55rem',
                    borderRadius: '6px'
                  }}
                >
                  Plantilla Oficial
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)' }}>
                Filtros aplicados:{' '}
                <strong style={{ color: 'var(--text-main, #f8fafc)' }}>{comp.nombre}</strong> •{' '}
                <strong style={{ color: 'var(--text-main, #f8fafc)' }}>{periodText}</strong> ({allDrivers.length}{' '}
                operadores evaluados)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        {/* Cuerpo Principal: 2 Columnas (Lista de Operadores + Vista Previa) */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '360px 1fr',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {/* Columna Izquierda: Roster de Operadores y Filtros */}
          <div
            style={{
              borderRight: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0, 0, 0, 0.15)',
              minHeight: 0
            }}
          >
            {/* Controles de Búsqueda y Filtros de la Lista */}
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))' }}>
              <input
                type="text"
                placeholder="🔍 Buscar operador por nombre..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveDriverIndex(0);
                }}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  background: 'var(--bg-app, #0f172a)',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                  color: 'var(--text-main, #f8fafc)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                  marginBottom: '0.75rem'
                }}
              />

              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  style={{
                    flex: '1 1 auto',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid',
                    cursor: 'pointer',
                    background: statusFilter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    borderColor: statusFilter === 'all' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                    color: statusFilter === 'all' ? '#38bdf8' : 'var(--text-secondary, #94a3b8)'
                  }}
                >
                  Todos ({allDrivers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('aprobados')}
                  style={{
                    flex: '1 1 auto',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid',
                    cursor: 'pointer',
                    background: statusFilter === 'aprobados' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                    borderColor: statusFilter === 'aprobados' ? '#22c55e' : 'rgba(255, 255, 255, 0.1)',
                    color: statusFilter === 'aprobados' ? '#22c55e' : 'var(--text-secondary, #94a3b8)'
                  }}
                >
                  Aprobados
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('sobresalientes')}
                  style={{
                    flex: '1 1 auto',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid',
                    cursor: 'pointer',
                    background: statusFilter === 'sobresalientes' ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
                    borderColor: statusFilter === 'sobresalientes' ? '#f97316' : 'rgba(255, 255, 255, 0.1)',
                    color: statusFilter === 'sobresalientes' ? '#f97316' : 'var(--text-secondary, #94a3b8)'
                  }}
                >
                  Sobresalientes
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
                  {selectedDriverNames.size} de {displayedDrivers.length} seleccionados
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={selectAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: 0
                    }}
                  >
                    Marcar todos
                  </button>
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: 0
                    }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            </div>

            {/* Lista con scroll de Operadores */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {displayedDrivers.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>No se encontraron operadores con los filtros actuales.</p>
                </div>
              ) : (
                displayedDrivers.map((driver, idx) => {
                  const isChecked = selectedDriverNames.has(driver.nombre);
                  const isActive = activeDriver?.nombre === driver.nombre;
                  const score = driver.promedioScore ?? 0;
                  const isPassed = score >= 6.0;

                  return (
                    <div
                      key={driver.nombre}
                      onClick={() => setActiveDriverIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.75rem',
                        borderRadius: '10px',
                        marginBottom: '0.35rem',
                        cursor: 'pointer',
                        background: isActive
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${
                          isActive ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.05)'
                        }`,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectDriver(driver.nombre);
                          }}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#f97316' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: isActive ? 700 : 500,
                              color: 'var(--text-main, #f8fafc)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            title={driver.nombre}
                          >
                            {customNames[driver.nombre] ?? driver.nombre}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                            Score: <strong style={{ color: isPassed ? '#22c55e' : '#ef4444' }}>{score.toFixed(1)}</strong>{' '}
                            • {driver.sede || 'Sede central'}
                          </div>
                        </div>
                      </div>

                      {isActive && (
                        <span style={{ fontSize: '0.8rem', color: '#38bdf8', paddingLeft: '0.4rem' }}>
                          👁️
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Columna Derecha: Vista Previa y Editor del Nombre */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(0, 0, 0, 0.3)',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            {activeDriver ? (
              <>
                {/* Barra de Ajuste de Nombre y Navegación de la Vista Previa */}
                <div
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 320px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Nombre en Diploma:
                    </label>
                    <input
                      type="text"
                      value={activeDriverDisplayName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Nombre completo del operador..."
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.75rem',
                        borderRadius: '6px',
                        background: 'var(--bg-app, #0f172a)',
                        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
                        color: 'var(--text-main, #f8fafc)',
                        fontWeight: 700,
                        fontSize: '0.88rem'
                      }}
                    />
                    {customNames[activeDriver.nombre] && (
                      <button
                        type="button"
                        onClick={handleResetName}
                        title="Restablecer nombre original del sistema"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f97316',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>

                  {/* Botones de Navegación entre Operadores */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      disabled={activeDriverIndex <= 0}
                      onClick={() => setActiveDriverIndex((prev) => Math.max(0, prev - 1))}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: activeDriverIndex <= 0 ? 'rgba(255, 255, 255, 0.25)' : 'var(--text-main, #f8fafc)',
                        cursor: activeDriverIndex <= 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      ◀ Anterior
                    </button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', minWidth: '60px', textAlign: 'center' }}>
                      {displayedDrivers.length > 0 ? activeDriverIndex + 1 : 0} de {displayedDrivers.length}
                    </span>
                    <button
                      type="button"
                      disabled={activeDriverIndex >= displayedDrivers.length - 1}
                      onClick={() => setActiveDriverIndex((prev) => Math.min(displayedDrivers.length - 1, prev + 1))}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color:
                          activeDriverIndex >= displayedDrivers.length - 1
                            ? 'rgba(255, 255, 255, 0.25)'
                            : 'var(--text-main, #f8fafc)',
                        cursor: activeDriverIndex >= displayedDrivers.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Siguiente ▶
                    </button>
                  </div>
                </div>

                {/* Área de Visualización del Canvas */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.25rem',
                    overflow: 'auto',
                    position: 'relative'
                  }}
                >
                  {isLoadingTemplate && (
                    <div style={{ textAlign: 'center', color: '#38bdf8' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          border: '3px solid rgba(56, 189, 248, 0.2)',
                          borderTopColor: '#38bdf8',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                          margin: '0 auto 0.75rem'
                        }}
                      />
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando plantilla oficial...</p>
                    </div>
                  )}

                  {templateError && (
                    <div style={{ color: '#ef4444', textAlign: 'center', padding: '1.5rem' }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>⚠️ {templateError}</p>
                    </div>
                  )}

                  <canvas
                    ref={previewCanvasRef}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 12px 35px rgba(0, 0, 0, 0.55)',
                      display: isLoadingTemplate || templateError ? 'none' : 'block'
                    }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: '0.95rem'
                }}
              >
                No hay ningún operador seleccionado para visualización.
              </div>
            )}
          </div>
        </div>

        {/* Barra de Progreso si se está ejecutando generación masiva */}
        {batchProgress && (
          <div
            style={{
              padding: '0.65rem 1.5rem',
              background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.2), rgba(56, 189, 248, 0.2))',
              borderTop: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(249, 115, 22, 0.3)',
                  borderTopColor: '#f97316',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main, #f8fafc)' }}>
                {batchProgress.message}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f97316' }}>
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </span>
              {isDownloadingAll && (
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  style={{
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Cancelar y detener de inmediato la descarga"
                >
                  <span style={{ color: '#ef4444', fontSize: '0.95rem', fontWeight: 900, lineHeight: 1 }}>✕</span>
                  <span>Cancelar</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pie del Modal con Acciones de Descarga e Impresión */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.02), transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)' }}>
            <strong>{selectedDriverNames.size}</strong> operador(es) seleccionado(s) de{' '}
            <strong>{allDrivers.length}</strong> disponibles
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {isDownloadingAll ? (
              <button
                type="button"
                onClick={handleCancelDownload}
                className="btn btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'rgba(239, 68, 68, 0.22)',
                  border: '1.5px solid #ef4444',
                  color: '#ef4444',
                  boxShadow: '0 0 14px rgba(239, 68, 68, 0.4)'
                }}
                title="Cancelar y detener de inmediato la generación del archivo ZIP"
              >
                <span style={{ color: '#ef4444', fontSize: '1.15rem', fontWeight: 900, lineHeight: 1 }}>✕</span>
                <span>Cancelar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadAllSelected}
                disabled={selectedDriverNames.size === 0 || !!batchProgress}
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.95rem',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: selectedDriverNames.size === 0 || !!batchProgress ? 'not-allowed' : 'pointer',
                  opacity: selectedDriverNames.size === 0 || !!batchProgress ? 0.6 : 1
                }}
                title="Descargar todos los diplomas seleccionados como documentos PDF individuales comprimidos en un archivo ZIP"
              >
                <span>📦</span>
                <span>Descargar Todos (ZIP de PDFs) ({selectedDriverNames.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintBatch}
              disabled={selectedDriverNames.size === 0 || !!batchProgress}
              className="btn btn-primary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: '1px solid rgba(249, 115, 22, 0.4)',
                background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                color: '#ffffff',
                cursor: selectedDriverNames.size === 0 || !!batchProgress ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                opacity: selectedDriverNames.size === 0 || !!batchProgress ? 0.6 : 1
              }}
              title="Abre el cuadro de diálogo de impresión para imprimir o guardar como PDF en orientación horizontal"
            >
              <span>🖨️</span>
              <span>Imprimir / Guardar PDF ({selectedDriverNames.size})</span>
            </button>
          </div>
        </div>

        {/* Iframe oculto para renderizado e impresión masiva de diplomas */}
        <iframe
          ref={printIframeRef}
          title="Print Frame Diplomas"
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            width: '1px',
            height: '1px',
            opacity: 0.01,
            pointerEvents: 'none',
            border: 'none'
          }}
        />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
