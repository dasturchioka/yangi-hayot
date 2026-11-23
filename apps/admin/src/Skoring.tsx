import {
  KVIZ_MUDDATLARI,
  KVIZ_TOLOV_USULLARI,
  MUDDAT_NOMI,
  SKORING_NAMUNALARI,
  TOLOV_NOMI,
  darajaHisobla,
  type Daraja,
  type SkoringQoidalari,
  type SkoringResponse,
} from '@yh/shared';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { adminApi, errorText } from './api';
import { Form, Section } from './Matnlar';
import './skoring.css';

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; text: string };

const DARAJA_NOMI: Record<Daraja, string> = { issiq: 'Issiq', iliq: 'Iliq', sovuq: 'Sovuq' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** NaN (a half-typed field) counts as 0 in the preview; saving is blocked by `required`. */
const n = (v: number) => (Number.isFinite(v) ? v : 0);

/** Highest ball a Mijoz can reach under these rules (positive parts only): the right end of the scale. */
function maxBall(q: SkoringQoidalari): number {
  const pos = (v: number) => Math.max(0, n(v));
  return (
    pos(Math.max(...Object.values(q.muddat).map(n))) +
    pos(Math.max(...Object.values(q.tolov).map(n))) +
    pos(q.byudjet) +
    pos(q.kalkulyator.hisobladi) +
    pos(q.kalkulyator.yubordi) +
    pos(q.yozilish) +
    pos(q.qaytish.har) * pos(q.qaytish.max)
  );
}

/**
 * «Matnlar va sozlamalar» → «Ball qoidalari» (UF-4, #18): how many ball each
 * kviz / kalkulyator answer and action gives, and where iliq and issiq start.
 * The five test anketalar on the right are rescored as the rules change.
 */
export function SkoringForm() {
  const [q, setQ] = useState<SkoringQoidalari | null>(null);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  useEffect(() => {
    adminApi<SkoringResponse>('GET', '/skoring').then(
      (r) => setQ(r.qoidalar),
      (e) => setState({ kind: 'error', text: errorText(e) }),
    );
  }, []);

  const namunalar = useMemo(
    () =>
      q
        ? SKORING_NAMUNALARI.map((a) => ({
            ...a,
            natija: darajaHisobla(
              { ...q, chegara: { iliq: n(q.chegara.iliq), issiq: n(q.chegara.issiq) } },
              a.signallar,
            ),
          }))
        : [],
    [q],
  );

  if (!q) return state.kind === 'error' ? <p className="error">{state.text}</p> : null;

  const edit = (next: SkoringQoidalari) => {
    setState((s) => (s.kind === 'saved' || s.kind === 'error' ? { kind: 'idle' } : s));
    setQ(next);
  };

  async function submit() {
    if (!q) return;
    if (!(q.chegara.iliq < q.chegara.issiq)) {
      setState({ kind: 'error', text: '«Iliq» chegarasi «Issiq»dan kichik bo‘lishi kerak' });
      return;
    }
    setState({ kind: 'saving' });
    try {
      const r = await adminApi<SkoringResponse>('PUT', '/skoring', q);
      setQ(r.qoidalar);
      setState({ kind: 'saved' });
    } catch (e) {
      setState({ kind: 'error', text: `${errorText(e)}. Ball −100 dan 100 gacha butun son bo‘lishi kerak.` });
    }
  }

  const max = Math.max(maxBall(q), n(q.chegara.issiq) + 10);
  const chegaraXato = !(n(q.chegara.iliq) < n(q.chegara.issiq));

  return (
    <div className="skoring">
      <Form state={state} onSubmit={submit} savedText="Saqlandi — keyingi ariza yoki harakatdan qo‘llanadi">
        <Section
          title="Kviz javoblari"
          hint="Mijozning oxirgi kvizi. Kviz to‘ldirilmagan bo‘lsa, to‘lov usuli va byudjet kalkulyatordagi hisobdan olinadi."
        >
          <div className="ball-cols">
          <fieldset className="ball-group">
            <legend>Xarid muddati</legend>
            {KVIZ_MUDDATLARI.map((k) => (
              <BallRow
                key={k}
                label={cap(MUDDAT_NOMI[k])}
                value={q.muddat[k]}
                onChange={(v) => edit({ ...q, muddat: { ...q.muddat, [k]: v } })}
              />
            ))}
          </fieldset>
          <fieldset className="ball-group">
            <legend>To‘lov usuli</legend>
            {KVIZ_TOLOV_USULLARI.map((k) => (
              <BallRow
                key={k}
                label={cap(TOLOV_NOMI[k])}
                value={q.tolov[k]}
                onChange={(v) => edit({ ...q, tolov: { ...q.tolov, [k]: v } })}
              />
            ))}
          </fieldset>
          <fieldset className="ball-group">
            <legend>Byudjet</legend>
            <BallRow label="Byudjet ko‘rsatilgan" value={q.byudjet} onChange={(v) => edit({ ...q, byudjet: v })} />
          </fieldset>
          </div>
        </Section>

        <Section title="Xatti-harakat" hint="Har biri bir marta hisoblanadi; qayta kirishlar — kunlar soni bo‘yicha.">
          <div className="ball-cols">
          <fieldset className="ball-group">
            <legend>Kalkulyator</legend>
            <BallRow
              label="Natijani ko‘rdi"
              value={q.kalkulyator.hisobladi}
              onChange={(v) => edit({ ...q, kalkulyator: { ...q.kalkulyator, hisobladi: v } })}
            />
            <BallRow
              label="Hisobni menejerga yubordi"
              value={q.kalkulyator.yubordi}
              onChange={(v) => edit({ ...q, kalkulyator: { ...q.kalkulyator, yubordi: v } })}
            />
          </fieldset>
          <fieldset className="ball-group">
            <legend>Ko‘rish va qaytish</legend>
            <BallRow label="Ko‘rishga yozildi" value={q.yozilish} onChange={(v) => edit({ ...q, yozilish: v })} />
            <BallRow
              label="Har bir qayta kirgan kuni"
              hint="Botga yoki Mini App’ga boshqa kuni qaytsa"
              value={q.qaytish.har}
              onChange={(v) => edit({ ...q, qaytish: { ...q.qaytish, har: v } })}
            />
            <BallRow
              label="Ko‘pi bilan necha kun hisoblanadi"
              unit="kun"
              min={0}
              max={30}
              value={q.qaytish.max}
              onChange={(v) => edit({ ...q, qaytish: { ...q.qaytish, max: v } })}
            />
          </fieldset>
          </div>
        </Section>

        <Section
          title="Daraja chegaralari"
          hint="Ball shu qiymatga yetganda Mijoz iliq yoki issiq bo‘ladi. Daraja amoCRM’dagi ochiq Bitimga teg bo‘lib yoziladi."
        >
          <div className="chegara-fields">
            <label className="field">
              <span>
                <i className="daraja-dot iliq" aria-hidden /> Iliq, ball dan
              </span>
              <input
                required
                type="number"
                className="tabular"
                min={1}
                max={500}
                step={1}
                aria-invalid={chegaraXato}
                value={Number.isFinite(q.chegara.iliq) ? q.chegara.iliq : ''}
                onChange={(e) => edit({ ...q, chegara: { ...q.chegara, iliq: e.target.valueAsNumber } })}
              />
            </label>
            <label className="field">
              <span>
                <i className="daraja-dot issiq" aria-hidden /> Issiq, ball dan
              </span>
              <input
                required
                type="number"
                className="tabular"
                min={1}
                max={500}
                step={1}
                aria-invalid={chegaraXato}
                value={Number.isFinite(q.chegara.issiq) ? q.chegara.issiq : ''}
                onChange={(e) => edit({ ...q, chegara: { ...q.chegara, issiq: e.target.valueAsNumber } })}
              />
            </label>
            <label className="field">
              <span>Issiq Mijozga qo‘ng‘iroq, daqiqa</span>
              <input
                required
                type="number"
                className="tabular"
                min={1}
                max={240}
                step={1}
                value={Number.isFinite(q.issiqVazifaDaqiqa) ? q.issiqVazifaDaqiqa : ''}
                onChange={(e) => edit({ ...q, issiqVazifaDaqiqa: e.target.valueAsNumber })}
              />
            </label>
          </div>
          <p className="muted small">
            Issiq bo‘lganda: amoCRM’da shu muddatli «Qo‘ng‘iroq qilish» vazifasi (ish vaqti hisobida) va menejerlar
            guruhida «🔥 Issiq Mijoz» xabari.
          </p>
        </Section>
      </Form>

      <aside className="card namunalar" aria-labelledby="namunalar-h">
        <header>
          <h2 id="namunalar-h" className="title">
            Test anketalari
          </h2>
          <p className="muted small">Qoidani o‘zgartirsangiz, darhol qayta hisoblanadi. Kutilgan darajani sotuv bo‘limi rahbari bilan solishtiring.</p>
        </header>
        <Shkala q={q} max={max} nuqtalar={namunalar.map((a) => a.natija.ball)} />
        <ol className="namuna-list">
          {namunalar.map((a, i) => (
            <li key={a.nomi} className="namuna">
              <span className="namuna-n tabular">{i + 1}</span>
              <span className="namuna-nomi">{a.nomi}</span>
              <span className="namuna-ball tabular">{a.natija.ball}</span>
              <DarajaChip daraja={a.natija.daraja} />
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function DarajaChip({ daraja }: { daraja: Daraja }) {
  return <span className={`daraja-chip ${daraja}`}>{DARAJA_NOMI[daraja]}</span>;
}

/** 0 … max with the three Daraja zones and the test anketalar as numbered marks. */
function Shkala({ q, max, nuqtalar }: { q: SkoringQoidalari; max: number; nuqtalar: number[] }) {
  const frac = (v: number) => Math.min(Math.max(n(v), 0), max) / max;
  const at = (v: number) => `${frac(v) * 100}%`;
  // Anketalar with (nearly) the same ball stack upwards instead of covering each other.
  const rows: number[] = [];
  nuqtalar.forEach((b, i) => {
    let row = 0;
    while (nuqtalar.slice(0, i).some((p, j) => rows[j] === row && Math.abs(frac(p) - frac(b)) < 0.04)) row++;
    rows.push(row);
  });
  const rowCount = Math.max(1, ...rows.map((r) => r + 1));
  const tartibli = n(q.chegara.iliq) <= n(q.chegara.issiq);
  const yaqin = Math.abs(frac(q.chegara.issiq) - frac(q.chegara.iliq)) < 0.1;
  return (
    <div
      className="shkala"
      role="img"
      aria-label={`Sovuq 0–${n(q.chegara.iliq) - 1}, iliq ${n(q.chegara.iliq)}–${n(q.chegara.issiq) - 1}, issiq ${n(q.chegara.issiq)} va undan yuqori`}
    >
      <div className="shkala-marks" style={{ '--rows': rowCount } as CSSProperties}>
        {nuqtalar.map((b, i) => (
          <span
            key={i}
            className="shkala-mark-track"
            style={{ '--x': at(b), '--row': rowCount - 1 - rows[i]! } as CSSProperties}
          >
            <span className="shkala-mark tabular" title={`${i + 1}-anketa: ${b} ball`}>
              {i + 1}
            </span>
          </span>
        ))}
      </div>
      <div className="shkala-bar">
        <span className="zona sovuq" style={{ left: 0, right: `calc(100% - ${at(q.chegara.iliq)})` }} />
        <span className="zona iliq" style={{ left: at(q.chegara.iliq), right: `calc(100% - ${at(q.chegara.issiq)})` }} />
        <span className="zona issiq" style={{ left: at(q.chegara.issiq), right: 0 }} />
      </div>
      <div className="shkala-axis tabular">
        <span>0</span>
        {/* Close thresholds: labels step aside from each other instead of overlapping. */}
        <span className={yaqin ? (tartibli ? 'before' : 'after') : undefined} style={{ left: at(q.chegara.iliq) }}>
          {n(q.chegara.iliq)}
        </span>
        <span className={yaqin ? (tartibli ? 'after' : 'before') : undefined} style={{ left: at(q.chegara.issiq) }}>
          {n(q.chegara.issiq)}
        </span>
        <span className="end">{max}</span>
      </div>
    </div>
  );
}

function BallRow({
  label,
  hint,
  value,
  onChange,
  unit = 'ball',
  min = -100,
  max = 100,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="ball-row">
      <span className="ball-label">
        {label}
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <span className="ball-input">
        <input
          required
          type="number"
          className="tabular"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        <span className="ball-unit">{unit}</span>
      </span>
    </label>
  );
}
