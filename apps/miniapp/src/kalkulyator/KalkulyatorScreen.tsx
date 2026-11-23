import {
  hisobla,
  ipotekaChegaralari,
  kalkulyatorXatolari,
  minBoshlangich,
  type IpotekaKirish,
  type KalkulyatorKirish,
  type KalkulyatorNatija,
  type KalkulyatorSozlamalari,
} from '@yh/shared';
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { formatLocal, Kontekst, localDigits, Sent } from '../ariza/ArizaScreen';
import { useLang, useT, type Translate } from '../i18n';
import { Loaded } from '../katalog/parts';
import { useLoad } from '../useLoad';
import './kalkulyator.css';

type Rejim = 'muddatli' | 'ipoteka';
type IpotekaSxema = IpotekaKirish['sxema'];
/** Boshlang'ich to'lov as the Mijoz set it: by the slider (percent) or typed (so'm). */
type Boshlangich = { by: 'foiz'; v: number } | { by: 'som'; v: number };

/** The slider's upper end: above this the hisob stops being a hisob. */
const MAX_FOIZ = 90;
/** Month chips offered up to the maximal muddat (the maximum itself is always offered). */
const OY_QADAMLARI = [3, 6, 9, 12, 18, 24, 36, 48, 60, 72, 84, 96, 120];
/** Record «hisobladi» once the Mijoz stops changing things for this long. */
const HISOB_DEBOUNCE_MS = 1500;

const som = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const somT = (t: Translate, n: number) => `${som(n)} ${t('kalk.som')}`;
const mln = (t: Translate, n: number) =>
  `${t('narx.mln', { n: new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1e6).replace('.', ',') })} ${t('kalk.som')}`;
/** Secondary figures: «786,7 mln so'm» (exact so'm below a million). The CRM note keeps exact numbers. */
const qisqa = (t: Translate, n: number) => (n >= 1e6 ? mln(t, n) : somT(t, n));
const foizText = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function oyVariantlari(max: number): number[] {
  const list = OY_QADAMLARI.filter((m) => m < max);
  return [...list.slice(-4), max];
}

/**
 * To'lov kalkulyatori (TZ 6-b.): muddatli to'lov and ipoteka (bank or own
 * stavka; annuitet / differensial). Computes live with the shared pure module
 * under the admin settings; the server recomputes on «Hisobni menejerga yuborish».
 */
export function KalkulyatorScreen({ planirovkaId, xonadonId }: { planirovkaId?: number; xonadonId?: number }) {
  const load = useLoad('kalkulyator', () => api.kalkulyator());
  return (
    <Loaded load={load}>
      {({ sozlama }) => <Kalkulyator sozlama={sozlama} planirovkaId={planirovkaId} xonadonId={xonadonId} />}
    </Loaded>
  );
}

