import type { BotEvent, BotUser } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Messenger } from '../src/adapters/messenger/messenger';
import { recordShaharQiziqish } from '../src/mijoz/shahar-qiziqish';
import { drainRassilkaQueue, recoverRassilkaQueue } from '../src/rassilka/worker';
import { setSetting } from '../src/settings/settings';
import { botEvent, sends, text } from './support/bot';
import { createTestApp, type TestApp } from './support/test-app';

const admin: BotUser = { id: 700000099, first_name: 'Admin', language_code: 'uz' };
const adminId = String(admin.id);

let t: TestApp;
let nextId = 710000000;
beforeEach(async () => {
  t = await createTestApp();
  await setSetting(t.db, 'admins', [adminId], t.clock.now());
  await joinBot(admin, 'uz');
});
afterEach(async () => {
  await t.close();
});

/** A Mijoz who started the bot and chose a language. */
async function joinBot(user: BotUser, lang: 'ru' | 'uz') {
  await botEvent(t, user, { type: 'start' });
  await botEvent(t, user, { type: 'callback', data: `lang:${lang}` });
  return String(user.id);
}

async function newMijoz(lang: 'ru' | 'uz' = 'ru') {
  return joinBot({ id: ++nextId, first_name: `M${nextId}` }, lang);
}

const sleep = async (ms: number) => t.clock.advance({ seconds: ms / 1000 });

/** Runs the queue to the end (what the server's worker does); waiting moves the fake clock. */
async function drain(messenger: Messenger = t.messenger) {
  await drainRassilkaQueue({ ...t, messenger }, { sleep });
}

/** Admin goes through /broadcast up to «N ta qabul qiluvchiga yuborilsinmi?». */
async function prepare(opts: { content?: BotEvent; button?: string; audience?: string } = {}) {
  await botEvent(t, admin, { type: 'command', name: 'broadcast' });
  await botEvent(t, admin, opts.content ?? text('Aksiya! -10%'));
  if (opts.button) await botEvent(t, admin, text(opts.button));
  else await botEvent(t, admin, { type: 'callback', data: 'bc:nobutton' });
  const actions = sends(await botEvent(t, admin, { type: 'callback', data: `bc:aud:${opts.audience ?? 'all'}` }));
  const ask = actions.at(-1)!;
  const data = (ask.buttons ?? []).flat().map((b) => ('callbackData' in b ? b.callbackData : ''));
  return {
    actions,
    ask: ask.text,
    send: data.find((d) => d.startsWith('bc:send:')) ?? 'bc:send:none',
    cancel: data.find((d) => d.startsWith('bc:cancel:')) ?? 'bc:cancel:none',
  };
}

/** /broadcast to `audience`, confirmed and fully sent; returns the report the admin got. */
async function broadcast(audience: string, message: string) {
  const { send } = await prepare({ audience, content: text(message) });
  await botEvent(t, admin, { type: 'callback', data: send });
  await drain();
  return lastToAdmin();
}

function lastToAdmin() {
  return t.messenger.deliveredTo(adminId).at(-1)?.text ?? '';
}

/** Chats that were sent (attempted) `message`. */
function receivers(message: string) {
  return t.messenger.sent.filter((s) => s.message.text === message).map((s) => s.message.chatId);
}

describe('/broadcast in the bot', () => {
  it('sends the confirmed text to every Mijoz', async () => {
    const a = await newMijoz('ru');
    const b = await newMijoz('uz');

    const { ask, send } = await prepare();
    expect(ask).toBe('3 ta qabul qiluvchiga yuborilsinmi?'); // a, b and the admin
    const queued = sends(await botEvent(t, admin, { type: 'callback', data: send }));
    expect(queued[0]!.text).toContain('boshlandi');
    await drain();

    for (const chatId of [a, b, adminId]) {
      expect(t.messenger.deliveredTo(chatId).map((m) => m.text)).toContain('Aksiya! -10%');
    }
  });

  it('is for administrators only', async () => {
    const m = await newMijoz('uz');
    const user = { id: Number(m), first_name: 'X' };

    const reply = sends(await botEvent(t, user, { type: 'command', name: 'broadcast' }));
    expect(reply[0]!.text).toContain('Rahmat'); // the ordinary fallback reply
    await botEvent(t, user, text('Spam'));
    expect(await botEvent(t, user, { type: 'callback', data: 'bc:aud:all' })).toEqual([]);

    const { send } = await prepare();
    expect(await botEvent(t, user, { type: 'callback', data: send })).toEqual([]);
    await drain();
    expect(receivers('Spam')).toEqual([]);
    expect(receivers('Aksiya! -10%')).toEqual([]); // the admin never confirmed
  });

  it('/restart abandons an unfinished /broadcast', async () => {
    await botEvent(t, admin, { type: 'command', name: 'broadcast' });
    await botEvent(t, admin, { type: 'command', name: 'restart' });
    const reply = sends(await botEvent(t, admin, text('Salom')));
    expect(reply[0]!.text).toContain('Rahmat');
  });
});

