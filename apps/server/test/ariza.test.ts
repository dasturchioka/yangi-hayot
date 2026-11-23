import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importLegacyBot } from '../src/kochirish/bot-import';
import { setSetting } from '../src/settings/settings';
import { botEvent } from './support/bot';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', last_name: 'Karimov', username: 'aziz_k', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser = aziz, startParam?: string) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam }));
}

function postAriza(payload: Record<string, unknown>, user: TelegramTestUser = aziz, startParam?: string) {
  return t.app.inject({ method: 'POST', url: '/api/arizalar', headers: auth(user, startParam), payload });
}

describe('Ariza formasi → amoCRM', () => {
  it('creates a contact, a Bitim in the bot pipeline, tags, a note and a call task', async () => {
    const res = await postAriza({ name: 'Aziz', phone: '90 123 45 67' });

    expect(res.statusCode).toBe(201);
    expect(t.crm.contacts).toEqual([
      { id: expect.any(String), name: 'Aziz', phone: '+998901234567', telegramId: '700000001' },
    ]);
    expect(t.crm.bitimlar).toHaveLength(1);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.contactId).toBe(t.crm.contacts[0]!.id);
    expect(bitim.tags).toEqual(['bot_form', "Telegram (to'g'ridan-to'g'ri)", 'sovuq']); // + Daraja (#18)
    expect(bitim.manba).toBe("Telegram (to'g'ridan-to'g'ri)");
    expect(bitim.notes).toHaveLength(1);
    expect(bitim.notes[0]).toContain('+998901234567');
    expect(bitim.notes[0]).toContain('Til: UZ');
    expect(t.crm.tasks).toEqual([
      expect.objectContaining({
        bitimId: bitim.id,
        kind: 'call',
        // Monday 10:00 Tashkent + 15 min
        dueAt: new Date('2026-11-23T05:15:00Z'),
        closed: false,
      }),
    ]);
  });
});

describe('one Mijoz = one contact, at most one open Bitim', () => {
  it('adds a repeat Ariza to the open Bitim instead of creating new ones', async () => {
    const { bloklar } = await seedLoyiha(t.db, { bloklar: [blok('A', [{}, { xonalar: 3, maydon: 80 }])] });
    const [p1, p2] = bloklar[0]!.planirovkalar;

    expect((await postAriza({ name: 'Aziz', phone: '+998 90 123-45-67', planirovkaId: p1!.id })).statusCode).toBe(201);
    expect((await postAriza({ name: 'Aziz', phone: '901234567', planirovkaId: p2!.id })).statusCode).toBe(201);

    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.notes).toHaveLength(2);
    expect(t.crm.tasks).toHaveLength(2);
  });

  it('finds an existing contact by phone first', async () => {
    const existing = await t.crm.createContact({ name: 'Aziz aka', phone: '+998901234567' });

    await postAriza({ name: 'Aziz', phone: '90 123 45 67' });

    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.contactId).toBe(existing.id);
  });

  it('then by Telegram ID', async () => {
    const existing = await t.crm.createContact({ name: 'Aziz', telegramId: '700000001' });

    await postAriza({ name: 'Aziz', phone: '90 123 45 67' });

    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.contactId).toBe(existing.id);
    expect(t.crm.callsOf('findContact')).toEqual([[{ phone: '+998901234567' }], [{ telegramId: '700000001' }]]);
  });

  it('opens a new Bitim when the earlier one was closed', async () => {
    await postAriza({ name: 'Aziz', phone: '90 123 45 67' });
    t.crm.bitimlar[0]!.open = false;
    t.clock.advance({ minutes: 30 });

    await postAriza({ name: 'Aziz', phone: '90 123 45 67' });

    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar).toHaveLength(2);
  });

  it('two Arizalar at the same moment still make one Bitim', async () => {
    const [a, b] = await Promise.all([
      postAriza({ name: 'Aziz', phone: '90 123 45 67' }),
      postAriza({ name: 'Aziz', phone: '90 123 45 68' }),
    ]);

    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(t.crm.bitimlar).toHaveLength(1);
  });
});

