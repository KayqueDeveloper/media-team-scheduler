// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { Download, MessageCircle, Printer } from 'lucide-react';
import { exportToPdf, shareToWhatsApp } from '../utils/pdfExport';
import { getSlotAssignment } from '../utils/scheduleUtils';
import '../styles/print.css';

export const PdfExporter = ({
  schedule,
  volunteers,
  sundays,
  shifts,
  roles,
  monthLabel = 'Setembro 2026',
  status = 'published',
  version = null,
  versions = []
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const hasPublishedSnapshot = versions.some((item) => Number(item.version) === Number(version));
  const [selectedVersion, setSelectedVersion] = useState(() =>
    status === 'published' && version ? String(version) : 'current'
  );
  const selectedSnapshot = versions.find((item) => String(item.version) === selectedVersion);
  const displaySchedule = selectedSnapshot?.matrix || schedule;
  const displayVersion = selectedSnapshot?.version || version;
  const isOfficial = Boolean(selectedSnapshot) || status === 'published';

  React.useEffect(() => {
    setSelectedVersion(status === 'published' && hasPublishedSnapshot ? String(version) : 'current');
  }, [monthLabel, status, version, hasPublishedSnapshot]);

  const volunteersMap = React.useMemo(() => {
    return volunteers.reduce((acc, v) => {
      acc[v.id] = v;
      return acc;
    }, {});
  }, [volunteers]);
  const displayVolunteersMap = React.useMemo(
    () => ({
      ...volunteersMap,
      ...(selectedSnapshot?.volunteerNames || {})
    }),
    [volunteersMap, selectedSnapshot]
  );

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    const prefix = isOfficial ? 'escala-transmissao' : 'previa-rascunho-escala-transmissao';
    const versionSuffix = isOfficial && displayVersion ? `-v${displayVersion}` : '';
    const filename = `${prefix}-${monthLabel.toLowerCase().replace(/\s+/g, '-')}${versionSuffix}.pdf`;
    await exportToPdf('pdf-printable-document', filename);
    setIsExporting(false);
  };

  const handleWhatsAppShare = () => {
    if (isOfficial) shareToWhatsApp(displaySchedule, displayVolunteersMap, sundays, roles, monthLabel);
  };

  const handlePrint = () => {
    window.print();
  };

  // Get month name in uppercase (e.g., "SETEMBRO" or "JULHO")
  const extractedMonth = monthLabel.split(' ')[0].toUpperCase();

  return (
    <div className="pdf-exporter-wrapper">
      <div className="no-print glass-panel pdf-export-controls">
        <div className="pdf-export-toolbar">
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Exportação da Escala de Transmissão</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isOfficial
                ? 'Versão oficial publicada, liberada para impressão, PDF A4 e compartilhamento.'
                : 'Prévia identificada do rascunho. Publique a escala para liberar a distribuição oficial.'}
            </p>
            {versions.length > 0 && (
              <label className="version-selector">
                Versão exibida
                <select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)}>
                  {(status !== 'published' || !hasPublishedSnapshot) && (
                    <option value="current">
                      Estado atual ({status === 'published' ? 'publicação sem snapshot' : 'rascunho'})
                    </option>
                  )}
                  {versions.map((item) => (
                    <option key={item.version} value={String(item.version)}>
                      Publicação v{item.version}
                      {item.publishedAt ? ` · ${item.publishedAt}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="pdf-export-actions">
            <button className="btn btn-outline" onClick={handlePrint}>
              <Printer size={16} />
              Imprimir
            </button>

            <button
              className="btn btn-success"
              onClick={handleWhatsAppShare}
              disabled={!isOfficial}
              title={!isOfficial ? 'Disponível somente após a publicação' : undefined}
            >
              <MessageCircle size={16} />
              Enviar no WhatsApp
            </button>

            <button className="btn btn-primary" onClick={handleDownloadPdf} disabled={isExporting}>
              <Download size={16} />
              {isExporting ? 'Gerando PDF...' : isOfficial ? 'Baixar PDF oficial' : 'Baixar prévia em PDF'}
            </button>
          </div>
        </div>
      </div>

      <section className="pdf-mobile-preview no-print" aria-label="Prévia mobile da escala">
        <div className="pdf-mobile-preview-header">
          <span>Prévia da escala</span>
          <strong>{monthLabel}</strong>
        </div>
        {sundays.map((sunday) => (
          <article className="pdf-mobile-day" key={sunday.date}>
            <header>
              <h3>{sunday.label}</h3>
              <span>{sunday.formatted}</span>
            </header>
            {shifts.map((shift) => (
              <section className="pdf-mobile-shift" key={shift.id} aria-label={`Turno ${shift.name}`}>
                <h4>
                  Turno {shift.name} ({shift.time})
                </h4>
                <div className="pdf-mobile-assignments">
                  {roles.map((role) => {
                    const { main: volunteerId, trainee: traineeId } = getSlotAssignment(
                      displaySchedule,
                      sunday.date,
                      shift.id,
                      role.id
                    );
                    const volunteerName = volunteerId
                      ? displayVolunteersMap[volunteerId]?.name || 'Não alocado'
                      : 'Vago';
                    const traineeName = traineeId ? displayVolunteersMap[traineeId]?.name : '';
                    return (
                      <div className="pdf-mobile-assignment" key={role.id}>
                        <span>{role.name}</span>
                        <div>
                          <strong>{volunteerName}</strong>
                          {traineeName && <small>Treinando: {traineeName}</small>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </article>
        ))}
      </section>

      {/* Printable Element - Exact Replica of Reference PDF Layout */}
      <div id="pdf-printable-document" className="pdf-printable-area">
        {!isOfficial && <div className="pdf-draft-watermark">PRÉVIA · RASCUNHO · NÃO DISTRIBUIR</div>}
        {/* Top Banner Header */}
        <div className="pdf-banner-header">ESCALA COMPLETA TRANSMISSÃO | {extractedMonth}</div>

        {/* Main Grid Table */}
        <table className="pdf-schedule-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>TURNO / DIA</th>
              {roles.map((role) => (
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
                    {roles.map((role) => {
                      const { main: volId, trainee: traineeId } = getSlotAssignment(
                        displaySchedule,
                        sunday.date,
                        'MORNING',
                        role.id
                      );
                      const volName = volId ? displayVolunteersMap[volId]?.name || 'Não alocado' : '';
                      const traineeName = traineeId ? displayVolunteersMap[traineeId]?.name : null;
                      return (
                        <td key={role.id} className="td-volunteer-cell">
                          <div>{volName}</div>
                          {traineeName && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: '#0284c7',
                                fontWeight: 600,
                                marginTop: '2px'
                              }}
                            >
                              (Treino: {traineeName})
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Night Shift Row */}
                  <tr>
                    <td className="td-date-shift">{shortDate} - NOITE</td>
                    {roles.map((role) => {
                      const { main: volId, trainee: traineeId } = getSlotAssignment(
                        displaySchedule,
                        sunday.date,
                        'NIGHT',
                        role.id
                      );
                      const volName = volId ? displayVolunteersMap[volId]?.name || 'Não alocado' : '';
                      const traineeName = traineeId ? displayVolunteersMap[traineeId]?.name : null;
                      return (
                        <td key={role.id} className="td-volunteer-cell">
                          <div>{volName}</div>
                          {traineeName && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: '#0284c7',
                                fontWeight: 600,
                                marginTop: '2px'
                              }}
                            >
                              (Treino: {traineeName})
                            </div>
                          )}
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
          <span>
            Status:{' '}
            {isOfficial
              ? `OFICIAL${displayVersion ? ` · VERSÃO ${displayVersion}` : ''}`
              : 'PRÉVIA DE RASCUNHO'}
          </span>
        </div>
      </div>
    </div>
  );
};