function Kalkulyator({
  sozlama,
  planirovkaId,
  xonadonId,
}: {
  sozlama: KalkulyatorSozlamalari;
  planirovkaId?: number;
  /** From a Xonadon kartochkasi (#23): its own narx goes in instead of the Planirovka's Boshlang'ich narx. */
  xonadonId?: number;
}) {
  const t = useT();
  const lang = useLang();
  const [rejim, setRejim] = useState<Rejim>(sozlama.muddatli.yoqilgan ? 'muddatli' : 'ipoteka');
  const [narx, setNarx] = useState<number | null>(null);
  const [fromPlanirovka, setFromPlanirovka] = useState(false);
  const [fromXonadon, setFromXonadon] = useState<string | null>(null);
  const [boshlangich, setBoshlangich] = useState<Boshlangich | null>(null);
  const [oylar, setOylar] = useState(sozlama.muddatli.maxMuddatOy);
  const [bankId, setBankId] = useState<string | undefined>(sozlama.banklar[0]?.id);
  const [stavka, setStavka] = useState('');
  const [sxema, setSxema] = useState<IpotekaSxema>('annuitet');
  const [yillar, setYillar] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // From a Xonadon: its own narx goes in (the Mijoz may change it).
  useEffect(() => {
    if (!xonadonId) return;
    let live = true;
    api.xonadon(xonadonId, lang).then(
      ({ xonadon }) => {
        if (!live || xonadon.narx === null) return;
        setNarx((n) => n ?? xonadon.narx);
        setFromXonadon(`${xonadon.blokNomi}-${xonadon.raqam}`);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [xonadonId, lang]);

  // From a Planirovka: its Boshlang'ich narx goes in (the Mijoz may change it).
  useEffect(() => {
    if (!planirovkaId || xonadonId) return;
    let live = true;
    api.planirovka(planirovkaId, lang).then(
      ({ planirovka }) => {
        if (!live || planirovka.boshlangichNarx === null) return;
        setNarx((n) => n ?? planirovka.boshlangichNarx);
        setFromPlanirovka(true);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [planirovkaId, xonadonId, lang]);

  // Limits of the current mode.
  const ch =
    rejim === 'muddatli'
      ? { minFoiz: sozlama.muddatli.minBoshlangichFoiz, muddatlar: oyVariantlari(sozlama.muddatli.maxMuddatOy) }
      : (() => {
          const c = ipotekaChegaralari(sozlama, bankId) ?? ipotekaChegaralari(sozlama, undefined)!;
          return { minFoiz: c.minBoshlangichFoiz, muddatlar: c.muddatlarYil };
        })();
  const maxFoiz = Math.max(MAX_FOIZ, ch.minFoiz);
  const muddat = rejim === 'muddatli' ? oylar : (yillar !== null && ch.muddatlar.includes(yillar) ? yillar : ch.muddatlar.at(-1)!);

  // Boshlang'ich to'lov, kept inside the limits whatever the Mijoz did.
  const minSom = narx ? minBoshlangich(narx, ch.minFoiz) : 0;
  const maxSom = narx ? Math.floor((narx * maxFoiz) / 100) : 0;
  const rawSom = !narx ? 0 : !boshlangich ? minSom : boshlangich.by === 'som' ? boshlangich.v : Math.round((narx * boshlangich.v) / 100);
  const bSom = Math.min(Math.max(rawSom, minSom), maxSom);
  const bFoiz = narx ? (bSom / narx) * 100 : ch.minFoiz;

  const stavkaNum = Number(stavka.replace(',', '.'));
  const kirish: KalkulyatorKirish | null = !narx
    ? null
    : rejim === 'muddatli'
      ? { sxema: 'muddatli', narx, boshlangich: bSom, oylar: muddat }
      : { sxema, narx, boshlangich: bSom, yillar: muddat, ...(bankId ? { bankId } : { stavka: stavkaNum }) };
  const valid = kirish !== null && kalkulyatorXatolari(kirish, sozlama).length === 0;
  const natija = valid ? hisobla(kirish, sozlama) : null;

  // «Hisobladi» for dojim / Daraja: once the inputs settle, each distinct hisob once.
  const recorded = useRef('');
  const key = valid ? JSON.stringify(kirish) : '';
  useEffect(() => {
    if (!key || key === recorded.current) return;
    const timer = setTimeout(() => {
      recorded.current = key;
      api.kalkulyatorHisob({ kirish: JSON.parse(key) as KalkulyatorKirish, planirovkaId, xonadonId }).catch(() => {});
    }, HISOB_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, planirovkaId, xonadonId]);

  if (sending && kirish && natija) {
    return (
      <Yuborish
        kirish={kirish}
        natija={natija}
        planirovkaId={planirovkaId}
        xonadonId={xonadonId}
        onBack={() => setSending(false)}
      />
    );
  }

  const bank = rejim === 'ipoteka' && bankId ? sozlama.banklar.find((b) => b.id === bankId) : undefined;

  return (
    <div className="kalk">
      <header className="kalk-head">
        <h1 className="h1">{t('kalk.title')}</h1>
      </header>

      {(planirovkaId || xonadonId) && <Kontekst planirovkaId={planirovkaId} xonadonId={xonadonId} />}

      {sozlama.muddatli.yoqilgan && (
        <div className="segmented" role="tablist">
          {(['muddatli', 'ipoteka'] as const).map((r) => (
            <button key={r} role="tab" aria-selected={r === rejim} className={r === rejim ? 'active' : undefined} onClick={() => setRejim(r)}>
              {t(`kalk.${r}`)}
            </button>
          ))}
        </div>
      )}

      <NarxField
        narx={narx}
        hint={fromXonadon ? t('kalk.xonadonHint', { nomi: fromXonadon }) : fromPlanirovka ? t('kalk.narxHint') : null}
        onChange={(n) => {
          setNarx(n);
          setFromPlanirovka(false);
          setFromXonadon(null);
        }}
      />

      {rejim === 'ipoteka' && (
        <fieldset className="kalk-group kalk-enter">
          <legend className="kalk-label">{t('kalk.bank')}</legend>
          <div className="chips kalk-wrap">
            {sozlama.banklar.map((b) => (
              <button key={b.id} type="button" aria-pressed={b.id === bankId} className={b.id === bankId ? 'chip active' : 'chip'} onClick={() => setBankId(b.id)}>
                {b.nomi} · {foizText(b.stavka)}%
              </button>
            ))}
            <button type="button" aria-pressed={!bankId} className={!bankId ? 'chip active' : 'chip'} onClick={() => setBankId(undefined)}>
              {t('kalk.qolda')}
            </button>
          </div>
          {!bankId && (
            <label className="kalk-input kalk-input-sm kalk-enter">
              <span className="visually-hidden">{t('kalk.stavka')}</span>
              <input
                inputMode="decimal"
                autoFocus
                placeholder={t('kalk.stavka')}
                value={stavka}
                onChange={(e) => setStavka(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))}
                aria-invalid={stavka !== '' && !(stavkaNum > 0 && stavkaNum < 100)}
              />
              <span className="kalk-suffix">%</span>
            </label>
          )}
        </fieldset>
      )}

      <BoshlangichField
        narx={narx}
        som={bSom}
        foiz={bFoiz}
        minFoiz={ch.minFoiz}
        maxFoiz={maxFoiz}
        onFoiz={(v) => setBoshlangich({ by: 'foiz', v })}
        onSom={(v) => setBoshlangich({ by: 'som', v })}
      />

      <fieldset className="kalk-group">
        <legend className="kalk-label">{t('kalk.muddat')}</legend>
        <div className="kalk-chips">
          {ch.muddatlar.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === muddat}
              className={m === muddat ? 'kalk-chip active' : 'kalk-chip'}
              onClick={() => (rejim === 'muddatli' ? setOylar(m) : setYillar(m))}
            >
              {t(rejim === 'muddatli' ? 'kalk.oy' : 'kalk.yil', { n: m })}
            </button>
          ))}
        </div>
      </fieldset>

      {rejim === 'ipoteka' && (
        <fieldset className="kalk-group kalk-enter">
          <legend className="kalk-label">{t('kalk.sxema')}</legend>
          <div className="segmented segmented-sm">
            {(['annuitet', 'differensial'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={s === sxema} className={s === sxema ? 'active' : undefined} onClick={() => setSxema(s)}>
                {t(`kalk.sxema.${s}`)}
              </button>
            ))}
          </div>
          <p className="caption muted">{t(`kalk.sxemaHint.${sxema}`)}</p>
        </fieldset>
      )}

      <Natija natija={natija} empty={!narx ? t('kalk.enterNarx') : t('kalk.enterStavka')} />

      <p className="caption muted kalk-oferta">
        {bank ? `${t('kalk.basis.bank', { bank: bank.nomi })} ` : fromPlanirovka ? `${t('kalk.basis.narx')} ` : ''}
        {t('kalk.oferta')}
      </p>

      <div className="sticky-actions">
        <button className="button-primary" disabled={!natija} onClick={() => setSending(true)}>
          {t('kalk.send')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- fields

function NarxField({ narx, hint, onChange }: { narx: number | null; hint: string | null; onChange: (n: number | null) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="kalk-group">
      <label className="kalk-label" htmlFor={id}>
        {t('kalk.narx')}
      </label>
      <span className="kalk-input kalk-input-lg">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={narx ? som(narx) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
            onChange(digits ? Number(digits) : null);
          }}
        />
        <span className="kalk-suffix">{t('kalk.som')}</span>
      </span>
      {hint && <p className="caption muted">{hint}</p>}
    </div>
  );
}

function BoshlangichField(p: {
  narx: number | null;
  som: number;
  foiz: number;
  minFoiz: number;
  maxFoiz: number;
  onFoiz: (v: number) => void;
  onSom: (v: number) => void;
}) {
  const t = useT();
  const id = useId();
  // The typed sum is clamped only when the field is left, so typing is never fought.
  const [typed, setTyped] = useState<string | null>(null);
  const fill = ((p.foiz - p.minFoiz) / Math.max(1, p.maxFoiz - p.minFoiz)) * 100;
  return (
    <div className="kalk-group">
      <div className="row-between">
        <label className="kalk-label" htmlFor={id}>
          {t('kalk.boshlangich')}
        </label>
        <span className="kalk-value">
          {foizText(p.foiz)}% {p.narx ? `· ${mln(t, p.som)}` : ''}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="kalk-range"
        min={p.minFoiz}
        max={p.maxFoiz}
        step={1}
        value={Math.round(p.foiz)}
        disabled={!p.narx}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-valuetext={`${foizText(p.foiz)}%`}
        onChange={(e) => {
          setTyped(null);
          p.onFoiz(e.target.valueAsNumber);
        }}
      />
      <div className="row-between caption muted">
        <span>{t('kalk.min', { n: foizText(p.minFoiz) })}</span>
        <span>{t('kalk.max', { n: p.maxFoiz })}</span>
      </div>
      {p.narx !== null && (
        <label className="kalk-input kalk-input-sm">
          <span className="visually-hidden">{t('kalk.boshlangichSumma')}</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={typed ?? som(p.som)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
              setTyped(digits ? som(Number(digits)) : '');
              if (digits) p.onSom(Number(digits));
            }}
            onBlur={() => setTyped(null)}
          />
          <span className="kalk-suffix">{t('kalk.som')}</span>
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- result

function Natija({ natija, empty }: { natija: KalkulyatorNatija | null; empty: string }) {
  const t = useT();
  if (!natija) {
    return (
      <section className="kalk-natija kalk-natija-empty" aria-live="polite">
        <p className="kalk-natija-label">{t('kalk.oylik')}</p>
        <p className="kalk-natija-big">— {t('kalk.som')}</p>
        <p className="caption">{empty}</p>
      </section>
    );
  }
  const big = natija.sxema === 'differensial' ? natija.birinchi : natija.oylik;
  return (
    <section className="kalk-natija" aria-live="polite">
      <p className="kalk-natija-label">{t(natija.sxema === 'differensial' ? 'kalk.birinchi' : 'kalk.oylik')}</p>
      <p className="kalk-natija-big">{somT(t, big)}</p>
      {natija.sxema === 'differensial' && <p className="kalk-natija-sub">{t('kalk.oxirgi', { summa: somT(t, natija.oxirgi) })}</p>}
      <dl className="kalk-natija-grid">
        <div>
          <dt>{t(natija.sxema === 'muddatli' ? 'kalk.qoldiq' : 'kalk.kredit')}</dt>
          <dd>{qisqa(t, natija.kredit)}</dd>
        </div>
        <div>
          <dt>{t(natija.sxema === 'muddatli' ? 'kalk.ustama' : 'kalk.yillikStavka')}</dt>
          <dd>
            {natija.sxema === 'muddatli'
              ? natija.ustamaFoiz === 0
                ? t('kalk.ustamaYoq')
                : `${foizText(natija.ustamaFoiz)}%`
              : `${foizText(natija.stavka)}%`}
          </dd>
        </div>
        <div>
          <dt>{t('kalk.ortiqcha')}</dt>
          <dd>{qisqa(t, natija.ortiqcha)}</dd>
        </div>
        <div>
          <dt>{t('kalk.umumiy')}</dt>
          <dd>{qisqa(t, natija.umumiy)}</dd>
        </div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- «Hisobni menejerga yuborish»

type Sending = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; reason: 'limit' | 'other' | 'kirish' };

function Yuborish({
  kirish,
  natija,
  planirovkaId,
  xonadonId,
  onBack,
}: {
  kirish: KalkulyatorKirish;
  natija: KalkulyatorNatija;
  planirovkaId?: number;
  xonadonId?: number;
  onBack: () => void;
}) {
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

  const nameError = checked && name.trim() === '';
  const phoneError = checked && phone.length !== 9;
  const busy = state.kind === 'sending';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setChecked(true);
    if (name.trim() === '') return nameRef.current?.focus();
    if (phone.length !== 9) return phoneRef.current?.focus();
    setState({ kind: 'sending' });
    try {
      await api.kalkulyatorAriza({ name: name.trim(), phone: `+998${phone}`, kirish, planirovkaId, xonadonId });
      setState({ kind: 'sent' });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      // 400 with a complete phone = the hisob left the limits (an admin changed the settings meanwhile).
      setState({ kind: 'failed', reason: status === 400 ? 'kirish' : status === 429 ? 'limit' : 'other' });
    }
  }

  if (state.kind === 'sent') return <Sent text={t('kalk.sent.text')} />;

  const big = natija.sxema === 'differensial' ? natija.birinchi : natija.oylik;
  const muddat = kirish.sxema === 'muddatli' ? t('kalk.oy', { n: kirish.oylar }) : t('kalk.yil', { n: kirish.yillar });
  return (
    <form className="ariza-form kalk-yuborish kalk-enter" onSubmit={submit} noValidate>
      <h1 className="h1">{t('kalk.sendTitle')}</h1>
      <div className="kalk-xulosa">
        <span className="caption">
          {t(kirish.sxema === 'muddatli' ? 'kalk.muddatli' : 'kalk.ipoteka')} · {muddat} · {mln(t, kirish.narx)}
        </span>
        <span className="title">
          {t(natija.sxema === 'differensial' ? 'kalk.birinchi' : 'kalk.oylik')}: {somT(t, big)}
        </span>
        <button type="button" className="kalk-link" onClick={onBack}>
          {t('kalk.back')}
        </button>
      </div>
      <p className="muted">{t('kalk.sendHint')}</p>

      <div className="field">
        <label className="field-label" htmlFor="kalk-name">
          {t('ariza.name')}
        </label>
        <input
          id="kalk-name"
          ref={nameRef}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          enterKeyHint="next"
          aria-invalid={nameError}
          aria-describedby={nameError ? 'kalk-name-error' : undefined}
        />
        {nameError && (
          <p className="field-error" id="kalk-name-error">
            {t('ariza.error.name')}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="kalk-phone">
          {t('ariza.phone')}
        </label>
        <span className="input input-phone" data-invalid={phoneError || undefined}>
          <span className="input-prefix">+998</span>
          <input
            id="kalk-phone"
            ref={phoneRef}
            value={formatLocal(phone)}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="90 123 45 67"
            enterKeyHint="send"
            aria-invalid={phoneError}
            aria-describedby={phoneError ? 'kalk-phone-error' : undefined}
          />
        </span>
        {phoneError && (
          <p className="field-error" id="kalk-phone-error">
            {t('ariza.error.phone')}
          </p>
        )}
      </div>

      {state.kind === 'failed' && (
        <p className="note note-error" role="alert">
          {state.reason === 'kirish' ? t('kalk.error.kirish') : t(`ariza.error.${state.reason}`)}
        </p>
      )}

      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {busy ? t('ariza.sending') : t('kalk.send')}
        </button>
      </div>
    </form>
  );
}