describe("note, mas'ul, Manba", () => {
  it("writes Loyiha, Blok, Planirovka and both Manbalar; the new Bitim goes to the Loyiha mas'ul", async () => {
    const { id: loyihaId, bloklar } = await seedLoyiha(t.db, {
      nomi: 'Jozibali Maskan',
      bloklar: [blok('B', [{ xonalar: 2, maydon: 54.5, boshlangichNarx: 455_500_000 }])],
    });
    await t.db.query(`UPDATE loyiha SET crm_responsible_id = '4242' WHERE id = $1`, [loyihaId]);
    await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(aziz, 'src_facebook') });

    await postAriza({ name: 'Aziz', phone: '901234567', planirovkaId: bloklar[0]!.planirovkalar[0]!.id }, aziz, 'src_insta');

    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.responsibleUserId).toBe('4242');
    expect(t.crm.tasks[0]!.responsibleUserId).toBe('4242');
    expect(bitim.tags).toEqual(['bot_form', 'insta', 'sovuq']);
    expect(bitim.manba).toBe('insta');
    const note = bitim.notes[0]!;
    expect(note).toContain('Loyiha: Jozibali Maskan');
    expect(note).toContain('Blok: B');
    expect(note).toContain("Planirovka: 2 xonali, 54,5 m², 455 500 000 so'mdan");
    expect(note).toContain('Manba: birinchi — facebook; oxirgi — insta');
    expect(note).toContain('Til: UZ');
  });

  it("says «Narx so'rov bo'yicha» for a Planirovka without a price, and takes a Loyiha alone", async () => {
    const { id: loyihaId, bloklar } = await seedLoyiha(t.db, {
      nomi: 'Sayhun',
      bloklar: [blok('A', [{ xonalar: 1, maydon: 32 }])],
    });

    await postAriza({ name: 'Aziz', phone: '901234567', planirovkaId: bloklar[0]!.planirovkalar[0]!.id });
    await postAriza({ name: 'Aziz', phone: '901234567', loyihaId });

    const [withPlan, withLoyiha] = t.crm.bitimlar[0]!.notes;
    expect(withPlan).toContain("Planirovka: 1 xonali, 32 m², Narx so'rov bo'yicha");
    expect(withLoyiha).toContain('Loyiha: Sayhun');
    expect(withLoyiha).not.toContain('Planirovka:');
  });

  it('rejects unknown or Topshirilgan Loyihalar, a bad phone and an empty name', async () => {
    const { id: topshirilgan } = await seedLoyiha(t.db, { holat: 'topshirilgan' });

    expect((await postAriza({ name: 'Aziz', phone: '901234567', loyihaId: topshirilgan })).statusCode).toBe(400);
    expect((await postAriza({ name: 'Aziz', phone: '901234567', planirovkaId: 999999 })).statusCode).toBe(400);
    expect((await postAriza({ name: 'Aziz', phone: '12345' })).statusCode).toBe(400);
    expect((await postAriza({ name: ' ', phone: '901234567' })).statusCode).toBe(400);
    expect(t.crm.calls).toEqual([]);
  });
});

describe('task deadline: 15 minutes of working time', () => {
  it('moves past the end of the working day to the next morning', async () => {
    t.clock.set(new Date('2026-11-23T13:55:00Z')); // Mon 18:55 Tashkent
    await postAriza({ name: 'Aziz', phone: '901234567' });
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-24T04:10:00Z')); // Tue 9:10
  });

  it('skips Sunday', async () => {
    t.clock.set(new Date('2026-11-28T15:00:00Z')); // Sat 20:00
    await postAriza({ name: 'Aziz', phone: '901234567' });
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-30T04:15:00Z')); // Mon 9:15
  });

  it('takes the minutes and the working hours from settings', async () => {
    await setSetting(
      t.db,
      'crmTaskDue',
      { minutes: 30, workingHours: { start: '08:00', end: '20:00', days: [1, 2, 3, 4, 5, 6, 7] } },
      t.clock.now(),
    );
    await postAriza({ name: 'Aziz', phone: '901234567' });
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-23T05:30:00Z'));
  });
});

