import type {
  KontentResponse,
  ArizaCreatedResponse,
  ArizaFormRequest,
  ArizalarResponse,
  KalkulyatorArizaRequest,
  KalkulyatorHisobRequest,
  KalkulyatorResponse,
  Lang,
  LoyihaResponse,
  LoyihalarResponse,
  MeResponse,
  PlanirovkaResponse,
  SevimlilarResponse,
  TaqqoslashResponse,
  UlashishResponse,
} from '@yh/shared';
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

/** PUT / DELETE / POST with an optional JSON body; resolves to the JSON answer (undefined on 204). */
async function apiSend<T = void>(method: 'PUT' | 'DELETE' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      authorization: `tma ${getInitData()}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status);
  return (res.status === 204 ? undefined : await res.json()) as T;
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
  /** Own Arizalar + name/phone to prefill forms. */
  arizalar: () => apiGet<ArizalarResponse>('/arizalar'),
  /** 400 = bad phone/context, 429 = too many Arizalar. */
  createAriza: (body: ArizaFormRequest) => apiSend<ArizaCreatedResponse>('POST', '/arizalar', body),
  /** Sevimlilar live on the server (follow the Mijoz across devices): never cached. */
  sevimlilar: (lang: Lang) => apiGet<SevimlilarResponse>(`/sevimlilar?lang=${lang}`),
  addSevimli: (id: number) => apiSend('PUT', `/sevimlilar/${id}`),
  removeSevimli: (id: number) => apiSend('DELETE', `/sevimlilar/${id}`),
  taqqoslash: (ids: number[], lang: Lang) => apiGet<TaqqoslashResponse>(`/taqqoslash?ids=${ids.join(',')}&lang=${lang}`),
  /** «Qanday sotib olish», «Biz haqimizda» (+ portfolio), kontaktlar — texts the Administrator edits. */
  kontent: (lang: Lang) => cachedGet<KontentResponse>(`/kontent?lang=${lang}`),
  /** Muddatli to'lov terms and banks: changed by admins, so cached like the katalog. */
  kalkulyator: () => cachedGet<KalkulyatorResponse>('/kalkulyator'),
  /** «Hisobladi» (dojim #17, Daraja #18). Fire and forget. */
  kalkulyatorHisob: (body: KalkulyatorHisobRequest) => apiSend('POST', '/kalkulyator/hisob', body),
  /** «Hisobni menejerga yuborish»: 400 = bad phone or input outside the settings, 429 = too many Arizalar. */
  kalkulyatorAriza: (body: KalkulyatorArizaRequest) => apiSend<ArizaCreatedResponse>('POST', '/kalkulyator/ariza', body),
  ulashish: (planirovkaId: number) => apiSend<UlashishResponse>('POST', '/ulashish', { planirovkaId }),
};
