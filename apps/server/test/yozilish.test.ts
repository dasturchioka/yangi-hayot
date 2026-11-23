import type { YozilishSlotlarResponse } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/settings';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser = aziz) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now() }));
}

async function slotlar(): Promise<YozilishSlotlarResponse> {
  const res = await t.app.inject({ method: 'GET', url: '/api/yozilish/slotlar', headers: auth() });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('slots', () => {
  it('offers the nearest 14 days with hourly slots 9:00–17:00, hiding the passed ones of today', async () => {
    const { kunlar } = await slotlar();

    expect(kunlar).toHaveLength(14);
    expect(kunlar[0]).toEqual({
      sana: '2026-11-23',
      haftaKuni: 1,
      vaqtlar: ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
    });
    expect(kunlar[1]!.vaqtlar).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    expect(kunlar[13]!.sana).toBe('2026-12-06');
  });

  it('hides closed weekdays and holidays set by the Administrator', async () => {
    await setSetting(t.db, 'yozilish', {
      haftaKunlari: [1, 2, 3, 4, 5, 6],
      vaqtlar: ['15:00', '10:00'],
      bayramlar: ['2026-11-25'],
      kunlarSoni: 7,
    }, t.clock.now());

    const { kunlar } = await slotlar();

    expect(kunlar.map((k) => [k.sana, k.vaqtlar.join(' ')])).toEqual([
      ['2026-11-23', '15:00'],
      ['2026-11-24', '10:00 15:00'],
      ['2026-11-25', ''], // holiday
      ['2026-11-26', '10:00 15:00'],
      ['2026-11-27', '10:00 15:00'],
      ['2026-11-28', '10:00 15:00'],
      ['2026-11-29', ''], // Sunday off
    ]);
  });

  it('moves with the clock: late in the evening today has no slots left', async () => {
    t.clock.set(new Date('2026-11-23T12:30:00Z')); // 17:30 Tashkent
    const { kunlar } = await slotlar();
    expect(kunlar[0]).toEqual({ sana: '2026-11-23', haftaKuni: 1, vaqtlar: [] });

    t.clock.set(new Date('2026-11-23T19:30:00Z')); // 00:30 next day in Tashkent
    expect((await slotlar()).kunlar[0]!.sana).toBe('2026-11-24');
  });
});

const GROUP = '-1001234567890';

async function loyiha(overrides: Parameters<typeof seedLoyiha>[1] = {}) {
  const l = await seedLoyiha(t.db, {
    nomi: 'Jozibali Maskan',
    bloklar: [blok('B', [{ xonalar: 2, maydon: 54.5, boshlangichNarx: 455_500_000 }])],
    ...overrides,
  });
  await t.db.query(`UPDATE loyiha SET crm_responsible_id = '777' WHERE id = $1`, [l.id]);
  return { id: l.id, planirovkaId: l.bloklar[0]!.planirovkalar[0]!.id };
}

function yozil(payload: Record<string, unknown>, user: TelegramTestUser = aziz) {
  return t.app.inject({ method: 'POST', url: '/api/yozilishlar?lang=uz', headers: auth(user), payload });
}

describe('booking', () => {
  beforeEach(async () => {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
  });

  it("creates a «Ko'rish» Bitim with a «Uchrashuv» task at the visit time for the Loyiha mas'ul", async () => {
    const l = await loyiha();

    const res = await yozil({
      loyihaId: l.id,
      planirovkaId: l.planirovkaId,
      sana: '2026-11-25',
      vaqt: '12:00',
      name: 'Aziz',
      phone: '90 123 45 67',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().yozilish).toMatchObject({
      loyihaNomi: 'Jozibali Maskan',
      planirovka: { id: l.planirovkaId, xonalar: 2, maydon: 54.5, blokNomi: 'B' },
      sana: '2026-11-25',
      vaqt: '12:00',
      haftaKuni: 3,
      at: '2026-11-25T07:00:00.000Z',
      holat: 'faol',
      davomat: null,
      manzil: "Mirzo Ulug'bek tumani",
      ozgartirsaBoladi: true,
    });
    expect(t.crm.bitimlar).toHaveLength(1);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.name).toBe("Ko'rish: Jozibali Maskan, 25.11.2026 12:00 — Aziz");
    expect(bitim.responsibleUserId).toBe('777');
    expect(bitim.tags).toContain('bot_visit');
    expect(bitim.notes[0]).toContain("Ko'rish vaqti: 25.11.2026 (chorshanba) 12:00");
    expect(t.crm.tasks).toEqual([
      expect.objectContaining({
        bitimId: bitim.id,
        kind: 'meeting',
        dueAt: new Date('2026-11-25T07:00:00Z'),
        responsibleUserId: '777',
        closed: false,
      }),
    ]);
    expect(t.crm.tasks[0]!.text).toMatch(/^Uchrashuv: /);
  });

  it('adds the booking to the open Bitim instead of creating one', async () => {
    const l = await loyiha();
    t.crm.contacts.push({ id: '5550001', name: 'Aziz', phone: '+998901234567' });
    t.crm.bitimlar.push({ id: '9001', contactId: '5550001', name: 'Eski bitim', open: true, tags: [], notes: [] });

    const res = await yozil({ loyihaId: l.id, sana: '2026-11-24', vaqt: '09:00', name: 'Aziz', phone: '901234567' });

    expect(res.statusCode).toBe(201);
    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.name).toBe('Eski bitim');
    expect(t.crm.tasks).toEqual([
      expect.objectContaining({ bitimId: '9001', kind: 'meeting', dueAt: new Date('2026-11-24T04:00:00Z') }),
    ]);
  });

  it('tells the managers group', async () => {
    const l = await loyiha();
    await yozil({ loyihaId: l.id, sana: '2026-11-25', vaqt: '12:00', name: 'Aziz', phone: '90 123 45 67' });

    const [msg] = t.messenger.deliveredTo(GROUP);
    expect(msg!.text).toContain("Ko'rishga yozilish");
    expect(msg!.text).toContain('Jozibali Maskan');
    expect(msg!.text).toContain('25.11.2026 (chorshanba) 12:00');
    expect(msg!.text).toContain('+998901234567');
    expect(msg!.text).toContain('@aziz_k');
  });

  it('refuses slots that are not offered; any number of Mijozlar may take the same slot', async () => {
    const l = await loyiha();
    await setSetting(
      t.db,
      'yozilish',
      { haftaKunlari: [1, 2, 3, 4, 5, 6, 7], vaqtlar: ['09:00', '10:00', '11:00'], bayramlar: ['2026-11-26'], kunlarSoni: 14 },
      t.clock.now(),
    );
    const at = (sana: string, vaqt: string, user: TelegramTestUser = aziz, phone = '901234567') =>
      yozil({ loyihaId: l.id, sana, vaqt, name: user.first_name, phone }, user);

    expect((await at('2026-11-23', '10:00')).statusCode).toBe(409); // starts now
    expect((await at('2026-11-26', '10:00')).statusCode).toBe(409); // holiday
    expect((await at('2026-11-24', '12:00')).statusCode).toBe(409); // not a slot
    expect((await at('2026-12-07', '10:00')).statusCode).toBe(409); // beyond 14 days
    expect((await at('2026-11-24', '10:00')).statusCode).toBe(201);
    const malika = { id: 700000002, first_name: 'Malika', language_code: 'ru' };
    expect((await at('2026-11-24', '10:00', malika, '935554433')).statusCode).toBe(201);
  });

  it('rejects an unknown or Topshirilgan Loyiha and a bad phone', async () => {
    const old = await loyiha({ holat: 'topshirilgan' });
    const body = { sana: '2026-11-24', vaqt: '10:00', name: 'Aziz', phone: '901234567' };
    expect((await yozil({ ...body, loyihaId: old.id })).statusCode).toBe(400);
    expect((await yozil({ ...body, loyihaId: 99999 })).statusCode).toBe(400);
    const l = await loyiha();
    expect((await yozil({ ...body, loyihaId: l.id, phone: '12' })).json()).toEqual({ error: 'phone' });
    expect(t.crm.calls).toHaveLength(0);
  });

  it('a double tap books once', async () => {
    const l = await loyiha();
    const body = { loyihaId: l.id, sana: '2026-11-24', vaqt: '10:00', name: 'Aziz', phone: '901234567' };
    const first = await yozil(body);
    const second = await yozil(body);
    expect(second.statusCode).toBe(200);
    expect(second.json().yozilish.id).toBe(first.json().yozilish.id);
    expect(t.crm.tasks).toHaveLength(1);
  });
});