const GROUP = '-1001234567890';
const ADMIN = '800000001';

async function myArizalar(user: TelegramTestUser = aziz) {
  const res = await t.app.inject({ method: 'GET', url: '/api/arizalar', headers: auth(user) });
  expect(res.statusCode).toBe(200);
  return res.json();
}

/** Moves the clock in 5-minute steps, running jobs after each step. */
async function retryFor(minutes: number) {
  for (let m = 0; m < minutes; m += 5) {
    t.clock.advance({ minutes: 5 });
    await t.runJobs();
  }
}

describe('amoCRM is down', () => {
  beforeEach(async () => {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
    await setSetting(t.db, 'admins', [ADMIN], t.clock.now());
  });

  it('accepts the Ariza, tells the managers group, and delivers it once amoCRM is back', async () => {
    t.crm.fail('unavailable');

    const res = await postAriza({ name: 'Aziz', phone: '901234567' });

    expect(res.statusCode).toBe(201);
    expect((await myArizalar()).arizalar).toEqual([expect.objectContaining({ id: res.json().id, tur: 'form' })]);
    const toGroup = t.messenger.deliveredTo(GROUP);
    expect(toGroup).toHaveLength(1);
    expect(toGroup[0]!.text).toContain("amoCRM'ga yuborilmadi");
    expect(toGroup[0]!.text).toContain('+998901234567');

    await retryFor(15); // still down: no new group messages
    expect(t.messenger.deliveredTo(GROUP)).toHaveLength(1);

    t.crm.recover();
    await retryFor(5);
    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.notes).toHaveLength(1);
    expect(t.crm.tasks).toHaveLength(1);

    await retryFor(30); // delivered Arizalar are not sent again
    expect(t.crm.callsOf('createTask')).toHaveLength(1);
  });

  it('retries every 5 minutes for 24 hours, then gives up and alerts', async () => {
    t.crm.fail('unavailable');
    await postAriza({ name: 'Aziz', phone: '901234567' });
    const attempts = () => t.crm.calls.filter((c) => c.method === 'findContact' && 'phone' in c.args[0]).length;
    expect(attempts()).toBe(1);

    await retryFor(10);
    expect(attempts()).toBe(3);

    await retryFor(24 * 60 - 10);
    // first attempt + one every 5 minutes up to and including the 24th hour
    expect(attempts()).toBe(1 + (24 * 60) / 5);
    const last = t.messenger.deliveredTo(GROUP).at(-1)!;
    expect(last.text).toContain("24 soat davomida amoCRM'ga yuborilmadi");
    expect(t.messenger.deliveredTo(ADMIN).at(-1)!.text).toContain("24 soat davomida amoCRM'ga yuborilmadi");

    t.crm.recover();
    await retryFor(60);
    expect(attempts()).toBe(1 + (24 * 60) / 5);
  });

  it('does not repeat steps that were already done (no second note or Bitim)', async () => {
    await postAriza({ name: 'Aziz', phone: '901234567' }); // first Ariza: all fine
    t.clock.advance({ minutes: 1 });
    // second Ariza: amoCRM breaks right after the note
    const addNote = t.crm.addNote.bind(t.crm);
    t.crm.addNote = async (...args) => {
      await addNote(...args);
      t.crm.fail('unavailable');
    };
    await postAriza({ name: 'Aziz', phone: '901234568' });
    t.crm.recover();
    t.crm.addNote = addNote;

    await retryFor(5);

    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.notes).toHaveLength(2);
    expect(t.crm.tasks).toHaveLength(2);
  });

  it('survives a server restart', async () => {
    t.crm.fail('unavailable');
    await postAriza({ name: 'Aziz', phone: '901234567' });

    await t.restart();
    t.crm.recover();
    await retryFor(5);

    expect(t.crm.tasks).toHaveLength(1);
  });

  it('alerts admins at once on an auth error, only once until delivery works again', async () => {
    t.crm.fail('auth');

    await postAriza({ name: 'Aziz', phone: '901234567' });
    expect(t.messenger.deliveredTo(ADMIN)).toHaveLength(1);
    expect(t.messenger.deliveredTo(ADMIN)[0]!.text).toContain('avtorizatsiya');

    await retryFor(30);
    expect(t.messenger.deliveredTo(ADMIN)).toHaveLength(1);

    t.crm.recover();
    await retryFor(5);
    expect(t.crm.tasks).toHaveLength(1);

    t.crm.fail('auth');
    await postAriza({ name: 'Aziz', phone: '901234568' });
    expect(t.messenger.deliveredTo(ADMIN)).toHaveLength(2);
  });
});

