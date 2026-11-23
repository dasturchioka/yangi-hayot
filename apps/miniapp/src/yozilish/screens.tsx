import type { ArizaDto, LoyihaCardDto, YozilishDto, YozilishKunDto } from '@yh/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { formatLocal, Kontekst, localDigits } from '../ariza/ArizaScreen';
import { useLang, useT, type MessageKey } from '../i18n';
import { formatMaydon, joyNomi } from '../katalog/format';
import { Loaded, PlanIcon } from '../katalog/parts';
import { PinIcon } from '../kontent/icons';
import { href, replaceRoute } from '../router';
import { confirmDialog, hapticNotify, hapticSelect, openExternal } from '../telegram';
import { useLoad } from '../useLoad';
import { haftaNomi, haftaQisqa, kunRaqami, sanaQisqa, sanaToliq, xaritaUrl } from './format';
import { CalendarIcon, CheckIcon, HomeIcon } from './icons';
import './yozilish.css';
import { CheckIcon as CheckMark } from '../icons';

type Sending = { kind: 'idle' } | { kind: 'sending' } | { kind: 'failed'; reason: 'slot' | 'limit' | 'other' };

// ---------------------------------------------------------------- slot picker

/** Kun (a strip of the nearest days) and Vaqt (free hours of the chosen day). Closed days stay visible but off. */
function SlotPicker({
  kunlar,
  sana,
  vaqt,
  onChange,
  hozirgi,
}: {
  kunlar: YozilishKunDto[];
  sana: string | null;
  vaqt: string | null;
  onChange: (sana: string, vaqt: string | null) => void;
  /** While moving: the booking's current slot, marked so the Mijoz sees where it is now. */
  hozirgi?: { sana: string; vaqt: string };
}) {
  const t = useT();
  const lang = useLang();
  const kun = kunlar.find((k) => k.sana === sana) ?? null;

  if (!kunlar.some((k) => k.vaqtlar.length > 0)) return <p className="note note-muted">{t('yozilish.noKun')}</p>;

  return (
    <>
      <section className="yz-section" aria-labelledby="yz-kun">
        <h2 className="h3" id="yz-kun">
          {t('yozilish.kun')}
        </h2>
        <div className="yz-days" role="radiogroup" aria-labelledby="yz-kun">
          {kunlar.map((k) => {
            const off = k.vaqtlar.length === 0;
            const on = k.sana === sana;
            return (
              <button
                key={k.sana}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={sanaToliq(lang, k.sana, k.haftaKuni)}
                className="yz-day"
                disabled={off}
                onClick={() => {
                  if (on) return;
                  hapticSelect();
                  onChange(k.sana, vaqt && k.vaqtlar.includes(vaqt) ? vaqt : null);
                }}
              >
                <span className="yz-day-week">{haftaQisqa(lang, k.haftaKuni)}</span>
                <span className="yz-day-num">{kunRaqami(k.sana)}</span>
              </button>
            );
          })}
        </div>
        {kun && <p className="caption muted yz-day-caption">{sanaToliq(lang, kun.sana, kun.haftaKuni)}</p>}
      </section>

      <section className="yz-section" aria-labelledby="yz-vaqt">
        <h2 className="h3" id="yz-vaqt">
          {t('yozilish.vaqt')}
        </h2>
        {kun ? (
          <div className="yz-times" role="radiogroup" aria-labelledby="yz-vaqt">
            {kun.vaqtlar.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={v === vaqt}
                data-current={(hozirgi && hozirgi.sana === kun.sana && hozirgi.vaqt === v) || undefined}
                className="yz-time"
                onClick={() => {
                  if (v === vaqt) return;
                  hapticSelect();
                  onChange(kun.sana, v);
                }}
              >
                {v}
              </button>
            ))}
          </div>
        ) : (
          <p className="caption muted">{t('yozilish.pickKun')}</p>
        )}
      </section>
    </>
  );
}

/** First day that still has time (today if possible). */
const firstOpen = (kunlar: YozilishKunDto[]) => kunlar.find((k) => k.vaqtlar.length > 0)?.sana ?? null;

function useSlotlar() {
  const [attempt, setAttempt] = useState(0);
  const load = useLoad(`yozilish-slotlar:${attempt}`, () => api.yozilishSlotlar());
  return { load, reload: () => setAttempt((a) => a + 1) };
}

// ---------------------------------------------------------------- «Ko'rishga yozilish»

