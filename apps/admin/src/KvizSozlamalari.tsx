import type { ByudjetOraligi, KvizByudjetSozlamasi } from '@yh/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, ApiError, errorText } from './api';

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
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function load(d: KvizByudjetSozlamasi) {
    setData(d);
    setQolda(d.qolda !== null);
    setQatorlar((d.qolda ?? d.avtomatik).map(toQator));
  }

  useEffect(() => {
    adminApi<KvizByudjetSozlamasi>('GET', '/kviz/byudjet').then(load, (e) => setError(errorText(e)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      const body = { qolda: qolda ? qatorlar.map((q) => ({ dan: parse(q.dan), gacha: parse(q.gacha) })) : null };
      load(await adminApi<KvizByudjetSozlamasi>('PUT', '/kviz/byudjet', body));
      setError('');
      setSaved(true);
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setError((code && XATO[code]) ?? errorText(err));
    }
  }

  const edit = (i: number, patch: Partial<Qator>) =>
    setQatorlar((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <div className="stack wide">
      <header>
        <h2 className="title">«Xonadon tanlash» kvizi: byudjet oraliqlari</h2>
        <p className="muted small">«Byudjetingiz qancha?» savoliga javob variantlari</p>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <form className="card stack" onSubmit={save}>
          <label className="row">
            <input type="radio" checked={!qolda} onChange={() => setQolda(false)} />
            <span>
              Avtomatik — Boshlang'ich narxlarning minimumidan maksimumigacha 4 ta teng oraliq
              <br />
              <span className="muted small">
                {data.avtomatik.length ? data.avtomatik.map(label).join(' · ') : "Narxi bor planirovka yo'q"}
              </span>
            </span>
          </label>
          <label className="row">
            <input
              type="radio"
              checked={qolda}
              onChange={() => {
                setQolda(true);
                if (qatorlar.length < 2) setQatorlar(data.avtomatik.map(toQator));
              }}
            />
            <span>O'z oraliqlarim (mln so'm; bo'sh qoldirilgan chet — «… dan» yoki «… gacha»)</span>
          </label>
          {qolda && (
            <div className="stack">
              {qatorlar.map((q, i) => (
                <div className="row" key={i}>
                  <label className="field">
                    <span>dan</span>
                    <input inputMode="decimal" value={q.dan} onChange={(e) => edit(i, { dan: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>gacha</span>
                    <input inputMode="decimal" value={q.gacha} onChange={(e) => edit(i, { gacha: e.target.value })} />
                  </label>
                  <button
                    type="button"
                    className="link"
                    disabled={qatorlar.length <= 2}
                    onClick={() => setQatorlar((list) => list.filter((_, j) => j !== i))}
                  >
                    O'chirish
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="link"
                  disabled={qatorlar.length >= 6}
                  onClick={() => setQatorlar((list) => [...list, { dan: '', gacha: '' }])}
                >
                  + Oraliq qo'shish
                </button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="primary">Saqlash</button>
            {saved && <span className="muted small">Saqlandi. Kvizda bir daqiqa ichida ko'rinadi.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
