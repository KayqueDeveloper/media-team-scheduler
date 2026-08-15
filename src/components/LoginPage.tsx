// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useState } from 'react';
import { LockKeyhole, LogIn, UserPlus } from 'lucide-react';

export function LoginPage({ onLogin, onOpenRegistration, onOpenRecovery, error, busy = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    await onLogin(email, password);
  }

  return (
    <main className="auth-page">
      <form className="glass-panel auth-card" onSubmit={handleSubmit}>
        <div className="brand-icon auth-icon"><LockKeyhole size={24} /></div>
        <h1>Escala de Transmissão</h1>
        <p className="auth-subtitle">Entre para acessar o painel administrativo.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <label>
          E-mail
          <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" />
        </label>
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          <LogIn size={16} /> {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button className="auth-link" type="button" onClick={() => onOpenRecovery(email)}>Esqueci minha senha</button>
        <div className="auth-divider"><span>ou</span></div>
        <button className="btn btn-secondary auth-submit" type="button" onClick={onOpenRegistration}>
          <UserPlus size={16} /> Ainda não tenho cadastro
        </button>
      </form>
    </main>
  );
}
