// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { ArrowLeft, MailCheck, UserPlus } from 'lucide-react';

function phoneMask(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function RegistrationPage({ onRegister, onBack, onRecover, confirmed = false }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(confirmed ? 'E-mail confirmado. Seu cadastro agora aguarda aprovação do líder.' : '');

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError({ message: 'A senha deve conter pelo menos 8 caracteres.' });
    if (form.password !== form.confirmation) return setError({ message: 'As senhas não coincidem.' });
    setBusy(true);
    try {
      const result = await onRegister(form);
      setSuccess(result?.message || 'Enviamos um link de confirmação para o seu e-mail.');
    } catch (nextError) {
      setError({ message: nextError.message, code: nextError.payload?.code, email: form.email });
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <main className="auth-page">
        <section className="glass-panel auth-card auth-result" aria-live="polite">
          <div className="brand-icon auth-icon"><MailCheck size={24} /></div>
          <h1>{confirmed ? 'E-mail confirmado' : 'Confira seu e-mail'}</h1>
          <p className="auth-success">{success}</p>
          {!confirmed && <p className="auth-subtitle">O cadastro só aparecerá para o líder depois que você confirmar o endereço.</p>}
          <button className="btn btn-secondary auth-submit" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar para entrar</button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="glass-panel auth-card" onSubmit={submit}>
        <div className="brand-icon auth-icon"><UserPlus size={24} /></div>
        <h1>Cadastro de voluntário</h1>
        <p className="auth-subtitle">Confirme seu e-mail e aguarde a aprovação do líder para acessar o portal.</p>
        {error && <p className="auth-error" role="alert">{error.message}</p>}
        <label>Nome completo<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required autoComplete="name" /></label>
        <label>E-mail<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></label>
        <label>Telefone / WhatsApp<input type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: phoneMask(event.target.value) })} required placeholder="(11) 99999-9999" autoComplete="tel" /></label>
        <label>Senha<input type="password" minLength={8} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required autoComplete="new-password" /></label>
        <label>Confirmar senha<input type="password" minLength={8} value={form.confirmation} onChange={event => setForm({ ...form, confirmation: event.target.value })} required autoComplete="new-password" /></label>
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}><UserPlus size={16} /> {busy ? 'Cadastrando…' : 'Criar cadastro'}</button>
        {error?.code === 'EMAIL_ALREADY_REGISTERED' && (
          <div className="auth-actions">
            <button className="btn btn-secondary" type="button" onClick={onBack}>Entrar</button>
            <button className="btn btn-secondary" type="button" onClick={() => onRecover(error.email)}>Recuperar senha</button>
          </div>
        )}
        <button className="auth-link" type="button" onClick={onBack}><ArrowLeft size={14} /> Já tenho cadastro</button>
      </form>
    </main>
  );
}
