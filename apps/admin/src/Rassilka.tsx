import { useCallback, useEffect, useState } from 'react';
import { Select } from '@yh/ui/select';
import { adminApi, ApiError } from './api';
import { qachon } from './format';
import { Icon } from './icons';
import { RasmYuklash } from './RasmYuklash';
import { TelegramPreview } from './TelegramPreview';
import './rassilka.css';

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

/** Mini App screens a button can open (startapp; '' = home). */
const EKRANLAR = [
  { value: '', label: 'Bosh sahifa' },
  { value: 'booking', label: "Ko'rishga yozilish" },
  { value: 'ariza', label: 'Ariza qoldirish' },
  { value: 'kalkulyator', label: "To'lov kalkulyatori" },
];
/** Telegram's limits: a caption under media is much shorter than a plain message. */
const MATN_MAX = 4096;
const IZOH_MAX = 1024;

/** Rassilka screen: compose → «N ta qabul qiluvchiga yuborilsinmi?» → confirm; list with the report. */
export function RassilkaScreen() {
  const [counts, setCounts] = useState<Record<Audience, number> | null>(null);
  const [items, setItems] = useState<Rassilka[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Rassilka | null>(null);
  const [busy, setBusy] = useState(false);

  const [audience, setAudience] = useState<Audience>('all');
  const [text, setText] = useState('');
  const [mediaKind, setMediaKind] = useState<'' | 'photo' | 'video'>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [mediaRef, setMediaRef] = useState('');
  const [buttonKind, setButtonKind] = useState<'' | 'url' | 'app'>('');
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [buttonScreen, setButtonScreen] = useState('');

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

  // What the form would send now: the preview follows typing, the confirm step shows the saved draft.
  // An uploaded photo goes out as an absolute URL: Telegram fetches it from this host.
  const mediaFileId = mediaKind === 'photo' ? (photo ? new URL(photo, window.location.origin).href : '') : mediaRef.trim();
  const live: Content = { text };
  if (mediaKind) live.media = { kind: mediaKind, fileId: mediaFileId };
  if (buttonKind === 'url') live.button = { text: buttonText, url: buttonUrl.trim() };
  if (buttonKind === 'app') live.button = { text: buttonText, startapp: buttonScreen };

  const max = mediaKind ? IZOH_MAX : MATN_MAX;
  const tooLong = text.length > max;
  const missing = !text.trim()
    ? 'Matn yozing'
    : tooLong
      ? `Matn ${max} belgidan oshmasin`
      : mediaKind && !mediaFileId
        ? mediaKind === 'photo' ? 'Rasmni yuklang' : 'Video havolasi yoki file_id kiriting'
        : buttonKind && !buttonText.trim()
          ? 'Tugma matnini yozing'
          : buttonKind === 'url' && !/^https:\/\/\S+$/.test(buttonUrl.trim())
            ? 'Tugma havolasi https:// bilan boshlansin'
            : counts && counts[audience] === 0
              ? "Bu auditoriyada hech kim yo'q"
              : null;

  async function createDraft() {
    if (missing) return;
    setBusy(true);
    try {
      setDraft(await adminApi<Rassilka>('POST', '/rassilka', { audience, content: live }));
      setError('');
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: 'confirm' | 'cancel') {
    if (!draft) return;
    setBusy(true);
    try {
      await adminApi('POST', `/rassilka/${draft.id}/${action}`);
      setDraft(null);
      if (action === 'confirm') {
        setText('');
        setMediaKind('');
        setPhoto(null);
        setMediaRef('');
        setButtonKind('');
        setButtonText('');
        setButtonUrl('');
      }
      await refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack bc-page">
      <header>
        <h1 className="h2">Rassilka</h1>
        <p className="muted">Bot obunachilariga xabar. Avval ko'rib chiqasiz, keyin tasdiqlaysiz.</p>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="bc-grid">
        {!draft ? (
          <form
            className="card bc-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void createDraft();
            }}
          >
            <fieldset className="bc-step">
              <legend>Kimga</legend>
              <div className="bc-audience" role="group" aria-label="Auditoriya">
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <button key={a} type="button" aria-pressed={a === audience} onClick={() => setAudience(a)}>
                    {AUDIENCE_LABEL[a]}
                    {counts && <span className="bc-count">{counts[a]}</span>}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="bc-step">
              <legend>Xabar</legend>
              <label className="field">
                <span className="visually-hidden">Xabar matni</span>
                <textarea
                  rows={7}
                  value={text}
                  placeholder="Assalomu alaykum! Yangi Hayot'da…"
                  aria-invalid={tooLong || undefined}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <p className={tooLong ? 'bc-counter over' : 'bc-counter'}>
                {text.length} / {max}
                {mediaKind && ' · media bilan izoh qisqaroq bo\u2019ladi'}
              </p>
            </fieldset>

            <fieldset className="bc-step">
              <legend>Rasm yoki video</legend>
              <Tabs
                label="Media"
                value={mediaKind}
                options={[
                  ['', "Yo'q"],
                  ['photo', 'Foto'],
                  ['video', 'Video'],
                ]}
                onChange={setMediaKind}
              />
              {mediaKind === 'photo' && (
                <RasmYuklash
                  label="Foto"
                  hint="JPG ga aylantirib yuklanadi — Telegram uni shu manzildan oladi."
                  value={photo}
                  onChange={setPhoto}
                  format="image/jpeg"
                />
              )}
              {mediaKind === 'video' && (
                <label className="field">
                  <span>Video: https havola yoki Telegram file_id</span>
                  <input value={mediaRef} onChange={(e) => setMediaRef(e.target.value)} placeholder="https://…/video.mp4" />
                </label>
              )}
            </fieldset>

            <fieldset className="bc-step">
              <legend>Tugma</legend>
              <Tabs
                label="Tugma"
                value={buttonKind}
                options={[
                  ['', 'Tugmasiz'],
                  ['app', 'Mini App'],
                  ['url', 'Havola'],
                ]}
                onChange={setButtonKind}
              />
              {buttonKind && (
                <div className="row">
                  <label className="field grow">
                    <span>Tugma matni</span>
                    <input
                      value={buttonText}
                      maxLength={64}
                      placeholder={buttonKind === 'app' ? 'Planirovkalarni ko‘rish' : 'Batafsil'}
                      onChange={(e) => setButtonText(e.target.value)}
                    />
                  </label>
                  {buttonKind === 'url' ? (
                    <label className="field grow">
                      <span>Havola</span>
                      <input value={buttonUrl} placeholder="https://…" onChange={(e) => setButtonUrl(e.target.value)} />
                    </label>
                  ) : (
                    <div className="grow">
                      <Select<string> label="Qaysi ekran" value={buttonScreen} options={EKRANLAR} onChange={setButtonScreen} />
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            <footer className="bc-submit">
              <button className="primary" disabled={Boolean(missing) || busy}>
                {busy ? 'Tayyorlanmoqda…' : "Ko'rib chiqish"}
              </button>
              <span className="muted small">
                {missing ?? `${counts ? counts[audience] : '…'} ta qabul qiluvchi · yuborishdan oldin yana tasdiqlaysiz`}
              </span>
            </footer>
          </form>
        ) : (
          <div className="card bc-confirm">
            <p className="bc-confirm-n">
              <b>{draft.recipients}</b> ta qabul qiluvchiga yuborilsinmi?
            </p>
            <dl className="bc-confirm-meta">
              <div>
                <dt>Auditoriya</dt>
                <dd>{AUDIENCE_LABEL[draft.audience]}</dd>
              </div>
              <div>
                <dt>Media</dt>
                <dd>{draft.content.media ? (draft.content.media.kind === 'photo' ? 'Foto' : 'Video') : "Yo'q"}</dd>
              </div>
              <div>
                <dt>Tugma</dt>
                <dd>{draft.content.button?.text ?? "Yo'q"}</dd>
              </div>
            </dl>
            <p className="bc-warn">Yuborilgandan keyin to'xtatib bo'lmaydi. O'ngdagi ko'rinishni yana bir bor tekshiring.</p>
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => void act('confirm')}>
                <Icon name="send" size={18} />
                {busy ? 'Yuborilmoqda…' : 'Yuborish'}
              </button>
              <button disabled={busy} onClick={() => void act('cancel')}>
                Ortga, tahrirlash
              </button>
            </div>
          </div>
        )}

        <aside className="bc-preview" aria-label="Telegram'dagi ko'rinishi">
          <p className="bc-preview-title">{draft ? "Qabul qiluvchilar shuni ko'radi" : "Telegram'da shunday ko'rinadi"}</p>
          <TelegramPreview
            message={draft ? draft.content : live}
            arrivalKey={draft?.id}
            placeholder={'Xabar matni shu yerda ko\u2018rinadi'}
          />
        </aside>
      </div>

      <section className="card flush">
        <h2 className="title pad">Yuborilganlar</h2>
        <div className="bc-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Matn</th>
                <th>Auditoriya</th>
                <th>Holat</th>
                <th className="num">Yetkazildi</th>
                <th className="num">Bloklagan</th>
                <th className="num">Xato</th>
                <th className="num">Navbatda</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="bc-date">{qachon(r.createdAt)}</td>
                  <td className="clip">{r.content.text}</td>
                  <td>{AUDIENCE_LABEL[r.audience]}</td>
                  <td>
                    <span className={`status-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    {r.status === 'sending' && r.stats.total > 0 && (
                      <span className="bc-progress" aria-hidden>
                        <span style={{ width: `${((r.stats.total - r.stats.pending) / r.stats.total) * 100}%` }} />
                      </span>
                    )}
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
        </div>
      </section>
    </section>
  );
}

function Tabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs bc-tabs" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? 'tab active' : 'tab'}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
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
