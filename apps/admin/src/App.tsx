import type { AdminDto, AdminMeResponse, AdminRol } from '@yh/shared';
import { useEffect, useState } from 'react';
import { adminApi, onUnauthorized } from './api';
import { ROL_LABEL } from './format';
import { CollapseIcon, ExpandIcon, LogoutIcon, MenuIcon, SectionIcon } from './icons';
import { FoydalanuvchilarScreen } from './Foydalanuvchilar';
import { ImportScreen } from './Import';
import { JurnalScreen } from './Jurnal';
import { KvizSozlamalariScreen } from './KvizSozlamalari';
import { LoginScreen } from './Login';
import { LoyihalarScreen } from './Loyihalar';
import { MatnlarScreen } from './Matnlar';
import { RassilkaScreen } from './Rassilka';
import { TakliflarScreen } from './Takliflar';
import { VoronkaScreen } from './Voronka';
import { XonadonlarScreen } from './Xonadonlar';
import { YozilishlarScreen } from './Yozilishlar';

/**
 * Admin-panel shell: login, then sections by rol. Administrator sees
 * everything; Menejer — Xonadonlar (holat), Import (#6), Yozilishlar and the Jurnal.
 * The server enforces the same rules; hiding here is only convenience.
 */
interface Section {
  name: string;
  rollar: AdminRol[];
  render?: (admin: AdminDto, go: (section: string) => void) => React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    name: 'Xonadonlar',
    rollar: ['administrator', 'menejer'],
    render: (a, go) => <XonadonlarScreen admin={a} onImport={() => go('Import')} />,
  },
  { name: 'Import', rollar: ['administrator', 'menejer'], render: () => <ImportScreen /> },
  { name: 'Loyihalar', rollar: ['administrator'], render: () => <LoyihalarScreen /> },
  { name: 'Yozilishlar', rollar: ['administrator', 'menejer'], render: (a) => <YozilishlarScreen admin={a} /> },
  { name: 'Jurnal', rollar: ['administrator', 'menejer'], render: () => <JurnalScreen /> },
  { name: 'Rassilka', rollar: ['administrator'], render: () => <RassilkaScreen /> },
  { name: 'Takliflar', rollar: ['administrator'], render: () => <TakliflarScreen /> },
  { name: 'Analitika', rollar: ['administrator'], render: () => <VoronkaScreen /> },
  {
    name: 'Matnlar va sozlamalar',
    rollar: ['administrator'],
    render: () => (
      <>
        <MatnlarScreen />
        <KvizSozlamalariScreen />
      </>
    ),
  },
  { name: 'Foydalanuvchilar', rollar: ['administrator'], render: (a) => <FoydalanuvchilarScreen me={a} /> },
];

export function App() {
  const [admin, setAdmin] = useState<AdminDto | null | undefined>(undefined);
  const [section, setSection] = useState('Xonadonlar');
  // Phones: off-canvas drawer; medium screens: the icon rail expanded over the content.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    adminApi<AdminMeResponse>('GET', '/auth/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(null));
    return onUnauthorized(() => setAdmin(null));
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  if (admin === undefined) return null;
  if (admin === null) return <LoginScreen onLogin={setAdmin} />;

  const visible = SECTIONS.filter((s) => s.rollar.includes(admin.rol));
  const current = visible.find((s) => s.name === section) ?? visible[0]!;

  async function logout() {
    await adminApi('POST', '/auth/logout').catch(() => undefined);
    setAdmin(null);
  }

  return (
    <div className={navOpen ? 'layout nav-open' : 'layout'}>
      <header className="topbar">
        <button className="icon-button" onClick={() => setNavOpen(true)} aria-label="Menyu" aria-expanded={navOpen} aria-controls="sidebar">
          <MenuIcon />
        </button>
        <img src="/logo.png" alt="" width={28} height={28} />
        <strong>{current.name}</strong>
      </header>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />
      <nav className="sidebar" id="sidebar" aria-label="Bo'limlar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="" width={32} height={32} />
          <span className="sidebar-brand-text">
            <strong>Yangi Hayot</strong>
            <span className="muted small">Sotuv bo'limi paneli</span>
          </span>
          <button
            className="icon-button rail-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label={navOpen ? 'Menyuni yig‘ish' : 'Menyuni ochish'}
            aria-expanded={navOpen}
          >
            {navOpen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </div>
        <ul>
          {visible.map((s) => (
            <li key={s.name}>
              <button
                className={s.name === current.name ? 'nav active' : 'nav'}
                aria-current={s.name === current.name ? 'page' : undefined}
                disabled={!s.render}
                title={s.render ? s.name : `${s.name} — keyingi bosqichda qo'shiladi`}
                onClick={() => {
                  setSection(s.name);
                  setNavOpen(false);
                }}
              >
                <SectionIcon name={s.name} />
                <span className="nav-label">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="me">
          <span className="avatar">{admin.nomi.slice(0, 1).toUpperCase()}</span>
          <span className="me-text">
            <strong>{admin.nomi}</strong>
            <span className="muted small">{ROL_LABEL[admin.rol]}</span>
          </span>
          <button className="icon-button" onClick={logout} aria-label="Chiqish" title="Chiqish">
            <LogoutIcon />
          </button>
        </div>
      </nav>
      <main className="content" key={current.name}>
        {current.render ? (
          current.render(admin, setSection)
        ) : (
          <div className="empty-panel">
            <p className="title">{current.name}</p>
            <p className="muted">Bo'lim keyingi bosqichlarda qo'shiladi.</p>
          </div>
        )}
      </main>
    </div>
  );
}
