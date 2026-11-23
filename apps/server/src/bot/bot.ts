import { LANGS, type BotAction, type BotEvent, type BotIncomingMessage, type BotUser, type Lang } from '@yh/shared';
import type pg from 'pg';
import { toTashkent, type Clock } from '../clock';
import { kunlikHisobot, kunlikMatn } from '../hisobot/hisobot';
import { botKirdi } from '../hodisa/hodisa';
import { DOJIM_STOP_CALLBACK, toxtatDojim } from '../dojim/dojim';
import { manbaFromStartParam } from '../mijoz/manba';
import { chooseLang, ensureMijoz, markBotUnblocked, setBotStep, type MijozRecord } from '../mijoz/mijoz';
import { getSetting, isAdmin, setSetting, type WelcomeContent } from '../settings/settings';
import { taklifVisit } from '../taklif/taklif';
import { beginBroadcast, continueBroadcast, isBroadcastStep, onBroadcastCallback } from './broadcast';
import { texts } from './texts';

export interface BotDeps {
  db: pg.Pool;
  clock: Clock;
}

interface Ctx {
  deps: BotDeps;
  mijoz: MijozRecord;
  now: Date;
}

/**
 * Decides how the bot reacts to one event from a Mijoz in the private chat.
 * Records the Mijoz (and the Manba of `/start src_…`) on every event.
 */
export async function handleBotEvent(deps: BotDeps, user: BotUser, event: BotEvent): Promise<BotAction[]> {
  const now = deps.clock.now();
  const taklif = event.type === 'start' ? await taklifVisit(deps.db, event.payload, String(user.id)) : null;
  const manba = taklif ? taklif.manba : event.type === 'start' ? manbaFromStartParam(event.payload) : null;
  const mijoz = await ensureMijoz(deps.db, user, now, { manba, taklifQilganId: taklif?.taklifQilganId });
  // Any update from the Mijoz means the bot can reach them again.
  if (mijoz.botBlocked) await markBotUnblocked(deps.db, mijoz.telegramId);
  const ctx: Ctx = { deps, mijoz, now };

  switch (event.type) {
    case 'start':
      await botKirdi(deps.db, mijoz.telegramId, now);
      return mijoz.langChosen ? welcome(ctx, mijoz.lang) : [askLang(mijoz)];
    case 'callback':
      return onCallback(ctx, event.data);
    case 'command':
      return onCommand(ctx, event.name);
    case 'message':
      return onMessage(ctx, event.message);
  }
}

async function onCommand(ctx: Ctx, name: string): Promise<BotAction[]> {
  switch (name) {
    case 'restart':
      return restart(ctx);
    case 'welcome':
      if (await isAdmin(ctx.deps.db, ctx.mijoz.telegramId)) return beginWelcomeEdit(ctx);
      return [fallbackReply(ctx)];
    case 'broadcast':
      if (await isAdmin(ctx.deps.db, ctx.mijoz.telegramId)) return beginBroadcast(bcCtx(ctx));
      return [fallbackReply(ctx)];
    case 'report':
      if (await isAdmin(ctx.deps.db, ctx.mijoz.telegramId)) {
        const sana = toTashkent(ctx.now).date;
        return [{ type: 'send', chatId: ctx.mijoz.telegramId, text: kunlikMatn(await kunlikHisobot(ctx.deps.db, sana)) }];
      }
      return [fallbackReply(ctx)];
    default:
      return [fallbackReply(ctx)];
  }
}

async function onMessage(ctx: Ctx, message: BotIncomingMessage): Promise<BotAction[]> {
  if (message.kind === 'text' && RESTART_LABELS.includes(message.text ?? '')) return restart(ctx);
  if (ctx.mijoz.botStep === WELCOME_STEP_RU || ctx.mijoz.botStep === WELCOME_STEP_UZ) {
    return continueWelcomeEdit(ctx, message);
  }
  if (isBroadcastStep(ctx.mijoz.botStep) && (await isAdmin(ctx.deps.db, ctx.mijoz.telegramId))) {
    return continueBroadcast(bcCtx(ctx), message);
  }
  return [fallbackReply(ctx), ...(await toManagersGroup(ctx, message))];
}

const RESTART_LABELS = LANGS.map((l) => texts(l).btnRestart);

/** /restart: forget unfinished steps (and, later, the AI dialog); keep contact, language, Manba, Arizalar. */
async function restart(ctx: Ctx): Promise<BotAction[]> {
  await setBotStep(ctx.deps.db, ctx.mijoz.telegramId, null, null, ctx.now);
  if (!ctx.mijoz.langChosen) return [askLang(ctx.mijoz)];
  const lang = ctx.mijoz.lang;
  return [
    { type: 'send', chatId: ctx.mijoz.telegramId, text: texts(lang).restarted, keyboard: restartKeyboard(lang) },
    ...(await welcome(ctx, lang)),
  ];
}

/** Reply to a message the bot cannot answer yet (until the AI manager, 9-b.). */
function fallbackReply(ctx: Ctx): BotAction {
  const t = texts(ctx.mijoz.lang);
  return {
    type: 'send',
    chatId: ctx.mijoz.telegramId,
    text: t.fallback,
    buttons: [[{ text: t.btnMenu, startapp: '' }], [{ text: t.btnAriza, startapp: 'ariza' }]],
  };
}

