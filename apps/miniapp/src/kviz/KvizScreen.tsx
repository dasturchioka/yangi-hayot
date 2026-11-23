import {
  KVIZ_MUDDATLARI,
  KVIZ_TOLOV_USULLARI,
  KVIZ_TURLARI,
  SHAHARLAR,
  XONALAR_VARIANTLARI,
  type ByudjetOraligi,
  type KvizMuddati,
  type KvizTolovUsuli,
  type KvizTuri,
  type Shahar,
} from '@yh/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { formatLocal, localDigits } from '../ariza/ArizaScreen';
import { useT, type MessageKey } from '../i18n';
import { href, navigate, replaceRoute, type Route } from '../router';
import { formatOraliq } from '../tanlash/filtr';
import '../tanlash/tanlash.css';
import { CheckIcon, ChevronRightIcon } from '../icons';

/**
 * «Xonadon tanlash» kvizi (#10): the filters one question at a time, then the
 * contact. Each question is its own history entry, so Telegram Back = previous
 * question. Answers live here (module level) while the Mijoz goes back and
 * forth; finishing sends a bot_quiz Ariza and opens the matching Planirovkalar.
 */

const QADAMLAR = ['shahar', 'tur', 'xonalar', 'byudjet', 'muddat', 'tolov', 'kontakt'] as const;
type Qadam = (typeof QADAMLAR)[number];

interface Javoblar {
  shahar?: Shahar;
  tur?: KvizTuri;
  xonalar: number[];
  /** null = «Hali aniq emas». */
  byudjet?: ByudjetOraligi | null;
  muddat?: KvizMuddati;
  tolov?: KvizTolovUsuli;
  /** Set when leaving the xonalar step with «Davom etish». */
  xonalarTayyor?: boolean;
}

let javoblar: Javoblar = { xonalar: [] };
/** Kviz entries this page pushed onto history (to leave them all at the end). */
let pushed = 0;

function answered(q: Qadam): boolean {
  switch (q) {
    case 'shahar':
      return Boolean(javoblar.shahar);
    case 'tur':
      return Boolean(javoblar.tur);
    case 'xonalar':
      return Boolean(javoblar.xonalarTayyor && javoblar.xonalar.length);
    case 'byudjet':
      return javoblar.byudjet !== undefined;
    case 'muddat':
      return Boolean(javoblar.muddat);
    case 'tolov':
      return Boolean(javoblar.tolov);
    case 'kontakt':
      return false;
  }
}

/** Opens `route` in place of every kviz entry, so Back from it leaves the kviz. */
function leaveKviz(route: Route) {
  const steps = pushed;
  pushed = 0;
  if (steps === 0) return replaceRoute(route);
  window.addEventListener('popstate', () => replaceRoute(route), { once: true });
  window.history.go(-steps);
}

