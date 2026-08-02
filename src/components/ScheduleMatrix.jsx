import React, { useState } from 'react';
import { 
  Calendar, 
  Sun, 
  Moon, 
  AlertTriangle, 
  Tv, 
  Video, 
  Mic, 
  Monitor, 
  Sliders, 
  Maximize2,
  Table,
  LayoutGrid
} from 'lucide-react';

export const ScheduleMatrix = ({
  sundays,
  shifts,
  roles,
  volunteers,
  schedule,
  unavailabilities,
  onScheduleChange
}) => {
  const [viewMode, setViewMode] = useState('table'); // 'table' (Official PDF style) | 'grid' (Interactive Cards)

  const volunteersMap = React.useMemo(() => {
    return volunteers.reduce((acc, v) => {
      acc[v.id] = v;
      return acc;
    }, {});
  }, [volunteers]);

  // Helper to map icon for each role
  const getRoleIcon = (roleId) => {
    switch (roleId) {
      case 'COORDINATOR': return <Tv size={16} className="role-icon" />;
      case 'FIXED_CAM': return <Video size={16} className="role-icon" />;
      case 'JIB': return <Maximize2 size={16} className="role-icon" />;
      case 'SWITCHER': return <Sliders size={16} className="role-icon" />;
      case 'VMIX': return <Monitor size={16} className="role-icon" />;
      case 'FREEHAND': return <Mic size={16} className="role-icon" />;
      default: return <Video size={16} className="role-icon" />;
    }
  };

  // Helper to check if a volunteer has an unavailability on a date/shift
  const isUnavailable = (volunteerId, date, shiftId) => {
    if (!volunteerId) return false;
    return unavailabilities.some(
      u => u.volunteerId === volunteerId && u.date === date && (u.shift === shiftId || u.shift === 'ALL')
    );
  };

  // Helper to check if a volunteer is double-booked on same Sunday
  const isDoubleBooked = (volunteerId, date, currentShiftId) => {
    if (!volunteerId) return false;
    const otherShiftId = currentShiftId === 'MORNING' ? 'NIGHT' : 'MORNING';
    const otherAllocations = Object.values(schedule[date]?.[otherShiftId] || {});
    return otherAllocations.includes(volunteerId);
  };

  return (
    <section className="matrix-container glass-panel">
      <div className="matrix-header-info">
        <div className="matrix-title">
          <h2>Matriz de Alocação Mensal</h2>
          <p>Grade de Cultos Dominicais × Turnos × 6 Funções de Transmissão</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* Mode Switcher Buttons */}
          <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button 
              className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setViewMode('table')}
            >
              <Table size={15} />
              Tabela Oficial (Estilo PDF)
            </button>
            <button 
              className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={15} />
              Grade de Edição
            </button>
          </div>

          {viewMode === 'grid' && (
            <div className="matrix-legend">
              <span>Proficiência:</span>
              <div className="legend-item"><span className="legend-badge level-1"></span>N1</div>
              <div className="legend-item"><span className="legend-badge level-2"></span>N2</div>
              <div className="legend-item"><span className="legend-badge level-3"></span>N3</div>
            </div>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: Official Table Layout (Dark Theme Matched) */}
      {viewMode === 'table' && (
        <div className="app-table-container">
          <div className="app-banner-header">
            ESCALA COMPLETA TRANSMISSÃO
          </div>

          <table className="app-schedule-table">
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
                const shortDate = sunday.formatted.slice(0, 5);

                return (
                  <React.Fragment key={sunday.date}>
                    {/* Morning Row */}
                    <tr>
                      <td className="td-date-shift">{shortDate} - MANHÃ</td>
                      {roles.map(role => {
                        const currentVolId = schedule[sunday.date]?.['MORNING']?.[role.id] || '';
                        const volObj = volunteersMap[currentVolId];
                        const profLevel = volObj ? (volObj.proficiencies[role.id] || 0) : 0;
                        const unavailable = isUnavailable(currentVolId, sunday.date, 'MORNING');
                        const doubleBooked = isDoubleBooked(currentVolId, sunday.date, 'MORNING');

                        return (
                          <td key={role.id} className={`td-volunteer-cell ${(unavailable || doubleBooked) ? 'has-conflict' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%' }}>
                              <select
                                className="volunteer-select-table"
                                value={currentVolId}
                                onChange={(e) => onScheduleChange(sunday.date, 'MORNING', role.id, e.target.value)}
                              >
                                <option value="">-- Vago --</option>
                                {volunteers.map(v => {
                                  const vUnavail = isUnavailable(v.id, sunday.date, 'MORNING');
                                  const vLevel = v.proficiencies[role.id] || 0;
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.name} (N{vLevel}){vUnavail ? ' ⚠️ (Indisponível)' : ''}
                                    </option>
                                  );
                                })}
                              </select>

                              {profLevel > 0 && (
                                <span className={`proficiency-pill level-${profLevel}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>
                                  N{profLevel}
                                </span>
                              )}

                              {(unavailable || doubleBooked) && (
                                <div className="conflict-warning" style={{ flexShrink: 0 }} title={
                                  unavailable 
                                    ? 'Atenção: Voluntário possui indisponibilidade nesta data/turno!' 
                                    : 'Atenção: Voluntário alocado nos dois turnos do mesmo domingo!'
                                }>
                                  <AlertTriangle size={15} />
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Night Row */}
                    <tr>
                      <td className="td-date-shift">{shortDate} - NOITE</td>
                      {roles.map(role => {
                        const currentVolId = schedule[sunday.date]?.['NIGHT']?.[role.id] || '';
                        const volObj = volunteersMap[currentVolId];
                        const profLevel = volObj ? (volObj.proficiencies[role.id] || 0) : 0;
                        const unavailable = isUnavailable(currentVolId, sunday.date, 'NIGHT');
                        const doubleBooked = isDoubleBooked(currentVolId, sunday.date, 'NIGHT');

                        return (
                          <td key={role.id} className={`td-volunteer-cell ${(unavailable || doubleBooked) ? 'has-conflict' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%' }}>
                              <select
                                className="volunteer-select-table"
                                value={currentVolId}
                                onChange={(e) => onScheduleChange(sunday.date, 'NIGHT', role.id, e.target.value)}
                              >
                                <option value="">-- Vago --</option>
                                {volunteers.map(v => {
                                  const vUnavail = isUnavailable(v.id, sunday.date, 'NIGHT');
                                  const vLevel = v.proficiencies[role.id] || 0;
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.name} (N{vLevel}){vUnavail ? ' ⚠️ (Indisponível)' : ''}
                                    </option>
                                  );
                                })}
                              </select>

                              {profLevel > 0 && (
                                <span className={`proficiency-pill level-${profLevel}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>
                                  N{profLevel}
                                </span>
                              )}

                              {(unavailable || doubleBooked) && (
                                <div className="conflict-warning" style={{ flexShrink: 0 }} title={
                                  unavailable 
                                    ? 'Atenção: Voluntário possui indisponibilidade nesta data/turno!' 
                                    : 'Atenção: Voluntário alocado nos dois turnos do mesmo domingo!'
                                }>
                                  <AlertTriangle size={15} />
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Separator */}
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
        </div>
      )}

      {/* VIEW MODE 2: Interactive Cards Grid */}
      {viewMode === 'grid' && (
        <>
          {sundays.map(sunday => (
            <div key={sunday.date} className="sunday-card">
              <div className="sunday-header">
                <div className="sunday-date">
                  <Calendar size={18} />
                  <span>{sunday.label} - {sunday.formatted}</span>
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Culto Presencial & Transmissão ao Vivo
                </span>
              </div>

              <div className="shifts-wrapper">
                {shifts.map(shift => (
                  <div key={shift.id} className="shift-box">
                    <div className={`shift-title ${shift.id}`}>
                      {shift.id === 'MORNING' ? <Sun size={18} /> : <Moon size={18} />}
                      <span>Turno {shift.name} ({shift.time})</span>
                    </div>

                    <div className="roles-list">
                      {roles.map(role => {
                        const currentVolId = schedule[sunday.date]?.[shift.id]?.[role.id] || '';
                        const volObj = volunteersMap[currentVolId];
                        const profLevel = volObj ? (volObj.proficiencies[role.id] || 0) : 0;
                        
                        const unavailable = isUnavailable(currentVolId, sunday.date, shift.id);
                        const doubleBooked = isDoubleBooked(currentVolId, sunday.date, shift.id);

                        return (
                          <div key={role.id} className="role-slot">
                            <div className="role-info">
                              {getRoleIcon(role.id)}
                              <span className="role-name">{role.shortName}</span>
                            </div>

                            <div className="volunteer-select-container">
                              <select
                                className="volunteer-select"
                                value={currentVolId}
                                onChange={(e) => onScheduleChange(sunday.date, shift.id, role.id, e.target.value)}
                              >
                                <option value="">-- Selecionar --</option>
                                {volunteers.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} (Nível {v.proficiencies[role.id] || 0})
                                  </option>
                                ))}
                              </select>

                              {profLevel > 0 && (
                                <span className={`proficiency-pill level-${profLevel}`}>
                                  N{profLevel}
                                </span>
                              )}
                            </div>

                            {/* Rule Violations / Warnings */}
                            {(unavailable || doubleBooked) && (
                              <div className="conflict-warning" title={
                                unavailable 
                                  ? 'Voluntário com indisponibilidade registrada!' 
                                  : 'Atenção: Voluntário alocado nos dois turnos do mesmo domingo!'
                              }>
                                <AlertTriangle size={16} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
};