/** Header with who wrote + a copy of the message, to the managers group (if configured). */
async function toManagersGroup(ctx: Ctx, message: BotIncomingMessage): Promise<BotAction[]> {
  const groupId = await getSetting(ctx.deps.db, 'managersGroupId');
  if (!groupId) return [];
  const m = ctx.mijoz;
  const who = [m.name, m.username ? `@${m.username}` : null, `ID ${m.telegramId}`].filter(Boolean).join(' · ');
  const header =
    `💬 Mijoz xabari: ${who}\n` +
    `Til: ${m.lang.toUpperCase()} · Manba: ${m.firstManba}` +
    (m.lastManba !== m.firstManba ? ` → ${m.lastManba}` : '');
  return [
    { type: 'send', chatId: groupId, text: header },
    { type: 'copy', chatId: groupId, fromChatId: m.telegramId, messageId: message.messageId },
  ];
}

const WELCOME_STEP_RU = 'welcome_ru';
const WELCOME_STEP_UZ = 'welcome_uz';

async function beginWelcomeEdit(ctx: Ctx): Promise<BotAction[]> {
  await setBotStep(ctx.deps.db, ctx.mijoz.telegramId, WELCOME_STEP_RU, {}, ctx.now);
  return [{ type: 'send', chatId: ctx.mijoz.telegramId, text: texts(ctx.mijoz.lang).welcomeAskRu }];
}

async function continueWelcomeEdit(ctx: Ctx, message: BotIncomingMessage): Promise<BotAction[]> {
  const { db } = ctx.deps;
  const t = texts(ctx.mijoz.lang);
  const chatId = ctx.mijoz.telegramId;
  const text = message.text?.trim();
  if (!text) return [{ type: 'send', chatId, text: t.welcomeNeedText }];

  const media =
    (message.kind === 'photo' || message.kind === 'video') && message.fileId
      ? { kind: message.kind, fileId: message.fileId }
      : undefined;
  const part = media ? { text, media } : { text };

  if (ctx.mijoz.botStep === WELCOME_STEP_RU) {
    await setBotStep(db, chatId, WELCOME_STEP_UZ, { ru: part }, ctx.now);
    return [{ type: 'send', chatId, text: t.welcomeAskUz }];
  }

  const draft = ctx.mijoz.botStepData as { ru: WelcomeContent['ru'] };
  await setSetting(db, 'welcome', { ru: draft.ru, uz: part }, ctx.now);
  await setBotStep(db, chatId, null, null, ctx.now);
  return [{ type: 'send', chatId, text: t.welcomeSaved }, ...(await welcome(ctx, ctx.mijoz.lang))];
}

function bcCtx(ctx: Ctx) {
  return { db: ctx.deps.db, mijoz: ctx.mijoz, now: ctx.now };
}

async function onCallback(ctx: Ctx, data: string): Promise<BotAction[]> {
  if (data.startsWith('bc:')) {
    return (await isAdmin(ctx.deps.db, ctx.mijoz.telegramId)) ? onBroadcastCallback(bcCtx(ctx), data) : [];
  }
  if (data === DOJIM_STOP_CALLBACK) {
    await toxtatDojim(ctx.deps.db, ctx.mijoz.telegramId, ctx.now);
    const t = texts(ctx.mijoz.lang);
    return [{ type: 'send', chatId: ctx.mijoz.telegramId, text: t.dojimStopped, buttons: [[{ text: t.btnMenu, startapp: '' }]] }];
  }
  const lang = /^lang:(\w+)$/.exec(data)?.[1] as Lang | undefined;
  if (lang && LANGS.includes(lang)) {
    await chooseLang(ctx.deps.db, ctx.mijoz.telegramId, lang, ctx.now);
    return [
      { type: 'send', chatId: ctx.mijoz.telegramId, text: texts(lang).langSaved, keyboard: restartKeyboard(lang) },
      ...(await welcome(ctx, lang)),
    ];
  }
  return [];
}

function askLang(mijoz: MijozRecord): BotAction {
  return {
    type: 'send',
    chatId: mijoz.telegramId,
    text: texts(mijoz.lang).chooseLang,
    buttons: [
      [
        { text: '🇷🇺 Русский', callbackData: 'lang:ru' },
        { text: "🇺🇿 O'zbekcha", callbackData: 'lang:uz' },
      ],
    ],
  };
}

function restartKeyboard(lang: Lang): string[][] {
  return [[texts(lang).btnRestart]];
}

/** The welcome message (salomlashish) in `lang`, as set with /welcome. */
async function welcome(ctx: Ctx, lang: Lang, chatId = ctx.mijoz.telegramId): Promise<BotAction[]> {
  const t = texts(lang);
  const custom = (await getSetting(ctx.deps.db, 'welcome'))?.[lang];
  return [
    {
      type: 'send',
      chatId,
      text: custom?.text ?? t.defaultWelcome,
      ...(custom?.media ? { media: custom.media } : {}),
      buttons: [[{ text: t.btnMenu, startapp: '' }], [{ text: t.btnBooking, startapp: 'booking' }]],
    },
  ];
}
