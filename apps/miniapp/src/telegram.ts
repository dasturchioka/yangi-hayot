import type { Lang } from '@yh/shared';

/** The parts of Telegram.WebApp we use. Full API: https://core.telegram.org/bots/webapps */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { language_code?: string }; start_param?: string };
  ready(): void;
  expand(): void;
  openLink?(url: string): void;
  openTelegramLink?(url: string): void;
  showAlert?(message: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: {
    selectionChanged(): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const webApp = (): TelegramWebApp | undefined => window.Telegram?.WebApp;

/** Signed initData; empty when opened outside Telegram. `VITE_DEV_INIT_DATA` overrides it in dev. */
export function getInitData(): string {
  return import.meta.env.VITE_DEV_INIT_DATA || webApp()?.initData || '';
}

/** Language to show before the server answers. */
export function guessLang(): Lang {
  return webApp()?.initDataUnsafe.user?.language_code?.startsWith('uz') ? 'uz' : 'ru';
}

export function signalReady(): void {
  webApp()?.ready();
  webApp()?.expand();
}

/** t.me links open inside Telegram (channel post), anything else in the in-app browser. */
export function openExternal(url: string): void {
  const w = webApp();
  const isTelegram = /^https:\/\/(t|telegram)\.me\//i.test(url);
  if (isTelegram && w?.openTelegramLink) w.openTelegramLink(url);
  else if (w?.openLink) w.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function showAlert(message: string): void {
  const w = webApp();
  if (w?.showAlert) w.showAlert(message);
  else window.alert(message);
}

/** Telegram's native confirm dialog (browser confirm outside Telegram). */
export function confirmDialog(message: string): Promise<boolean> {
  const w = webApp();
  if (w?.showConfirm) return new Promise((resolve) => w.showConfirm!(message, resolve));
  return Promise.resolve(window.confirm(message));
}

/** A light tick when a choice changes (day, time); silent outside Telegram. */
export function hapticSelect(): void {
  webApp()?.HapticFeedback?.selectionChanged();
}

export function hapticNotify(type: 'error' | 'success' | 'warning'): void {
  webApp()?.HapticFeedback?.notificationOccurred(type);
}

/** Shows Telegram's native back button while `onBack` is set. */
export function setBackButton(onBack: (() => void) | null): () => void {
  const bb = webApp()?.BackButton;
  if (!bb) return () => {};
  if (!onBack) {
    bb.hide();
    return () => {};
  }
  bb.show();
  bb.onClick(onBack);
  return () => bb.offClick(onBack);
}

/**
 * The launch's `startapp` parameter. Direct links (`t.me/<bot>/<app>?startapp=`)
 * put it in initData (signed, also seen by the server); the bot's web_app
 * buttons (#7) pass it as `?startapp=` in the page URL instead.
 */
export function getStartParam(): string {
  const fromInitData = webApp()?.initDataUnsafe.start_param;
  if (fromInitData) return fromInitData;
  const q = new URLSearchParams(window.location.search);
  return q.get('startapp') ?? q.get('tgWebAppStartParam') ?? '';
}

/** Opens Telegram's «send to chat» picker with this link and text. */
export function shareToChat(url: string, text: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const w = webApp();
  if (w?.openTelegramLink) w.openTelegramLink(share);
  else window.open(share, '_blank', 'noopener');
}
