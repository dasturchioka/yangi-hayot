/**
 * Types shared by the server and the frontends (Mini App, admin-panel).
 * Types and constants only: no runtime dependencies.
 */

export const LANGS = ['ru', 'uz'] as const;
export type Lang = (typeof LANGS)[number];

/** Mijoz as the Mini App sees it (GET /api/me). */
export interface MijozDto {
  /** Telegram user id as a string (may exceed 2^53). */
  telegramId: string;
  name: string;
  lang: Lang;
}

export interface MeResponse {
  mijoz: MijozDto;
}

export interface ApiError {
  error: string;
}
