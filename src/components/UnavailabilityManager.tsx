// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  Calendar, 
  Plus, 
  Trash2, 
  AlertCircle, 
  UserX,
  Sun,
  Moon,
  CheckCircle2
} from 'lucide-react';

export const UnavailabilityManager = ({
  unavailabilities,
  volunteers,
  sundays,
  shifts,
  onAddUnavailability,
  onRemoveUnavailability,
  disabled = false
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedVolId, setSelectedVolId] = useState('');
  const [selectedDate, setSelectedDate] = useState(sundays[0]?.date || '');
  const [selectedShift, setSelectedShift] = useState('MORNING');
  const [reason, setReason] = useState('');

  const volunteersMap = React.useMemo(() => {
    return volunteers.reduce((acc, v) => {
      acc[v.id] = v;
      return acc;
    }, {});
  }, [volunteers]);

  useEffect(() => {
    setSelectedDate(sundays[0]?.date || '');
  }, [sundays]);

  const handleCreateUnavailability = async (e) => {
    e.preventDefault();
    if (!selectedVolId || !selectedDate) return;

    const saved = await onAddUnavailability({
      volunteerId: selectedVolId,
      date: selectedDate,
      shift: selectedShift,
      reason: reason || 'Sem motivo especificado'
    });

    if (!saved) return;
    setSelectedVolId('');
    setReason('');
    setIsAddModalOpen(false);
  };

  const getShiftName = (shiftId) => {
    if (shiftId === 'ALL' || shiftId === 'todos') return 'Ambos os Turnos';
    if (shiftId === 'MORNING' || shiftId === 'manha') return 'Manhã';
    if (shiftId === 'NIGHT' || shiftId === 'noite') return 'Noite';
    const s = shifts.find(item => item.id === shiftId);
    return s ? s.name : shiftId;
  };

  const getSundayFormatted = (dateStr) => {
    const s = sundays.find(item => item.date === dateStr);
    return s ? `${s.formatted} (${s.label})` : dateStr;
  };

  return (
    <section className="unavailability-container glass-panel">
      <div className="manager-toolbar">
        <div>
          <h2>Bloqueios e Registo de Indisponibilidades</h2>
          <p>Solicitações de bloqueio de datas e turnos enviadas pelos voluntários antes do fechamento da escala.</p>
        </div>

        <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)} disabled={disabled}>
          <Plus size={16} />
          Registrar Indisponibilidade
        </button>
      </div>

      <div className="cutoff-notice">
        <AlertCircle size={20} />
        <div>
          <strong>Política de Prazo Limite (Data de Corte):</strong>
          <span style={{ display: 'block', fontSize: '0.82rem', marginTop: 2 }}>
            As indisponibilidades devem ser enviadas impreterivelmente até o dia 25 do mês anterior para consideração no gerador de escala.
          </span>
        </div>
      </div>

      <div className="unavail-list">
        {unavailabilities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--accent-emerald)', marginBottom: '0.5rem' }} />
            <p>Nenhuma indisponibilidade cadastrada para este mês.</p>
          </div>
        ) : (
          unavailabilities.map(unavail => {
            const vol = volunteersMap[unavail.volunteerId];
            return (
              <div key={unavail.id} className="unavail-item">
                <div className="unavail-volunteer">
                  <div className="volunteer-avatar" style={{ width: 36, height: 36, fontSize: '0.9rem' }}>
                    {vol ? vol.name.charAt(0) : '?'}
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>{vol ? vol.name : 'Voluntário Desconhecido'}</strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Motivo: {unavail.reason}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="unavail-date-tag">
                    <Calendar size={14} />
                    {getSundayFormatted(unavail.date)} - Turno {getShiftName(unavail.shift)}
                  </span>

                  <button 
                    className="btn btn-danger"
                    style={{ padding: '0.4rem 0.6rem' }}
                    onClick={() => onRemoveUnavailability(unavail.id)}
                    disabled={disabled}
                    title="Remover Indisponibilidade"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add Unavailability */}
      {isAddModalOpen && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="unavailability-modal-title">
            <div className="modal-header">
              <h3 id="unavailability-modal-title">Registrar Indisponibilidade</h3>
              <button type="button" className="close-btn" aria-label="Fechar diálogo" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateUnavailability}>
              <div className="form-group">
                <label>Voluntário</label>
                <select 
                  className="form-select"
                  value={selectedVolId}
                  onChange={(e) => setSelectedVolId(e.target.value)}
                  required
                >
                  <option value="">-- Selecione o Voluntário --</option>
                  {volunteers.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Domingo Indisponível</label>
                <select 
                  className="form-select"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                >
                  {sundays.map(s => (
                    <option key={s.date} value={s.date}>{s.formatted} ({s.label})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Turno Impossibilitado</label>
                <select 
                  className="form-select"
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  required
                >
                  <option value="MORNING">Turno Manhã (09h00)</option>
                  <option value="NIGHT">Turno Noite (18h00)</option>
                  <option value="ALL">Ambos os Turnos (Dia Inteiro)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Justificativa / Motivo (Opcional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Viagem, compromisso acadêmico, trabalho"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={disabled}>
                  Confirmar Indisponibilidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