describe('spam protection', () => {
  it('treats the same Ariza sent twice in a row as one', async () => {
    const first = await postAriza({ name: 'Aziz', phone: '901234567' });
    const again = await postAriza({ name: 'Aziz', phone: '901234567' });

    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect(t.crm.tasks).toHaveLength(1);
    expect((await myArizalar()).arizalar).toHaveLength(1);
  });

  it('limits a Mijoz to 5 Arizalar an hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await postAriza({ name: 'Aziz', phone: `90123456${i}` })).statusCode).toBe(201);
    }
    expect((await postAriza({ name: 'Aziz', phone: '901234569' })).statusCode).toBe(429);
    expect(t.crm.tasks).toHaveLength(5);

    t.clock.advance({ hours: 1 });
    expect((await postAriza({ name: 'Aziz', phone: '901234569' })).statusCode).toBe(201);
  });
});

describe('Mijoz Arizalari', () => {
  it('lists own Arizalar and the contact to prefill the form', async () => {
    expect(await myArizalar()).toEqual({ kontakt: { name: 'Aziz Karimov', phone: null }, arizalar: [] });

    await postAriza({ name: 'Aziz', phone: '901234567' });

    const mine = await myArizalar();
    expect(mine.kontakt).toEqual({ name: 'Aziz Karimov', phone: '+998901234567' });
    expect(mine.arizalar).toHaveLength(1);
    const other = { ...aziz, id: 700000002 };
    expect((await myArizalar(other)).arizalar).toEqual([]);
  });

  it('keeps Arizalar after /restart in the bot', async () => {
    await postAriza({ name: 'Aziz', phone: '901234567' });

    await botEvent(t, aziz, { type: 'command', name: 'restart' });

    expect((await myArizalar()).arizalar).toHaveLength(1);
    expect((await myArizalar()).kontakt.phone).toBe('+998901234567');
  });
});

describe('Ariza module (other entry points)', () => {
  it('creates a booking Ariza with a meeting task at the visit time and extra note lines', async () => {
    await botEvent(t, aziz, { type: 'start' });
    const visitAt = new Date('2026-11-25T06:00:00Z');

    const { id } = await t.app.arizalar.create({
      tur: 'visit',
      telegramId: '700000001',
      name: 'Aziz',
      phone: '+998901234567',
      izoh: ['Sana: 25.11.2026, 11:00'],
      tags: ['aksiya'],
      taskDueAt: visitAt,
    });

    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.tags).toEqual(['bot_visit', "Telegram (to'g'ridan-to'g'ri)", 'aksiya', 'iliq']); // yozilish → iliq (#18)
    expect(bitim.notes[0]).toContain("Ko'rishga yozilish");
    expect(bitim.notes[0]).toContain('Sana: 25.11.2026, 11:00');
    expect(t.crm.tasks).toEqual([expect.objectContaining({ kind: 'meeting', dueAt: visitAt })]);
    expect(await t.app.arizalar.crmIds(id)).toEqual({
      contactId: t.crm.contacts[0]!.id,
      bitimId: bitim.id,
      taskId: t.crm.tasks[0]!.id,
    });
  });

  it('«Menejer kerak» without a phone: contact by Telegram ID, «Bog\'lanish» task', async () => {
    await botEvent(t, aziz, { type: 'start' });

    await t.app.arizalar.create({ tur: 'human', telegramId: '700000001', name: 'Aziz Karimov' });

    expect(t.crm.contacts).toEqual([expect.objectContaining({ telegramId: '700000001', phone: undefined })]);
    expect(t.crm.tasks).toEqual([expect.objectContaining({ kind: 'contact' })]);
    expect(t.crm.bitimlar[0]!.tags[0]).toBe('bot_human');
  });
});

