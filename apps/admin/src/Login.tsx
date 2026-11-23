import type { AdminDto, AdminMeResponse } from '@yh/shared';
import { useState, type FormEvent } from 'react';
import { adminApi, errorText } from './api';

/** «Kirish» screen (UI kit, admin page 1): login + parol. */
export function LoginScreen({ onLogin }: { onLogin: (admin: AdminDto) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminApi<AdminMeResponse>('POST', '/auth/login', { login: login.trim(), password });
      onLogin(res.admin);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <p className="brand on-dark">Yangi Hayot</p>
        <div>
          <h1 className="h1">Xonadonlar, narxlar va yozilishlar — bitta joyda</h1>
          <p>O'zgarishlar Mini App va AI-menejerda 1 daqiqada ko'rinadi</p>
        </div>
      </section>
      <form className="login-form stack" onSubmit={submit}>
        <p className="brand">Yangi Hayot</p>
        <h2 className="h2">Kirish</h2>
        <label className="field">
          <span>Login</span>
          <input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </label>
        <label className="field">
          <span>Parol</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          Kirish
        </button>
        <p className="muted small">Parolni unutdingizmi? Administratorga murojaat qiling.</p>
      </form>
    </div>
  );
}