async function booked(sana = '2026-11-25', vaqt = '12:00') {
  const l = await loyiha();
  const res = await yozil({ loyihaId: l.id, sana, vaqt, name: 'Aziz', phone: '90 123 45 67' });
  expect(res.statusCode).toBe(201);
  return res.json().yozilish.id as number;
}

function kochir(id: number, sana: string, vaqt: string, user: TelegramTestUser = aziz) {
  return t.app.inject({ method: 'POST', url: `/api/yozilishlar/${id}/kochirish`, headers: auth(user), payload: { sana, vaqt } });
}

function bekor(id: number, user: TelegramTestUser = aziz) {
  return t.app.inject({ method: 'POST', url: `/api/yozilishlar/${id}/bekor`, headers: auth(user) });
}

describe('moving and cancelling', () => {
  beforeEach(async () => {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
  });

  it('moving updates the task date, the Bitim name and adds a note; managers are told', async () => {
    const id = await booked();

    const res = await kochir(id, '2026-11-26', '15:00');

    expect(res.statusCode).toBe(200);
    expect(res.json().yozilish).toMatchObject({ sana: '2026-11-26', vaqt: '15:00', holat: 'faol' });
    expect(t.crm.tasks).toHaveLength(1);
    expect(t.crm.tasks[0]).toMatchObject({ dueAt: new Date('2026-11-26T10:00:00Z'), closed: false });
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.name).toBe("Ko'rish: Jozibali Maskan, 26.11.2026 15:00 — Aziz");
    expect(bitim.notes.at(-1)).toBe(
      `Ko'rish ko'chirildi (yozilish #${id}): 25.11.2026 (chorshanba) 12:00 → 26.11.2026 (payshanba) 15:00`,
    );
    const msg = t.messenger.deliveredTo(GROUP).at(-1)!;
    expect(msg.text).toContain("Ko'rish ko'chirildi");
    expect(msg.text).toContain('26.11.2026 (payshanba) 15:00');
  });

  it("moving keeps someone else's open Bitim name", async () => {
    const l = await loyiha();
    t.crm.contacts.push({ id: '5550001', name: 'Aziz', phone: '+998901234567' });
    t.crm.bitimlar.push({ id: '9001', contactId: '5550001', name: 'Eski bitim', open: true, tags: [], notes: [] });
    const id = (await yozil({ loyihaId: l.id, sana: '2026-11-24', vaqt: '09:00', name: 'Aziz', phone: '901234567' })).json()
      .yozilish.id;

    await kochir(id, '2026-11-24', '11:00');

    expect(t.crm.bitimlar[0]!.name).toBe('Eski bitim');
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-24T06:00:00Z'));
  });

  it('cancelling closes the task and writes a note; the Bitim stays open', async () => {
    const id = await booked();

    const res = await bekor(id);

    expect(res.statusCode).toBe(200);
    expect(res.json().yozilish).toMatchObject({ holat: 'bekor', ozgartirsaBoladi: false });
    expect(t.crm.tasks[0]).toMatchObject({ closed: true, result: "Mijoz ko'rishni bekor qildi" });
    expect(t.crm.bitimlar[0]!.open).toBe(true);
    expect(t.crm.bitimlar[0]!.notes.at(-1)).toContain("Mijoz ko'rishni bekor qildi");
    expect(t.messenger.deliveredTo(GROUP).at(-1)!.text).toContain("Ko'rish bekor qilindi");
    expect((await kochir(id, '2026-11-26', '15:00')).statusCode).toBe(409);
    expect((await bekor(id)).statusCode).toBe(409);
  });

  it('only the own, upcoming booking can be changed', async () => {
    const id = await booked('2026-11-23', '12:00');
    const malika = { id: 700000002, first_name: 'Malika', language_code: 'ru' };
    expect((await bekor(id, malika)).statusCode).toBe(404);
    expect((await kochir(id, '2026-11-26', '15:00')).statusCode).toBe(200);
    expect((await kochir(id, '2026-11-26', '18:00')).json()).toEqual({ error: 'slot' });

    t.clock.set(new Date('2026-11-26T10:30:00Z')); // after the visit
    expect((await bekor(id)).json()).toEqual({ error: 'otgan' });
  });

  it('a move made while amoCRM is down reaches it later, after the booking itself', async () => {
    t.crm.fail('unavailable');
    const id = await booked();
    expect((await kochir(id, '2026-11-26', '15:00')).statusCode).toBe(200);
    expect((await bekor(id)).statusCode).toBe(200);
    expect(t.crm.tasks).toHaveLength(0);

    t.crm.recover();
    t.clock.advance({ minutes: 5 });
    await t.runJobs();

    expect(t.crm.bitimlar).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.name).toBe("Ko'rish: Jozibali Maskan, 26.11.2026 15:00 — Aziz");
    expect(t.crm.tasks).toEqual([expect.objectContaining({ dueAt: new Date('2026-11-26T10:00:00Z'), closed: true })]);
    const notes = t.crm.bitimlar[0]!.notes;
    expect(notes.filter((n) => n.startsWith("Ko'rish ko'chirildi"))).toHaveLength(1);
    expect(notes.filter((n) => n.startsWith("Mijoz ko'rishni bekor qildi"))).toHaveLength(1);

    t.clock.advance({ minutes: 5 });
    await t.runJobs();
    expect(t.crm.bitimlar[0]!.notes).toEqual(notes); // nothing sent twice
  });

  it('a cancellation whose CRM update failed mid-way is retried without repeating done steps', async () => {
    const id = await booked();
    t.crm.fail('unavailable');
    await bekor(id);
    t.crm.recover();
    t.clock.advance({ minutes: 5 });
    await t.runJobs();
    expect(t.crm.callsOf('closeTask')).toHaveLength(1);
    expect(t.crm.bitimlar[0]!.notes.filter((n) => n.includes('bekor'))).toHaveLength(1);
  });
});

describe("«Mening yozilishlarim»", () => {
  it('lists upcoming bookings first, soonest first, then the past and cancelled ones', async () => {
    const a = await booked('2026-11-27', '10:00');
    const b = await booked('2026-11-24', '10:00');
    const c = await booked('2026-11-25', '10:00');
    await bekor(c);

    const res = await t.app.inject({ method: 'GET', url: '/api/yozilishlar?lang=ru', headers: auth() });

    expect(res.json().yozilishlar.map((y: { id: number }) => y.id)).toEqual([b, a, c]);
    expect(res.json().yozilishlar[0].manzil).toBe('Мирзо-Улугбекский район');
  });

  it("uses the Loyiha's ko'rsatuv manzili when set", async () => {
    const id = await booked();
    await t.db.query(`UPDATE loyiha SET korsatuv_manzili = '{"uz":"Sotuv ofisi, Buyuk Ipak yo''li 1","ru":"Офис продаж"}'`);
    const res = await t.app.inject({ method: 'GET', url: `/api/yozilishlar/${id}?lang=uz`, headers: auth() });
    expect(res.json().yozilish.manzil).toBe("Sotuv ofisi, Buyuk Ipak yo'li 1");
  });
});
