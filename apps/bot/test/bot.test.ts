import type { BotAction, BotEventRequest } from '@yh/shared';
import type { Update } from 'grammy/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../src/bot';

/**
 * The bot is a thin translator, so these tests only check translation:
 * Telegram update → BotEvent sent to the server, and server BotActions →
 * Bot API calls. Behaviour (what to answer) is tested in apps/server.
 */

const MINIAPP_URL = 'https://miniapp.example.com/';
const from = { id: 700000001, is_bot: false, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };
const privateChat = { id: 700000001, type: 'private' as const, first_name: 'Aziz' };

let received: BotEventRequest[];
let reply: BotAction[];
let calls: Array<{ method: string; payload: Record<string, unknown> }>;
let bot: ReturnType<typeof createBot>;

beforeEach(() => {
  received = [];
  reply = [];
  calls = [];
  bot = createBot({
    token: '123:TEST',
    miniAppUrl: MINIAPP_URL,
    botInfo: { id: 1, is_bot: true, first_name: 'YH', username: 'YangiHayot_test_bot' } as never,
    server: {
      async sendEvent(req) {
        received.push(req);
        return reply;
      },
    },
  });
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as never;
  });
});

let seq = 0;
function message(extra: Record<string, unknown>, chat: Record<string, unknown> = privateChat): Update {
  return { update_id: ++seq, message: { message_id: 42, date: 0, chat, from, ...extra } } as unknown as Update;
}

describe('Telegram update → server event', () => {
  it('sends /start with its deep-link payload', async () => {
    await bot.handleUpdate(message({ text: '/start src_instagram', entities: [{ type: 'bot_command', offset: 0, length: 6 }] }));

    expect(received).toEqual([
      {
        user: { id: 700000001, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' },
        event: { type: 'start', payload: 'src_instagram' },
      },
    ]);
  });

  it('sends other commands by name', async () => {
    await bot.handleUpdate(message({ text: '/welcome', entities: [{ type: 'bot_command', offset: 0, length: 8 }] }));

    expect(received[0]!.event).toEqual({ type: 'command', name: 'welcome' });
  });

  it('sends a voice message with its file id', async () => {
    await bot.handleUpdate(message({ voice: { file_id: 'voice-1', file_unique_id: 'u', duration: 3 } }));

    expect(received[0]!.event).toEqual({
      type: 'message',
      message: { messageId: 42, kind: 'voice', fileId: 'voice-1' },
    });
  });

  it('sends a photo with its caption and the largest size', async () => {
    await bot.handleUpdate(
      message({
        caption: 'Salom',
        photo: [
          { file_id: 'small', file_unique_id: 's', width: 90, height: 90 },
          { file_id: 'big', file_unique_id: 'b', width: 1280, height: 1280 },
        ],
      }),
    );

    expect(received[0]!.event).toEqual({
      type: 'message',
      message: { messageId: 42, kind: 'photo', text: 'Salom', fileId: 'big' },
    });
  });

  it('sends a button press and answers the callback query', async () => {
    await bot.handleUpdate({
      update_id: ++seq,
      callback_query: { id: 'cb1', from, chat_instance: 'x', data: 'lang:uz', message: { message_id: 5, date: 0, chat: privateChat } },
    } as unknown as Update);

    expect(received[0]!.event).toEqual({ type: 'callback', data: 'lang:uz' });
    expect(calls.map((c) => c.method)).toContain('answerCallbackQuery');
  });

  it('ignores messages outside private chats (e.g. the managers group)', async () => {
    await bot.handleUpdate(message({ text: 'hi' }, { id: -100123, type: 'supergroup', title: 'Managers' }));

    expect(received).toEqual([]);
  });
});

describe('server actions → Bot API calls', () => {
  it('sends text with inline buttons; Mini App buttons open the Mini App on the named screen', async () => {
    reply = [
      {
        type: 'send',
        chatId: '700000001',
        text: 'Salom',
        buttons: [
          [{ text: 'Menyu', startapp: '' }],
          [{ text: 'Yozilish', startapp: 'booking' }],
          [{ text: 'UZ', callbackData: 'lang:uz' }],
        ],
      },
    ];
    await bot.handleUpdate(message({ text: 'hi' }));

    expect(calls).toEqual([
      {
        method: 'sendMessage',
        payload: {
          chat_id: '700000001',
          text: 'Salom',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Menyu', web_app: { url: 'https://miniapp.example.com/' } }],
              [{ text: 'Yozilish', web_app: { url: 'https://miniapp.example.com/?startapp=booking' } }],
              [{ text: 'UZ', callback_data: 'lang:uz' }],
            ],
          },
        },
      },
    ]);
  });

  it('installs the persistent reply keyboard', async () => {
    reply = [{ type: 'send', chatId: '1', text: 'ok', keyboard: [['🔄 Qayta ishga tushirish']] }];
    await bot.handleUpdate(message({ text: 'hi' }));

    expect(calls[0]!.payload.reply_markup).toEqual({
      keyboard: [[{ text: '🔄 Qayta ishga tushirish' }]],
      is_persistent: true,
      resize_keyboard: true,
    });
  });

  it('sends a photo welcome with the text as caption', async () => {
    reply = [{ type: 'send', chatId: '1', text: 'Salom', media: { kind: 'photo', fileId: 'AgAC' } }];
    await bot.handleUpdate(message({ text: 'hi' }));

    expect(calls[0]).toMatchObject({ method: 'sendPhoto', payload: { chat_id: '1', photo: 'AgAC', caption: 'Salom' } });
  });

  it('copies a message to another chat', async () => {
    reply = [{ type: 'copy', chatId: '-100123', fromChatId: '700000001', messageId: 42 }];
    await bot.handleUpdate(message({ text: 'hi' }));

    expect(calls[0]).toEqual({
      method: 'copyMessage',
      payload: { chat_id: '-100123', from_chat_id: '700000001', message_id: 42 },
    });
  });

  it('apologises in the Mijoz language when the server is unreachable', async () => {
    bot = createBot({
      token: '123:TEST',
      miniAppUrl: MINIAPP_URL,
      botInfo: { id: 1, is_bot: true, first_name: 'YH', username: 'YangiHayot_test_bot' } as never,
      server: {
        async sendEvent() {
          throw new Error('ECONNREFUSED');
        },
      },
    });
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: payload as Record<string, unknown> });
      return { ok: true, result: true } as never;
    });
    await bot.handleUpdate(message({ text: 'hi' }));

    expect(calls[0]).toMatchObject({ method: 'sendMessage', payload: { chat_id: 700000001 } });
    expect(String(calls[0]!.payload.text)).toMatch(/qayta urinib/);
  });
});
