import { describe, expect, it } from 'vitest';
import { TelegramMessenger } from '../src/adapters/messenger/telegram-messenger';

// The real Messenger: talks to the Telegram Bot API over HTTP. Here the HTTP
// layer is a fake `fetch` answering like Telegram does.

type Reply = { status: number; body: object };

function fakeTelegram(...replies: Reply[]) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waits: number[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const r = replies.shift() ?? { status: 200, body: { ok: true, result: { message_id: 1 } } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  const messenger = new TelegramMessenger({
    botToken: '123:ABC',
    miniAppUrl: 'https://app.yangihayot.uz/',
    fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { messenger, calls, waits };
}

describe('TelegramMessenger', () => {
  it('sends text with inline buttons (link, Mini App screen, callback)', async () => {
    const tg = fakeTelegram({ status: 200, body: { ok: true, result: { message_id: 77 } } });
    const result = await tg.messenger.send({
      chatId: '700000001',
      text: 'Salom',
      buttons: [
        [{ text: 'Sayt', url: 'https://yangihayot.uz' }],
        [
          { text: 'Menyu', startapp: '' },
          { text: 'Yozilish', startapp: 'booking' },
        ],
        [{ text: 'OK', callbackData: 'ok' }],
      ],
    });

    expect(result).toEqual({ status: 'delivered', messageId: '77' });
    expect(tg.calls).toEqual([
      {
        url: 'https://api.telegram.org/bot123:ABC/sendMessage',
        body: {
          chat_id: '700000001',
          text: 'Salom',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Sayt', url: 'https://yangihayot.uz' }],
              [
                { text: 'Menyu', web_app: { url: 'https://app.yangihayot.uz/' } },
                { text: 'Yozilish', web_app: { url: 'https://app.yangihayot.uz/?startapp=booking' } },
              ],
              [{ text: 'OK', callback_data: 'ok' }],
            ],
          },
        },
      },
    ]);
  });

  it('sends photo and video with the text as caption', async () => {
    const tg = fakeTelegram();
    await tg.messenger.send({ chatId: '1', text: 'Foto', media: { kind: 'photo', fileId: 'PH' } });
    await tg.messenger.send({ chatId: '1', text: 'Video', media: { kind: 'video', fileId: 'https://x.uz/v.mp4' } });

    expect(tg.calls.map((c) => [c.url.split('/').at(-1), c.body])).toEqual([
      ['sendPhoto', { chat_id: '1', photo: 'PH', caption: 'Foto' }],
      ['sendVideo', { chat_id: '1', video: 'https://x.uz/v.mp4', caption: 'Video' }],
    ]);
  });

  it('reports a Mijoz who blocked the bot (403)', async () => {
    const tg = fakeTelegram({
      status: 403,
      body: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    });
    expect(await tg.messenger.send({ chatId: '1', text: 'x' })).toEqual({ status: 'blocked' });
  });

  it('waits and retries once when Telegram asks to slow down (429)', async () => {
    const tg = fakeTelegram(
      { status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } } },
      { status: 200, body: { ok: true, result: { message_id: 5 } } },
    );
    expect(await tg.messenger.send({ chatId: '1', text: 'x' })).toEqual({ status: 'delivered', messageId: '5' });
    expect(tg.waits).toEqual([3000]);
    expect(tg.calls).toHaveLength(2);
  });

  it('reports other failures as errors without throwing', async () => {
    const tg = fakeTelegram({ status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } });
    expect(await tg.messenger.send({ chatId: '1', text: 'x' })).toEqual({
      status: 'error',
      error: 'Bad Request: chat not found',
    });

    const down = new TelegramMessenger({
      botToken: 't',
      miniAppUrl: 'https://a.uz/',
      fetch: async () => {
        throw new Error('ECONNRESET');
      },
    });
    expect(await down.send({ chatId: '1', text: 'x' })).toEqual({ status: 'error', error: 'ECONNRESET' });
  });
});
