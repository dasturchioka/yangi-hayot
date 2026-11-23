import {
  KONTENT_LIMITLARI,
  type AdminKontentResponse,
  type BizHaqimizdaKontent,
  type KontaktlarKontent,
  type Matn,
  type SotibOlishKontent,
} from '@yh/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { adminApi, errorText } from './api';
import { KalkulyatorForm } from './Kalkulyator';
import { SkoringForm } from './Skoring';
import './matnlar.css';
import { YozilishSozlamalariForm } from './Yozilishlar';

/**
 * «Matnlar va sozlamalar» (Administrator): Mini App texts in RU/UZ.
 * Each tab saves on its own. Later tickets add their tabs to TABS
 * (#12 — muddatli to'lov / bank stavkalari, #11 — ko'rsatuv kunlari).
 */
interface Tab {
  id: string;
  name: string;
  render: (k: AdminKontentResponse, onSaved: (k: AdminKontentResponse) => void) => ReactNode;
  /** The tab loads and saves its own settings (does not need the Kontent). */
  own?: () => ReactNode;
}

const TABS: Tab[] = [
  {
    id: 'sotib-olish',
    name: 'Qanday sotib olish',
    render: (k, onSaved) => <SotibOlishForm initial={k.sotibOlish} onSaved={onSaved} />,
  },
  {
    id: 'biz-haqimizda',
    name: 'Biz haqimizda',
    render: (k, onSaved) => <BizHaqimizdaForm initial={k.bizHaqimizda} onSaved={onSaved} />,
  },
  {
    id: 'kontaktlar',
    name: 'Kontaktlar',
    render: (k, onSaved) => <KontaktlarForm initial={k.kontaktlar} onSaved={onSaved} />,
  },
  {
    id: 'korish-vaqtlari',
    name: "Ko'rish kunlari va vaqtlari",
    render: () => null,
    own: () => <YozilishSozlamalariForm />,
  },
  {
    id: 'kalkulyator',
    name: "Muddatli to'lov va ipoteka",
    // Own settings key (GET/PUT /admin/api/kalkulyator), not part of Kontent.
    render: () => <KalkulyatorForm />,
  },
  {
    id: 'skoring',
    name: 'Ball qoidalari',
    // Lead skoringi (UF-4, #18): own settings key (GET/PUT /admin/api/skoring).
    render: () => <SkoringForm />,
  },
];

export function MatnlarScreen() {
  const [kontent, setKontent] = useState<AdminKontentResponse | null>(null);
  const [tab, setTab] = useState(TABS[0]!.id);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<AdminKontentResponse>('GET', '/kontent').then(setKontent, (e) => setError(errorText(e)));
  }, []);

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="stack wide matnlar">
      <header>
        <h1 className="h2">Matnlar va sozlamalar</h1>
        <p className="muted">Mini App'dagi matnlar. Saqlangan zahoti mijozlar ko'radi; har matn UZ va RU tilida.</p>
      </header>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={t.id === tab ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {/* key: switching tabs drops unsaved edits of the previous tab on purpose — each tab saves on its own */}
      {current.own ? (
        <div key={current.id}>{current.own()}</div>
      ) : (
        kontent && <div key={current.id}>{current.render(kontent, setKontent)}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- form shell

function useSave<T>(path: string, onSaved: (k: AdminKontentResponse) => void) {
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; text: string }>({
    kind: 'idle',
  });
  async function save(value: T) {
    setState({ kind: 'saving' });
    try {
      onSaved(await adminApi<AdminKontentResponse>('PUT', `/kontent/${path}`, value));
      setState({ kind: 'saved' });
    } catch (e) {
      setState({ kind: 'error', text: errorText(e) });
    }
  }
  return { state, save, touch: () => setState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)) };
}