export function KvizScreen({ qadam }: { qadam: number }) {
  const t = useT();
  const [, rerender] = useState(0);
  const prev = useRef(qadam);
  const dir = qadam >= prev.current ? 'fwd' : 'back';
  useEffect(() => {
    prev.current = qadam;
  }, [qadam]);

  // Deep link or reload past an unanswered question → that question.
  const firstOpen = QADAMLAR.findIndex((q) => !answered(q)) + 1;
  const step = Math.min(qadam, firstOpen);
  useEffect(() => {
    if (step !== qadam) replaceRoute({ name: 'kviz', qadam: step });
  }, [step, qadam]);

  const q = QADAMLAR[step - 1]!;
  const advancing = useRef(false);
  useEffect(() => {
    advancing.current = false;
  }, [step]);

  function answer(patch: Partial<Javoblar>, next = true) {
    javoblar = { ...javoblar, ...patch };
    rerender((n) => n + 1);
    if (!next || advancing.current) return;
    advancing.current = true;
    // A beat to see the choice land, then the next question.
    window.setTimeout(() => {
      pushed += 1;
      navigate({ name: 'kviz', qadam: step + 1 });
    }, 200);
  }

  return (
    <div className="kviz">
      <div className="kviz-progress" aria-hidden>
        <span style={{ transform: `scaleX(${step / QADAMLAR.length})` }} />
      </div>
      <p className="caption muted">
        {q === 'kontakt' ? t('kviz.oxirgi') : t('kviz.qadam', { n: step, jami: QADAMLAR.length - 1 })}
      </p>

      <div className="kviz-step" key={step} data-dir={dir}>
        {q === 'shahar' && (
          <Savol title={t('kviz.shahar.title')}>
            <Variantlar
              items={SHAHARLAR.map((s) => ({ value: s, label: t(`shahar.${s}`) }))}
              value={javoblar.shahar}
              onPick={(shahar) =>
                // Another city's budget ranges differ: ask the budget again.
                answer(shahar === javoblar.shahar ? { shahar } : { shahar, byudjet: undefined })
              }
            />
          </Savol>
        )}
        {q === 'tur' && (
          <Savol title={t('kviz.tur.title')}>
            <Variantlar
              items={KVIZ_TURLARI.map((v) => ({ value: v, label: t(`kviz.tur.${v}` as MessageKey) }))}
              value={javoblar.tur}
              onPick={(tur) => answer({ tur })}
            />
          </Savol>
        )}
        {q === 'xonalar' && (
          <Savol title={t('kviz.xonalar.title')} hint={t('kviz.xonalar.hint')}>
            <div className="xona-grid xona-grid-lg">
              {XONALAR_VARIANTLARI.map((x) => {
                const on = javoblar.xonalar.includes(x);
                return (
                  <button
                    key={x}
                    className={on ? 'xona-toggle active' : 'xona-toggle'}
                    aria-pressed={on}
                    onClick={() =>
                      answer(
                        { xonalar: on ? javoblar.xonalar.filter((y) => y !== x) : [...javoblar.xonalar, x] },
                        false,
                      )
                    }
                  >
                    <b>{x >= 4 ? '4+' : x}</b>
                    <span className="caption">{t('kviz.xonalar.xona')}</span>
                  </button>
                );
              })}
            </div>
            <div className="sticky-actions">
              <button
                className="button-primary"
                disabled={javoblar.xonalar.length === 0}
                onClick={() => answer({ xonalarTayyor: true })}
              >
                {t('kviz.next')}
              </button>
            </div>
          </Savol>
        )}
        {q === 'byudjet' && <ByudjetSavoli shahar={javoblar.shahar} value={javoblar.byudjet} onPick={(byudjet) => answer({ byudjet })} />}
        {q === 'muddat' && (
          <Savol title={t('kviz.muddat.title')}>
            <Variantlar
              items={KVIZ_MUDDATLARI.map((v) => ({ value: v, label: t(`kviz.muddat.${v}` as MessageKey) }))}
              value={javoblar.muddat}
              onPick={(muddat) => answer({ muddat })}
            />
          </Savol>
        )}
        {q === 'tolov' && (
          <Savol title={t('kviz.tolov.title')}>
            <Variantlar
              items={KVIZ_TOLOV_USULLARI.map((v) => ({ value: v, label: t(`kviz.tolov.${v}` as MessageKey) }))}
              value={javoblar.tolov}
              onPick={(tolov) => answer({ tolov })}
            />
          </Savol>
        )}
        {q === 'kontakt' && <Kontakt />}
      </div>
    </div>
  );
}

/** Home screen entry: «Xonadon tanlash» kvizi. */
export function KvizKirish() {
  const t = useT();
  return (
    <a className="kviz-kirish" href={href({ name: 'kviz', qadam: 1 })}>
      <span className="kviz-kirish-text">
        <span className="title">{t('kviz.kirish.title')}</span>
        <span className="caption">{t('kviz.kirish.text', { n: QADAMLAR.length - 1 })}</span>
      </span>
      <span className="kviz-kirish-arrow" aria-hidden>
        <ChevronRightIcon size={18} strokeWidth={2.4} />
      </span>
    </a>
  );
}

function Savol({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <>
      <div className="kviz-savol">
        <h1 className="h1">{title}</h1>
        {hint && <p className="muted">{hint}</p>}
      </div>
      {children}
    </>
  );
}

