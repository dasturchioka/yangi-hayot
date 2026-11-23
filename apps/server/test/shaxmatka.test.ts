import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { createTestApp, type TestApp } from './support/test-app';

// Shaxmatka va Xonadon kartochkasi (#23, UF-1, ADR 0003).

const aziz: TelegramTestUser = { id: 700000023, first_name: 'Aziz', language_code: 'uz' };
const mln = (n: number) => n * 1_000_000;

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

function get(url: string, user: TelegramTestUser = aziz) {
  return t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(user, { authDate: t.clock.now() })) });
}

/**
 * Jozibali, Blok A:
 *   P1 2 xona 54 m² (qo'lda 500 mln): q2 r1 bo'sh 480 mln, q5 r9 bron, q9 r17 bo'sh (qo'lda narx)
 *   P2 3 xona 78 m²: q2 r2 sotilgan 700 mln, q3 r4 bo'sh 720 mln
 */
async function seedBlok() {
  const loyiha = await seedLoyiha(t.db, {
    nomi: 'Jozibali',
    bloklar: [
      blok('A', [
        {
          xonalar: 2,
          maydon: 54,
          boshlangichNarx: mln(500),
          xonadonlar: [
            { qavat: 2, raqam: 1, narx: mln(480) },
            { qavat: 5, raqam: 9, holat: 'bron' },
            { qavat: 9, raqam: 17 },
          ],
        },
        {
          xonalar: 3,
          maydon: 78,
          xonadonlar: [
            { qavat: 2, raqam: 2, holat: 'sotilgan', narx: mln(700) },
            { qavat: 3, raqam: 4, narx: mln(720) },
          ],
        },
      ]),
    ],
  });
  const [p1, p2] = loyiha.bloklar[0]!.planirovkalar.map((p) => p.id) as [number, number];
  return { loyiha, blokId: loyiha.bloklar[0]!.id, p1, p2 };
}

describe('Qavat filtri (UF-1)', () => {
  it('finds the Planirovkalar that have a Xonadon on those floors', async () => {
    const { p1, p2 } = await seedBlok();
    const ids = async (q: string) => {
      const res = await get(`/api/katalog/planirovkalar?${q}`);
      expect(res.statusCode).toBe(200);
      return res.json().planirovkalar.map((p: { id: number }) => p.id).sort();
    };

    expect(await ids('qavatDan=5')).toEqual([p1]);
    expect(await ids('qavatDan=3&qavatGacha=4')).toEqual([p2]);
    expect(await ids('qavatGacha=2')).toEqual([p1, p2].sort()); // P2's sold Xonadon is still listed…
    expect(await ids('qavatGacha=2&faqatBosh=1')).toEqual([p1]); // …but not as bo'sh
    expect(await ids('qavatDan=5&qavatGacha=5&faqatBosh=1')).toEqual([]); // only a bron one there
    // With a floor, narx is the Xonadon's own: on floor 9 P1 costs its qo'lda 500 mln.
    expect(await ids('qavatDan=9&narxGacha=490000000')).toEqual([]);
    expect(await ids('qavatDan=2&qavatGacha=2&narxGacha=490000000')).toEqual([p1]);
    expect((await get('/api/katalog/planirovkalar?qavatDan=abc')).statusCode).toBe(400);
  });
});

describe('Xonadon filtri (shaxmatka highlighting, AI-menejer)', () => {
  it("lists the Xonadonlar matching every field, sotilgan included unless «Faqat bo'sh»", async () => {
    const { blokId } = await seedBlok();
    const raqamlar = async (q: string) => {
      const res = await get(`/api/katalog/xonadonlar?${q}`);
      expect(res.statusCode).toBe(200);
      return res.json().xonadonlar.map((x: { raqam: number }) => x.raqam);
    };

    expect(await raqamlar(`blok=${blokId}`)).toEqual([1, 2, 4, 9, 17]); // qavat, then raqam
    expect(await raqamlar(`blok=${blokId}&xonalar=2`)).toEqual([1, 9, 17]);
    expect(await raqamlar(`blok=${blokId}&qavatDan=2&qavatGacha=3`)).toEqual([1, 2, 4]);
    expect(await raqamlar(`blok=${blokId}&qavatDan=2&qavatGacha=3&faqatBosh=1`)).toEqual([1, 4]);
    expect(await raqamlar(`blok=${blokId}&narxDan=490000000&narxGacha=710000000`)).toEqual([2, 9, 17]); // 700 sold; 9 and 17 at P1's qo'lda 500
    expect(await raqamlar(`blok=${blokId}&maydonDan=60`)).toEqual([2, 4]);
    expect(await raqamlar('shahar=navoiy')).toEqual([]);
    expect((await get('/api/katalog/xonadonlar?qavat=3')).statusCode).toBe(400);
    expect((await get('/api/katalog/filtr?shahar=toshkent')).json().qavat).toEqual({ min: 2, max: 9 }); // the sheet's qavat bounds
  });
});

