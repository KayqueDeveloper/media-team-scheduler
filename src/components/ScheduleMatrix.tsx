// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { getSlotAssignment } from '../utils/scheduleUtils';
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
  LayoutGrid,
  Sparkles,
  Lock,
  Unlock,
  GraduationCap
} from 'lucide-react';

export const ScheduleMatrix = ({
  sundays,
  shifts,
  roles,
  volunteers,
  schedule,
  unavailabilities,
  lockedSlots = [],
  onScheduleChange,
  onGenerateAuto,
  onToggleLockSlot,
  readOnly = false
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
    const vIdStr = String(volunteerId);
    return unavailabilities.some(
      u => String(u.volunteerId) === vIdStr && u.date === date && (u.shift === shiftId || u.shift === 'ALL')
    );
  };

  // Helper to check if a volunteer is double-booked on same Sunday
  const isDoubleBooked = (volunteerId, date, currentShiftId) => {
    if (!volunteerId) return false;
    const vIdStr = String(volunteerId);
    const otherShiftId = currentShiftId === 'MORNING' ? 'NIGHT' : 'MORNING';
    const otherAllocations = Object.values(schedule[date]?.[otherShiftId] || {}).flatMap(item => {
      const slot = typeof item === 'object' ? item : { main: item, trainee: '' };
      return [slot.main, slot.trainee];
    });
    return otherAllocations.some(id => String(id) === vIdStr);
  };

  return (
    <section className="matrix-container glass-panel">
      <div className="matrix-header-info">
        <div className="matrix-title">
          <h2>Matriz da Escala Mensal</h2>
          <p>Alocações principais N2/N3 e treinamento N1 acompanhado exclusivamente por mentor N3.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Action button inside Matrix header */}
          {onGenerateAuto && (
            <button className="btn btn-secondary" onClick={onGenerateAuto} disabled={readOnly} title="Preencher ou recalcular a proposta pelo gerador do backend">
              <Sparkles size={16} />
              Gerar Escala (IA)
            </button>
          )}

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
              <div className="legend-item"><span className="legend-badge level-1"></span>N1 (Treinando)</div>
              <div className="legend-item"><span className="legend-badge level-2"></span>N2 (Apto)</div>
              <div className="legend-item"><span className="legend-badge level-3"></span>N3 (Sênior)</div>
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

                const shiftList = [
                  { id: 'MORNING', label: 'MANHÃ' },
                  { id: 'NIGHT', label: 'NOITE' }
                ];

                return (
                  <React.Fragment key={sunday.date}>
                    {shiftList.map(shiftItem => (
                      <tr key={shiftItem.id}>
                        <td className="td-date-shift">{shortDate} - {shiftItem.label}</td>
                        {roles.map(role => {
                          const { main: currentVolId, trainee: currentTraineeId } = getSlotAssignment(schedule, sunday.date, shiftItem.id, role.id);
                          const volObj = volunteersMap[currentVolId];
                          const profLevel = volObj ? (volObj.proficiencies[role.id] || 0) : 0;

                          const traineeObj = volunteersMap[currentTraineeId];
                          const canHaveTrainee = profLevel === 3;

                          const mainUnavailable = isUnavailable(currentVolId, sunday.date, shiftItem.id);
                          const mainDoubleBooked = isDoubleBooked(currentVolId, sunday.date, shiftItem.id);
                          const traineeUnavailable = isUnavailable(currentTraineeId, sunday.date, shiftItem.id);

                          const slotKey = `${sunday.date}:${shiftItem.id}:${role.id}`;
                          const isLocked = lockedSlots.includes(slotKey);

                          return (
                            <td key={role.id} className={`td-volunteer-cell ${(mainUnavailable || mainDoubleBooked || traineeUnavailable) ? 'has-conflict' : ''}`}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', width: '100%' }}>
                                  <button
                                    type="button"
                                    onClick={() => onToggleLockSlot && onToggleLockSlot(sunday.date, shiftItem.id, role.id)}
                                    disabled={readOnly}
                                    aria-label={isLocked ? `Destravar vaga de ${role.name} em ${sunday.formatted} no turno ${shiftItem.label}` : `Travar vaga de ${role.name} em ${sunday.formatted} no turno ${shiftItem.label}`}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLocked ? 'var(--accent-amber)' : 'var(--text-dim)', padding: '2px 4px' }}
                                    title={isLocked ? 'Vaga travada (fixa durante a geração automática)' : 'Vaga livre (clique para travar)'}
                                  >
                                    {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                  </button>

                                  <select
                                    className="volunteer-select-table"
                                    value={currentVolId}
                                    onChange={(e) => onScheduleChange(sunday.date, shiftItem.id, role.id, e.target.value, 'main')}
                                    disabled={readOnly}
                                  >
                                    <option value="">-- Vago --</option>
                                    {volunteers.filter(v => String(v.id) === String(currentVolId) || (v.active && Number(v.proficiencies?.[role.id] || 0) >= 2)).map(v => {
                                      const vUnavail = isUnavailable(v.id, sunday.date, shiftItem.id);
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

                                  {(mainUnavailable || mainDoubleBooked) && (
                                    <div className="conflict-warning" style={{ flexShrink: 0 }} title={
                                      mainUnavailable 
                                        ? 'Atenção: Voluntário possui indisponibilidade nesta data/turno!' 
                                        : 'Atenção: Voluntário escalado nos dois turnos do mesmo domingo!'
                                    }>
                                      <AlertTriangle size={15} />
                                    </div>
                                  )}
                                </div>

                                {/* Trainee Select Row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  <GraduationCap size={13} style={{ color: canHaveTrainee ? '#38bdf8' : 'var(--text-dim)' }} />
                                  <select
                                    className="volunteer-select-table"
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '0.15rem 0.3rem',
                                      borderColor: currentTraineeId ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                                      background: currentTraineeId ? 'rgba(56, 189, 248, 0.1)' : undefined
                                    }}
                                    value={currentTraineeId}
                                    disabled={readOnly || !canHaveTrainee}
                                    onChange={(e) => onScheduleChange(sunday.date, shiftItem.id, role.id, e.target.value, 'trainee')}
                                    title={canHaveTrainee ? 'Selecione um voluntário N1 para treinar' : 'Treinamento requer mentor N3'}
                                  >
                                    <option value="">-- {canHaveTrainee ? 'Sem Treinando' : 'Requer mentor N3'} --</option>
                                    {volunteers.filter(v => String(v.id) === String(currentTraineeId) || (v.active && Number(v.proficiencies?.[role.id] || 0) === 1)).map(v => {
                                      if (v.id === currentVolId) return null;
                                      const vLevel = v.proficiencies[role.id] || 0;
                                      const vUnavail = isUnavailable(v.id, sunday.date, shiftItem.id);
                                      return (
                                        <option key={v.id} value={v.id}>
                                          🎓 {v.name} (N{vLevel}){vLevel === 1 ? ' [Treinando]' : ''}{vUnavail ? ' ⚠️' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}

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
                        const { main: currentVolId, trainee: currentTraineeId } = getSlotAssignment(schedule, sunday.date, shift.id, role.id);
                        const volObj = volunteersMap[currentVolId];
                        const profLevel = volObj ? (volObj.proficiencies[role.id] || 0) : 0;
                        const canHaveTrainee = profLevel === 3;
                        
                        const mainUnavailable = isUnavailable(currentVolId, sunday.date, shift.id);
                        const mainDoubleBooked = isDoubleBooked(currentVolId, sunday.date, shift.id);
                        const traineeUnavailable = isUnavailable(currentTraineeId, sunday.date, shift.id);

                        const slotKey = `${sunday.date}:${shift.id}:${role.id}`;
                        const isLocked = lockedSlots.includes(slotKey);

                        return (
                          <div key={role.id} className="role-slot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div className="role-info">
                                <button
                                  type="button"
                                  onClick={() => onToggleLockSlot && onToggleLockSlot(sunday.date, shift.id, role.id)}
                                  disabled={readOnly}
                                  aria-label={isLocked ? `Destravar vaga de ${role.name} em ${sunday.formatted} no turno ${shift.name}` : `Travar vaga de ${role.name} em ${sunday.formatted} no turno ${shift.name}`}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLocked ? 'var(--accent-amber)' : 'var(--text-dim)', padding: 0 }}
                                  title={isLocked ? 'Vaga travada (fixa durante a geração automática)' : 'Vaga livre (clique para travar)'}
                                >
                                  {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                                </button>
                                {getRoleIcon(role.id)}
                                <span className="role-name">{role.shortName}</span>
                              </div>

                              {profLevel > 0 && (
                                <span className={`proficiency-pill level-${profLevel}`}>
                                  Op N{profLevel}
                                </span>
                              )}
                            </div>

                            {/* Main Operator Select */}
                            <div className="volunteer-select-container">
                              <select
                                className="volunteer-select"
                                value={currentVolId}
                                onChange={(e) => onScheduleChange(sunday.date, shift.id, role.id, e.target.value, 'main')}
                                disabled={readOnly}
                              >
                                <option value="">-- Selecionar Operador --</option>
                                {volunteers.filter(v => String(v.id) === String(currentVolId) || (v.active && Number(v.proficiencies?.[role.id] || 0) >= 2)).map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} (Nível {v.proficiencies[role.id] || 0})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Trainee Select */}
                            <div className="volunteer-select-container" style={{ gap: '0.4rem' }}>
                              <GraduationCap size={15} style={{ color: canHaveTrainee ? '#38bdf8' : 'var(--text-dim)', flexShrink: 0 }} />
                              <select
                                className="volunteer-select"
                                style={{
                                  borderColor: currentTraineeId ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                                  background: currentTraineeId ? 'rgba(56, 189, 248, 0.1)' : undefined,
                                  fontSize: '0.8rem'
                                }}
                                value={currentTraineeId}
                                disabled={readOnly || !canHaveTrainee}
                                onChange={(e) => onScheduleChange(sunday.date, shift.id, role.id, e.target.value, 'trainee')}
                              >
                                <option value="">-- {canHaveTrainee ? 'Selecionar Treinando (N1)' : 'Requer mentor N3'} --</option>
                                {volunteers.filter(v => String(v.id) === String(currentTraineeId) || (v.active && Number(v.proficiencies?.[role.id] || 0) === 1)).map(v => {
                                  if (v.id === currentVolId) return null;
                                  const vLevel = v.proficiencies[role.id] || 0;
                                  return (
                                    <option key={v.id} value={v.id}>
                                      🎓 {v.name} (Nível {vLevel}){vLevel === 1 ? ' ★ Treinando' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* Rule Violations / Warnings */}
                            {(mainUnavailable || mainDoubleBooked || traineeUnavailable) && (
                              <div className="conflict-warning" title={
                                mainUnavailable || traineeUnavailable
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