/** Loyiha → kun → vaqt → ism, telefon → confirmation. */
export function YozilishScreen({
  loyihaId: given,
  planirovkaId,
  xonadonId,
}: {
  loyihaId?: number;
  planirovkaId?: number;
  /** From a Xonadon kartochkasi (#25): the booking is about that Xonadon. */
  xonadonId?: number;
}) {
  const t = useT();
  const lang = useLang();
  const { load, reload } = useSlotlar();
  const [loyihaId, setLoyihaId] = useState<number | null>(given ?? null);
  const [sana, setSana] = useState<string | null>(null);
  const [vaqt, setVaqt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [checked, setChecked] = useState({ name: false, phone: false });
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

  // Preselect the first open day once the calendar is there.
  useEffect(() => {
    if (load.kind === 'ready' && sana === null) setSana(firstOpen(load.data.kunlar));
  }, [load, sana]);

  const nameError = checked.name && name.trim().length === 0;
  const phoneError = checked.phone && phone.length !== 9;
  const sending = state.kind === 'sending';
  const ready = loyihaId !== null && sana !== null && vaqt !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending || !ready) return;
    setChecked({ name: true, phone: true });
    if (name.trim().length === 0) return nameRef.current?.focus();
    if (phone.length !== 9) return phoneRef.current?.focus();
    setState({ kind: 'sending' });
    try {
      const { yozilish } = await api.yozil(
        { loyihaId, planirovkaId, xonadonId, sana, vaqt, name: name.trim(), phone: `+998${phone}` },
        lang,
      );
      hapticNotify('success');
      replaceRoute({ name: 'yozilishKorish', id: yozilish.id, yangi: 'yozildi' });
    } catch (err) {
      hapticNotify('error');
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setState({ kind: 'idle' });
        setPhone((p) => (p.length === 9 ? '' : p));
        phoneRef.current?.focus();
        return;
      }
      if (status === 409) {
        setVaqt(null);
        reload();
      }
      setState({ kind: 'failed', reason: status === 409 ? 'slot' : status === 429 ? 'limit' : 'other' });
    }
  }

  return (
    <form className="yz-form" onSubmit={submit} noValidate>
      <h1 className="h1">{t('yozilish.title')}</h1>
      {given ? <Kontekst loyihaId={given} planirovkaId={planirovkaId} xonadonId={xonadonId} /> : <LoyihaPicker value={loyihaId} onChange={setLoyihaId} />}

      <Loaded load={load}>
        {({ kunlar }) => (
          <SlotPicker
            kunlar={kunlar}
            sana={sana}
            vaqt={vaqt}
            onChange={(s, v) => {
              setSana(s);
              setVaqt(v);
              if (state.kind === 'failed') setState({ kind: 'idle' });
            }}
          />
        )}
      </Loaded>

      <section className="yz-section" aria-labelledby="yz-aloqa">
        <h2 className="h3" id="yz-aloqa">
          {t('yozilish.aloqa')}
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="yz-name">
            {t('ariza.name')}
          </label>
          <input
            id="yz-name"
            ref={nameRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            enterKeyHint="next"
            aria-invalid={nameError}
            aria-describedby={nameError ? 'yz-name-error' : undefined}
          />
          {nameError && (
            <p className="field-error" id="yz-name-error">
              {t('ariza.error.name')}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="yz-phone">
            {t('ariza.phone')}
          </label>
          <span className="input input-phone" data-invalid={phoneError || undefined}>
            <span className="input-prefix">+998</span>
            <input
              id="yz-phone"
              ref={phoneRef}
              value={formatLocal(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
              onBlur={() => phone.length > 0 && setChecked((c) => ({ ...c, phone: true }))}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="90 123 45 67"
              enterKeyHint="done"
              aria-invalid={phoneError}
              aria-describedby={phoneError ? 'yz-phone-error' : undefined}
            />
          </span>
          {phoneError && (
            <p className="field-error" id="yz-phone-error">
              {t('ariza.error.phone')}
            </p>
          )}
        </div>
      </section>

      {state.kind === 'failed' && (
        <p className="note note-error" role="alert">
          {t(state.reason === 'slot' ? 'yozilish.error.slot' : `ariza.error.${state.reason}`)}
        </p>
      )}

      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={!ready || sending} aria-busy={sending}>
          {sending && <span className="spinner" aria-hidden />}
          {sending
            ? t('yozilish.sending')
            : ready
              ? t('yozilish.submit', { sana: sanaQisqa(lang, sana), vaqt })
              : t(loyihaId === null ? 'yozilish.pickLoyiha' : 'yozilish.pick')}
        </button>
      </div>
    </form>
  );
}

/** Step «Loyiha» when booking starts from the menu or the bot: Sotuvdagi Loyihalar as a radio list. */
function LoyihaPicker({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`loyihalar:${lang}`, () => api.loyihalar(lang));
  return (
    <section className="yz-section" aria-labelledby="yz-loyiha">
      <h2 className="h3" id="yz-loyiha">
        {t('yozilish.loyiha')}
      </h2>
      <Loaded load={load}>
        {({ loyihalar }) => (
          <div className="yz-loyihalar" role="radiogroup" aria-labelledby="yz-loyiha">
            {loyihalar.map((l: LoyihaCardDto) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={l.id === value}
                className="yz-loyiha"
                onClick={() => {
                  if (l.id === value) return;
                  hapticSelect();
                  onChange(l.id);
                }}
              >
                <span className="ariza-kontekst-thumb">{l.foto ? <img src={l.foto} alt="" loading="lazy" /> : <PlanIcon />}</span>
                <span className="ariza-kontekst-text">
                  <span className="title">{l.nomi}</span>
                  <span className="caption">
                    {joyNomi(t(`shahar.${l.shahar}`), l.manzil)}
                  </span>
                </span>
                <span className="yz-loyiha-check" aria-hidden>
                  <CheckIcon size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </Loaded>
    </section>
  );
}

// ---------------------------------------------------------------- ko'chirish

export function YozilishKochirishScreen({ id }: { id: number }) {
  const lang = useLang();
  const load = useLoad(`yozilish:${id}:${lang}`, () => api.yozilish(id, lang));
  return <Loaded load={load}>{({ yozilish }) => <Kochirish y={yozilish} />}</Loaded>;
}

function Kochirish({ y }: { y: YozilishDto }) {
  const t = useT();
  const lang = useLang();
  const { load, reload } = useSlotlar();
  const [sana, setSana] = useState<string | null>(null);
  const [vaqt, setVaqt] = useState<string | null>(null);
  const [state, setState] = useState<Sending>({ kind: 'idle' });

  useEffect(() => {
    if (load.kind !== 'ready' || sana !== null) return;
    const own = load.data.kunlar.find((k) => k.sana === y.sana && k.vaqtlar.length > 0);
    setSana(own ? own.sana : firstOpen(load.data.kunlar));
  }, [load, sana, y.sana]);

  if (!y.ozgartirsaBoladi) return <p className="muted">{t('yozilish.ozgarmaydi')}</p>;

  const same = sana === y.sana && vaqt === y.vaqt;
  const ready = sana !== null && vaqt !== null && !same;
  const sending = state.kind === 'sending';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || sending) return;
    setState({ kind: 'sending' });
    try {
      await api.kochir(y.id, { sana, vaqt }, lang);
      hapticNotify('success');
      replaceRoute({ name: 'yozilishKorish', id: y.id, yangi: 'kochirildi' });
    } catch (err) {
      hapticNotify('error');
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 409) {
        setVaqt(null);
        reload();
      }
      setState({ kind: 'failed', reason: status === 409 ? 'slot' : 'other' });
    }
  }

  return (
    <form className="yz-form" onSubmit={submit} noValidate>
      <h1 className="h1">{t('yozilish.kochirishTitle')}</h1>
      <div className="ariza-kontekst">
        <span className="ariza-kontekst-thumb">
          <CalendarIcon />
        </span>
        <span className="ariza-kontekst-text">
          <span className="title">{y.loyihaNomi}</span>
          <span className="caption">{t('yozilish.hozir', { sana: sanaToliq(lang, y.sana, y.haftaKuni), vaqt: y.vaqt })}</span>
        </span>
      </div>
      <Loaded load={load}>
        {({ kunlar }) => (
          <SlotPicker
            kunlar={kunlar}
            sana={sana}
            vaqt={vaqt}
            hozirgi={{ sana: y.sana, vaqt: y.vaqt }}
            onChange={(s, v) => {
              setSana(s);
              setVaqt(v);
              if (state.kind === 'failed') setState({ kind: 'idle' });
            }}
          />
        )}
      </Loaded>
      {state.kind === 'failed' && (
        <p className="note note-error" role="alert">
          {t(state.reason === 'slot' ? 'yozilish.error.slot' : 'ariza.error.other')}
        </p>
      )}
      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={!ready || sending} aria-busy={sending}>
          {sending && <span className="spinner" aria-hidden />}
          {sending
            ? t('yozilish.sending')
            : ready
              ? t('yozilish.submitKochir', { sana: sanaQisqa(lang, sana), vaqt })
              : t('yozilish.pick')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- one booking (confirmation)

export function YozilishKorishScreen({ id, yangi }: { id: number; yangi?: 'yozildi' | 'kochirildi' }) {
  const lang = useLang();
  const load = useLoad(`yozilish:${id}:${lang}`, () => api.yozilish(id, lang));
  return <Loaded load={load}>{({ yozilish }) => <Korish initial={yozilish} yangi={yangi} />}</Loaded>;
}

function Korish({ initial, yangi }: { initial: YozilishDto; yangi?: 'yozildi' | 'kochirildi' }) {
  const t = useT();
  const lang = useLang();
  const [y, setY] = useState(initial);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(false);

  async function bekor() {
    if (cancelling || !(await confirmDialog(t('yozilish.bekorConfirm')))) return;
    setCancelling(true);
    setError(false);
    try {
      setY((await api.bekor(y.id, lang)).yozilish);
      hapticNotify('success');
    } catch {
      hapticNotify('error');
      setError(true);
    } finally {
      setCancelling(false);
    }
  }

  const fresh = yangi !== undefined && y.holat === 'faol';
  const holat = yozilishHolati(y);

  return (
    <div className={fresh ? 'yz-korish ariza-done' : 'yz-korish'}>
      {fresh ? (
        <>
          <div className="ariza-done-mark" aria-hidden>
            <span>
              <CheckMark size={28} />
            </span>
          </div>
          <h1 className="h2" role="status">
            {t(yangi === 'kochirildi' ? 'yozilish.moved.title' : 'yozilish.done.title')}
          </h1>
          <p className="body-text muted">{t('yozilish.done.text')}</p>
        </>
      ) : (
        <div className="row-between">
          <h1 className="h1">{t('yozilish.title')}</h1>
          <span className={`badge yz-badge-${holat}`}>{t(HOLAT_KEY[holat])}</span>
        </div>
      )}

      <dl className="yz-details">
        <div className="yz-detail">
          <CalendarIcon />
          <div>
            <dt className="caption muted">{t('yozilish.sanaVaqt')}</dt>
            <dd className="title yz-detail-value" data-off={y.holat === 'bekor' || undefined}>
              {sanaToliq(lang, y.sana, y.haftaKuni)} · {y.vaqt}
            </dd>
          </div>
        </div>
        <div className="yz-detail">
          <HomeIcon />
          <div>
            <dt className="caption muted">{t('yozilish.loyiha')}</dt>
            <dd className="title">{joyMatni(t, y)}</dd>
          </div>
        </div>
        <div className="yz-detail">
          <PinIcon />
          <div>
            <dt className="caption muted">{t('yozilish.manzil')}</dt>
            <dd className="title">{y.manzil}</dd>
          </div>
          <button type="button" className="yz-link yz-xarita" onClick={() => openExternal(xaritaUrl(y.manzil, y.xarita))}>
            {t('yozilish.xarita')}
          </button>
        </div>
      </dl>

      {error && (
        <p className="note note-error" role="alert">
          {t('ariza.error.other')}
        </p>
      )}

      <div className="sticky-actions yz-actions">
        {fresh && (
          <button className="button-primary" type="button" onClick={() => replaceRoute({ name: 'loyihalar' })}>
            {t('yozilish.tayyor')}
          </button>
        )}
        {y.ozgartirsaBoladi && (
          <div className="yz-actions-row">
            <a className={fresh ? 'yz-link' : 'button-secondary'} href={href({ name: 'yozilishKochirish', id: y.id })}>
              {t('yozilish.kochirish')}
            </a>
            <button type="button" className="yz-link yz-link-danger" onClick={bekor} disabled={cancelling} aria-busy={cancelling}>
              {cancelling ? t('yozilish.bekorQilinmoqda') : t('yozilish.bekor')}
            </button>
          </div>
        )}
        {!y.ozgartirsaBoladi && !fresh && (
          <a className="button-secondary" href={href({ name: 'yozilish', loyihaId: y.loyihaId })}>
            {t('yozilish.yana')}
          </a>
        )}
      </div>
    </div>
  );
}

type KorinishHolati = 'faol' | 'bekor' | 'keldi' | 'kelmadi' | 'otgan';

const HOLAT_KEY: Record<KorinishHolati, MessageKey> = {
  faol: 'yozilish.holat.faol',
  bekor: 'yozilish.holat.bekor',
  keldi: 'yozilish.holat.keldi',
  kelmadi: 'yozilish.holat.kelmadi',
  otgan: 'yozilish.holat.otgan',
};

function yozilishHolati(y: YozilishDto): KorinishHolati {
  if (y.holat === 'bekor') return 'bekor';
  if (y.davomat) return y.davomat;
  return y.ozgartirsaBoladi ? 'faol' : 'otgan';
}

function joyMatni(t: ReturnType<typeof useT>, y: YozilishDto): string {
  const p = y.planirovka;
  if (!p) return y.loyihaNomi;
  return [y.loyihaNomi, t('blok.nomi', { nomi: p.blokNomi }), t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) })].join(
    ' · ',
  );
}

// ---------------------------------------------------------------- «Mening arizalarim va yozilishlarim»

export function MeningScreen() {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`mening:${lang}`, () => Promise.all([api.arizalar(), api.yozilishlar(lang)]));

  return (
    <Loaded load={load}>
      {([{ kontakt, arizalar }, { yozilishlar }]) => {
        const boshqa = arizalar.filter((a) => a.tur !== 'visit');
        return (
          <>
            <header className="yz-me">
              <span className="yz-me-avatar" aria-hidden>
                {kontakt.name.trim().charAt(0).toUpperCase() || '·'}
              </span>
              <span className="yz-me-text">
                <span className="h3">{kontakt.name}</span>
                {kontakt.phone && <span className="caption muted">{formatPhone(kontakt.phone)}</span>}
              </span>
            </header>

            <section className="yz-list" aria-labelledby="mening-yozilishlar">
              <h2 className="label" id="mening-yozilishlar">
                {t('mening.yozilishlar')}
              </h2>
              {yozilishlar.length === 0 ? (
                <div className="yz-empty">
                  <p className="body-text">{t('mening.emptyYozilish')}</p>
                  <a className="button-secondary" href={href({ name: 'yozilish' })}>
                    {t('kontent.yozilish')}
                  </a>
                </div>
              ) : (
                yozilishlar.map((y) => <YozilishCard key={y.id} y={y} />)
              )}
            </section>

            <section className="yz-list" aria-labelledby="mening-arizalar">
              <h2 className="label" id="mening-arizalar">
                {t('mening.arizalar')}
              </h2>
              {boshqa.length === 0 ? (
                <p className="caption muted">{t('mening.emptyAriza')}</p>
              ) : (
                boshqa.map((a) => <ArizaRow key={a.id} a={a} />)
              )}
            </section>
          </>
        );
      }}
    </Loaded>
  );
}

function YozilishCard({ y }: { y: YozilishDto }) {
  const t = useT();
  const lang = useLang();
  const holat = yozilishHolati(y);
  return (
    <article className="yz-card" data-holat={holat}>
      <a className="yz-card-main" href={href({ name: 'yozilishKorish', id: y.id })}>
        <span className="row-between">
          <span className="title yz-card-when">
            {sanaQisqa(lang, y.sana)} · {y.vaqt}
          </span>
          <span className={`badge yz-badge-${holat}`}>{t(HOLAT_KEY[holat])}</span>
        </span>
        <span className="caption yz-card-meta">
          {haftaNomi(lang, y.haftaKuni)} · {joyMatni(t, y)}
        </span>
      </a>
      {y.ozgartirsaBoladi && (
        <div className="yz-card-actions">
          <a className="yz-chip-button" href={href({ name: 'yozilishKochirish', id: y.id })}>
            {t('yozilish.kochirish')}
          </a>
          <button type="button" className="yz-chip-button" onClick={() => openExternal(xaritaUrl(y.manzil, y.xarita))}>
            {t('mening.xaritada')}
          </button>
        </div>
      )}
    </article>
  );
}

const TUR_KEY: Record<ArizaDto['tur'], MessageKey> = {
  form: 'ariza.tur.form',
  quiz: 'ariza.tur.quiz',
  visit: 'ariza.tur.visit',
  calc: 'ariza.tur.calc',
  ai: 'ariza.tur.ai',
  human: 'ariza.tur.human',
};

function ArizaRow({ a }: { a: ArizaDto }) {
  const t = useT();
  const lang = useLang();
  const sana = new Date(a.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
  return (
    <div className="yz-ariza">
      <span className="yz-ariza-text">
        <span className="title">{t(TUR_KEY[a.tur])}</span>
        <span className="caption muted">{[sanaQisqa(lang, sana), a.loyihaNomi].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="badge yz-badge-qabul">{t('mening.qabul')}</span>
    </div>
  );
}

/** «+998 90 123 45 67». */
function formatPhone(phone: string): string {
  return `+998 ${formatLocal(localDigits(phone))}`;
}
