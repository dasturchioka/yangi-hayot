import type { MeResponse } from '@yh/shared';
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

export const api = {
  me: () => apiGet<MeResponse>('/me'),
};