describe('preview and confirmation', () => {
  it('previews photo, caption and button exactly as recipients get them', async () => {
    const m = await newMijoz('ru');
    const { actions, send } = await prepare({
      content: { type: 'message', message: { messageId: 5, kind: 'photo', text: 'Yangi blok', fileId: 'PHOTO1' } },
      button: "Ko'rish | app:booking",
    });

    const expected = {
      text: 'Yangi blok',
      media: { kind: 'photo', fileId: 'PHOTO1' },
      buttons: [[{ text: "Ko'rish", startapp: 'booking' }]],
    };
    expect(actions[0]).toMatchObject({ chatId: adminId, ...expected });

    await botEvent(t, admin, { type: 'callback', data: send });
    await drain();
    expect(t.messenger.deliveredTo(m)).toEqual([{ chatId: m, ...expected }]);
  });

  it('accepts a link button, rejects a malformed one, and shows audience sizes', async () => {
    await newMijoz('ru');
    await botEvent(t, admin, { type: 'command', name: 'broadcast' });
    await botEvent(t, admin, text('Matn'));
    const bad = sends(await botEvent(t, admin, text('just text')));
    expect(bad[0]!.text).toContain('Format');

    const audience = sends(await botEvent(t, admin, text('Sayt | https://yangihayot.uz/aksiya')));
    expect(audience[0]!.buttons!.flat().map((b) => b.text)).toEqual([
      'Hammasi (2)',
      'RU (1)',
      'UZ (1)',
      'Toshkentga qiziqish (0)',
      'Navoiyga qiziqish (0)',
    ]);
    const confirm = sends(await botEvent(t, admin, { type: 'callback', data: 'bc:aud:ru' }));
    expect(confirm[0]!.buttons).toEqual([[{ text: 'Sayt', url: 'https://yangihayot.uz/aksiya' }]]);
  });

  it('asks again when the caption is longer than Telegram allows', async () => {
    await botEvent(t, admin, { type: 'command', name: 'broadcast' });
    const reply = sends(
      await botEvent(t, admin, {
        type: 'message',
        message: { messageId: 9, kind: 'video', text: 'x'.repeat(1025), fileId: 'V' },
      }),
    );
    expect(reply[0]!.text).toContain('1024');
  });

  it('does not offer an empty audience', async () => {
    await botEvent(t, admin, { type: 'command', name: 'broadcast' });
    await botEvent(t, admin, text('Matn'));
    await botEvent(t, admin, { type: 'callback', data: 'bc:nobutton' });
    const reply = sends(await botEvent(t, admin, { type: 'callback', data: 'bc:aud:navoiy' }));
    expect(reply[0]!.text).toContain("hech kim yo'q");
  });

  it('sends nothing before confirmation', async () => {
    await newMijoz('ru');
    await newMijoz('ru');
    const { ask } = await prepare({ audience: 'ru' });
    expect(ask).toBe('2 ta qabul qiluvchiga yuborilsinmi?');
    await drain();
    expect(receivers('Aksiya! -10%')).toEqual([]);
  });

  it('a second press of «Yuborish» does not send twice', async () => {
    const m = await newMijoz('ru');
    const { send } = await prepare();
    await botEvent(t, admin, { type: 'callback', data: send });
    const again = sends(await botEvent(t, admin, { type: 'callback', data: send }));
    expect(again[0]!.text).toContain('allaqachon');
    await drain();
    expect(t.messenger.deliveredTo(m)).toHaveLength(1);
  });

  it('a cancelled Rassilka is never sent', async () => {
    await newMijoz('ru');
    const { send, cancel } = await prepare();
    await botEvent(t, admin, { type: 'callback', data: cancel });
    await botEvent(t, admin, { type: 'callback', data: send });
    await drain();
    expect(receivers('Aksiya! -10%')).toEqual([]);
  });
});

