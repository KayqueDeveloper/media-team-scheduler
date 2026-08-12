import React from 'react';
import { ArrowLeftRight, CheckCircle2, Clock3, XCircle } from 'lucide-react';

const labels = { PENDING: 'Pendente', ACCEPTED: 'Aceita', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' };

export function AdminExchangeManager({ exchanges = [] }) {
  return (
    <section className="glass-panel admin-exchanges">
      <div className="portal-card-header">
        <h2><ArrowLeftRight size={19} /> Acompanhamento de trocas</h2>
        <span>{exchanges.filter(item => item.status === 'PENDING').length} pendente(s)</span>
      </div>
      {exchanges.length === 0 ? <p className="portal-muted">Nenhuma troca registrada.</p> : (
        <div className="portal-list">
          {exchanges.map(exchange => {
            const Icon = exchange.status === 'ACCEPTED' ? CheckCircle2 : exchange.status === 'REJECTED' || exchange.status === 'CANCELLED' ? XCircle : Clock3;
            return <div className="portal-list-row" key={exchange.id}>
              <div>
                <strong>{exchange.date} · {exchange.shift} ↔ {exchange.targetDate} · {exchange.targetShift}</strong>
                <span>{exchange.requesterName} ↔ {exchange.targetVolunteerName}</span>
                {exchange.reason && <small className="portal-muted">Motivo: {exchange.reason}</small>}
              </div>
              <span className={`portal-tag status-${exchange.status.toLowerCase()}`}><Icon size={14} /> {labels[exchange.status] || exchange.status}</span>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
