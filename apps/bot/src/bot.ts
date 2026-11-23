import type { BotAction, BotButton, BotEvent, BotEventRequest } from '@yh/shared';
import { Bot, type Api, type Context } from 'grammy';
import type { InlineKeyboardButton, UserFromGetMe } from 'grammy/types';
import type { ServerClient } from './server-client';

/**
 * Thin Telegram adapter. Every update in a private chat becomes one BotEvent
 * for the server (`POST /internal/bot/events`); the returned BotActions are
 * executed in order. No business logic here: texts, Manba, language, admin
 * rights and steps all live in apps/server (src/bot/bot.ts).
 *
 * To port legacy behaviour, add it on the server as a new event/command
 * branch; touch this file only for a new kind of Telegram update or action.
 */
export function createBot(opts: {
  token: string;
  server: ServerClient;
  miniAppUrl: string;
  /** Pass in tests to skip getMe. */
  botInfo?: UserFromGetMe;
}) {
  const bot = new Bot(opts.token, opts.botInfo ? { botInfo: opts.botInfo } : {});

  // Only private chats with a Mijoz; the managers group etc. are ignored.
  bot.chatType('private').on(['message', 'callback_query:data'], async (ctx) => {
    const event = toBotEvent(ctx);
    if (!event || !ctx.from) return;
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});

    const { id, first_name, last_name, username, language_code } = ctx.from;
    const request: BotEventRequest = { user: { id, first_name, last_name, username, language_code }, event };
    let actions: BotAction[];
    try {
      actions = await opts.server.sendEvent(request);
    } catch (err) {
      console.error('server unreachable', err);
      await ctx.api.sendMessage(ctx.from.id, apology(language_code)).catch(() => {});
      return;
    }
    await executeActions(ctx.api, actions, opts.miniAppUrl);
  });

  bot.catch((err) => console.error('bot error', err.error));
  return bot;
}

/** Translates a Telegram update into the server event, or null if not handled. */
export function toBotEvent(ctx: Context): BotEvent | null {
  const data = ctx.callbackQuery?.data;
  if (data !== undefined) return { type: 'callback', data };

  const msg = ctx.message;
  if (!msg) return null;

  const command = /^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s+(\S+))?/.exec(msg.text ?? '');
  if (command && msg.entities?.[0]?.type === 'bot_command' && msg.entities[0].offset === 0) {
    const name = command[1]!.toLowerCase();
    if (name === 'start') return command[2] ? { type: 'start', payload: command[2] } : { type: 'start' };
    return { type: 'command', name };
  }

  const text = msg.text ?? msg.caption;
  const base = { messageId: msg.message_id, ...(text !== undefined ? { text } : {}) };
  if (msg.text !== undefined) return { type: 'message', message: { ...base, kind: 'text' } };
  if (msg.voice) return { type: 'message', message: { ...base, kind: 'voice', fileId: msg.voice.file_id } };
  if (msg.photo) return { type: 'message', message: { ...base, kind: 'photo', fileId: msg.photo.at(-1)!.file_id } };
  if (msg.video) return { type: 'message', message: { ...base, kind: 'video', fileId: msg.video.file_id } };
  return { type: 'message', message: { ...base, kind: 'other' } };
}

/** Executes server actions in order. A failed action is logged and does not stop the rest. */
export async function executeActions(api: Api, actions: BotAction[], miniAppUrl: string): Promise<void> {
  for (const action of actions) {
    try {
      await executeAction(api, action, miniAppUrl);
    } catch (err) {
      console.error('bot action failed', action.type, err);
    }
  }
}

async function executeAction(api: Api, action: BotAction, miniAppUrl: string): Promise<void> {
  if (action.type === 'copy') {
    await api.copyMessage(action.chatId, action.fromChatId, action.messageId);
    return;
  }
  const reply_markup = action.buttons
    ? { inline_keyboard: action.buttons.map((row) => row.map((b) => inlineButton(b, miniAppUrl))) }
    : action.keyboard
      ? {
          keyboard: action.keyboard.map((row) => row.map((text) => ({ text }))),
          is_persistent: true,
          resize_keyboard: true,
        }
      : undefined;
  const extra = reply_markup ? { reply_markup } : {};

  if (action.media?.kind === 'photo') {
    await api.sendPhoto(action.chatId, action.media.fileId, { caption: action.text, ...extra });
  } else if (action.media?.kind === 'video') {
    await api.sendVideo(action.chatId, action.media.fileId, { caption: action.text, ...extra });
  } else {
    await api.sendMessage(action.chatId, action.text, extra);
  }
}

function inlineButton(b: BotButton, miniAppUrl: string): InlineKeyboardButton {
  if ('callbackData' in b) return { text: b.text, callback_data: b.callbackData };
  if ('url' in b) return { text: b.text, url: b.url };
  const url = new URL(miniAppUrl);
  if (b.startapp) url.searchParams.set('startapp', b.startapp);
  return { text: b.text, web_app: { url: url.toString() } };
}

function apology(languageCode: string | undefined): string {
  return languageCode?.startsWith('uz')
    ? "Uzr, texnik nosozlik. Birozdan keyin qayta urinib ko'ring 🙏"
    : 'Извините, технический сбой. Попробуйте ещё раз через минуту 🙏 / Birozdan keyin qayta urinib ko‘ring';
}
