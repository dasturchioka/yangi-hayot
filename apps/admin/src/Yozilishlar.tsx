import type {
  AdminDto,
  AdminYozilishDto,
  AdminYozilishlarResponse,
  Davomat,
  YozilishSozlamalari,
} from '@yh/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DatePicker } from '@yh/ui/date';
import { adminApi, errorText } from './api';
import { SaveBar, useDirty, type SaveState } from './controls';
import { Icon } from './icons';
import { DarajaChip } from './Skoring';
import './yozilishlar.css';

/** Today in Tashkent, `YYYY-MM-DD` (the server counts days the same way). */
function bugun(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
}

function addDays(sana: string, n: number): string {
  const [y, m, d] = sana.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const HAFTA = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const HAFTA_QISQA = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function haftaKuni(sana: string): number {
  return ((new Date(`${sana}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** «24.11». */
const qisqa = (sana: string) => `${sana.slice(8, 10)}.${sana.slice(5, 7)}`;
/** «24.11.2026, seshanba». */
const toliq = (sana: string) =>
  `${sana.slice(8, 10)}.${sana.slice(5, 7)}.${sana.slice(0, 4)}, ${HAFTA[haftaKuni(sana) - 1]!.toLowerCase()}`;

function formatPhone(p: string | null): string {
  if (!p) return '—';
  const d = p.replace(/\D/g, '').slice(3);
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

type Davr = 'bugun' | 'ertaga' | 'hafta' | 'kun';

// ---------------------------------------------------------------- «Ko'rishga yozilishlar»

/** Both roles: who comes when, and «keldi / kelmadi» after the visit (UF-2; dojim #17 acts on «kelmadi»). */
export function YozilishlarScreen({ admin: _admin }: { admin: AdminDto }) {
  const today = bugun();
  const [davr, setDavr] = useState<Davr>('bugun');
  const [kun, setKun] = useState(addDays(today, -1));
  const [rows, setRows] = useState<AdminYozilishDto[] | null>(null);
  const [error, setError] = useState('');

  const [dan, gacha] =
    davr === 'bugun' ? [today, today] : davr === 'ertaga' ? [addDays(today, 1), addDays(today, 1)] : davr === 'hafta' ? [today, addDays(today, 6)] : [kun, kun];

  const load = useCallback(() => {
    setError('');
    adminApi<AdminYozilishlarResponse>('GET', `/yozilishlar?dan=${dan}&gacha=${gacha}`).then(
      (r) => setRows(r.yozilishlar),
      (e) => setError(errorText(e)),
    );
  }, [dan, gacha]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  function replace(y: AdminYozilishDto) {
    setRows((rs) => rs?.map((r) => (r.id === y.id ? y : r)) ?? null);
  }

  const faol = rows?.filter((r) => r.holat === 'faol').length ?? 0;
  const kunlar = rows ? [...new Set(rows.map((r) => r.sana))] : [];

  return (
    <div className="stack wide yozilishlar">
      <header className="yz-head">
        <div>
          <h1 className="h2">Ko'rishga yozilishlar</h1>
          <p className="muted">«Kelmadi» belgilansa, bot mijozga yangi vaqt taklif qiladi.</p>
        </div>
        <div className="yz-periods">
          <div className="tabs" role="tablist" aria-label="Davr">
            {(
              [
                ['bugun', `Bugun · ${qisqa(today)}`],
                ['ertaga', `Ertaga · ${qisqa(addDays(today, 1))}`],
                ['hafta', 'Hafta'],
                ['kun', 'Boshqa kun'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={davr === id}
                className={davr === id ? 'tab active' : 'tab'}
                onClick={() => setDavr(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {davr === 'kun' && (
            <DatePicker className="yz-date" value={kun} onChange={setKun} aria-label="Kun" />
          )}
        </div>
      </header>

      {error && (
        <p className="error">
          {error}{' '}
          <button className="link" onClick={load}>
            Qayta urinish
          </button>
        </p>
      )}

      {rows && rows.length === 0 && (
        <div className="card yz-empty">
          <p className="title">{davr === 'hafta' ? 'Bu hafta yozilishlar yo‘q' : `${toliq(dan)} — yozilishlar yo‘q`}</p>
          <p className="muted">Mijozlar Mini App’dagi «Ko‘rishga yozilish» orqali yoziladi; yangisi shu yerda va menejerlar guruhida chiqadi.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card yz-table-card">
          <table className="yz-table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Mijoz</th>
                <th>Loyiha</th>
                <th>Manba</th>
                <th>Holat</th>
              </tr>
            </thead>
            {kunlar.map((sana) => (
              <tbody key={sana}>
                {davr === 'hafta' && (
                  <tr className="yz-day-row">
                    <th colSpan={5}>
                      {sana === today ? 'Bugun' : sana === addDays(today, 1) ? 'Ertaga' : HAFTA[haftaKuni(sana) - 1]} ·{' '}
                      {qisqa(sana)}
                    </th>
                  </tr>
                )}
                {rows
                  .filter((r) => r.sana === sana)
                  .map((r) => (
                    <Row key={r.id} r={r} today={today} onChange={replace} />
                  ))}
              </tbody>
            ))}
          </table>
          <p className="muted small yz-foot">
            {faol} ta faol yozilish{rows.length > faol ? ` · ${rows.length - faol} ta bekor qilingan` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ r, today, onChange }: { r: AdminYozilishDto; today: string; onChange: (y: AdminYozilishDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function mark(davomat: Davomat | null) {
    setBusy(true);
    setError('');
    try {
      onChange((await adminApi<{ yozilish: AdminYozilishDto }>('PATCH', `/yozilishlar/${r.id}/davomat`, { davomat })).yozilish);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const bekor = r.holat === 'bekor';
  return (
    <tr className={bekor ? 'yz-row is-bekor' : 'yz-row'} data-davomat={r.davomat ?? undefined}>
      <td className="yz-time">{r.vaqt}</td>
      <td>
        <span className="yz-name">
          {r.mijoz.name}
          {r.daraja && <DarajaChip daraja={r.daraja} inline />}
        </span>
        <span className="yz-sub tabular">
          {formatPhone(r.mijoz.phone)}
          {r.mijoz.username ? ` · @${r.mijoz.username}` : ''}
        </span>
      </td>
      <td>
        <span className="yz-name">{r.loyiha.nomi}</span>
        {r.planirovka && <span className="yz-sub">{r.planirovka}</span>}
      </td>
      <td className="yz-manba">{r.manba}</td>
      <td className="yz-holat">
        {bekor ? (
          <span className="yz-badge yz-badge-bekor">Bekor qilingan</span>
        ) : r.davomat ? (
          <span className="yz-marked">
            <span className={`yz-badge yz-badge-${r.davomat}`}>{r.davomat === 'keldi' ? 'Keldi' : 'Kelmadi'}</span>
            <button
              className="yz-undo"
              onClick={() => mark(null)}
              disabled={busy}
              title={r.belgiladi ? `${r.belgiladi.nomi}, ${new Date(r.belgiladi.at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}` : undefined}
            >
              O‘zgartirish
            </button>
          </span>
        ) : r.sana > today ? (
          <span className="muted small">Kutilmoqda{r.kochirildi > 0 ? ' · ko‘chirilgan' : ''}</span>
        ) : (
          <span className="yz-mark">
            <button className="primary" onClick={() => mark('keldi')} disabled={busy}>
              Keldi
            </button>
            <button onClick={() => mark('kelmadi')} disabled={busy}>
              Kelmadi
            </button>
          </span>
        )}
        {error && <span className="yz-row-error">{error}</span>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- «Ko'rish kunlari va vaqtlari» (Matnlar va sozlamalar)

/** Administrator: showing weekdays, hourly slots, holidays, how far ahead (TZ 2-b.; default 14 days, 9:00–18:00). */
export function YozilishSozlamalariForm() {
  const [s, setS] = useState<YozilishSozlamalari | null>(null);
  const [yangiVaqt, setYangiVaqt] = useState('');
  const [yangiBayram, setYangiBayram] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const { dirty, rebase } = useDirty(s);

  useEffect(() => {
    adminApi<{ sozlamalar: YozilishSozlamalari }>('GET', '/yozilish-sozlamalari').then(
      (r) => setS(r.sozlamalar),
      (e) => setState({ kind: 'error', text: errorText(e) }),
    );
  }, []);

  if (!s) return state.kind === 'error' ? <p className="error">{state.text}</p> : null;

  const change = (next: Partial<YozilishSozlamalari>) => {
    setS({ ...s, ...next });
    setState((st) => (st.kind === 'saved' ? { kind: 'idle' } : st));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (s!.vaqtlar.length === 0) return setState({ kind: 'error', text: 'Kamida bitta vaqt qoldiring' });
    setState({ kind: 'saving' });
    try {
      setS((await adminApi<{ sozlamalar: YozilishSozlamalari }>('PUT', '/yozilish-sozlamalari', s)).sozlamalar);
      rebase();
      setState({ kind: 'saved' });
    } catch (err) {
      setState({ kind: 'error', text: errorText(err) });
    }
  }

  function addVaqt() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(yangiVaqt) || s!.vaqtlar.includes(yangiVaqt)) return;
    change({ vaqtlar: [...s!.vaqtlar, yangiVaqt].sort() });
    setYangiVaqt('');
  }

  function addBayram() {
    if (!yangiBayram || s!.bayramlar.includes(yangiBayram)) return;
    change({ bayramlar: [...s!.bayramlar, yangiBayram].sort() });
    setYangiBayram('');
  }

  const today = bugun();
  return (
    <form className="matn-form" onSubmit={submit}>
      <section className="card matn-section">
        <header>
          <h2 className="title">Ko'rish kunlari va vaqtlari</h2>
          <p className="muted small">
            Mijoz eng yaqin {s.kunlarSoni} kundan kun va vaqt tanlaydi. Bugungi o‘tgan vaqtlar o‘zi yashiriladi; bir vaqtga
            yozilishlar soni cheklanmaydi.
          </p>
        </header>
        <div className="yz-setting">
          <span className="field-label">Ko‘rsatuv kunlari</span>
          <div className="yz-weekdays" role="group" aria-label="Ko‘rsatuv kunlari">
            {HAFTA_QISQA.map((h, i) => {
              const n = i + 1;
              const on = s.haftaKunlari.includes(n);
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={on}
                  title={HAFTA[i]}
                  className="yz-weekday"
                  onClick={() =>
                    change({ haftaKunlari: on ? s.haftaKunlari.filter((x) => x !== n) : [...s.haftaKunlari, n].sort() })
                  }
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>
        <div className="yz-setting">
          <span className="field-label">Vaqtlar (soatbay)</span>
          <div className="yz-chips">
            {s.vaqtlar.map((v) => (
              <span key={v} className="yz-chip tabular">
                {v}
                <button type="button" aria-label={`${v} ni olib tashlash`} onClick={() => change({ vaqtlar: s.vaqtlar.filter((x) => x !== v) })}>
                  <Icon name="x" size={16} />
                </button>
              </span>
            ))}
            <span className="yz-add">
              <input type="time" step={1800} value={yangiVaqt} onChange={(e) => setYangiVaqt(e.target.value)} aria-label="Yangi vaqt" />
              <button type="button" onClick={addVaqt} disabled={!yangiVaqt}>
                <Icon name="plus" size={16} />
                vaqt
              </button>
            </span>
          </div>
        </div>
        <label className="field yz-days-field">
          <span>Necha kun oldinga yozilish mumkin</span>
          <input
            type="number"
            min={1}
            max={60}
            value={s.kunlarSoni}
            onChange={(e) => change({ kunlarSoni: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
          />
        </label>
      </section>

      <section className="card matn-section">
        <header>
          <h2 className="title">Bayramlar va ko‘rsatuv bo‘lmaydigan kunlar</h2>
          <p className="muted small">Bu kunlar Mini App kalendarida yopiq ko‘rinadi.</p>
        </header>
        <div className="yz-chips">
          {s.bayramlar.length === 0 && <span className="muted small">Hozircha yo‘q</span>}
          {s.bayramlar.map((b) => (
            <span key={b} className={b < today ? 'yz-chip is-past tabular' : 'yz-chip tabular'}>
              {toliq(b)}
              <button type="button" aria-label={`${b} ni olib tashlash`} onClick={() => change({ bayramlar: s.bayramlar.filter((x) => x !== b) })}>
                <Icon name="x" size={16} />
              </button>
            </span>
          ))}
          <span className="yz-add">
            <DatePicker min={today} value={yangiBayram || today} onChange={setYangiBayram} aria-label="Bayram kuni" />
            <button type="button" onClick={addBayram} disabled={!yangiBayram}>
              <Icon name="plus" size={16} />
              kun
            </button>
          </span>
        </div>
      </section>

      <SaveBar state={state} dirty={dirty} savedText="Saqlandi — Mini App kalendari yangilandi" />
    </form>
  );
}
