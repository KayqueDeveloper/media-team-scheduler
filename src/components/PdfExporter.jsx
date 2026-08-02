import React, { useState } from 'react';
import { Download, MessageCircle, Printer } from 'lucide-react';
import { exportToPdf, shareToWhatsApp } from '../utils/pdfExport';
import '../styles/print.css';

export const PdfExporter = ({
  schedule,
  volunteers,
  sundays,
  shifts,
  roles,
  monthLabel = 'Setembro 2026',
  status = 'published'
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const volunteersMap = React.useMemo(() => {
    return volunteers.reduce((acc, v) => {
      acc[v.id] = v;
      return acc;
    }, {});
  }, [volunteers]);

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    const filename = `escala-transmissao-${monthLabel.toLowerCase().replace(/\s+/g, '-')}.pdf`;
    await exportToPdf('pdf-printable-document', filename);
    setIsExporting(false);
  };

  const handleWhatsAppShare = () => {
    shareToWhatsApp(schedule, volunteersMap, sundays, roles, monthLabel);
  };

  const handlePrint = () => {
    window.print();
  };

  // Get month name in uppercase (e.g., "SETEMBRO" or "JULHO")
  const extractedMonth = monthLabel.split(' ')[0].toUpperCase();

  return (
    <div className="pdf-exporter-wrapper">
      <div className="no-print glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Exportação da Escala de Transmissão</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Layout idêntico ao modelo oficial da igreja para impressão em PDF A4 ou compartilhamento no grupo do WhatsApp.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={handlePrint}>
              <Printer size={16} />
              Imprimir
            </button>

            <button className="btn btn-success" onClick={handleWhatsAppShare}>
              <MessageCircle size={16} />
              Enviar no WhatsApp
            </button>

            <button className="btn btn-primary" onClick={handleDownloadPdf} disabled={isExporting}>
              <Download size={16} />
              {isExporting ? 'Gerando PDF...' : 'Baixar PDF A4'}
            </button>
          </div>
        </div>
      </div>

      {/* Printable Element - Exact Replica of Reference PDF Layout */}
      <div id="pdf-printable-document" className="pdf-printable-area">
        {/* Top Banner Header */}
        <div className="pdf-banner-header">
          ESCALA COMPLETA TRANSMISSÃO | {extractedMonth}
        </div>

        {/* Main Grid Table */}
        <table className="pdf-schedule-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>TURNO / DIA</th>
              {roles.map(role => (
                <th key={role.id}>{role.shortName.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sundays.map((sunday, idx) => {
              // Extract short date (e.g. "06/09" or "12/07")
              const shortDate = sunday.formatted.slice(0, 5);

              return (
                <React.Fragment key={sunday.date}>
                  {/* Morning Shift Row */}
                  <tr>
                    <td className="td-date-shift">{shortDate} - MANHÃ</td>
                    {roles.map(role => {
                      const volId = schedule[sunday.date]?.['MORNING']?.[role.id];
                      const volName = volId ? (volunteersMap[volId]?.name || 'Não alocado') : '';
                      return (
                        <td key={role.id} className="td-volunteer-cell">
                          {volName}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Night Shift Row */}
                  <tr>
                    <td className="td-date-shift">{shortDate} - NOITE</td>
                    {roles.map(role => {
                      const volId = schedule[sunday.date]?.['NIGHT']?.[role.id];
                      const volName = volId ? (volunteersMap[volId]?.name || 'Não alocado') : '';
                      return (
                        <td key={role.id} className="td-volunteer-cell">
                          {volName}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Black Separator Bar between different Sundays */}
                  {idx < sundays.length - 1 && (
                    <tr className="sunday-separator-row">
                      <td colSpan={roles.length + 1}></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="pdf-footer-note">
          <span>Equipe de Transmissão & Mídia</span>
          <span>Status: {status === 'published' ? 'OFICIAL' : 'RASCUNHO'}</span>
        </div>
      </div>
    </div>
  );
};
