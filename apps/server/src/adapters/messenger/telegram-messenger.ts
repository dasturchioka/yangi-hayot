import type { MessageButton, Messenger, OutgoingMessage, SendResult } from './messenger';

export interface TelegramMessengerOptions {
  botToken: string;
  /** Mini App URL for `startapp` buttons (web_app buttons; `?startapp=<screen>` appended). */
  miniAppUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Used to honour 429 `retry_after`. */
  sleep?: (ms: number) => Promise<void>;
}

interface TgResponse {
  ok: boolean;
  result?: { message_id: number };
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Messenger over the Telegram Bot API (sendMessage / sendPhoto / sendVideo).
 * 403 → 'blocked'; 429 → waits `retry_after` and retries once; anything else
 * (including network errors) → 'error'. Never throws for a send.
 */
export class TelegramMessenger implements Messenger {
  readonly #opts: TelegramMessengerOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(opts: TelegramMessengerOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetch ?? globalThis.fetch;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    const { method, body } = this.#request(message);
    let res = await this.#call(method, body);
    const retryAfter = res.error_code === 429 ? res.parameters?.retry_after : undefined;
    if (retryAfter !== undefined) {
      await this.#sleep(retryAfter * 1000);
      res = await this.#call(method, body);
    }
    if (res.ok && res.result) return { status: 'delivered', messageId: String(res.result.message_id) };
    if (res.error_code === 403) return { status: 'blocked' };
    return { status: 'error', error: res.description ?? 'unknown Telegram error' };
  }

  #request(m: OutgoingMessage): { method: string; body: Record<string, unknown> } {
    const body: Record<string, unknown> = { chat_id: m.chatId };
    let method = 'sendMessage';
    if (m.media) {
      method = m.media.kind === 'photo' ? 'sendPhoto' : 'sendVideo';
      body[m.media.kind] = m.media.fileId;
      if (m.text) body.caption = m.text;
    } else {
      body.text = m.text ?? '';
    }
    if (m.buttons?.length) {
      body.reply_markup = { inline_keyboard: m.buttons.map((row) => row.map((b) => this.#button(b))) };
    }
    return { method, body };
  }

  #button(b: MessageButton): Record<string, unknown> {
    if ('callbackData' in b) return { text: b.text, callback_data: b.callbackData };
    if ('url' in b) return { text: b.text, url: b.url };
    const url = new URL(this.#opts.miniAppUrl);
    if (b.startapp) url.searchParams.set('startapp', b.startapp);
    return { text: b.text, web_app: { url: url.toString() } };
  }

  async #call(method: string, body: Record<string, unknown>): Promise<TgResponse> {
    try {
      const res = await this.#fetch(`https://api.telegram.org/bot${this.#opts.botToken}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await res.json()) as TgResponse;
    } catch (e) {
      return { ok: false, description: e instanceof Error ? e.message : String(e) };
    }
  }
}
