import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DavomatHodisa } from '../src/yozilish/yozilish';
import { adminLogin } from './support/admin';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };
const malika = { id: 700000002, first_name: 'Malika', language_code: 'ru' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
});
afterEach(async () => {
  await t.close();
});

async function yozil(user: TelegramTestUser, loyihaId: number, sana: string, vaqt: string, phone = '901234567') {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/yozilishlar',
    headers: tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam: 'src_olx' })),
    payload: { loyihaId, sana, vaqt, name: user.first_name, phone },
  });
  expect(res.statusCode).toBe(201);
  return res.json().yozilish.id as number;
}

function admin(method: 'GET' | 'PATCH' | 'PUT', url: string, headers: { cookie: string }, payload?: unknown) {
  return t.app.inject({ method, url: `/admin/api${url}`, headers, payload: payload as object });
}

describe('admin: yozilishlar list', () => {
  it('shows the bookings of the asked days by time, to both roles', async () => {
    const l = await seedLoyiha(t.db, { nomi: 'Sayhun', bloklar: [blok('A', [{}])] });
    const later = await yozil(aziz, l.id, '2026-11-24', '15:00');
    const early = await yozil(malika, l.id, '2026-11-24', '09:00', '935554433');
    await yozil(aziz, l.id, '2026-11-25', '10:00');
    const menejer = await adminLogin(t, 'menejer');

    const res = await admin('GET', '/yozilishlar?dan=2026-11-24&gacha=2026-11-24', menejer);

    expect(res.statusCode).toBe(200);
    expect(res.json().yozilishlar).toEqual([
      expect.objectContaining({
        id: early,
        sana: '2026-11-24',
        vaqt: '09:00',
        mijoz: { telegramId: '700000002', name: 'Malika', phone: '+998935554433', username: null },
        loyiha: { id: l.id, nomi: 'Sayhun' },
        manba: 'olx',
        holat: 'faol',
        davomat: null,
      }),
      expect.objectContaining({ id: later, vaqt: '15:00' }),
    ]);
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/yozilishlar' })).statusCode).toBe(401);
  });
});

describe('admin: keldi / kelmadi', () => {
  it('a manager marks keldi / kelmadi once the day has come; listeners hear it', async () => {
    const l = await seedLoyiha(t.db, { bloklar: [blok('A', [{}])] });
    const today = await yozil(aziz, l.id, '2026-11-23', '12:00');
    const tomorrow = await yozil(malika, l.id, '2026-11-24', '12:00', '935554433');
    const heard: DavomatHodisa[] = [];
    t.app.yozilishlar.onDavomat((e) => void heard.push(e));
    const menejer = await adminLogin(t, 'menejer', { nomi: 'Menejer 01' });

    const res = await admin('PATCH', `/yozilishlar/${today}/davomat`, menejer, { davomat: 'kelmadi' });

    expect(res.statusCode).toBe(200);
    expect(res.json().yozilish).toMatchObject({
      davomat: 'kelmadi',
      belgiladi: { nomi: 'Menejer 01', at: t.clock.now().toISOString() },
    });
    expect(heard).toEqual([
      expect.objectContaining({
        yozilishId: today,
        mijozId: '700000001',
        loyihaId: l.id,
        davomat: 'kelmadi',
        oldingi: null,
        vaqt: new Date('2026-11-23T07:00:00Z'),
      }),
    ]);

    // corrected
    await admin('PATCH', `/yozilishlar/${today}/davomat`, menejer, { davomat: 'keldi' });
    expect(heard.at(-1)).toMatchObject({ davomat: 'keldi', oldingi: 'kelmadi' });
    // the same mark again changes nothing
    await admin('PATCH', `/yozilishlar/${today}/davomat`, menejer, { davomat: 'keldi' });
    expect(heard).toHaveLength(2);

    expect((await admin('PATCH', `/yozilishlar/${tomorrow}/davomat`, menejer, { davomat: 'keldi' })).json()).toEqual({
      error: 'kelajak',
    });
    t.clock.advance({ days: 1 });
    expect((await admin('PATCH', `/yozilishlar/${tomorrow}/davomat`, menejer, { davomat: 'keldi' })).statusCode).toBe(200);
  });

  it('a marked booking can no longer be moved by the Mijoz; a cancelled one cannot be marked', async () => {
    const l = await seedLoyiha(t.db, { bloklar: [blok('A', [{}])] });
    const id = await yozil(aziz, l.id, '2026-11-23', '12:00');
    const headers = await adminLogin(t, 'administrator');
    await admin('PATCH', `/yozilishlar/${id}/davomat`, headers, { davomat: 'keldi' });
    const mijoz = tmaAuth(signInitData(aziz, { authDate: t.clock.now() }));
    expect((await t.app.inject({ method: 'POST', url: `/api/yozilishlar/${id}/bekor`, headers: mijoz })).statusCode).toBe(409);

    const other = await yozil(aziz, l.id, '2026-11-23', '14:00');
    await t.app.inject({ method: 'POST', url: `/api/yozilishlar/${other}/bekor`, headers: mijoz });
    expect((await admin('PATCH', `/yozilishlar/${other}/davomat`, headers, { davomat: 'keldi' })).statusCode).toBe(409);
  });
});