function Variantlar<T extends string>({
  items,
  value,
  onPick,
}: {
  items: { value: T; label: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
}) {
  return (
    <div className="kviz-options" role="radiogroup">
      {items.map((i) => (
        <Variant key={i.value} label={i.label} on={i.value === value} onClick={() => onPick(i.value)} />
      ))}
    </div>
  );
}

function Variant({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button role="radio" aria-checked={on} className={on ? 'kviz-option active' : 'kviz-option'} onClick={onClick}>
      <span>{label}</span>
      <span className="kviz-check" aria-hidden>
        <CheckIcon size={14} />
      </span>
    </button>
  );
}

/** Budget ranges come from the katalog (or the Administrator), so they are loaded for the chosen city. */
function ByudjetSavoli({
  shahar,
  value,
  onPick,
}: {
  shahar: Shahar | undefined;
  value: ByudjetOraligi | null | undefined;
  onPick: (b: ByudjetOraligi | null) => void;
}) {
  const t = useT();
  const [ranges, setRanges] = useState<ByudjetOraligi[] | null>(null);
  useEffect(() => {
    let live = true;
    api.filtr(shahar).then(
      (r) => live && setRanges(r.byudjet),
      () => live && setRanges([]),
    );
    return () => {
      live = false;
    };
  }, [shahar]);

  const same = (a: ByudjetOraligi | null | undefined, b: ByudjetOraligi | null) =>
    a !== undefined && (a === null || b === null ? a === b : a.dan === b.dan && a.gacha === b.gacha);

  return (
    <Savol title={t('kviz.byudjet.title')}>
      {ranges === null ? (
        <div className="kviz-options" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="kviz-option kviz-option-skeleton" />
          ))}
        </div>
      ) : (
        <div className="kviz-options" role="radiogroup">
          {ranges.map((r) => (
            <Variant key={`${r.dan}-${r.gacha}`} label={formatOraliq(t, r)} on={same(value, r)} onClick={() => onPick(r)} />
          ))}
          <Variant label={t('kviz.byudjet.bilmayman')} on={value === null} onClick={() => onPick(null)} />
        </div>
      )}
    </Savol>
  );
}

type Sending = { kind: 'idle' } | { kind: 'sending' } | { kind: 'failed'; reason: 'limit' | 'other' };

/** Last step: name + phone (prefilled from earlier Arizalar), then the matching Planirovkalar. */
function Kontakt() {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState<Sending>({ kind: 'idle' });
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api.arizalar().then(
      ({ kontakt }) => {
        if (!live) return;
        setName((n) => n || kontakt.name);
        setPhone((p) => p || localDigits(kontakt.phone));
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const nameError = checked && name.trim().length === 0;
  const phoneError = checked && phone.length !== 9;
  const sending = state.kind === 'sending';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setChecked(true);
    if (name.trim().length === 0) return nameRef.current?.focus();
    if (phone.length !== 9) return phoneRef.current?.focus();
    const { shahar, tur, byudjet, muddat, tolov, xonalar } = javoblar;
    if (!shahar || !tur || byudjet === undefined || !muddat || !tolov || !xonalar.length) return;
    setState({ kind: 'sending' });
    try {
      const res = await api.kviz({ shahar, tur, xonalar, byudjet, muddat, tolov, name: name.trim(), phone: `+998${phone}` });
      javoblar = { xonalar: [] };
      leaveKviz({ name: 'tanlash', filtr: res.filtr, kviz: true });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setState({ kind: 'idle' });
        setPhone((p) => (p.length === 9 ? '' : p));
        phoneRef.current?.focus();
        return;
      }
      setState({ kind: 'failed', reason: status === 429 ? 'limit' : 'other' });
    }
  }

  return (
    <form className="ariza-form" onSubmit={submit} noValidate>
      <div className="kviz-savol">
        <h1 className="h1">{t('kviz.kontakt.title')}</h1>
        <p className="muted">{t('kviz.kontakt.hint')}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="kviz-name">
          {t('ariza.name')}
        </label>
        <input
          id="kviz-name"
          ref={nameRef}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          enterKeyHint="next"
          aria-invalid={nameError}
        />
        {nameError && <p className="field-error">{t('ariza.error.name')}</p>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="kviz-phone">
          {t('ariza.phone')}
        </label>
        <span className="input input-phone" data-invalid={phoneError || undefined}>
          <span className="input-prefix">+998</span>
          <input
            id="kviz-phone"
            ref={phoneRef}
            value={formatLocal(phone)}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="90 123 45 67"
            enterKeyHint="send"
            aria-invalid={phoneError}
          />
        </span>
        {phoneError && <p className="field-error">{t('ariza.error.phone')}</p>}
      </div>

      {state.kind === 'failed' && (
        <p className="note note-error" role="alert">
          {t(`ariza.error.${state.reason}`)}
        </p>
      )}

      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={sending} aria-busy={sending}>
          {sending && <span className="spinner" aria-hidden />}
          {sending ? t('ariza.sending') : t('kviz.kontakt.send')}
        </button>
      </div>
    </form>
  );
}
