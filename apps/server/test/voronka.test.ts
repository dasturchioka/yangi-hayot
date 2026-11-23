import type { VoronkaResponse } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { botEvent } from './support/bot';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const mijoz = (n: number): TelegramTestUser => ({ id: 700000200 + n, first_name: `Mijoz${n}`, language_code: 'uz' });
const TOGRIDAN = "Telegram (to'g'ridan-to'g'ri)";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
});
afterEach(async () => {
  await t.close();
});

const auth = (user: TelegramTestUser) => tmaAuth(signInitData(user, { authDate: t.clock.now() }));

async function korish(user: TelegramTestUser, planirovkaId: number) {
  const res = await t.app.inject({ method: 'GET', url: `/api/katalog/planirovkalar/${planirovkaId}`, headers: auth(user) });
  expect(res.statusCode).toBe(200);
}

async function ariza(user: TelegramTestUser, payload: Record<string, unknown>) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/arizalar',
    headers: auth(user),
    payload: { name: user.first_name, phone: `90 ${String(user.id).slice(-3)} 45 67`, ...payload },
  });
  expect(res.statusCode).toBe(201);
}

async function yozilish(user: TelegramTestUser, loyihaId: number, vaqt: string): Promise<number> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/yozilishlar',
    headers: auth(user),
    payload: { loyihaId, sana: '2026-11-23', vaqt, name: user.first_name, phone: `+99890${String(user.id).slice(-3)}4567` },
  });
  expect(res.statusCode).toBe(201);
  return res.json().yozilish.id as number;
}

async function davomat(yozilishId: number, value: 'keldi' | 'kelmadi') {
  const res = await t.app.inject({
    method: 'PATCH',
    url: `/admin/api/yozilishlar/${yozilishId}/davomat`,
    headers: await adminLogin(t, 'menejer'),
    payload: { davomat: value },
  });
  expect(res.statusCode).toBe(200);
}

async function voronka(query: string): Promise<VoronkaResponse> {
  const res = await t.app.inject({ method: 'GET', url: `/admin/api/voronka?${query}`, headers: await adminLogin(t, 'administrator') });
  expect(res.statusCode).toBe(200);
  return res.json();
}

const mijozlar = (v: VoronkaResponse) => v.qadamlar.map((q) => q.mijozlar);

/**
 * The test day: what four test Mijozlar did, and what the funnel must show.
 *
 *   Mijoz1 instagram: /start, opens P1 twice and P2, leaves an Ariza (Navoiy Park)
 *   Mijoz2 instagram: /start, opens P1, books a visit to Navoiy Park, comes
 *   Mijoz3 direct:    /start, opens P3, books a visit to Sayhun, does not come
 *   Mijoz4 olx:       /start only
 *   Mijoz5 instagram: everything the day before (outside the period)
 */
async function testKuni() {
  const navoiy = await seedLoyiha(t.db, { nomi: 'Navoiy Park', bloklar: [blok('A', [{ xonalar: 2, maydon: 54 }, { xonalar: 3, maydon: 78 }])] });
  const sayhun = await seedLoyiha(t.db, { nomi: 'Sayhun', bloklar: [blok('1', [{ xonalar: 1, maydon: 40 }])] });
  const [p1, p2] = navoiy.bloklar[0]!.planirovkalar.map((p) => p.id) as [number, number];
  const p3 = sayhun.bloklar[0]!.planirovkalar[0]!.id;

  t.clock.set(new Date('2026-11-22T06:00:00Z')); // Sunday
  await botEvent(t, mijoz(5), { type: 'start', payload: 'src_instagram' });
  await korish(mijoz(5), p1);
  await ariza(mijoz(5), { loyihaId: navoiy.id });

  t.clock.set(new Date('2026-11-23T05:00:00Z')); // Monday 10:00
  await botEvent(t, mijoz(1), { type: 'start', payload: 'src_instagram' });
  await korish(mijoz(1), p1);
  await korish(mijoz(1), p1);
  await korish(mijoz(1), p2);
  await ariza(mijoz(1), { loyihaId: navoiy.id, planirovkaId: p1 });

  await botEvent(t, mijoz(2), { type: 'start', payload: 'src_instagram' });
  await korish(mijoz(2), p1);
  const y2 = await yozilish(mijoz(2), navoiy.id, '15:00');

  await botEvent(t, mijoz(3), { type: 'start' });
  await korish(mijoz(3), p3);
  const y3 = await yozilish(mijoz(3), sayhun.id, '16:00');

  await botEvent(t, mijoz(4), { type: 'start', payload: 'src_olx' });

  t.clock.set(new Date('2026-11-23T12:00:00Z')); // 17:00
  await davomat(y2, 'keldi');
  await davomat(y3, 'kelmadi');
  return { navoiy, sayhun, p1, p2, p3 };
}

