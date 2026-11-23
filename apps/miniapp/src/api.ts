import type { Lang, LoyihaResponse, LoyihalarResponse, MeResponse, PlanirovkaResponse } from '@yh/shared';
import { getInitData } from './telegram';

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API error ${status}`);
  }
}

/** Calls the server API with the Mini App initData. Every Mini App request goes through here. */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { authorization: `tma ${getInitData()}` } });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

/**
 * Katalog answers are kept for a short while so going back is instant.
 * The server itself serves data at most ~30 s old, so the Mijoz still sees
 * changes within a minute.
 */
const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cachedGet<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
  const value = apiGet<T>(path);
  cache.set(path, { at: Date.now(), value });
  value.catch(() => cache.delete(path));
  return value;
}

export const api = {
  me: () => apiGet<MeResponse>('/me'),
  /** All Sotuvdagi Loyihalar (both cities): the list screen splits them by city. */
  loyihalar: (lang: Lang) => cachedGet<LoyihalarResponse>(`/katalog/loyihalar?lang=${lang}`),
  loyiha: (id: number, lang: Lang) => cachedGet<LoyihaResponse>(`/katalog/loyihalar/${id}?lang=${lang}`),
  planirovka: (id: number, lang: Lang) => cachedGet<PlanirovkaResponse>(`/katalog/planirovkalar/${id}?lang=${lang}`),
};
