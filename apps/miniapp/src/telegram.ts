import type { Lang } from '@yh/shared';

/** The parts of Telegram.WebApp we use. Full API: https://core.telegram.org/bots/webapps */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { language_code?: string } };
  ready(): void;
  expand(): void;
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
