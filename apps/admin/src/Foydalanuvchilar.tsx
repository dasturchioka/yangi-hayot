import { ADMIN_ROLLAR, type AdminDto, type AdminRol } from '@yh/shared';
import { useCallback, useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { ROL_LABEL } from './format';
import { Select } from '@yh/ui/select';
import { Icon } from './icons';
import { Modal, ModalForm } from './Modal';

/** «Foydalanuvchilar» (Administrator): admin-panel logins, roles, deactivation, new password. */
export function FoydalanuvchilarScreen({ me }: { me: AdminDto }) {
  const [users, setUsers] = useState<AdminDto[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [parolUchun, setParolUchun] = useState<AdminDto | null>(null);
  // The modal keeps its user while it closes.
  const [parolShown, setParolShown] = useState<AdminDto | null>(null);
  if (parolUchun && parolUchun !== parolShown) setParolShown(parolUchun);

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

  return (
    <div className="stack wide">
      <header className="row between">
        <div>
          <h1 className="h2">Foydalanuvchilar</h1>
          <p className="muted">Administrator — hammasi; Menejer — Xonadon holatlari va yozilishlar</p>
        </div>
        <button className="primary with-icon" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          Foydalanuvchi
        </button>
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
                  <button className="link" onClick={() => setParolUchun(u)}>
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
      <Modal open={parolUchun !== null} onClose={() => setParolUchun(null)} title={`${parolShown?.nomi ?? ''} uchun yangi parol`}>
        {parolShown && (
          <NewPasswordForm
            user={parolShown}
            onDone={() => {
              setParolUchun(null);
              setError('');
            }}
          />
        )}
      </Modal>
      <Modal open={creating} onClose={() => setCreating(false)} title="Yangi foydalanuvchi">
        <NewUserForm
          onCreated={async () => {
            setCreating(false);
            setError('');
            await reload();
          }}
        />
      </Modal>
    </div>
  );
}

function NewUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [login, setLogin] = useState('');
  const [nomi, setNomi] = useState('');
  const [rol, setRol] = useState<AdminRol>('menejer');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    try {
      await adminApi('POST', '/users', { login: login.trim(), nomi: nomi.trim(), rol, password });
      setBusy(false);
      await onCreated();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <ModalForm onSubmit={() => void create()} busy={busy} error={error || undefined} submitLabel="Qo'shish">
      <label className="field">
        <span>Ism</span>
        <input value={nomi} onChange={(e) => setNomi(e.target.value)} required maxLength={100} />
      </label>
      <label className="field">
        <span>Login (lotin harf, raqam, . _ -)</span>
        <input value={login} onChange={(e) => setLogin(e.target.value)} required pattern="[a-zA-Z0-9._\-]{3,32}" autoComplete="off" />
      </label>
      <Select label="Rol" value={rol} options={ADMIN_ROLLAR.map((r) => ({ value: r, label: ROL_LABEL[r] }))} onChange={setRol} />
      <label className="field">
        <span>Parol (kamida 8 belgi)</span>
        <input
          data-autofocus
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
    </ModalForm>
  );
}

function NewPasswordForm({ user, onDone }: { user: AdminDto; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    try {
      await adminApi('PATCH', `/users/${user.id}`, { password });
      setBusy(false);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <ModalForm onSubmit={() => void save()} busy={busy} error={error || undefined}>
      <input type="text" name="username" autoComplete="username" value={user.login} readOnly hidden />
      <label className="field">
        <span>Parol (kamida 8 belgi)</span>
        <input
          data-autofocus
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
    </ModalForm>
  );
}
