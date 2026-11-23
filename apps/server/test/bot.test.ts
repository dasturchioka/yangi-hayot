import type { BotUser } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/settings';
import { botEvent, labels, sends, text } from './support/bot';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', last_name: 'Karimov', username: 'aziz_k', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

describe('internal bot API auth', () => {
  it('rejects events without the bot secret', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/internal/bot/events',
      payload: { user: aziz, event: { type: 'start' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects events with a wrong bot secret', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/internal/bot/events',
      headers: { authorization: 'Bearer not-the-secret' },
      payload: { user: aziz, event: { type: 'start' } },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('/start', () => {
  it('asks a new Mijoz to choose the language first', async () => {
    const actions = await botEvent(t, aziz, { type: 'start' });

    expect(actions).toHaveLength(1);
    const [ask] = sends(actions);
    expect(ask!.chatId).toBe('700000001');
    expect(ask!.buttons).toEqual([
      [
        { text: '🇷🇺 Русский', callbackData: 'lang:ru' },
        { text: "🇺🇿 O'zbekcha", callbackData: 'lang:uz' },
      ],
    ]);
  });

  it('greets in the chosen language with the menu and booking buttons', async () => {
    await botEvent(t, aziz, { type: 'start' });
    const actions = sends(await botEvent(t, aziz, { type: 'callback', data: 'lang:uz' }));

    const welcome = actions.at(-1)!;
    expect(welcome.text).toContain('Yangi Hayot');
    expect(welcome.buttons).toEqual([
      [{ text: '📱 Menyuni ochish', startapp: '' }],
      [{ text: "📅 Ko'rishga yozilish", startapp: 'booking' }],
    ]);
    // the permanent restart button is installed in the same reply
    expect(actions.some((a) => a.keyboard?.flat().includes('🔄 Qayta ishga tushirish'))).toBe(true);
  });

  it('greets a returning Mijoz in the saved language without asking again', async () => {
    await botEvent(t, aziz, { type: 'start' });
    await botEvent(t, aziz, { type: 'callback', data: 'lang:ru' });

    const actions = sends(await botEvent(t, aziz, { type: 'start' }));

    expect(actions).toHaveLength(1);
    expect(labels(actions[0]!.buttons)).toEqual(['📱 Открыть меню', '📅 Записаться на просмотр']);
  });
});

/** What the Mini App sees for this user (GET /api/me with valid initData). */
async function me(user: BotUser, opts: { startParam?: string } = {}) {
  const res = await t.app.inject({
    method: 'GET',
    url: '/api/me',
    headers: tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam: opts.startParam })),
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('Manba (src_ deep links)', () => {
  it('records the src_ tag as both first and last Manba of a new Mijoz', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_instagram_nov' });

    expect((await me(aziz)).manba).toEqual({ first: 'instagram_nov', last: 'instagram_nov' });
  });

  it('keeps the first Manba and updates the last one on a later tagged visit', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_instagram_nov' });
    await botEvent(t, aziz, { type: 'start', payload: 'src_youtube_2' });

    expect((await me(aziz)).manba).toEqual({ first: 'instagram_nov', last: 'youtube_2' });
  });

  it("counts an untagged Mijoz as «Telegram (to'g'ridan-to'g'ri)»", async () => {
    await botEvent(t, aziz, { type: 'start' });

    expect((await me(aziz)).manba).toEqual({
      first: "Telegram (to'g'ridan-to'g'ri)",
      last: "Telegram (to'g'ridan-to'g'ri)",
    });
  });

  it('does not overwrite a tagged Manba with an untagged visit', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_fb' });
    await botEvent(t, aziz, { type: 'start' });

    expect((await me(aziz)).manba).toEqual({ first: 'fb', last: 'fb' });
  });

  it('accepts a 64-character tag of Latin letters, digits and _', async () => {
    const tag = 'src_' + 'A1_'.repeat(20); // 64 chars
    await botEvent(t, aziz, { type: 'start', payload: tag });

    expect((await me(aziz)).manba.first).toBe('A1_'.repeat(20));
  });

  it.each([
    ['too long', 'src_' + 'a'.repeat(61)],
    ['non-Latin', 'src_реклама'],
    ['dash', 'src_ig-nov'],
    ['empty name', 'src_'],
    ['not a source', 'pl_42'],
  ])('treats an invalid tag (%s) as untagged', async (_case, payload) => {
    await botEvent(t, aziz, { type: 'start', payload });

    expect((await me(aziz)).manba.first).toBe("Telegram (to'g'ridan-to'g'ri)");
  });
});

describe('Mini App and bot share the Mijoz', () => {
  it('shows in the Mini App the language chosen and the Manba recorded in the bot', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_tiktok' });
    await botEvent(t, aziz, { type: 'callback', data: 'lang:ru' }); // Telegram is in Uzbek, Mijoz picked RU

    expect(await me(aziz)).toEqual({
      mijoz: { telegramId: '700000001', name: 'Aziz Karimov', lang: 'ru' },
      manba: { first: 'tiktok', last: 'tiktok' },
    });
  });

  it('records a src_ start parameter of the Mini App as the last Manba', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_tiktok' });
    await me(aziz, { startParam: 'src_banner' });

    expect((await me(aziz)).manba).toEqual({ first: 'tiktok', last: 'banner' });
  });

  it('asks a Mijoz who first opened the Mini App to choose the language on /start', async () => {
    await me(aziz);
    const [ask] = sends(await botEvent(t, aziz, { type: 'start' }));

    expect(labels(ask!.buttons)).toEqual(['🇷🇺 Русский', "🇺🇿 O'zbekcha"]);
  });
});