export function Form({
  children,
  onSubmit,
  state,
  savedText = 'Saqlandi — Mini App’da ko‘rinadi',
}: {
  children: ReactNode;
  onSubmit: () => void;
  state: ReturnType<typeof useSave>['state'];
  /** Shown after a successful save. */
  savedText?: string;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <form className="matn-form" onSubmit={submit}>
      {children}
      <div className="save-bar">
        <span className="save-status" role="status">
          {state.kind === 'saved' && savedText}
          {state.kind === 'error' && <span className="save-error">{state.text}</span>}
        </span>
        <button className="primary" type="submit" disabled={state.kind === 'saving'}>
          {state.kind === 'saving' ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </form>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card matn-section">
      <header>
        <h2 className="title">{title}</h2>
        {hint && <p className="muted small">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- fields

/** One text in both languages, side by side. */
function MatnField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
}: {
  label: string;
  value: Matn;
  onChange: (v: Matn) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="matn-field">
      {(['uz', 'ru'] as const).map((lang) => (
        <label key={lang} className="field">
          <span>
            {label} <span className="lang">{lang.toUpperCase()}</span>
          </span>
          {multiline ? (
            <textarea
              rows={3}
              required
              maxLength={maxLength ?? 2000}
              value={value[lang]}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          ) : (
            <input
              required
              maxLength={maxLength ?? 200}
              value={value[lang]}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** Ordered list with add / remove / move; `max` from the TZ limits. */
export function ListEditor<T>({
  items,
  onChange,
  max,
  min = 0,
  blank,
  addLabel,
  numbered = false,
  children,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  max: number;
  min?: number;
  blank: () => T;
  addLabel: string;
  numbered?: boolean;
  children: (item: T, set: (v: T) => void) => ReactNode;
}) {
  const set = (i: number, v: T) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="list-editor">
      {items.map((item, i) => (
        <div key={i} className={numbered ? 'list-item numbered' : 'list-item'}>
          {numbered && (
            <span className="list-n" aria-hidden>
              {i + 1}
            </span>
          )}
          <div className="list-body">{children(item, (v) => set(i, v))}</div>
          <div className="list-actions">
            <button type="button" className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yuqoriga">
              <Icon d="M12 19V5M6 11l6-6 6 6" />
            </button>
            <button
              type="button"
              className="icon"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Pastga"
            >
              <Icon d="M12 5v14M6 13l6 6 6-6" />
            </button>
            <button
              type="button"
              className="icon danger"
              disabled={items.length <= min}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label="O'chirish"
            >
              <Icon d="M6 6l12 12M18 6 6 18" />
            </button>
          </div>
        </div>
      ))}
      <div className="row tight">
        <button type="button" disabled={items.length >= max} onClick={() => onChange([...items, blank()])}>
          + {addLabel}
        </button>
        <span className="muted small tabular">
          {items.length} / {max}
        </span>
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const bosh = (): Matn => ({ uz: '', ru: '' });

// ---------------------------------------------------------------- «Qanday sotib olish»

function SotibOlishForm({ initial, onSaved }: { initial: SotibOlishKontent; onSaved: (k: AdminKontentResponse) => void }) {
  const [v, setV] = useState(initial);
  const { state, save, touch } = useSave<SotibOlishKontent>('sotib-olish', onSaved);
  const upd = <K extends keyof SotibOlishKontent>(key: K, value: SotibOlishKontent[K]) => {
    touch();
    setV((s) => ({ ...s, [key]: value }));
  };

  return (
    <Form state={state} onSubmit={() => void save(v)}>
      <Section title="Sarlavha">
        <MatnField label="Sarlavha" value={v.sarlavha} onChange={(x) => upd('sarlavha', x)} />
      </Section>
      <Section title="Bosqichlar" hint="Tartib bo'yicha: tanlash va bron → shartnoma → to'lov → notarius → kalitlar → kadastr">
        <ListEditor
          items={v.bosqichlar}
          onChange={(x) => upd('bosqichlar', x)}
          max={KONTENT_LIMITLARI.bosqichlar}
          min={1}
          numbered
          blank={() => ({ nomi: bosh(), matn: bosh() })}
          addLabel="Bosqich"
        >
          {(b, set) => (
            <>
              <MatnField label="Nomi" value={b.nomi} onChange={(nomi) => set({ ...b, nomi })} />
              <MatnField label="Tavsif" multiline value={b.matn} onChange={(matn) => set({ ...b, matn })} />
            </>
          )}
        </ListEditor>
      </Section>
      <Section title="Xaridor hujjatlari">
        <ListEditor
          items={v.hujjatlar}
          onChange={(x) => upd('hujjatlar', x)}
          max={KONTENT_LIMITLARI.hujjatlar}
          blank={bosh}
          addLabel="Hujjat"
        >
          {(h, set) => <MatnField label="Hujjat" value={h} onChange={set} />}
        </ListEditor>
      </Section>
      <Section title="Ipoteka uchun hujjatlar" hint="Alohida ro'yxat: xaridor hujjatlariga qo'shimcha">
        <ListEditor
          items={v.ipotekaHujjatlari}
          onChange={(x) => upd('ipotekaHujjatlari', x)}
          max={KONTENT_LIMITLARI.hujjatlar}
          blank={bosh}
          addLabel="Hujjat"
        >
          {(h, set) => <MatnField label="Hujjat" value={h} onChange={set} />}
        </ListEditor>
      </Section>
      <Section title="Ko'p beriladigan savollar" hint={`Ochiladigan ro'yxat, ${KONTENT_LIMITLARI.faq} tagacha savol`}>
        <ListEditor
          items={v.faq}
          onChange={(x) => upd('faq', x)}
          max={KONTENT_LIMITLARI.faq}
          blank={() => ({ savol: bosh(), javob: bosh() })}
          addLabel="Savol"
        >
          {(f, set) => (
            <>
              <MatnField label="Savol" value={f.savol} onChange={(savol) => set({ ...f, savol })} />
              <MatnField label="Javob" multiline value={f.javob} onChange={(javob) => set({ ...f, javob })} />
            </>
          )}
        </ListEditor>
      </Section>
    </Form>
  );
}

// ---------------------------------------------------------------- «Biz haqimizda»

function BizHaqimizdaForm({ initial, onSaved }: { initial: BizHaqimizdaKontent; onSaved: (k: AdminKontentResponse) => void }) {
  const [v, setV] = useState(initial);
  const { state, save, touch } = useSave<BizHaqimizdaKontent>('biz-haqimizda', onSaved);
  const upd = <K extends keyof BizHaqimizdaKontent>(key: K, value: BizHaqimizdaKontent[K]) => {
    touch();
    setV((s) => ({ ...s, [key]: value }));
  };

  return (
    <Form state={state} onSubmit={() => void save({ ...v, foto: v.foto?.trim() || null })}>
      <Section title="Asosiy">
        <MatnField label="Sarlavha (rasm ustida)" value={v.sarlavha} onChange={(x) => upd('sarlavha', x)} />
        <MatnField label="Kompaniya haqida" multiline value={v.matn} onChange={(x) => upd('matn', x)} />
        <label className="field">
          <span>Rasm (https havola yoki /media/... yo'li; bo'sh — rasmsiz)</span>
          <input
            value={v.foto ?? ''}
            pattern="(https://|/)\S+"
            placeholder="/media/loyiha/jozibali-maskan/1.webp"
            onChange={(e) => upd('foto', e.target.value)}
          />
        </label>
      </Section>
      <Section title="Kompaniya raqamlari" hint="Masalan: «12» — «loyiha». Mijozga to'g'ri raqamlar ko'rinishi muhim">
        <ListEditor
          items={v.raqamlar}
          onChange={(x) => upd('raqamlar', x)}
          max={KONTENT_LIMITLARI.raqamlar}
          blank={() => ({ qiymat: '', nomi: bosh() })}
          addLabel="Raqam"
        >
          {(r, set) => (
            <div className="raqam-row">
              <label className="field">
                <span>Raqam</span>
                <input required maxLength={12} value={r.qiymat} onChange={(e) => set({ ...r, qiymat: e.target.value })} />
              </label>
              <MatnField label="Izoh" maxLength={40} value={r.nomi} onChange={(nomi) => set({ ...r, nomi })} />
            </div>
          )}
        </ListEditor>
      </Section>
      <p className="muted small">
        Topshirilgan loyihalar portfoliosi «Loyihalar» bo'limidan olinadi: holati «Topshirilgan» bo'lgan Loyihalar shu
        yerda ko'rinadi, katalogda emas.
      </p>
    </Form>
  );
}

// ---------------------------------------------------------------- Kontaktlar

function KontaktlarForm({ initial, onSaved }: { initial: KontaktlarKontent; onSaved: (k: AdminKontentResponse) => void }) {
  const [v, setV] = useState(initial);
  const [lat, setLat] = useState(initial.xarita ? String(initial.xarita.lat) : '');
  const [lng, setLng] = useState(initial.xarita ? String(initial.xarita.lng) : '');
  const { state, save, touch } = useSave<KontaktlarKontent>('kontaktlar', onSaved);
  const upd = <K extends keyof KontaktlarKontent>(key: K, value: KontaktlarKontent[K]) => {
    touch();
    setV((s) => ({ ...s, [key]: value }));
  };

  function submit() {
    const xarita = lat.trim() && lng.trim() ? { lat: Number(lat), lng: Number(lng) } : null;
    void save({ ...v, telegram: v.telegram?.trim() || null, xarita });
  }

  return (
    <Form state={state} onSubmit={submit}>
      <Section title="Aloqa" hint="«Biz haqimizda» ekranining pastida; «Qo'ng'iroq qilish» shu raqamni teradi">
        <div className="row">
          <label className="field grow">
            <span>Telefon</span>
            <input
              required
              pattern="\+?[0-9][0-9 ()\-]{1,19}"
              value={v.telefon}
              onChange={(e) => upd('telefon', e.target.value)}
            />
          </label>
          <label className="field grow">
            <span>Telegram (ixtiyoriy)</span>
            <input
              placeholder="@yangi_hayot_official"
              pattern="@?[A-Za-z0-9_]{5,32}"
              value={v.telegram ?? ''}
              onChange={(e) => upd('telegram', e.target.value)}
            />
          </label>
        </div>
        <MatnField label="Sotuv ofisi manzili" value={v.manzil} onChange={(x) => upd('manzil', x)} />
        <MatnField label="Ish vaqti" value={v.ishVaqti} onChange={(x) => upd('ishVaqti', x)} />
      </Section>
      <Section title="Xarita" hint="Ofis koordinatalari (Yandex yoki Google xaritadan). Bo'sh — «Xarita» tugmasi chiqmaydi">
        <div className="row">
          <label className="field grow">
            <span>Kenglik (lat)</span>
            <input
              inputMode="decimal"
              placeholder="41.311"
              value={lat}
              onChange={(e) => {
                touch();
                setLat(e.target.value);
              }}
            />
          </label>
          <label className="field grow">
            <span>Uzunlik (lng)</span>
            <input
              inputMode="decimal"
              placeholder="69.279"
              value={lng}
              onChange={(e) => {
                touch();
                setLng(e.target.value);
              }}
            />
          </label>
        </div>
      </Section>
    </Form>
  );
}
