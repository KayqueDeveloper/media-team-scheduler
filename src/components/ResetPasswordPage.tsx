// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';

export function ResetPasswordPage({ onUpdate, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError('A senha deve conter pelo menos 8 caracteres.');
    if (password !== confirmation) return setError('As senhas não coincidem.');
    setBusy(true);
    try {
      await onUpdate(password);
      onDone();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="glass-panel auth-card" onSubmit={submit}>
        <div className="brand-icon auth-icon"><KeyRound size={24} /></div>
        <h1>Definir nova senha</h1>
        <p className="auth-subtitle">Escolha uma senha com pelo menos 8 caracteres.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <label>Nova senha<input type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" /></label>
        <label>Confirmar senha<input type="password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="new-password" /></label>
        <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </main>
  );
}