describe('voronka (admin)', () => {
  it("acceptance: the test day's funnel matches what the test Mijozlar did", async () => {
    await testKuni();

    const v = await voronka('dan=2026-11-23&gacha=2026-11-23');

    expect(v.qadamlar.map((q) => q.kalit)).toEqual(['bot_kirdi', 'korildi', 'ariza', 'yozilish', 'keldi']);
    // Every yozilish is also an Ariza («Ko'rishga yozilish» type).
    expect(mijozlar(v)).toEqual([4, 3, 3, 2, 1]);
  });

  it('filters by Manba and by Loyiha; the bot entry has no Loyiha', async () => {
    const { navoiy, sayhun } = await testKuni();
    const day = 'dan=2026-11-23&gacha=2026-11-23';

    expect(mijozlar(await voronka(`${day}&manba=instagram`))).toEqual([2, 2, 2, 1, 1]);
    expect(mijozlar(await voronka(`${day}&manba=olx`))).toEqual([1, 0, 0, 0, 0]);
    expect(mijozlar(await voronka(`${day}&loyihaId=${navoiy.id}`))).toEqual([null, 2, 2, 1, 1]);
    expect(mijozlar(await voronka(`${day}&loyihaId=${sayhun.id}&manba=${encodeURIComponent(TOGRIDAN)}`))).toEqual([null, 1, 1, 1, 0]);
  });

  it('breaks the funnel down by Manba and by Loyiha', async () => {
    await testKuni();

    const v = await voronka('dan=2026-11-23&gacha=2026-11-23');

    expect(v.manbalar).toEqual([
      { manba: 'instagram', mijozlar: [2, 2, 2, 1, 1] },
      { manba: 'olx', mijozlar: [1, 0, 0, 0, 0] },
      { manba: TOGRIDAN, mijozlar: [1, 1, 1, 1, 0] },
    ]);
    expect(v.loyihalar.map((l) => [l.nomi, l.mijozlar])).toEqual([
      ['Navoiy Park', [null, 2, 2, 1, 1]],
      ['Sayhun', [null, 1, 1, 1, 0]],
    ]);
  });

  it('lists the most viewed Planirovkalar of the period', async () => {
    const { navoiy, p1, p2, p3 } = await testKuni();

    const v = await voronka('dan=2026-11-23&gacha=2026-11-23');
    expect(v.engKopKorilgan).toEqual([
      { planirovkaId: p1, loyiha: 'Navoiy Park', blok: 'A', xonalar: 2, maydon: 54, nomi: null, korishlar: 3, mijozlar: 2 },
      { planirovkaId: p2, loyiha: 'Navoiy Park', blok: 'A', xonalar: 3, maydon: 78, nomi: null, korishlar: 1, mijozlar: 1 },
      { planirovkaId: p3, loyiha: 'Sayhun', blok: '1', xonalar: 1, maydon: 40, nomi: null, korishlar: 1, mijozlar: 1 },
    ]);

    const both = await voronka(`dan=2026-11-22&gacha=2026-11-23&loyihaId=${navoiy.id}`);
    expect(both.engKopKorilgan.map((p) => [p.planirovkaId, p.korishlar, p.mijozlar])).toEqual([
      [p1, 4, 3],
      [p2, 1, 1],
    ]);
  });

  it('counts a Mijoz once per step over a longer period, and offers the filter choices', async () => {
    const { navoiy, sayhun } = await testKuni();

    const v = await voronka('dan=2026-11-22&gacha=2026-11-23');

    expect(mijozlar(v)).toEqual([5, 4, 4, 2, 1]);
    expect(v.tanlov.manbalar).toEqual(['instagram', 'olx', TOGRIDAN]);
    expect(v.tanlov.loyihalar).toEqual([
      { id: navoiy.id, nomi: 'Navoiy Park' },
      { id: sayhun.id, nomi: 'Sayhun' },
    ]);
  });

  it('defaults to the last 7 days; rejects a bad period; Administrator only', async () => {
    const headers = await adminLogin(t, 'administrator');
    const get = (q: string) => t.app.inject({ method: 'GET', url: `/admin/api/voronka${q}`, headers });

    const def = await get('');
    expect(def.statusCode).toBe(200);
    expect([def.json().dan, def.json().gacha]).toEqual(['2026-11-17', '2026-11-23']);
    expect((await get('?dan=2026-11-24&gacha=2026-11-23')).statusCode).toBe(400);
    expect((await get('?dan=2026-02-30')).statusCode).toBe(400);
    expect((await get('?dan=2024-01-01&gacha=2026-11-23')).statusCode).toBe(400); // > 366 days

    const menejer = await adminLogin(t, 'menejer');
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/voronka', headers: menejer })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/voronka' })).statusCode).toBe(401);
  });
});
