import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useLang, useT } from '../i18n';
import { formatMaydon, formatNarx } from '../katalog/format';
import { href } from '../router';

type Sending = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: 'phone' | 'limit' | 'other' };

/** 9 digits after +998, shown as «90 123 45 67». */
function formatLocal(digits: string): string {
  const d = digits.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

function localDigits(phone: string | null): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.startsWith('998') ? d.slice(3, 12) : d.slice(0, 9);
}

/** «Ariza qoldirish»: name + phone, about a Loyiha or Planirovka when opened from its card. */
export function ArizaScreen({ loyihaId, planirovkaId }: { loyihaId?: number; planirovkaId?: number }) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<Sending>({ kind: 'idle' });

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

  const phoneOk = phone.length === 9;
  const canSend = name.trim().length > 0 && phoneOk && state.kind !== 'sending';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setState({ kind: 'sending' });
    try {
      await api.createAriza({ name: name.trim(), phone: `+998${phone}`, loyihaId, planirovkaId });
      setState({ kind: 'sent' });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setState({ kind: 'error', message: status === 400 ? 'phone' : status === 429 ? 'limit' : 'other' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="ariza-done">
        <div className="ariza-done-mark" aria-hidden>
          ✓
        </div>
        <h1 className="h1">{t('ariza.sent.title')}</h1>
        <p className="body-text">{t('ariza.sent.text')}</p>
        <a className="button-secondary" href={href({ name: 'loyihalar' })}>
          {t('ariza.sent.back')}
        </a>
      </div>
    );
  }

  return (
    <form className="ariza-form" onSubmit={submit} noValidate>
      <h1 className="h1">{t('ariza.title')}</h1>
      <Kontekst loyihaId={loyihaId} planirovkaId={planirovkaId} />
      <p className="muted">{t('ariza.hint')}</p>

      <label className="field">
        <span className="label">{t('ariza.name')}</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          enterKeyHint="next"
        />
      </label>

      <label className="field">
        <span className="label">{t('ariza.phone')}</span>
        <span className="input input-phone">
          <span className="input-prefix">+998</span>
          <input
            value={formatLocal(phone)}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="90 123 45 67"
            aria-invalid={state.kind === 'error' && state.message === 'phone'}
          />
        </span>
      </label>

      {state.kind === 'error' && <p className="error">{t(`ariza.error.${state.message}`)}</p>}

      <div className="sticky-actions">
        <button className="button-primary" type="submit" disabled={!canSend}>
          {state.kind === 'sending' ? t('ariza.sending') : t('ariza.send')}
        </button>
      </div>
    </form>
  );
}

/** What the Ariza is about, as a short line (loaded from the katalog cache). */
function Kontekst({ loyihaId, planirovkaId }: { loyihaId?: number; planirovkaId?: number }) {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (planirovkaId) {
      api.planirovka(planirovkaId, lang).then(
        ({ planirovka: p }) =>
          live &&
          setText(
            [
              p.loyihaNomi,
              t('blok.nomi', { nomi: p.blokNomi }),
              t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) }),
              formatNarx(t, p.boshlangichNarx),
            ].join(' · '),
          ),
        () => {},
      );
    } else if (loyihaId) {
      api.loyiha(loyihaId, lang).then(({ loyiha }) => live && setText(loyiha.nomi), () => {});
    }
    return () => {
      live = false;
    };
  }, [loyihaId, planirovkaId, lang, t]);

  return text ? <p className="ariza-kontekst">{text}</p> : null;
}
