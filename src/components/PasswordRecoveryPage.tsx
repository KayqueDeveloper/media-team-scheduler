// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';

export function PasswordRecoveryPage({ initialEmail = '', onRequest, onBack }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onRequest(email);
      setSent(true);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="glass-panel auth-card" onSubmit={submit}>
        <div className="brand-icon auth-icon">{sent ? <MailCheck size={24} /> : <KeyRound size={24} />}</div>
        <h1>Recuperar senha</h1>
        {sent ? (
          <p className="auth-success">Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.</p>
        ) : (
          <>
            <p className="auth-subtitle">Informe o e-mail usado no cadastro.</p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label>
            <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          </>
        )}
        <button className="auth-link" type="button" onClick={onBack}><ArrowLeft size={14} /> Voltar para entrar</button>
      </form>
    </main>
  );
}
