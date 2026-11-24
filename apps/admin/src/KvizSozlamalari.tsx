import type { ByudjetOraligi, KvizByudjetSozlamasi } from '@yh/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, ApiError, errorText } from './api';
import { Choice, SaveBar, useDirty, type SaveState } from './controls';
import { Icon, XIcon } from './icons';
import './matnlar.css';

const MLN = 1_000_000;

/** One editable row: millions as typed; '' = open end. */
interface Qator {
  dan: string;
  gacha: string;
}

const XATO: Record<string, string> = {
  count: "Oraliqlar soni 2 tadan 6 tagacha bo'lishi kerak",
  open_dan: "Faqat birinchi oraliqning «dan» qiymati bo'sh bo'lishi mumkin",
  open_gacha: "Faqat oxirgi oraliqning «gacha» qiymati bo'sh bo'lishi mumkin",
  order: "Har bir oraliqda «dan» «gacha»dan kichik bo'lishi kerak",
  overlap: "Oraliqlar o'sib borishi va bir-birini qoplamasligi kerak",
};

const mlnText = (n: number | null) => (n === null ? '' : String(n / MLN).replace('.', ','));
const label = (r: ByudjetOraligi) =>
  r.dan !== null && r.gacha !== null
    ? `${mlnText(r.dan)}–${mlnText(r.gacha)} mln so'm`
    : r.dan !== null
      ? `${mlnText(r.dan)} mln so'mdan`
      : `${mlnText(r.gacha)} mln so'mgacha`;

function toQator(r: ByudjetOraligi): Qator {
  return { dan: mlnText(r.dan), gacha: mlnText(r.gacha) };
}

function parse(s: string): number | null {
  const n = Number(s.replace(',', '.').replace(/\s/g, ''));
  return s.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * MLN);
}

/**
 * «Matnlar va sozlamalar» → «Xonadon tanlash» kvizi: budget answers (#10).
 * Automatic = 4 equal ranges between the cheapest and dearest Boshlang'ich
 * narx; the Administrator may set their own instead.
 */
export function KvizSozlamalariScreen() {
  const [data, setData] = useState<KvizByudjetSozlamasi | null>(null);
  const [qolda, setQolda] = useState(false);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [loadError, setLoadError] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const { dirty, rebase } = useDirty(data ? { qolda, qatorlar } : null);

  function load(d: KvizByudjetSozlamasi) {
    setData(d);
    setQolda(d.qolda !== null);
    setQatorlar((d.qolda ?? d.avtomatik).map(toQator));
  }

  useEffect(() => {
    adminApi<KvizByudjetSozlamasi>('GET', '/kviz/byudjet').then(load, (e) => setLoadError(errorText(e)));
  }, []);

  const touch = () => setState((s) => (s.kind === 'saved' || s.kind === 'error' ? { kind: 'idle' } : s));

  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'saving' });
    try {
      const body = { qolda: qolda ? qatorlar.map((q) => ({ dan: parse(q.dan), gacha: parse(q.gacha) })) : null };
      load(await adminApi<KvizByudjetSozlamasi>('PUT', '/kviz/byudjet', body));
      rebase();
      setState({ kind: 'saved' });
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setState({ kind: 'error', text: (code && XATO[code]) ?? errorText(err) });
    }
  }

  const edit = (i: number, patch: Partial<Qator>) => {
    touch();
    setQatorlar((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };

  if (!data) return loadError ? <p className="error kviz-sozlama">{loadError}</p> : null;
  return (
    <form className="matn-form kviz-sozlama" onSubmit={save}>
      <section className="card matn-section" aria-labelledby="kviz-byudjet-title">
        <header>
          <h2 className="title" id="kviz-byudjet-title">
            «Xonadon tanlash» kvizi: byudjet oraliqlari
          </h2>
          <p className="muted small">«Byudjetingiz qancha?» savoliga javob variantlari</p>
        </header>
        <div className="choice-group" role="radiogroup" aria-labelledby="kviz-byudjet-title">
          <Choice
            name="kviz-byudjet"
            checked={!qolda}
            onChange={() => {
              touch();
              setQolda(false);
            }}
            hint={data.avtomatik.length ? data.avtomatik.map(label).join(' · ') : "Narxi bor planirovka yo'q"}
          >
            Avtomatik — Boshlang'ich narxlarning minimumidan maksimumigacha 4 ta teng oraliq
          </Choice>
          <Choice
            name="kviz-byudjet"
            checked={qolda}
            onChange={() => {
              touch();
              setQolda(true);
              if (qatorlar.length < 2) setQatorlar(data.avtomatik.map(toQator));
            }}
            hint="mln so'm; bo'sh qoldirilgan chet — «… dan» yoki «… gacha»"
          >
            O'z oraliqlarim
          </Choice>
        </div>
        {qolda && (
          <div className="kviz-ranges">
            {qatorlar.map((q, i) => (
              <div className="kviz-range" key={i}>
                <span className="list-n" aria-hidden>
                  {i + 1}
                </span>
                <label className="field">
                  <span>dan</span>
                  <input className="tabular" inputMode="decimal" value={q.dan} onChange={(e) => edit(i, { dan: e.target.value })} />
                </label>
                <label className="field">
                  <span>gacha</span>
                  <input className="tabular" inputMode="decimal" value={q.gacha} onChange={(e) => edit(i, { gacha: e.target.value })} />
                </label>
                <button
                  type="button"
                  className="icon danger"
                  aria-label="O'chirish"
                  title="O'chirish"
                  disabled={qatorlar.length <= 2}
                  onClick={() => {
                    touch();
                    setQatorlar((list) => list.filter((_, j) => j !== i));
                  }}
                >
                  <XIcon />
                </button>
              </div>
            ))}
            <div className="row tight">
              <button
                type="button"
                className="with-icon"
                disabled={qatorlar.length >= 6}
                onClick={() => {
                  touch();
                  setQatorlar((list) => [...list, { dan: '', gacha: '' }]);
                }}
              >
                <Icon name="plus" size={16} />
                Oraliq qo'shish
              </button>
              <span className="muted small tabular">{qatorlar.length} / 6</span>
            </div>
          </div>
        )}
      </section>
      <SaveBar state={state} dirty={dirty} savedText="Saqlandi. Kvizda bir daqiqa ichida ko'rinadi." />
    </form>
  );
}
