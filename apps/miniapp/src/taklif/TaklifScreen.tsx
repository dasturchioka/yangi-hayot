import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { useT } from '../i18n';
import { copyText, hapticSuccess, shareToChat, showAlert } from '../telegram';
import { CheckIcon as KitCheckIcon, SendIcon } from '../icons';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; soni: number }
  | { kind: 'error'; unavailable: boolean };

/**
 * «Do'stingni taklif qil» (UF-6, kit screen 18): the Mijoz's personal bot
 * link, «Nusxa», how many friends came by it and «Telegram'da yuborish».
 * No bonus amounts or «uy oldi»: the system only counts invitations (S12).
 */
export function TaklifScreen() {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    api.taklif().then(
      ({ url, soni }) => live && setState({ kind: 'ready', url, soni }),
      (e: unknown) => live && setState({ kind: 'error', unavailable: e instanceof ApiError && e.status === 503 }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className="taklif">
      <h1 className="h2 taklif-title">{t('taklif.title')}</h1>

      <section className="taklif-hero">
        <span className="taklif-hero-leaf" aria-hidden>
          <span />
        </span>
        <h2 className="taklif-hero-title">{t('taklif.hero')}</h2>
        <p className="taklif-hero-note">{t('taklif.heroNote')}</p>
      </section>

      {state.kind === 'loading' && <LinkSkeleton />}
      {state.kind === 'error' && (
        <div className="taklif-error">
          <p className={state.unavailable ? 'muted' : 'error'}>
            {t(state.unavailable ? 'taklif.unavailable' : 'state.error')}
          </p>
          {!state.unavailable && (
            <button className="button-secondary" onClick={() => setAttempt((a) => a + 1)}>
              {t('state.retry')}
            </button>
          )}
        </div>
      )}
      {state.kind === 'ready' && <LinkBlock url={state.url} soni={state.soni} />}

      <section className="taklif-how">
        <h2 className="h3">{t('taklif.howTitle')}</h2>
        <ol className="taklif-steps">
          {(['taklif.step1', 'taklif.step2', 'taklif.step3'] as const).map((key, i) => (
            <li key={key}>
              <span className="taklif-step-n">{i + 1}</span>
              <span className="body-text">{t(key)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="sticky-actions">
        <button
          className="button-primary taklif-send"
          disabled={state.kind !== 'ready'}
          onClick={() => state.kind === 'ready' && shareToChat(state.url, t('taklif.shareText'))}
        >
          <PlaneIcon />
          {t('taklif.send')}
        </button>
      </div>
    </div>
  );
}

function LinkBlock({ url, soni }: { url: string; soni: number }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(url))) return showAlert(url);
    hapticSuccess();
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <section className="taklif-link-wrap">
        <p className="taklif-label" id="taklif-link-label">
          {t('taklif.yourLink')}
        </p>
        <div className="taklif-link">
          <span className="taklif-url">
            {url.replace(/^https:\/\//, '')}
          </span>
          <button className="taklif-copy" data-copied={copied} onClick={copy} aria-live="polite">
            <span className="taklif-copy-label" aria-hidden={copied}>
              {t('taklif.copy')}
            </span>
            <span className="taklif-copy-done" aria-hidden={!copied}>
              <CheckIcon />
              {t('taklif.copied')}
            </span>
          </button>
        </div>
      </section>

      <div className="taklif-soni">
        <b>{soni}</b>
        <span>{t('taklif.soni')}</span>
        {soni === 0 && <p className="caption">{t('taklif.soniNone')}</p>}
      </div>
    </>
  );
}

function LinkSkeleton() {
  return (
    <div className="taklif-skeleton" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

function PlaneIcon() {
  return <SendIcon />;
}

function CheckIcon() {
  return <KitCheckIcon size={16} />;
}
