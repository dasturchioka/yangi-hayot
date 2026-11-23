import type { AdminDto, AdminMeResponse, AdminRol } from '@yh/shared';
import { useEffect, useState } from 'react';
import { adminApi, onUnauthorized } from './api';
import { ROL_LABEL } from './format';
import { FoydalanuvchilarScreen } from './Foydalanuvchilar';
import { ImportScreen } from './Import';
import { JurnalScreen } from './Jurnal';
import { LoginScreen } from './Login';
import { LoyihalarScreen } from './Loyihalar';
import { MatnlarScreen } from './Matnlar';
import { RassilkaScreen } from './Rassilka';
import { XonadonlarScreen } from './Xonadonlar';

/**
 * Admin-panel shell: login, then sections by rol. Administrator sees
 * everything; Menejer — Xonadonlar (moving counts), Import (#6), Yozilishlar and the Jurnal.
 * The server enforces the same rules; hiding here is only convenience.
 */
interface Section {
  name: string;
  rollar: AdminRol[];
  render?: (admin: AdminDto) => React.ReactNode;
}

const SECTIONS: Section[] = [
  { name: 'Xonadonlar', rollar: ['administrator', 'menejer'], render: (a) => <XonadonlarScreen admin={a} /> },
  { name: 'Import', rollar: ['administrator', 'menejer'], render: () => <ImportScreen /> },
  { name: 'Loyihalar', rollar: ['administrator'], render: () => <LoyihalarScreen /> },
  { name: 'Yozilishlar', rollar: ['administrator', 'menejer'] },
  { name: 'Jurnal', rollar: ['administrator', 'menejer'], render: () => <JurnalScreen /> },
  { name: 'Rassilka', rollar: ['administrator'], render: () => <RassilkaScreen /> },
  { name: 'Analitika', rollar: ['administrator'] },
  { name: 'Matnlar va sozlamalar', rollar: ['administrator'], render: () => <MatnlarScreen /> },
  { name: 'Foydalanuvchilar', rollar: ['administrator'], render: (a) => <FoydalanuvchilarScreen me={a} /> },
];

export function App() {
  const [admin, setAdmin] = useState<AdminDto | null | undefined>(undefined);
  const [section, setSection] = useState('Xonadonlar');

  useEffect(() => {
    adminApi<AdminMeResponse>('GET', '/auth/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(null));
    return onUnauthorized(() => setAdmin(null));
  }, []);

  if (admin === undefined) return null;
  if (admin === null) return <LoginScreen onLogin={setAdmin} />;

  const visible = SECTIONS.filter((s) => s.rollar.includes(admin.rol));
  const current = visible.find((s) => s.name === section) ?? visible[0]!;

  async function logout() {
    await adminApi('POST', '/auth/logout').catch(() => undefined);
    setAdmin(null);
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <p className="brand">Yangi Hayot</p>
        <ul>
          {visible.map((s) => (
            <li key={s.name}>
              <button
                className={s.name === current.name ? 'nav active' : 'nav'}
                disabled={!s.render}
                title={s.render ? undefined : "Keyingi bosqichda qo'shiladi"}
                onClick={() => setSection(s.name)}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="me">
          <span className="avatar">{admin.nomi.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{admin.nomi}</strong>
            <br />
            <span className="muted small">{ROL_LABEL[admin.rol]}</span>
          </span>
          <button className="link" onClick={logout}>
            Chiqish
          </button>
        </div>
      </nav>
      <main className="content">
        {current.render ? current.render(admin) : <p className="muted">Bo'lim keyingi bosqichlarda qo'shiladi.</p>}
      </main>
    </div>
  );
}