describe('«Ulashish» → Ariza (#16)', () => {
  it('an Ariza from a shared link goes to amoCRM with Manba «mijoz ulashdi» and who shared it', async () => {
    const { bloklar } = await seedLoyiha(t.db, { bloklar: [blok('A', [{ xonalar: 2, maydon: 54 }])] });
    const planirovkaId = bloklar[0]!.planirovkalar[0]!.id;
    const dilnoza = { id: 700000002, first_name: 'Dilnoza', language_code: 'uz' };

    const share = await t.app.inject({ method: 'POST', url: '/api/ulashish', headers: auth(), payload: { planirovkaId } });
    const startParam = new URL(share.json().url).searchParams.get('startapp')!;
    await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(dilnoza, startParam) });
    const res = await postAriza({ name: 'Dilnoza', phone: '931112233', planirovkaId }, dilnoza, startParam);

    expect(res.statusCode).toBe(201);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.tags).toContain('mijoz ulashdi');
    expect(bitim.manba).toBe('mijoz ulashdi');
    expect(bitim.notes[0]).toContain('oxirgi — mijoz ulashdi');
    expect(bitim.notes[0]).toContain(`Ulashgan: Aziz Karimov · @aziz_k · ID 700000001 (Planirovka #${planirovkaId})`);
  });
});

describe('old bot data (#8)', () => {
  const leads = [
    {
      id: 'L-1',
      user_id: 700000001,
      name: 'Aziz Karimov',
      phone: '+998901234567',
      type: 'form',
      source: 'src_tg_ads',
      amo_lead_id: 7770001,
      amo_contact_id: 5550001,
      created_at: '2026-10-01T09:30:00+05:00',
    },
  ];
  const importOld = () =>
    importLegacyBot(t.db, { leadsJsonl: leads.map((l) => JSON.stringify(l)).join('\n') }, t.clock.now());

  it('old Arizalar show up among the Mijoz Arizalar and are never sent to amoCRM again', async () => {
    await importOld();
    await t.runJobs();
    await t.runJobs(); // idempotent

    const mine = await myArizalar();
    expect(mine.arizalar).toEqual([expect.objectContaining({ tur: 'form', createdAt: '2026-10-01T04:30:00.000Z' })]);
    expect(mine.kontakt.phone).toBe('+998901234567');
    expect(t.crm.calls).toEqual([]);
  });

  it('a new Ariza joins the amoCRM contact and open Bitim the old bot made', async () => {
    await importOld();
    // amoCRM already has them; the contact has neither phone nor Telegram ID filled in
    t.crm.contacts.push({ id: '5550001', name: 'Aziz' });
    t.crm.bitimlar.push({ id: '7770001', contactId: '5550001', name: 'Aziz', open: true, tags: [], notes: [] });

    await t.app.arizalar.create({ tur: 'human', telegramId: '700000001', name: 'Aziz' });

    expect(t.crm.contacts).toHaveLength(1);
    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.notes[0]).toContain('Telefon: +998901234567');
    expect(t.crm.tasks).toEqual([expect.objectContaining({ bitimId: '7770001' })]);
  });
});
