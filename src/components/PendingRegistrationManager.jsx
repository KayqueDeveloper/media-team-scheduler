import React, { useState } from 'react';
import { Check, Pencil, Save, Trash2, UserCheck, X } from 'lucide-react';

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function PendingRegistrationManager({ registrations, onUpdate, onApprove, onReject, disabled = false }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: '', phone: '' });

  function edit(item) {
    setEditingId(item.id);
    setDraft({ name: item.name, phone: formatPhone(item.phone) });
  }

  async function save(item) {
    const saved = await onUpdate(item.id, draft);
    if (saved) setEditingId(null);
  }

  async function reject(item) {
    if (!window.confirm(`Rejeitar e excluir definitivamente o cadastro de ${item.name}?`)) return;
    await onReject(item.id);
  }

  return (
    <section className="manager-container glass-panel pending-manager">
      <div className="manager-toolbar">
        <div>
          <h2>Cadastros pendentes</h2>
          <p>Somente voluntários que já confirmaram o e-mail aparecem nesta fila.</p>
        </div>
        <span className="pending-count"><UserCheck size={16} /> {registrations.length} pendente(s)</span>
      </div>

      {registrations.length === 0 ? <p className="empty-state">Nenhum cadastro aguardando aprovação.</p> : (
        <div className="pending-list">
          {registrations.map(item => {
            const editing = editingId === item.id;
            return (
              <article className="pending-card" key={item.id}>
                <div className="pending-details">
                  {editing ? (
                    <>
                      <label>Nome<input className="form-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
                      <label>Telefone<input className="form-input" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
                    </>
                  ) : (
                    <>
                      <strong>{item.name}</strong>
                      <span>{item.email}</span>
                      <span>{formatPhone(item.phone)}</span>
                      <small>E-mail confirmado em {formatDate(item.emailConfirmedAt)}</small>
                    </>
                  )}
                </div>
                <div className="pending-actions">
                  {editing ? (
                    <>
                      <button className="btn btn-primary" onClick={() => save(item)} disabled={disabled}><Save size={15} /> Salvar</button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)} disabled={disabled}><X size={15} /> Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => edit(item)} disabled={disabled}><Pencil size={15} /> Editar</button>
                      <button className="btn btn-primary" onClick={() => onApprove(item.id)} disabled={disabled}><Check size={15} /> Aprovar</button>
                      <button className="btn btn-danger" onClick={() => reject(item)} disabled={disabled}><Trash2 size={15} /> Rejeitar e excluir</button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
