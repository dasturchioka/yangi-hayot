/**
 * Types shared by the server and the frontends (Mini App, admin-panel).
 * Types and constants only: no runtime dependencies.
 */

export * from './bot';

export const LANGS = ['ru', 'uz'] as const;
export type Lang = (typeof LANGS)[number];

/** Mijoz as the Mini App sees it (GET /api/me). */
export interface MijozDto {
  /** Telegram user id as a string (may exceed 2^53). */
  telegramId: string;
  name: string;
  lang: Lang;
}

/** Where the Mijoz came from: `src_<nomi>` tag name or «Telegram (to'g'ridan-to'g'ri)». */
export interface ManbaDto {
  /** First visit; never changes. */
  first: string;
  /** Latest tagged visit. */
  last: string;
}

export interface MeResponse {
  mijoz: MijozDto;
  manba: ManbaDto;
}

export interface ApiError {
  error: string;
}