describe('admin: ko\'rish kunlari va vaqtlari', () => {
  it('the Administrator changes days, slots and holidays; the Mini App follows', async () => {
    const headers = await adminLogin(t, 'administrator');
    expect((await admin('GET', '/yozilish-sozlamalari', headers)).json()).toEqual({
      sozlamalar: {
        haftaKunlari: [1, 2, 3, 4, 5, 6, 7],
        vaqtlar: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
        bayramlar: [],
        kunlarSoni: 14,
      },
    });

    const res = await admin('PUT', '/yozilish-sozlamalari', headers, {
      haftaKunlari: [6, 1, 2],
      vaqtlar: ['14:00', '10:00', '10:00'],
      bayramlar: ['2026-11-24'],
      kunlarSoni: 7,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().sozlamalar).toEqual({ haftaKunlari: [1, 2, 6], vaqtlar: ['10:00', '14:00'], bayramlar: ['2026-11-24'], kunlarSoni: 7 });
    const slots = await t.app.inject({
      method: 'GET',
      url: '/api/yozilish/slotlar',
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });
    expect(slots.json().kunlar.filter((k: { vaqtlar: string[] }) => k.vaqtlar.length > 0).map((k: { sana: string }) => k.sana)).toEqual([
      '2026-11-23',
      '2026-11-28',
    ]);
  });

  it('rejects nonsense and is Administrator-only to change', async () => {
    const headers = await adminLogin(t, 'administrator');
    const bad = [
      { haftaKunlari: [8], vaqtlar: ['10:00'], bayramlar: [], kunlarSoni: 14 },
      { haftaKunlari: [1], vaqtlar: ['25:00'], bayramlar: [], kunlarSoni: 14 },
      { haftaKunlari: [1], vaqtlar: [], bayramlar: [], kunlarSoni: 14 },
      { haftaKunlari: [1], vaqtlar: ['10:00'], bayramlar: ['24.11.2026'], kunlarSoni: 14 },
      { haftaKunlari: [1], vaqtlar: ['10:00'], bayramlar: [], kunlarSoni: 0 },
    ];
    for (const body of bad) expect((await admin('PUT', '/yozilish-sozlamalari', headers, body)).statusCode).toBe(400);

    const menejer = await adminLogin(t, 'menejer');
    expect((await admin('GET', '/yozilish-sozlamalari', menejer)).statusCode).toBe(200);
    const put = await admin('PUT', '/yozilish-sozlamalari', menejer, { haftaKunlari: [1], vaqtlar: ['10:00'], bayramlar: [], kunlarSoni: 14 });
    expect(put.statusCode).toBe(403);
  });
});

describe("admin: Loyiha's ko'rsatuv manzili and amoCRM mas'ul", () => {
  it('are edited with the Loyiha and used by new bookings', async () => {
    const headers = await adminLogin(t, 'administrator');
    const l = await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', bloklar: [blok('A', [{}])] });

    const res = await admin('PATCH', `/katalog/loyihalar/${l.id}`, headers, {
      korsatuvManzili: { uz: 'Sotuv ofisi, Buyuk Ipak yo\'li 1', ru: 'Офис продаж, Буюк Ипак йули 1' },
      crmMasulId: '8123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().loyiha).toMatchObject({ korsatuvManzili: { uz: "Sotuv ofisi, Buyuk Ipak yo'li 1" }, crmMasulId: '8123' });
    await yozil(aziz, l.id, '2026-11-24', '10:00');
    expect(t.crm.bitimlar[0]!.responsibleUserId).toBe('8123');
    expect(t.crm.bitimlar[0]!.notes[0]).toContain("Ko'rsatuv manzili: Sotuv ofisi, Buyuk Ipak yo'li 1");
    expect((await admin('PATCH', `/katalog/loyihalar/${l.id}`, headers, { crmMasulId: 'abc' })).statusCode).toBe(400);
  });
});
