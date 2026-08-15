// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, CalendarCheck2, CheckCircle2, LoaderCircle } from 'lucide-react';

const SHIFT_LABELS = { MORNING: 'Manhã', NIGHT: 'Noite' };
const STATUS_MESSAGES = {
  CONFIRMED: 'Sua presença está confirmada.',
  EXCHANGE_PENDING: 'Sua solicitação de troca está aguardando resposta.',
  SUPERSEDED: 'Esta resposta não é mais válida porque a escala mudou.'
};

export function ServiceConfirmationPage({ token, api }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [targetAssignmentId, setTargetAssignmentId] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api.getServiceConfirmation(token));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function run(operation) {
    setBusy(true);
    setError('');
    try {
      await operation();
      await load();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  function requestExchange(event) {
    event.preventDefault();
    return run(async () => {
      await api.requestServiceExchange(token, { targetAssignmentId: Number(targetAssignmentId), reason });
      setExchangeOpen(false);
    });
  }

  const confirmation = data?.confirmation;
  return (
    <main className="auth-page confirmation-page">
      <section className="glass-panel auth-card confirmation-card">
        <div className="brand-icon auth-icon"><CalendarCheck2 size={24} /></div>
        <h1>Confirmação de serviço</h1>
        {loading ? <div className="confirmation-state"><LoaderCircle className="spin" size={28} /><span>Carregando sua escala…</span></div> : error && !confirmation ? (
          <p className="auth-error" role="alert">{error}</p>
        ) : confirmation ? (
          <>
            <div className="confirmation-summary">
              <strong>{confirmation.date}</strong>
              <span>{SHIFT_LABELS[confirmation.shift] || confirmation.shift} · {confirmation.role}</span>
              <small>{confirmation.isTrainee ? 'Treinando' : 'Alocação principal'}</small>
            </div>
            {confirmation.status !== 'AWAITING' ? (
              <div className="auth-success confirmation-result"><CheckCircle2 size={20} /> {STATUS_MESSAGES[confirmation.status] || confirmation.status}</div>
            ) : (
              <>
                <p className="auth-subtitle">Confirme sua presença ou solicite uma troca de dia/turno com outra pessoa da escala.</p>
                <div className="confirmation-actions">
                  <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.confirmService(token))}><CheckCircle2 size={16} /> Confirmar presença</button>
                  <button className="btn btn-secondary" disabled={busy || data.candidates.length === 0} onClick={() => setExchangeOpen(value => !value)}><ArrowLeftRight size={16} /> Solicitar troca</button>
                </div>
                {data.candidates.length === 0 && <small className="portal-muted">Não há outra alocação compatível disponível para troca.</small>}
                {exchangeOpen && <form className="portal-form confirmation-exchange" onSubmit={requestExchange}>
                  <label>Trocar com
                    <select required value={targetAssignmentId} onChange={event => setTargetAssignmentId(event.target.value)}>
                      <option value="">Selecione outra escala</option>
                      {data.candidates.map(candidate => <option key={candidate.assignmentId} value={candidate.assignmentId}>{candidate.volunteerName} · {candidate.date} · {SHIFT_LABELS[candidate.shift] || candidate.shift} · {candidate.role}</option>)}
                    </select>
                  </label>
                  <label>Motivo
                    <textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explique por que precisa trocar." />
                  </label>
                  <button className="btn btn-primary" disabled={busy}>Enviar solicitação</button>
                </form>}
              </>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
          </>
        ) : null}
      </section>
    </main>
  );
}