describe('audiences', () => {
  it('goes only to the chosen audience; a Mijoz can be in both city segments', async () => {
    const ru = await newMijoz('ru');
    const uz = await newMijoz('uz');
    const both = await newMijoz('ru');
    const now = t.clock.now();
    await recordShaharQiziqish(t.db, ru, 'toshkent', 'loyiha', now);
    await recordShaharQiziqish(t.db, uz, 'navoiy', 'kviz', now);
    await recordShaharQiziqish(t.db, both, 'toshkent', 'ariza', now);
    await recordShaharQiziqish(t.db, both, 'navoiy', 'loyiha', now);
    await recordShaharQiziqish(t.db, both, 'navoiy', 'kviz', now);

    await broadcast('ru', 'to RU');
    await broadcast('uz', 'to UZ');
    await broadcast('toshkent', 'to Toshkent');
    await broadcast('navoiy', 'to Navoiy');
    await broadcast('all', 'to all');

    expect(receivers('to RU').sort()).toEqual([ru, both].sort());
    expect(receivers('to UZ').sort()).toEqual([adminId, uz].sort());
    expect(receivers('to Toshkent').sort()).toEqual([ru, both].sort());
    expect(receivers('to Navoiy').sort()).toEqual([uz, both].sort());
    expect(receivers('to all').sort()).toEqual([adminId, ru, uz, both].sort());
  });
});

describe('report and blocked Mijozlar', () => {
  it('reports delivered / blocked and leaves blockers out of later Rassilkalar', async () => {
    const ok = await newMijoz('ru');
    const blocker = await newMijoz('ru');
    t.messenger.blockBy(blocker);

    expect(await broadcast('ru', 'first')).toBe('Rassilka #1 yakunlandi.\nYetkazildi: 1\nBotni bloklagan: 1\nXato: 0');

    expect(await broadcast('ru', 'second')).toBe('Rassilka #2 yakunlandi.\nYetkazildi: 1\nBotni bloklagan: 0\nXato: 0');
    expect(receivers('second')).toEqual([ok]);
  });

  it('counts send errors and does not retry them', async () => {
    const a = await newMijoz('ru');
    await newMijoz('ru');
    const { send } = await prepare({ audience: 'ru' });
    await botEvent(t, admin, { type: 'callback', data: send });

    const failing: Messenger = {
      send: async (m) => (m.chatId === adminId ? t.messenger.send(m) : { status: 'error', error: 'Bad Request' }),
    };
    await drain(failing);
    await drain();

    expect(lastToAdmin()).toBe('Rassilka #1 yakunlandi.\nYetkazildi: 0\nBotni bloklagan: 0\nXato: 2');
    expect(t.messenger.deliveredTo(a)).toEqual([]);
  });

  it('a Mijoz who writes to the bot again is back in the audience', async () => {
    const blocker = await newMijoz('ru');
    t.messenger.blockBy(blocker);
    await broadcast('ru', 'first');

    await botEvent(t, { id: Number(blocker), first_name: 'B' }, { type: 'start' });
    const { ask } = await prepare({ audience: 'ru' });
    expect(ask).toBe('1 ta qabul qiluvchiga yuborilsinmi?');
  });
});

describe('queue', () => {
  it('sends at most 25 messages per second', async () => {
    for (let i = 0; i < 59; i++) await newMijoz('ru');
    const sentAt: number[] = [];
    const timed: Messenger = {
      send: async (m) => {
        if (m.chatId !== adminId) sentAt.push(t.clock.now().getTime());
        return t.messenger.send(m);
      },
    };
    const { send } = await prepare({ audience: 'ru' });
    await botEvent(t, admin, { type: 'callback', data: send });
    await drain(timed);

    expect(sentAt).toHaveLength(59);
    for (let i = 25; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 25]!).toBeGreaterThanOrEqual(1000);
    }
  });

  it('continues after a server restart without sending anyone twice', async () => {
    for (let i = 0; i < 40; i++) await newMijoz('ru');
    const { send } = await prepare({ audience: 'ru' });
    await botEvent(t, admin, { type: 'callback', data: send });

    // The server dies while the 30th message is in flight.
    let calls = 0;
    let died!: () => void;
    const dead = new Promise<void>((r) => (died = r));
    const dying: Messenger = {
      send: (m) => {
        if (++calls === 30) {
          died();
          return new Promise(() => {}); // never returns
        }
        return t.messenger.send(m);
      },
    };
    void drain(dying);
    await dead;

    // Restart: recover the queue, then a fresh worker drains it.
    await recoverRassilkaQueue(t.db, t.clock.now());
    await drain();

    const perChat = new Map<string, number>();
    for (const s of t.messenger.sent) {
      if (s.message.text === 'Aksiya! -10%') perChat.set(s.message.chatId, (perChat.get(s.message.chatId) ?? 0) + 1);
    }
    expect(perChat.size).toBe(39); // everyone but the one in flight at the crash
    expect([...perChat.values()].every((n) => n === 1)).toBe(true);
    expect(lastToAdmin()).toBe('Rassilka #1 yakunlandi.\nYetkazildi: 39\nBotni bloklagan: 0\nXato: 1');
  });
});