describe('Shaxmatka of a Blok', () => {
  it('a 200-Xonadon Blok comes as one compact payload, quickly', async () => {
    const loyiha = await seedLoyiha(t.db, {
      qavatlarSoni: 20,
      bloklar: [
        blok('A', [
          { xonalar: 1, maydon: 38.5, boshlangichNarx: mln(400), bosh: 40, bron: 5, sotilgan: 15 },
          { xonalar: 2, maydon: 54, boshlangichNarx: mln(520), bosh: 40, bron: 5, sotilgan: 15 },
          { xonalar: 3, maydon: 78, bosh: 30, bron: 5, sotilgan: 5 },
          { xonalar: 4, maydon: 102, boshlangichNarx: mln(990), bosh: 30, bron: 5, sotilgan: 5 },
        ]),
      ],
    });
    const blokId = loyiha.bloklar[0]!.id;

    await get(`/api/katalog/bloklar/${blokId}/shaxmatka`); // warm the snapshot
    const started = performance.now();
    const res = await get(`/api/katalog/bloklar/${blokId}/shaxmatka`);
    const ms = performance.now() - started;

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.blok).toEqual({ id: blokId, nomi: 'A', loyihaId: loyiha.id, loyihaNomi: expect.any(String), shahar: 'toshkent' });
    expect(body.planirovkalar).toHaveLength(4);
    expect(body.planirovkalar[0]).toEqual({ id: expect.any(Number), xonalar: 1, maydon: 38.5 });
    expect(body.xonadonlar).toHaveLength(200);
    expect(Object.keys(body.xonadonlar[0]).sort()).toEqual(['holat', 'id', 'narx', 'planirovkaId', 'qavat', 'raqam']);
    const holatlar: string[] = body.xonadonlar.map((x: { holat: string }) => x.holat);
    expect([holatlar.filter((h) => h === 'bosh').length, holatlar.filter((h) => h === 'sotilgan').length]).toEqual([140, 40]);
    // Sorted by qavat, then raqam.
    const order: number[] = body.xonadonlar.map((x: { qavat: number; raqam: number }) => x.qavat * 10_000 + x.raqam);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // ~80 bytes a cell: well within a 2 s budget on 4G even before gzip.
    expect(res.payload.length).toBeLessThan(20_000);
    expect(ms).toBeLessThan(200);
  });

  it('shows an admin-panel holat change within a minute; unknown Blok → 404', async () => {
    const { blokId } = await seedBlok();
    const holat = async () =>
      (await get(`/api/katalog/bloklar/${blokId}/shaxmatka`)).json().xonadonlar.find((x: { raqam: number }) => x.raqam === 17).holat;
    expect(await holat()).toBe('bosh');

    await t.db.query(`UPDATE xonadon SET holat = 'bron' WHERE blok_id = $1 AND raqam = 17`, [blokId]); // written elsewhere
    t.clock.advance({ minutes: 1 });
    expect(await holat()).toBe('bron');

    expect((await get('/api/katalog/bloklar/999999/shaxmatka')).statusCode).toBe(404);
  });
});

describe('Xonadon kartochkasi', () => {
  it('comes with its Planirovka (chizma, video) and its own narx', async () => {
    const { p1 } = await seedBlok();
    const { rows } = await t.db.query<{ id: number }>('SELECT id FROM xonadon WHERE planirovka_id = $1 AND raqam = 1', [p1]);
    const res = await get(`/api/katalog/xonadonlar/${rows[0]!.id}?lang=ru`);
    expect(res.statusCode).toBe(200);
    expect(res.json().xonadon).toMatchObject({ qavat: 2, raqam: 1, blokNomi: 'A', xonalar: 2, maydon: 54, narx: mln(480), holat: 'bosh' });
    expect(res.json().planirovka).toMatchObject({ id: p1, loyihaNomi: 'Jozibali', boshlangichNarx: mln(480) });
  });

  it("an opening is a «xonadon ko'rildi» event (funnel «ko'rdi» step, most viewed) and interest in the city", async () => {
    const { p1, loyiha } = await seedBlok();
    const navoiy = await seedLoyiha(t.db, { shahar: 'navoiy', bloklar: [blok('B', [{ bosh: 2 }])] });
    const { rows } = await t.db.query<{ id: number }>('SELECT id FROM xonadon WHERE planirovka_id = $1 AND raqam = 9', [p1]);
    const vali: TelegramTestUser = { id: 700000024, first_name: 'Vali', language_code: 'uz' };
    await get('/api/me');
    await get('/api/me', vali);

    expect((await get(`/api/katalog/xonadonlar/${rows[0]!.id}`)).statusCode).toBe(200);
    expect((await get(`/api/katalog/xonadonlar/${rows[0]!.id}`)).statusCode).toBe(200);
    expect((await get(`/api/katalog/bloklar/${navoiy.bloklar[0]!.id}/shaxmatka`, vali)).statusCode).toBe(200);

    const admin = await adminLogin(t, 'administrator');
    const v = (await t.app.inject({ method: 'GET', url: `/admin/api/voronka?loyihaId=${loyiha.id}`, headers: admin })).json();
    expect(v.qadamlar.find((q: { kalit: string }) => q.kalit === 'korildi').mijozlar).toBe(1);
    expect(v.engKopKorilgan.map((p: { planirovkaId: number; korishlar: number }) => [p.planirovkaId, p.korishlar])).toEqual([[p1, 2]]);

    const audiences = (await t.app.inject({ method: 'GET', url: '/admin/api/rassilka/audiences', headers: admin })).json();
    expect(audiences).toMatchObject({ all: 2, toshkent: 1, navoiy: 1 });
  });
});
