import { useState } from 'react';
import { getToken, setToken } from './api';
import { RassilkaScreen } from './Rassilka';

/**
 * Admin-panel shell. Login, roles (Administrator / Menejer) and the other
 * screens (Xonadonlar, Loyihalar, Yozilishlar, Analitika, Matnlar va
 * sozlamalar) come in later tickets. Until #5 the API is opened with a
 * temporary shared token typed in the sidebar.
 */
const sections = ['Xonadonlar', 'Loyihalar', 'Yozilishlar', 'Rassilka', 'Analitika', 'Matnlar va sozlamalar'] as const;
const ready: ReadonlySet<string> = new Set(['Rassilka']);

export function App() {
  const [section, setSection] = useState<string>('Rassilka');
  const [token, setTokenState] = useState(getToken());

  return (
    <div className="layout">
      <nav className="sidebar">
        <p className="brand">Yangi Hayot</p>
        <ul>
          {sections.map((s) => (
            <li key={s}>
              <button
                className={s === section ? 'nav active' : 'nav'}
                disabled={!ready.has(s)}
                onClick={() => setSection(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
        {/* TEMPORARY until #5 (login): shared admin token. */}
        <label className="field token">
          <span>Admin token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setTokenState(e.target.value);
              setToken(e.target.value);
            }}
          />
        </label>
      </nav>
      <main className="content">
        {section === 'Rassilka' ? (
          <RassilkaScreen key={token} />
        ) : (
          <p className="muted">Bo'lim keyingi bosqichlarda qo'shiladi.</p>
        )}
      </main>
    </div>
  );
}
