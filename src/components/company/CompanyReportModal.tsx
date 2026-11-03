import React, { useEffect, useRef, useState } from 'react';
import { CompanySummary } from '../../types';
import { logAudit } from '../../services/auditLog';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface CompanyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  comp: CompanySummary;
  selectedYear: string;
  periodText: string;
}

export const CompanyReportModal: React.FC<CompanyReportModalProps> = ({
  isOpen,
  onClose,
  comp,
  selectedYear,
  periodText
}) => {
  useEscapeKey(isOpen, onClose);

  const [previewDocument, setPreviewDocument] = useState('');
  const [previewError, setPreviewError] = useState('');
  const previewFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewDocument('');
      setPreviewError('');
      return;
    }

    const report = document.querySelector<HTMLElement>('.view-section.active');
    if (!report) {
      setPreviewDocument('');
      setPreviewError('No fue posible cargar el contenido completo del expediente.');
      return;
    }

    const preview = report.cloneNode(true) as HTMLElement;
    preview.classList.add('company-report-document');
    preview.querySelectorAll('.modal-overlay').forEach((modal) => modal.remove());

    const reportHeader = document.createElement('header');
    reportHeader.className = 'company-report-masthead';
    const brand = document.createElement('div');
    brand.className = 'company-report-brand';
    brand.textContent = 'TRACKSIM CLOUD';
    const title = document.createElement('h1');
    title.textContent = 'Expediente ejecutivo de flota';
    const metadata = document.createElement('div');
    metadata.className = 'company-report-metadata';
    [comp.nombre, periodText, `Emitido el ${new Date().toLocaleDateString('es-MX')}`].forEach((value) => {
      const item = document.createElement('span');
      item.textContent = value;
      metadata.appendChild(item);
    });
    reportHeader.append(brand, title, metadata);
    preview.prepend(reportHeader);

    const originalCanvases = report.querySelectorAll('canvas');
    const previewCanvases = preview.querySelectorAll('canvas');
    originalCanvases.forEach((canvas, index) => {
      const previewCanvas = previewCanvases[index];
      if (!previewCanvas) return;

      try {
        const chartImage = document.createElement('img');
        chartImage.src = canvas.toDataURL('image/png');
        chartImage.alt = 'Gráfico del expediente';
        chartImage.style.width = '100%';
        chartImage.style.height = 'auto';
        previewCanvas.replaceWith(chartImage);
      } catch (error) {
        console.error('No se pudo preparar un gráfico para la vista previa del expediente:', error);
      }
    });

    const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map((stylesheet) => stylesheet.outerHTML)
      .join('');
    const inlineStyles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.outerHTML)
      .join('');
    const theme = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    const themeAttribute = theme ? ` data-theme="${theme}"` : '';

    setPreviewDocument(`<!doctype html>
      <html${themeAttribute}>
        <head>
          <base href="${document.baseURI}">
          <meta charset="utf-8">
          ${stylesheets}
          ${inlineStyles}
          <title>TrackSIM Cloud - Expediente ejecutivo</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; }
            html, body { width: 100%; min-height: 100%; margin: 0; padding: 0; background: #f1f5f9 !important; color: #172033 !important; font: 9pt/1.45 "Segoe UI", Arial, sans-serif !important; overflow: visible !important; }
            .no-print, .navbar, .subnav-tabs, button, .badge-info, .screen-only { display: none !important; }
            .print-only { display: block !important; }
            .company-report-document { width: 100%; max-width: 1100px; margin: 0 auto; padding: 28px 34px 40px; background: #fff; }
            .company-report-masthead { position: relative; margin-bottom: 22px; padding: 2px 0 17px; border-bottom: 2px solid #dce5ef; }
            .company-report-masthead::after { position: absolute; bottom: -2px; left: 0; width: 74px; height: 3px; background: #0284c7; content: ""; }
            .company-report-brand { color: #0284c7; font-size: 8pt; font-weight: 800; letter-spacing: .16em; }
            .company-report-masthead h1 { margin: 7px 0 10px; color: #10233f; font-size: 22pt; font-weight: 750; letter-spacing: -.035em; line-height: 1.15; }
            .company-report-metadata { display: flex; flex-wrap: wrap; gap: 7px; color: #53647a; font-size: 8.5pt; }
            .company-report-metadata span { padding: 4px 9px; border: 1px solid #dbe5ef; border-radius: 999px; background: #f8fafc; }
            .company-report-document .view-section { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
            .company-report-document .company-executive-card { margin: 0 0 18px !important; padding: 15px 17px !important; border: 1px solid #d8e3ee !important; border-left: 4px solid #0284c7 !important; border-radius: 11px !important; background: linear-gradient(135deg, #f8fbff, #fff 72%) !important; box-shadow: 0 3px 12px rgba(16, 35, 63, .05) !important; }
            .company-report-document .company-executive-heading { padding-bottom: 12px !important; border-bottom: 1px solid #dce5ef !important; }
            .company-report-document .company-executive-heading h2 { color: #10233f !important; font-size: 15pt !important; }
            .company-report-document .company-executive-card > div:last-child { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px !important; }
            .company-report-document .company-executive-card > div:last-child > div { min-width: 0; padding: 9px 10px !important; border: 1px solid #e0e8f0; border-radius: 8px; background: #fff; }
            .company-report-document .company-executive-card > div:last-child > div > div:first-child { margin-bottom: 3px; color: #718096 !important; font-size: 7pt !important; letter-spacing: .055em; }
            .company-report-document .card { width: 100% !important; max-width: 100% !important; margin: 0 0 16px !important; padding: 0 !important; overflow: visible !important; border: 1px solid #dce5ef !important; border-radius: 10px !important; background: #fff !important; box-shadow: 0 2px 8px rgba(16, 35, 63, .035) !important; }
            .company-report-document .card > div:first-child, .company-report-document .card > summary { padding: 12px 15px !important; border-bottom: 1px solid #e7edf4 !important; background: #f8fafc !important; }
            .company-report-document .card h3, .company-report-document .card summary { color: #17314f !important; font-size: 10pt !important; font-weight: 750 !important; }
            .company-report-document .card > div:not(:first-child) { padding: 12px 15px !important; }
            .company-report-document .table-responsive { width: 100% !important; max-width: 100% !important; overflow: visible !important; }
            .company-report-document table.print-table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: separate !important; border-spacing: 0 !important; font-size: 7.5pt !important; }
            .company-report-document table.print-table th { padding: 7px 6px !important; border-bottom: 1px solid #d5e0eb !important; background: #edf4fa !important; color: #314760 !important; font-size: 7pt !important; font-weight: 750 !important; letter-spacing: .035em; text-align: left; text-transform: uppercase; }
            .company-report-document table.print-table td { padding: 6px !important; border-bottom: 1px solid #e8edf3 !important; color: #34445a !important; vertical-align: middle; }
            .company-report-document table.print-table tbody tr:nth-child(even) { background: #f8fafc !important; }
            .company-report-document .print-avoid-break, .company-report-document table.print-table tr { break-inside: avoid; }
            .company-report-document img { display: block; max-width: 100% !important; height: auto !important; }
            @media (max-width: 700px) {
              .company-report-document { padding: 18px 14px 28px; }
              .company-report-document .company-executive-card > div:last-child { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .company-report-masthead h1 { font-size: 18pt; }
            }
            @page { size: letter portrait; margin: 12mm 10mm; }
            @media print {
              html, body { background: #fff !important; }
              .company-report-document { width: 100%; max-width: none; margin: 0; padding: 0; }
              .company-report-document .card { box-shadow: none !important; }
              .company-report-document .company-executive-card { box-shadow: none !important; }
              .company-report-document .card > div:first-child, .company-report-document .card > summary { break-after: avoid; }
            }
          </style>
        </head>
        <body${themeAttribute}>${preview.outerHTML}</body>
      </html>`);
    setPreviewError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const previousTitle = document.title;
    const safeCompany = (comp.nombre || 'Flota').trim();
    const safePeriod = periodText.replace(/\s*[–—]\s*/g, '-').replace(/\s+/g, '_');
    const printTitle = `TrackSIM Cloud_${safeCompany}_${safePeriod}`;
    const frameDocument = previewFrame.current?.contentDocument;
    const frameWindow = previewFrame.current?.contentWindow;
    if (!frameDocument || !frameWindow) {
      setPreviewError('La vista previa aún no está lista para imprimir. Inténtalo de nuevo.');
      return;
    }

    document.title = printTitle;
    frameDocument.title = printTitle;

    void logAudit({
      categoria: 'datos',
      accion: 'imprimir',
      empresas: [comp.nombre],
      detalle: `Impresión / PDF del resumen de ${comp.nombre}${selectedYear && selectedYear !== 'all' ? ` (Año ${selectedYear})` : ''}`
    });

    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      setTimeout(() => {
        document.title = previousTitle;
      }, 1000);
    }
  };

  return (
    <div
      className="modal-overlay active no-print"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-backdrop)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        className="single-page-modal-dialog"
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-glow)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-app)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                Vista previa completa del Expediente
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {comp.nombre} • {periodText}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
              <span>🖨️</span> Imprimir Expediente
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: '1rem', background: 'var(--bg-app)' }}>
          {previewDocument ? (
            <iframe
              ref={previewFrame}
              title="Vista previa completa del expediente PDF"
              srcDoc={previewDocument}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                minHeight: '70vh',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                background: '#ffffff'
              }}
              onLoad={(event) => {
                event.currentTarget.contentDocument?.addEventListener('keydown', (keyboardEvent) => {
                  if (keyboardEvent.key !== 'Escape') return;
                  keyboardEvent.preventDefault();
                  onClose();
                });
              }}
            />
          ) : (
            <div role="status" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {previewError || 'Cargando vista previa completa...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
