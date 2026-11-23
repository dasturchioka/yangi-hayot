import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from './api';

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

  return (
    <section className="stack">
      <h1 className="h2">Rassilka</h1>
      {error && <p className="error">{error}</p>}

      {!draft ? (
        <div className="card stack">
          <label className="field">
            <span>Auditoriya</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                  {counts ? ` (${counts[a]})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Matn (media bilan — izoh, 1024 belgigacha)</span>
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row">
            <label className="field">
              <span>Media</span>
              <select value={mediaKind} onChange={(e) => setMediaKind(e.target.value as typeof mediaKind)}>
                <option value="">Yo'q</option>
                <option value="photo">Foto</option>
                <option value="video">Video</option>
              </select>
            </label>
            {mediaKind && (
              <label className="field grow">
                <span>https havola yoki Telegram file_id</span>
                <input value={mediaRef} onChange={(e) => setMediaRef(e.target.value)} />
              </label>
            )}
          </div>
          <div className="row">
            <label className="field">
              <span>Tugma</span>
              <select value={buttonKind} onChange={(e) => setButtonKind(e.target.value as typeof buttonKind)}>
                <option value="">Tugmasiz</option>
                <option value="url">Havola</option>
                <option value="app">Mini App ekrani</option>
              </select>
            </label>
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
        <div className="card stack">
          <p className="muted">Qabul qiluvchilar ko'radi:</p>
          <Preview content={draft.content} />
          <p className="title">{draft.recipients} ta qabul qiluvchiga yuborilsinmi?</p>
          <div className="row">
            <button className="primary" onClick={() => void act('confirm')}>
              ✅ Yuborish
            </button>
            <button onClick={() => void act('cancel')}>❌ Bekor qilish</button>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Matn</th>
            <th>Auditoriya</th>
            <th>Holat</th>
            <th>Yetkazildi</th>
            <th>Botni bloklagan</th>
            <th>Xato</th>
            <th>Navbatda</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td className="clip">{r.content.text}</td>
              <td>{AUDIENCE_LABEL[r.audience]}</td>
              <td>{STATUS_LABEL[r.status]}</td>
              <td>{r.stats.delivered}</td>
              <td>{r.stats.blocked}</td>
              <td>{r.stats.error}</td>
              <td>{r.stats.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Preview({ content }: { content: Content }) {
  return (
    <div className="preview">
      {content.media && (
        <p className="muted">
          [{content.media.kind === 'photo' ? 'Foto' : 'Video'}: {content.media.fileId}]
        </p>
      )}
      <p className="pre">{content.text}</p>
      {content.button && <span className="chip">{content.button.text}</span>}
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
