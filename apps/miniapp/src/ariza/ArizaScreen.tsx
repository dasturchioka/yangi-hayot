import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useLang, useT } from '../i18n';
import { formatMaydon, formatNarx } from '../katalog/format';
import { PlanIcon } from '../katalog/parts';
import { href } from '../router';

type Sending = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; reason: 'limit' | 'other' };

/** 9 digits after +998, shown as «90 123 45 67». */
export function formatLocal(digits: string): string {
  const d = digits.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function localDigits(phone: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.startsWith('998') ? d.slice(3, 12) : d.slice(0, 9);
}

/** «Ariza qoldirish»: name + phone, about a Loyiha or Planirovka when opened from its card. */
export function ArizaScreen({ loyihaId, planirovkaId }: { loyihaId?: number; planirovkaId?: number }) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Field errors show after the first submit attempt (or leaving a half-typed phone), never while typing.
  const [checked, setChecked] = useState({ name: false, phone: false });
  const [state, setState] = useState<Sending>({ kind: 'idle' });
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Prefill from what the Mijoz gave before (or the Telegram name).
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

  const nameError = checked.name && name.trim().length === 0;
  const phoneError = checked.phone && phone.length !== 9;
  const sending = state.kind === 'sending';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setChecked({ name: true, phone: true });
    if (name.trim().length === 0) return nameRef.current?.focus();
    if (phone.length !== 9) return phoneRef.current?.focus();
    setState({ kind: 'sending' });
    try {
      await api.createAriza({ name: name.trim(), phone: `+998${phone}`, loyihaId, planirovkaId });
      setState({ kind: 'sent' });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setState({ kind: 'idle' });
        setChecked({ name: true, phone: true });
        setPhone((p) => (p.length === 9 ? '' : p)); // server rejected a complete number: ask again
        phoneRef.current?.focus();
        return;
      }
      setState({ kind: 'failed', reason: status === 429 ? 'limit' : 'other' });
    }
  }

  if (state.kind === 'sent') return <Sent />;

  return (
    <form className="ariza-form" onSubmit={submit} noValidate>
      <h1 className="h1">{t('ariza.title')}</h1>
      <Kontekst loyihaId={loyihaId} planirovkaId={planirovkaId} />
      <p className="muted">{t('ariza.hint')}</p>

      <div className="field">
        <label className="field-label" htmlFor="ariza-name">
          {t('ariza.name')}
        </label>
        <input
          id="ariza-name"
          ref={nameRef}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          enterKeyHint="next"
          aria-invalid={nameError}
          aria-describedby={nameError ? 'ariza-name-error' : undefined}
        />
        {nameError && (
          <p className="field-error" id="ariza-name-error">
            {t('ariza.error.name')}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="ariza-phone">
          {t('ariza.phone')}
        </label>
        <span className="input input-phone" data-invalid={phoneError || undefined}>
          <span className="input-prefix">+998</span>
          <input
            id="ariza-phone"
            ref={phoneRef}
            value={formatLocal(phone)}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            onBlur={() => phone.length > 0 && setChecked((c) => ({ ...c, phone: true }))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="90 123 45 67"
            enterKeyHint="send"
            aria-invalid={phoneError}
            aria-describedby={phoneError ? 'ariza-phone-error' : undefined}
          />
        </span>
        {phoneError && (
          <p className="field-error" id="ariza-phone-error">
            {t('ariza.error.phone')}
          </p>
        )}
      </div>

      {state.kind === 'failed' && (
        <p className="note note-error" role="alert">
          {t(`ariza.error.${state.reason}`)}
        </p>
      )}

      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={sending} aria-busy={sending}>
          {sending && <span className="spinner" aria-hidden />}
          {sending ? t('ariza.sending') : t('ariza.send')}
        </button>
      </div>
    </form>
  );
}

function Sent() {
  const t = useT();
  return (
    <div className="ariza-done" role="status">
      <div className="ariza-done-mark" aria-hidden>
        <span>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </div>
      <h1 className="h2">{t('ariza.sent.title')}</h1>
      <p className="body-text muted">{t('ariza.sent.text')}</p>
      <div className="sticky-actions">
        <a className="button-primary" href={href({ name: 'loyihalar' })}>
          {t('ariza.sent.back')}
        </a>
      </div>
    </div>
  );
}

interface KontekstView {
  thumb: string | null;
  title: string;
  meta: string;
}

/** What the Ariza is about: a card like the booking screen's (from the katalog cache). */
function Kontekst({ loyihaId, planirovkaId }: { loyihaId?: number; planirovkaId?: number }) {
  const t = useT();
  const lang = useLang();
  const [view, setView] = useState<KontekstView | null>(null);

  useEffect(() => {
    let live = true;
    if (planirovkaId) {
      api.planirovka(planirovkaId, lang).then(
        ({ planirovka: p }) =>
          live &&
          setView({
            thumb: p.chizma,
            title: p.loyihaNomi,
            meta: [
              t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) }),
              t('blok.nomi', { nomi: p.blokNomi }),
              formatNarx(t, p.boshlangichNarx),
            ].join(' · '),
          }),
        () => {},
      );
    } else if (loyihaId) {
      api.loyiha(loyihaId, lang).then(
        ({ loyiha: l }) => live && setView({ thumb: l.fotolar[0] ?? null, title: l.nomi, meta: l.manzil }),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [loyihaId, planirovkaId, lang, t]);

  if (!view) return null;
  return (
    <div className="ariza-kontekst">
      <span className="ariza-kontekst-thumb">{view.thumb ? <img src={view.thumb} alt="" /> : <PlanIcon />}</span>
      <span className="ariza-kontekst-text">
        <span className="title">{view.title}</span>
        <span className="caption">{view.meta}</span>
      </span>
    </div>
  );
}
