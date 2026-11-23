import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from './api';
import { Select } from '@yh/ui/select';

/** Mirrors the server's /admin/api/rassilka responses (apps/server/src/rassilka/rassilka.ts). */
type Audience = 'all' | 'ru' | 'uz' | 'toshkent' | 'navoiy';
type Button = { text: string; url: string } | { text: string; startapp: string };
interface Content {
  text: string;
  media?: { kind: 'photo' | 'video'; fileId: string };
  button?: Button;
}
interface Rassilka {
  id: string;
  audience: Audience;
  content: Content;
  status: 'draft' | 'sending' | 'done' | 'cancelled';
  createdAt: string;
  stats: { total: number; pending: number; delivered: number; blocked: number; error: number };
  recipients?: number;
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Hammasi',
  ru: 'RU',
  uz: 'UZ',
  toshkent: 'Toshkentga qiziqish',
  navoiy: 'Navoiyga qiziqish',
};
const STATUS_LABEL: Record<Rassilka['status'], string> = {
  draft: 'Qoralama',
  sending: 'Yuborilmoqda',
  done: 'Yakunlandi',
  cancelled: 'Bekor qilindi',
};

/** Rassilka screen: compose → «N ta qabul qiluvchiga yuborilsinmi?» → confirm; list with the report. */
export function RassilkaScreen() {
  const [counts, setCounts] = useState<Record<Audience, number> | null>(null);
  const [items, setItems] = useState<Rassilka[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Rassilka | null>(null);

  const [audience, setAudience] = useState<Audience>('all');
  const [text, setText] = useState('');
  const [mediaKind, setMediaKind] = useState<'' | 'photo' | 'video'>('');
  const [mediaRef, setMediaRef] = useState('');
  const [buttonKind, setButtonKind] = useState<'' | 'url' | 'app'>('');
  const [buttonText, setButtonText] = useState('');
  const [buttonTarget, setButtonTarget] = useState('');

  const refresh = useCallback(async () => {
    try {
      setCounts(await adminApi<Record<Audience, number>>('GET', '/rassilka/audiences'));
      setItems((await adminApi<{ items: Rassilka[] }>('GET', '/rassilka')).items);
      setError('');
    } catch (e) {
      setError(describe(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function createDraft() {
    const content: Content = { text };
    if (mediaKind && mediaRef) content.media = { kind: mediaKind, fileId: mediaRef };
    if (buttonKind === 'url') content.button = { text: buttonText, url: buttonTarget };
    if (buttonKind === 'app') content.button = { text: buttonText, startapp: buttonTarget };
    try {
      setDraft(await adminApi<Rassilka>('POST', '/rassilka', { audience, content }));
      setError('');
    } catch (e) {
      setError(describe(e));
    }
  }

  async function act(action: 'confirm' | 'cancel') {
    if (!draft) return;
    try {
      await adminApi('POST', `/rassilka/${draft.id}/${action}`);
      setDraft(null);
      if (action === 'confirm') setText('');
      await refresh();
    } catch (e) {
      setError(describe(e));
    }
  }

  // What the form would send now: the preview follows typing, the confirm step shows the saved draft.
  const live: Content = { text };
  if (mediaKind) live.media = { kind: mediaKind, fileId: mediaRef };
  if (buttonKind === 'url') live.button = { text: buttonText, url: buttonTarget };
  if (buttonKind === 'app') live.button = { text: buttonText, startapp: buttonTarget };

  return (
    <section className="stack">
      <header>
        <h1 className="h2">Rassilka</h1>
        <p className="muted">Bot obunachilariga xabar: avval ko'rib chiqasiz, keyin tasdiqlaysiz</p>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="rassilka-grid">
        {!draft ? (
          <div className="card stack">
            <div className="field">
              <span>Auditoriya</span>
              <div className="audience" role="group" aria-label="Auditoriya">
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <button key={a} type="button" aria-pressed={a === audience} onClick={() => setAudience(a)}>
                    {AUDIENCE_LABEL[a]}
                    {counts && <span className="count">{counts[a]}</span>}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Matn (media bilan — izoh, 1024 belgigacha)</span>
              <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="row">
              <Select<typeof mediaKind>
                label="Media"
                value={mediaKind}
                options={[
                  { value: '', label: "Yo'q" },
                  { value: 'photo', label: 'Foto' },
                  { value: 'video', label: 'Video' },
                ]}
                onChange={setMediaKind}
              />
              {mediaKind && (
                <label className="field grow">
                  <span>https havola yoki Telegram file_id</span>
                  <input value={mediaRef} onChange={(e) => setMediaRef(e.target.value)} />
                </label>
              )}
            </div>
            <div className="row">
              <Select<typeof buttonKind>
                label="Tugma"
                value={buttonKind}
                options={[
                  { value: '', label: 'Tugmasiz' },
                  { value: 'url', label: 'Havola' },
                  { value: 'app', label: 'Mini App ekrani' },
                ]}
                onChange={setButtonKind}
              />
              {buttonKind && (
                <>
                  <label className="field grow">
                    <span>Tugma matni</span>
                    <input value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
                  </label>
                  <label className="field grow">
                    <span>{buttonKind === 'url' ? 'https://…' : "Ekran (bo'sh = bosh sahifa; booking, ariza)"}</span>
                    <input value={buttonTarget} onChange={(e) => setButtonTarget(e.target.value)} />
                  </label>
                </>
              )}
            </div>
            <div>
              <button className="primary" disabled={!text.trim()} onClick={() => void createDraft()}>
                Ko'rib chiqish
              </button>
            </div>
          </div>
        ) : (
          <div className="confirm-panel">
            <p className="title">{draft.recipients} ta qabul qiluvchiga yuborilsinmi?</p>
            <p className="muted">
              Auditoriya: {AUDIENCE_LABEL[draft.audience]}. Yuborilgandan keyin to'xtatib bo'lmaydi.
            </p>
            <div className="row">
              <button className="primary" onClick={() => void act('confirm')}>
                Yuborish
              </button>
              <button onClick={() => void act('cancel')}>Bekor qilish</button>
            </div>
          </div>
        )}

        <aside className="tg-preview">
          <p className="title">{draft ? "Qabul qiluvchilar shuni ko'radi" : "Telegram'da shunday ko'rinadi"}</p>
          <Preview content={draft ? draft.content : live} />
        </aside>
      </div>

      <section className="card flush">
        <h2 className="title pad">Yuborilganlar</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Matn</th>
              <th>Auditoriya</th>
              <th>Holat</th>
              <th className="num">Yetkazildi</th>
              <th className="num">Botni bloklagan</th>
              <th className="num">Xato</th>
              <th className="num">Navbatda</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td className="clip">{r.content.text}</td>
                <td>{AUDIENCE_LABEL[r.audience]}</td>
                <td>
                  <span className={`status-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className="num">{r.stats.delivered}</td>
                <td className="num">{r.stats.blocked}</td>
                <td className="num">{r.stats.error}</td>
                <td className="num">{r.stats.pending}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  Hali rassilka yuborilmagan
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function Preview({ content }: { content: Content }) {
  return (
    <div className="tg-chat">
      <div className="tg-bubble">
        {content.media && (
          <div className="tg-media">
            {content.media.kind === 'photo' ? 'Foto' : 'Video'}
            {content.media.fileId ? ` · ${content.media.fileId.slice(0, 32)}` : ''}
          </div>
        )}
        <p className={content.text.trim() ? 'tg-text' : 'tg-text placeholder'}>
          {content.text.trim() || 'Xabar matni shu yerda ko‘rinadi'}
        </p>
      </div>
      {content.button && <span className="tg-button">{content.button.text || 'Tugma'}</span>}
    </div>
  );
}

function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Sessiya tugadi, qayta kiring.';
    if (e.status === 403) return 'Rassilka faqat Administrator uchun.';
    if (e.status === 400) return "Ma'lumotlar noto'g'ri: matn, havola yoki izoh uzunligini tekshiring.";
    if (e.status === 409) return 'Bu rassilka allaqachon boshlangan yoki bekor qilingan.';
    return `Server xatosi (${e.status}).`;
  }
  return 'Server bilan aloqa yo‘q.';
}
