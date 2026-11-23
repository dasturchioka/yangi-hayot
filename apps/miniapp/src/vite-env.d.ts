/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: signed initData to use outside Telegram. */
  readonly VITE_DEV_INIT_DATA?: string;
}