const admin = { id: 500000001, first_name: 'Admin', language_code: 'ru' };
const olga = { id: 700000002, first_name: 'Ольга', language_code: 'ru' };

/** A new Mijoz's /start + language choice; returns the welcome message they get. */
async function welcomeSeenBy(user: BotUser, lang: 'ru' | 'uz') {
  await botEvent(t, user, { type: 'start' });
  return sends(await botEvent(t, user, { type: 'callback', data: `lang:${lang}` })).at(-1)!;
}

describe('/welcome (administrators change the welcome without code)', () => {
  beforeEach(async () => {
    await setSetting(t.db, 'admins', [String(admin.id)], t.clock.now());
  });

  it('lets an administrator set RU and UZ welcome; a new Mijoz sees it in their language with buttons', async () => {
    await botEvent(t, admin, { type: 'command', name: 'welcome' });
    await botEvent(t, admin, text('Добро пожаловать в Yangi Hayot! Скидка 10% до конца месяца.'));
    await botEvent(t, admin, {
      type: 'message',
      message: { messageId: 2, kind: 'photo', fileId: 'AgAC-photo', text: "Yangi Hayot'ga xush kelibsiz! Oy oxirigacha 10% chegirma." },
    });

    const uz = await welcomeSeenBy(aziz, 'uz');
    expect(uz.text).toBe("Yangi Hayot'ga xush kelibsiz! Oy oxirigacha 10% chegirma.");
    expect(uz.media).toEqual({ kind: 'photo', fileId: 'AgAC-photo' });
    expect(labels(uz.buttons)).toEqual(['📱 Menyuni ochish', "📅 Ko'rishga yozilish"]);

    const ru = await welcomeSeenBy(olga, 'ru');
    expect(ru.text).toBe('Добро пожаловать в Yangi Hayot! Скидка 10% до конца месяца.');
    expect(ru.media).toBeUndefined();
    expect(labels(ru.buttons)).toEqual(['📱 Открыть меню', '📅 Записаться на просмотр']);
  });

  it('shows the administrator a preview once saved', async () => {
    await botEvent(t, admin, { type: 'command', name: 'welcome' });
    await botEvent(t, admin, text('RU текст'));
    const actions = sends(await botEvent(t, admin, text('UZ matn')));

    expect(actions.at(-1)!.text).toBe('RU текст');
    expect(actions.every((a) => a.chatId === String(admin.id))).toBe(true);
  });

  it('asks again when the administrator sends something without text', async () => {
    await botEvent(t, admin, { type: 'command', name: 'welcome' });
    await botEvent(t, admin, { type: 'message', message: { messageId: 3, kind: 'voice', fileId: 'voice-1' } });
    await botEvent(t, admin, text('RU текст'));
    await botEvent(t, admin, text('UZ matn'));

    expect((await welcomeSeenBy(olga, 'ru')).text).toBe('RU текст');
  });

  it('ignores /welcome from a Mijoz who is not in the administrators list', async () => {
    await botEvent(t, aziz, { type: 'command', name: 'welcome' });
    await botEvent(t, aziz, text('Hacked welcome'));
    await botEvent(t, aziz, text('Hacked welcome 2'));

    expect((await welcomeSeenBy(olga, 'ru')).text).not.toContain('Hacked');
  });

  it('takes the administrators list from settings', async () => {
    await setSetting(t.db, 'admins', [String(admin.id), String(aziz.id)], t.clock.now());
    await botEvent(t, aziz, { type: 'command', name: 'welcome' });
    await botEvent(t, aziz, text('RU from Aziz'));
    await botEvent(t, aziz, text('UZ from Aziz'));

    expect((await welcomeSeenBy(olga, 'ru')).text).toBe('RU from Aziz');
  });
});

