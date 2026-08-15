// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';

const SHIFT_LABELS = { MORNING: 'Manhã', NIGHT: 'Noite' };
const STATUS = {
  AWAITING: { label: 'Aguardando', Icon: Clock3 },
  CONFIRMED: { label: 'Confirmado', Icon: CheckCircle2 },
  EXCHANGE_PENDING: { label: 'Troca pendente', Icon: RefreshCw },
  SUPERSEDED: { label: 'Substituído', Icon: AlertTriangle }
};

export function AdminConfirmationManager({ confirmations = [] }) {
  const active = confirmations.filter(item => item.status !== 'SUPERSEDED');
  return (
    <section className="glass-panel admin-exchanges">
      <div className="portal-card-header">
        <h2><BellRing size={19} /> Confirmações de serviço</h2>
        <span>{active.filter(item => item.status === 'AWAITING').length} aguardando · {active.filter(item => item.status === 'CONFIRMED').length} confirmada(s)</span>
      </div>
      {confirmations.length === 0 ? <p className="portal-muted">Os lembretes aparecerão aqui a partir de três dias antes de cada domingo.</p> : (
        <div className="portal-list">
          {confirmations.map(item => {
            const state = STATUS[item.status] || { label: item.status, Icon: Clock3 };
            const StatusIcon = state.Icon;
            return <div className="portal-list-row" key={item.id}>
              <div>
                <strong>{item.date} · {SHIFT_LABELS[item.shift] || item.shift} · {item.role}</strong>
                <span>{item.volunteerName} · {item.isTrainee ? 'Treinando' : 'Principal'}</span>
                {item.lastError && <small className="confirmation-error">Falha no envio: {item.lastError}</small>}
                {!item.recipientEmail && <small className="confirmation-error">Sem e-mail ativo</small>}
              </div>
              <div className="portal-actions">
                <small className="portal-muted">{item.reminderCount} lembrete(s)</small>
                <span className={`portal-tag confirmation-${item.status.toLowerCase()}`}><StatusIcon size={14} /> {state.label}</span>
              </div>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
