import type { BotAction, BotButton, BotIncomingMessage } from '@yh/shared';
import type pg from 'pg';
import { setBotStep, type MijozRecord } from '../mijoz/mijoz';
import {
  AUDIENCES,
  cancelDraft,
  confirmRassilka,
  contentTooLong,
  countAudience,
  MAX_CAPTION,
  MAX_TEXT,
  createDraft,
  type Audience,
  type RassilkaButton,
  type RassilkaContent,
} from '../rassilka/rassilka';
import { fill, texts, type Texts } from './texts';

/**
 * /broadcast (administrators only): content → optional button → audience →
 * preview + «N ta qabul qiluvchiga yuborilsinmi?» → confirm. The unfinished
 * steps live in `mijoz.bot_step` (cleared by /restart); the draft becomes a
 * `rassilka` row at the audience step, confirmed by `bc:send:<id>`.
 */

const AUDIENCE_STEP = 'broadcast_audience';

interface BcCtx {
  db: pg.Pool;
  mijoz: MijozRecord;
  now: Date;
}

export function isBroadcastStep(step: string | null): boolean {
  return step === 'broadcast_content' || step === 'broadcast_button' || step === AUDIENCE_STEP;
}

export async function beginBroadcast(ctx: BcCtx): Promise<BotAction[]> {
  await setBotStep(ctx.db, ctx.mijoz.telegramId, 'broadcast_content', {}, ctx.now);
  return [send(ctx, texts(ctx.mijoz.lang).bcAskContent)];
}

export async function continueBroadcast(ctx: BcCtx, message: BotIncomingMessage): Promise<BotAction[]> {
  const t = texts(ctx.mijoz.lang);
  const chatId = ctx.mijoz.telegramId;

  if (ctx.mijoz.botStep === 'broadcast_content') {
    const text = message.text?.trim();
    if (!text) return [send(ctx, t.bcNeedText)];
    const content: RassilkaContent =
      (message.kind === 'photo' || message.kind === 'video') && message.fileId
        ? { text, media: { kind: message.kind, fileId: message.fileId } }
        : { text };
    if (contentTooLong(content)) {
      return [send(ctx, fill(t.bcTooLong, { max: content.media ? MAX_CAPTION : MAX_TEXT }))];
    }
    await setBotStep(ctx.db, chatId, 'broadcast_button', { content }, ctx.now);
    return [{ ...send(ctx, t.bcAskButton), buttons: [[{ text: t.btnNoButton, callbackData: 'bc:nobutton' }]] }];
  }

  if (ctx.mijoz.botStep === 'broadcast_button') {
    const button = message.kind === 'text' ? parseButton(message.text ?? '') : null;
    if (!button) return [send(ctx, t.bcBadButton)];
    return askAudience(ctx, { ...draftContent(ctx), button });
  }

  // Audience step: expects a button press.
  return [await audienceQuestion(ctx, t)];
}

/** `bc:*` callbacks; the caller has checked the Mijoz is an administrator. */
export async function onBroadcastCallback(ctx: BcCtx, data: string): Promise<BotAction[]> {
  const t = texts(ctx.mijoz.lang);
  if (data === 'bc:nobutton' && ctx.mijoz.botStep === 'broadcast_button') {
    return askAudience(ctx, draftContent(ctx));
  }

  const aud = /^bc:aud:(\w+)$/.exec(data)?.[1] as Audience | undefined;
  if (aud && AUDIENCES.includes(aud) && ctx.mijoz.botStep === AUDIENCE_STEP) {
    const n = await countAudience(ctx.db, aud);
    if (n === 0) return [send(ctx, t.bcEmptyAudience), await audienceQuestion(ctx, t)];
    const content = draftContent(ctx);
    const draft = await createDraft(ctx.db, { audience: aud, content, createdBy: ctx.mijoz.telegramId }, ctx.now);
    await setBotStep(ctx.db, ctx.mijoz.telegramId, null, null, ctx.now);
    return [
      // The preview is exactly what recipients get.
      {
        ...send(ctx, content.text),
        ...(content.media ? { media: content.media } : {}),
        ...(content.button ? { buttons: [[content.button]] } : {}),
      },
      send(ctx, t.bcPreview),
      {
        ...send(ctx, fill(t.bcConfirm, { n })),
        buttons: [
          [
            { text: t.btnSend, callbackData: `bc:send:${draft.id}` },
            { text: t.btnCancel, callbackData: `bc:cancel:${draft.id}` },
          ],
        ],
      },
    ];
  }

  const sendId = /^bc:send:(\d+)$/.exec(data)?.[1];
  if (sendId) {
    const res = await confirmRassilka(ctx.db, sendId, ctx.now);
    return [send(ctx, res.ok ? fill(t.bcQueued, { id: sendId }) : t.bcNotDraft)];
  }

  const cancelId = /^bc:cancel:(\d+)$/.exec(data)?.[1];
  if (cancelId) {
    return [send(ctx, (await cancelDraft(ctx.db, cancelId)) ? t.bcCancelled : t.bcNotDraft)];
  }
  return [];
}

async function askAudience(ctx: BcCtx, content: RassilkaContent): Promise<BotAction[]> {
  await setBotStep(ctx.db, ctx.mijoz.telegramId, AUDIENCE_STEP, { content }, ctx.now);
  return [await audienceQuestion(ctx, texts(ctx.mijoz.lang))];
}

async function audienceQuestion(ctx: BcCtx, t: Texts): Promise<BotAction> {
  const label: Record<Audience, string> = {
    all: t.audAll,
    ru: t.audRu,
    uz: t.audUz,
    toshkent: t.audToshkent,
    navoiy: t.audNavoiy,
  };
  const buttons: BotButton[][] = [];
  for (const a of AUDIENCES) {
    buttons.push([{ text: `${label[a]} (${await countAudience(ctx.db, a)})`, callbackData: `bc:aud:${a}` }]);
  }
  return { ...send(ctx, t.bcAskAudience), buttons };
}

function draftContent(ctx: BcCtx): RassilkaContent {
  return (ctx.mijoz.botStepData as { content: RassilkaContent }).content;
}

function send(ctx: BcCtx, text: string): Extract<BotAction, { type: 'send' }> {
  return { type: 'send', chatId: ctx.mijoz.telegramId, text };
}

/**
 * «Matn | https://…» → link button; «Matn | app» or «Matn | app:<screen>» →
 * Mini App button (startapp '' = home). Anything else → null.
 */
export function parseButton(input: string): RassilkaButton | null {
  const m = /^(.+?)\s*\|\s*(\S+)\s*$/s.exec(input.trim());
  if (!m) return null;
  const text = m[1]!.trim();
  const target = m[2]!;
  if (!text || text.length > 64) return null;
  const app = /^app(?::([A-Za-z0-9_-]{1,64}))?$/.exec(target);
  if (app) return { text, startapp: app[1] ?? '' };
  if (/^https?:\/\/[^\s]+$/.test(target) && URL.canParse(target)) return { text, url: target };
  return null;
}
