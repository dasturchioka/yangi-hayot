import { ADMIN_ROLLAR, type AdminDto, type AdminRol } from '@yh/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, errorText } from './api';
import { ROL_LABEL } from './format';
import { Select } from '@yh/ui/select';

/** «Foydalanuvchilar» (Administrator): admin-panel logins, roles, deactivation, new password. */
export function FoydalanuvchilarScreen({ me }: { me: AdminDto }) {
  const [users, setUsers] = useState<AdminDto[]>([]);
  const [error, setError] = useState('');
  const [login, setLogin] = useState('');
  const [nomi, setNomi] = useState('');
  const [rol, setRol] = useState<AdminRol>('menejer');
  const [password, setPassword] = useState('');

  const reload = useCallback(async () => {
    try {
      setUsers((await adminApi<{ users: AdminDto[] }>('GET', '/users')).users);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError('');
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  function create(e: FormEvent) {
    e.preventDefault();
    void act(async () => {
      await adminApi('POST', '/users', { login: login.trim(), nomi: nomi.trim(), rol, password });
      setLogin('');
      setNomi('');
      setPassword('');
    });
  }

  function newPassword(u: AdminDto) {
    const p = window.prompt(`${u.nomi} uchun yangi parol (kamida 8 belgi)`);
    if (p) void act(() => adminApi('PATCH', `/users/${u.id}`, { password: p }));
  }

  return (
    <div className="stack wide">
      <header>
        <h1 className="h2">Foydalanuvchilar</h1>
        <p className="muted">Administrator — hammasi; Menejer — Xonadon holatlari va yozilishlar</p>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Ism</th>
              <th>Login</th>
              <th>Rol</th>
              <th>Holati</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.faol ? undefined : 'dim'}>
                <td>{u.nomi}</td>
                <td>{u.login}</td>
                <td>
                  <Select
                    size="sm"
                    aria-label={`${u.nomi}: rol`}
                    value={u.rol}
                    disabled={u.id === me.id}
                    options={ADMIN_ROLLAR.map((r) => ({ value: r, label: ROL_LABEL[r] }))}
                    onChange={(rol) => void act(() => adminApi('PATCH', `/users/${u.id}`, { rol }))}
                  />
                </td>
                <td>{u.faol ? 'Faol' : "O'chirilgan"}</td>
                <td className="actions">
                  <button className="link" onClick={() => newPassword(u)}>
                    Yangi parol
                  </button>
                  {u.id !== me.id && (
                    <button className="link" onClick={() => void act(() => adminApi('PATCH', `/users/${u.id}`, { faol: !u.faol }))}>
                      {u.faol ? "O'chirish" : 'Yoqish'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="card stack" onSubmit={create}>
        <h2 className="title">Yangi foydalanuvchi</h2>
        <div className="row">
          <label className="field grow">
            <span>Ism</span>
            <input value={nomi} onChange={(e) => setNomi(e.target.value)} required maxLength={100} />
          </label>
          <label className="field grow">
            <span>Login (lotin harf, raqam, . _ -)</span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} required pattern="[a-zA-Z0-9._\-]{3,32}" />
          </label>
          <Select
            label="Rol"
            value={rol}
            options={ADMIN_ROLLAR.map((r) => ({ value: r, label: ROL_LABEL[r] }))}
            onChange={setRol}
          />
          <label className="field grow">
            <span>Parol (kamida 8 belgi)</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
        </div>
        <div>
          <button className="primary">Qo'shish</button>
        </div>
      </form>
    </div>
  );
}
