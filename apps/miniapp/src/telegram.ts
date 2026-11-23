import type { Lang } from '@yh/shared';

/** The parts of Telegram.WebApp we use. Full API: https://core.telegram.org/bots/webapps */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { language_code?: string } };
  ready(): void;
  expand(): void;
  openLink?(url: string): void;
  openTelegramLink?(url: string): void;
  showAlert?(message: string): void;
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
