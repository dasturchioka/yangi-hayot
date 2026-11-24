import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import './telegram-preview.css';

/** What the bot sends (same shape as the Rassilka content). */
export interface TelegramMessage {
  text: string;
  media?: { kind: 'photo' | 'video'; fileId: string };
  button?: { text: string };
}

/**
 * The bot's chat as Telegram (iOS, Day theme) shows it: status bar, navigation bar, the default
 * wallpaper, a date pill, the incoming bubble with its tail, time and inline button, the input bar.
 *
 * Motion is reserved for moments, never per keystroke:
 * - while the admin types, the header says the bot is «yozmoqda…» (as Telegram shows a typing peer);
 * - a message arrives from its tail (bottom-left) when it first gets content, and again for each `arrivalKey`
 *   (e.g. the saved draft: «this is what they will receive»);
 * - a photo loads blurred → sharp, as Telegram's progressive images; the inline button slides out under the bubble.
 */
export function TelegramPreview({
  message,
  arrivalKey,
  placeholder,
}: {
  message: TelegramMessage;
  /** A new value replays the arrival of the message. */
  arrivalKey?: string;
  /** Shown as a service message while there is nothing to preview. */
  placeholder: string;
}) {
  const typing = useTyping(message.text, arrivalKey);
  const now = useClock();
  const text = message.text.trim();
  const empty = !text && !message.media;

  return (
    <div className="tgm" role="img" aria-label={empty ? placeholder : `Telegram xabari: ${text}`}>
      <div className="tgm-status" aria-hidden="true">
        <span className="tgm-status-time">{now}</span>
        <span className="tgm-status-icons">
          <Icon name="signal" size={15} />
          <Icon name="wifi" size={15} />
          <Icon name="battery" size={20} />
        </span>
      </div>

      <header className="tgm-nav" aria-hidden="true">
        <span className="tgm-back">
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none">
            <path d="M9.5 1.5 2 9.5l7.5 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Chatlar
        </span>
        <span className="tgm-peer">
          <b>Yangi Hayot</b>
          <small className={typing ? 'tgm-typing' : undefined}>
            {typing ? (
              <>
                yozmoqda
                <span className="tgm-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : (
              'bot'
            )}
          </small>
        </span>
        <img className="tgm-avatar" src="/logo.png" alt="" width={36} height={36} />
      </header>

      <div className="tgm-chat" aria-hidden="true">
        {/* column-reverse: the newest message sits at the bottom and a long one scrolls up, as in Telegram */}
        <div className="tgm-scroll">
          {empty ? (
            <p className="tgm-service" key="empty">
              {placeholder}
            </p>
          ) : (
            <div className={message.media ? 'tgm-msg has-media' : 'tgm-msg'} key={arrivalKey ?? 'live'}>
              <div className={message.media && !text ? 'tgm-bubble media-only' : 'tgm-bubble'}>
                {message.media && <Media media={message.media} time={text ? null : now} />}
                {text && (
                  <p className="tgm-text">
                    {linkify(text)}
                    <span className="tgm-time-spacer" />
                    <time className="tgm-time">{now}</time>
                  </p>
                )}
                <svg className="tgm-tail" width="11" height="18" viewBox="0 0 11 18">
                  <path d="M6 0c0 7.6-2 13-5.4 16.6-.5.6-.2 1.4.6 1.4H11V0z" />
                </svg>
              </div>
              {message.button && (
                <span className="tgm-inline">
                  {message.button.text.trim() || 'Tugma'}
                  <Icon name="arrowUpRight" size={12} className="tgm-inline-icon" />
                </span>
              )}
            </div>
          )}
          {!empty && <p className="tgm-date">Bugun</p>}
        </div>
      </div>

      <footer className="tgm-input" aria-hidden="true">
        <Icon name="paperclip" size={22} />
        <span className="tgm-field">Xabar</span>
        <Icon name="mic" size={22} />
      </footer>
    </div>
  );
}

function Media({ media, time }: { media: NonNullable<TelegramMessage['media']>; time: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const src = media.kind === 'photo' && /^(https?:\/\/|\/)/.test(media.fileId) ? media.fileId : null;
  return (
    <div className={`tgm-media ${media.kind}`}>
      {src ? (
        <img key={src} src={src} alt="" className={loaded ? 'loaded' : undefined} onLoad={() => setLoaded(true)} />
      ) : media.kind === 'photo' ? (
        <span className="tgm-media-empty">Foto shu yerda chiqadi</span>
      ) : (
        <span className="tgm-play">
          <Icon name="play" size={22} />
        </span>
      )}
      {time && <time className="tgm-time on-media">{time}</time>}
    </div>
  );
}

/** URLs and @usernames are links in Telegram even in plain text. */
function linkify(text: string): ReactNode[] {
  return text.split(/((?:https?:\/\/|t\.me\/)[^\s]+|@[A-Za-z0-9_]{5,32})/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="tgm-link">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** True while the text keeps changing (and for a moment after); not on the first render or a new arrival. */
function useTyping(text: string, arrivalKey: string | undefined): boolean {
  const [typing, setTyping] = useState(false);
  const prev = useRef(text);
  const prevKey = useRef(arrivalKey);
  useEffect(() => {
    if (prevKey.current !== arrivalKey) {
      prevKey.current = arrivalKey;
      prev.current = text;
      setTyping(false);
      return;
    }
    if (prev.current === text) return;
    prev.current = text;
    setTyping(true);
    const t = window.setTimeout(() => setTyping(false), 1100);
    return () => window.clearTimeout(t);
  }, [text, arrivalKey]);
  return typing;
}

/** HH:MM, kept current. */
function useClock(): string {
  const fmt = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = window.setInterval(() => setNow(fmt()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