describe('/restart and the permanent restart button', () => {
  beforeEach(async () => {
    await setSetting(t.db, 'admins', [String(admin.id)], t.clock.now());
  });

  it('clears an unfinished step and shows the welcome and menu', async () => {
    await botEvent(t, admin, { type: 'start' });
    await botEvent(t, admin, { type: 'callback', data: 'lang:ru' });
    await botEvent(t, admin, { type: 'command', name: 'welcome' });

    const actions = sends(await botEvent(t, admin, { type: 'command', name: 'restart' }));
    await botEvent(t, admin, text('this must not become the welcome'));

    expect(labels(actions.at(-1)!.buttons)).toEqual(['📱 Открыть меню', '📅 Записаться на просмотр']);
    expect(actions.some((a) => a.keyboard?.flat().includes('🔄 Перезапустить'))).toBe(true);
    expect((await welcomeSeenBy(olga, 'ru')).text).not.toContain('must not');
  });

  it('keeps the language and Manba', async () => {
    await botEvent(t, aziz, { type: 'start', payload: 'src_ig' });
    await botEvent(t, aziz, { type: 'callback', data: 'lang:uz' });
    await botEvent(t, aziz, { type: 'start', payload: 'src_fb' });

    const actions = sends(await botEvent(t, aziz, { type: 'command', name: 'restart' }));

    expect(labels(actions.at(-1)!.buttons)).toEqual(['📱 Menyuni ochish', "📅 Ko'rishga yozilish"]);
    expect(await me(aziz)).toMatchObject({ mijoz: { lang: 'uz' }, manba: { first: 'ig', last: 'fb' } });
  });

  it.each([['🔄 Перезапустить'], ['🔄 Qayta ishga tushirish']])(
    'treats the «%s» button like /restart',
    async (label) => {
      await botEvent(t, admin, { type: 'start' });
      await botEvent(t, admin, { type: 'callback', data: 'lang:ru' });
      await botEvent(t, admin, { type: 'command', name: 'welcome' });

      const actions = sends(await botEvent(t, admin, text(label)));
      await botEvent(t, admin, text('this must not become the welcome'));

      expect(labels(actions.at(-1)!.buttons)).toEqual(['📱 Открыть меню', '📅 Записаться на просмотр']);
      expect((await welcomeSeenBy(olga, 'ru')).text).not.toContain('must not');
    },
  );

  it('asks for the language if the Mijoz never chose one', async () => {
    const [ask] = sends(await botEvent(t, aziz, { type: 'command', name: 'restart' }));

    expect(labels(ask!.buttons)).toEqual(['🇷🇺 Русский', "🇺🇿 O'zbekcha"]);
  });
});

describe('text and voice messages (until the AI manager is connected)', () => {
  const GROUP = '-1001234567890';

  beforeEach(async () => {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
    await botEvent(t, aziz, { type: 'start', payload: 'src_ig' });
    await botEvent(t, aziz, { type: 'callback', data: 'lang:uz' });
  });

  it('answers with «Menyuni ochish» and «Ariza qoldirish» in the Mijoz language', async () => {
    const actions = await botEvent(t, aziz, text('Narxlar qancha?', 11));

    const reply = sends(actions).find((a) => a.chatId === String(aziz.id))!;
    expect(reply.buttons).toEqual([
      [{ text: '📱 Menyuni ochish', startapp: '' }],
      [{ text: '📝 Ariza qoldirish', startapp: 'ariza' }],
    ]);
  });

  it('sends the message to the managers group with who wrote it', async () => {
    const actions = await botEvent(t, aziz, text('Narxlar qancha?', 11));

    const toGroup = actions.filter((a) => a.chatId === GROUP);
    expect(toGroup).toHaveLength(2);
    const [header, copy] = toGroup;
    expect(header).toMatchObject({ type: 'send' });
    const headerText = (header as { text: string }).text;
    for (const part of ['Aziz Karimov', '@aziz_k', '700000001', 'ig']) expect(headerText).toContain(part);
    expect(copy).toEqual({ type: 'copy', chatId: GROUP, fromChatId: '700000001', messageId: 11 });
  });

  it('forwards a voice message the same way', async () => {
    const actions = await botEvent(t, aziz, {
      type: 'message',
      message: { messageId: 12, kind: 'voice', fileId: 'voice-xyz' },
    });

    expect(actions).toContainEqual({ type: 'copy', chatId: GROUP, fromChatId: '700000001', messageId: 12 });
    expect(sends(actions).some((a) => a.chatId === String(aziz.id))).toBe(true);
  });

  it('still answers the Mijoz when no managers group is configured', async () => {
    await setSetting(t.db, 'managersGroupId', null, t.clock.now());
    const actions = await botEvent(t, aziz, text('Salom', 13));

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'send', chatId: '700000001' });
  });
});
