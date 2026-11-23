import type { BotAction, BotEventRequest, BotEventResponse } from '@yh/shared';

/** The bot's only dependency on the server: one call per Telegram update. */
export interface ServerClient {
  sendEvent(request: BotEventRequest): Promise<BotAction[]>;
}

/** HTTP client for `POST {serverUrl}/internal/bot/events` with the shared secret. */
export function httpServerClient(opts: { serverUrl: string; secret: string; timeoutMs?: number }): ServerClient {
  const url = new URL('/internal/bot/events', opts.serverUrl).toString();
  return {
    async sendEvent(request) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.secret}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      return ((await res.json()) as BotEventResponse).actions;
    },
  };
}
