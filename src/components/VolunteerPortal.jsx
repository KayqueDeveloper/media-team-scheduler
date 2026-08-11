import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, LogOut, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { getCurrentBusinessMonth } from '../domain/catalog';

const SHIFT_LABELS = { MORNING: 'Manhã', NIGHT: 'Noite', ALL: 'Qualquer turno' };
const STATUS_LABELS = { PENDING: 'Aguardando resposta', ACCEPTED: 'Aceita', REJECTED: 'Rejeitada', CANCELLED: 'Cancelada' };

export function VolunteerPortal({ user, api, onLogout, onSessionExpired }) {
  const businessMonth = useMemo(() => getCurrentBusinessMonth(), []);
  const [year, setYear] = useState(businessMonth.year);
  const [month, setMonth] = useState(businessMonth.monthIndex + 1);
  const [schedule, setSchedule] = useState([]);
  const [unavailabilities, setUnavailabilities] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [form, setForm] = useState({ date: '', shift: 'ALL', reason: '' });
  const [exchangeForm, setExchangeForm] = useState({ assignmentId: '', targetVolunteerId: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadSequence = useRef(0);

  async function load(signal) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const [nextSchedule, nextUnavailabilities, nextExchanges, nextNotifications, nextDirectory] = await Promise.all([
        api.getMySchedule(year, month, { signal }),
        api.getMyUnavailabilities({ signal }),
        api.getMyExchanges({ signal }),
        api.getMyNotifications({ signal }),
        api.getVolunteerDirectory({ signal })
      ]);
      if (signal?.aborted || sequence !== loadSequence.current) return;
      setSchedule(nextSchedule);
      setUnavailabilities(nextUnavailabilities);
      setExchanges(nextExchanges);
      setNotifications(nextNotifications);
      setDirectory(nextDirectory.filter(item => String(item.id) !== String(user.volunteerId)));
    } catch (nextError) {
      if (nextError.name === 'AbortError' || sequence !== loadSequence.current) return;
      if (nextError.status === 401) {
        onSessionExpired?.();
      } else {
        setError(nextError.message);
      }
    } finally {
      if (!signal?.aborted && sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => {
      controller.abort();
      loadSequence.current += 1;
    };
  }, [year, month]);

  function changeMonth(delta) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  async function run(operation) {
    setBusy(true);
    setError('');
    try {
      await operation();
      await load();
    } catch (nextError) {
      if (nextError.status === 401) {
        onSessionExpired?.();
      } else {
        setError(nextError.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function addUnavailability(event) {
    event.preventDefault();
    return run(() => api.createMyUnavailability(form));
  }

  function requestExchange(event) {
    event.preventDefault();
    return run(() => api.createExchange(exchangeForm));
  }

  return (
    <main className="portal-container">
      <header className="portal-header glass-panel">
        <div>
          <p className="portal-kicker">Portal do voluntário</p>
          <h1>Olá, {user.name}</h1>
          <p className="portal-muted">Sua escala oficial e suas solicitações</p>
        </div>
        <button className="btn btn-secondary" onClick={onLogout}><LogOut size={16} /> Sair</button>
      </header>

      {error && <div className="app-notification error" role="alert"><span>{error}</span></div>}
      {loading ? <div className="app-state"><RefreshCw className="spin" size={28} /><p>Carregando portal…</p></div> : (
        <div className="portal-grid">
          <section className="glass-panel portal-card portal-wide">
            <div className="portal-card-header"><h2><CalendarDays size={19} /> Minha escala</h2><div className="portal-month-selector"><button className="icon-button" onClick={() => changeMonth(-1)} title="Mês anterior"><ChevronLeft size={18} /></button><span>{String(month).padStart(2, '0')}/{year}</span><button className="icon-button" onClick={() => changeMonth(1)} title="Próximo mês"><ChevronRight size={18} /></button></div></div>
            {schedule.length === 0 ? <p className="portal-muted">Você não possui atribuições publicadas neste mês.</p> : (
              <div className="portal-list">
                {schedule.map(item => <div className="portal-list-row" key={item.id}>
                  <div><strong>{item.date}</strong><span>{SHIFT_LABELS[item.shift] || item.shift} · {item.role}</span></div>
                  <span className={item.isTrainee ? 'portal-tag trainee' : 'portal-tag'}>{item.isTrainee ? 'Treinando' : 'Principal'}</span>
                </div>)}
              </div>
            )}
          </section>

          <section className="glass-panel portal-card">
            <div className="portal-card-header"><h2><Bell size={19} /> Notificações</h2></div>
            {notifications.length === 0 ? <p className="portal-muted">Nenhuma notificação.</p> : notifications.slice(0, 5).map(notification => (
              <button className={`notification-row ${notification.read_at ? 'read' : ''}`} key={notification.id} onClick={() => run(async () => { await api.markNotificationRead(notification.id); })}>
                <span>{notification.message}</span><small>{notification.read_at ? 'Lida' : 'Nova'}</small>
              </button>
            ))}
          </section>

          <section className="glass-panel portal-card">
            <div className="portal-card-header"><h2><Plus size={19} /> Indisponibilidade</h2></div>
            <form className="portal-form" onSubmit={addUnavailability}>
              <label>Domingo<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></label>
              <label>Turno<select value={form.shift} onChange={event => setForm({ ...form, shift: event.target.value })}><option value="ALL">Qualquer turno</option><option value="MORNING">Manhã</option><option value="NIGHT">Noite</option></select></label>
              <label>Motivo<input value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
              <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Registrar</button>
            </form>
            <div className="portal-list compact">{unavailabilities.map(item => <div className="portal-list-row" key={item.id}><span>{item.date} · {SHIFT_LABELS[item.shift] || item.shift}</span><button className="icon-button" disabled={busy} onClick={() => run(() => api.deleteMyUnavailability(item.id))} title="Remover"><Trash2 size={16} /></button></div>)}</div>
          </section>

          <section className="glass-panel portal-card portal-wide">
            <div className="portal-card-header"><h2><Send size={19} /> Solicitar troca</h2></div>
            {schedule.length === 0 ? <p className="portal-muted">Você precisa ter uma atribuição publicada para solicitar troca.</p> : <form className="portal-form exchange-form" onSubmit={requestExchange}>
              <label>Atribuição<select value={exchangeForm.assignmentId} onChange={event => setExchangeForm({ ...exchangeForm, assignmentId: event.target.value })} required><option value="">Selecione</option>{schedule.map(item => <option key={item.id} value={item.id}>{item.date} · {item.shift} · {item.role}</option>)}</select></label>
              <label>Destinatário<select value={exchangeForm.targetVolunteerId} onChange={event => setExchangeForm({ ...exchangeForm, targetVolunteerId: event.target.value })} required><option value="">Selecione</option>{directory.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Motivo<input value={exchangeForm.reason} onChange={event => setExchangeForm({ ...exchangeForm, reason: event.target.value })} /></label>
              <button className="btn btn-primary" disabled={busy}><Send size={16} /> Solicitar</button>
            </form>}
            <div className="portal-list">{exchanges.map(exchange => <div className="portal-list-row" key={exchange.id}><div><strong>{exchange.date} · {exchange.role}</strong><span>{exchange.requesterName} → {exchange.targetVolunteerName}</span></div><div className="portal-actions"><span className={`portal-tag status-${exchange.status.toLowerCase()}`}>{STATUS_LABELS[exchange.status] || exchange.status}</span>{exchange.status === 'PENDING' && String(exchange.targetVolunteerId) === String(user.volunteerId) && <><button className="icon-button success" onClick={() => run(() => api.acceptExchange(exchange.id))} title="Aceitar"><Check size={16} /></button><button className="icon-button danger" onClick={() => run(() => api.rejectExchange(exchange.id))} title="Rejeitar"><X size={16} /></button></>}{exchange.status === 'PENDING' && String(exchange.requesterId) === String(user.volunteerId) && <button className="icon-button danger" onClick={() => run(() => api.cancelExchange(exchange.id))} title="Cancelar"><X size={16} /></button>}</div></div>)}</div>
          </section>
        </div>
      )}
    </main>
  );
}
