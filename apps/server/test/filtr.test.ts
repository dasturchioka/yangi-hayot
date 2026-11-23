import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { createTestApp, type TestApp } from './support/test-app';

// Filtrlar (#10): shahar, Loyiha, Blok, xonalar, narx, maydon, «Faqat bo'sh». Qavat: test/shaxmatka.test.ts (#23).

const aziz = { id: 700000010, first_name: 'Aziz', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

function get(url: string) {
  return t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });
}

async function found(query: string): Promise<string[]> {
  const res = await get(`/api/katalog/planirovkalar?${query}`);
  expect(res.statusCode).toBe(200);
  return res.json().planirovkalar.map((p: { loyihaNomi: string; blokNomi: string; xonalar: number; maydon: number }) =>
    `${p.loyihaNomi} ${p.blokNomi} ${p.xonalar}x${p.maydon}`,
  );
}

const mln = (n: number) => n * 1_000_000;

/** Toshkent: Jozibali (A, B) and Sayhun (no prices); Navoiy: Navoiy 9. */
async function seedKatalog() {
  await seedLoyiha(t.db, {
    nomi: 'Jozibali',
    bloklar: [
      blok('A', [
        { xonalar: 1, maydon: 38, boshlangichNarx: mln(400), bosh: 3 },
        { xonalar: 2, maydon: 54, boshlangichNarx: mln(520), bosh: 0, bron: 2 }, // band
        { xonalar: 3, maydon: 80, boshlangichNarx: mln(700), bosh: 0, bron: 0, sotilgan: 4 }, // sotilgan
      ]),
      blok('B', [
        { xonalar: 2, maydon: 60, boshlangichNarx: mln(560), bosh: 1 },
        { xonalar: 4, maydon: 110, boshlangichNarx: mln(800), bosh: 1 },
        { xonalar: 5, maydon: 130, boshlangichNarx: mln(950), bosh: 1 },
      ]),
    ],
  });
  await seedLoyiha(t.db, { nomi: 'Sayhun', bloklar: [blok('A', [{ xonalar: 2, maydon: 58, bosh: 2 }])] });
  await seedLoyiha(t.db, {
    nomi: 'Navoiy 9',
    shahar: 'navoiy',
    bloklar: [blok('A', [{ xonalar: 2, maydon: 56, boshlangichNarx: mln(300), bosh: 5 }])],
  });
  await seedLoyiha(t.db, {
    nomi: 'Topshirilgan',
    holat: 'topshirilgan',
    bloklar: [blok('A', [{ xonalar: 2, maydon: 50, boshlangichNarx: mln(200), bosh: 5 }])],
  });
}

describe('Planirovkalar filtri', () => {
  it('without filters lists every Planirovka of Sotuvdagi Loyihalar, cheapest first, unpriced last', async () => {
    await seedKatalog();
    expect(await found('')).toEqual([
      'Navoiy 9 A 2x56',
      'Jozibali A 1x38',
      'Jozibali A 2x54',
      'Jozibali B 2x60',
      'Jozibali A 3x80',
      'Jozibali B 4x110',
      'Jozibali B 5x130',
      'Sayhun A 2x58',
    ]);
  });

  it('filters by shahar, Loyiha and Blok', async () => {
    await seedKatalog();
    expect(await found('shahar=navoiy')).toEqual(['Navoiy 9 A 2x56']);
    const { loyihalar } = (await get('/api/katalog/filtr?shahar=toshkent')).json();
    const jozibali = loyihalar.find((l: { nomi: string }) => l.nomi === 'Jozibali');
    expect(loyihalar.map((l: { nomi: string }) => l.nomi)).toEqual(['Jozibali', 'Sayhun']);
    expect(await found(`loyiha=${jozibali.id}&blok=${jozibali.bloklar[1].id}`)).toEqual([
      'Jozibali B 2x60',
      'Jozibali B 4x110',
      'Jozibali B 5x130',
    ]);
  });

  it('filters by several xonalar; 4 means «4+»', async () => {
    await seedKatalog();
    expect(await found('shahar=toshkent&xonalar=1,4')).toEqual([
      'Jozibali A 1x38',
      'Jozibali B 4x110',
      'Jozibali B 5x130',
    ]);
  });

  it('filters by narx and maydon ranges (inclusive); a price range leaves out «Narx so\'rov bo\'yicha»', async () => {
    await seedKatalog();
    expect(await found(`shahar=toshkent&narxDan=${mln(520)}&narxGacha=${mln(800)}`)).toEqual([
      'Jozibali A 2x54',
      'Jozibali B 2x60',
      'Jozibali A 3x80',
      'Jozibali B 4x110',
    ]);
    expect(await found('shahar=toshkent&maydonDan=54&maydonGacha=60')).toEqual([
      'Jozibali A 2x54',
      'Jozibali B 2x60',
      'Sayhun A 2x58',
    ]);
  });

  it("«Faqat bo'sh» hides Band and Sotilgan Planirovkalar", async () => {
    await seedKatalog();
    expect(await found('shahar=toshkent&xonalar=2,3&faqatBosh=1')).toEqual(['Jozibali B 2x60', 'Sayhun A 2x58']);
  });

  it('rejects unknown keys and nonsense', async () => {
    await seedKatalog();
    expect((await get('/api/katalog/planirovkalar?qavat=7')).statusCode).toBe(400);
    expect((await get('/api/katalog/planirovkalar?xonalar=abc')).statusCode).toBe(400);
    expect((await get('/api/katalog/planirovkalar?shahar=samarqand')).statusCode).toBe(400);
  });
});

describe('Filtr variantlari va byudjet oraliqlari', () => {
  it('gives narx and maydon bounds and 4 equal budget ranges from the cheapest to the dearest Boshlang\'ich narx', async () => {
    await seedLoyiha(t.db, {
      nomi: 'Jozibali',
      bloklar: [
        blok('A', [
          { xonalar: 1, maydon: 38, boshlangichNarx: mln(400) },
          { xonalar: 3, maydon: 90, boshlangichNarx: mln(800) },
          { xonalar: 2, maydon: 50 }, // no price: not in the ranges
        ]),
      ],
    });
    await seedLoyiha(t.db, {
      shahar: 'navoiy',
      bloklar: [blok('A', [{ xonalar: 2, maydon: 56, boshlangichNarx: mln(200) }])],
    });

    const res = await get('/api/katalog/filtr?shahar=toshkent');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narx).toEqual({ min: mln(400), max: mln(800) });
    expect(body.maydon).toEqual({ min: 38, max: 90 });
    expect(body.byudjet).toEqual([
      { dan: mln(400), gacha: mln(500) },
      { dan: mln(500), gacha: mln(600) },
      { dan: mln(600), gacha: mln(700) },
      { dan: mln(700), gacha: mln(800) },
    ]);
    // Both cities when none is chosen.
    expect((await get('/api/katalog/filtr')).json().byudjet[0]).toEqual({ dan: mln(200), gacha: mln(350) });
  });

  it('rounds range bounds to whole millions', async () => {
    await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ boshlangichNarx: 455_500_000 }, { xonalar: 3, boshlangichNarx: 912_300_000 }])],
    });
    expect((await get('/api/katalog/filtr')).json().byudjet).toEqual([
      { dan: mln(455), gacha: mln(570) },
      { dan: mln(570), gacha: mln(684) },
      { dan: mln(684), gacha: mln(799) },
      { dan: mln(799), gacha: mln(913) },
    ]);
  });

  it('no prices → no budget ranges', async () => {
    await seedLoyiha(t.db, { bloklar: [blok('A', [{}])] });
    const body = (await get('/api/katalog/filtr')).json();
    expect(body.byudjet).toEqual([]);
    expect(body.narx).toBeNull();
  });

  it('the Administrator can replace the ranges in the admin-panel, and go back to automatic ones', async () => {
    await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ boshlangichNarx: mln(400) }, { xonalar: 3, boshlangichNarx: mln(800) }])],
    });
    const admin = await adminLogin(t, 'administrator');
    const qolda = [
      { dan: null, gacha: mln(500) },
      { dan: mln(500), gacha: mln(700) },
      { dan: mln(700), gacha: null },
    ];

    const before = await t.app.inject({ method: 'GET', url: '/admin/api/kviz/byudjet', headers: admin });
    expect(before.json()).toEqual({ qolda: null, avtomatik: expect.any(Array) });

    const put = await t.app.inject({ method: 'PUT', url: '/admin/api/kviz/byudjet', headers: admin, payload: { qolda } });
    expect(put.statusCode).toBe(200);
    expect((await get('/api/katalog/filtr')).json().byudjet).toEqual(qolda);

    await t.app.inject({ method: 'PUT', url: '/admin/api/kviz/byudjet', headers: admin, payload: { qolda: null } });
    expect((await get('/api/katalog/filtr')).json().byudjet).toHaveLength(4);
  });

  it('only the Administrator changes the ranges, and they must make sense', async () => {
    const menejer = await adminLogin(t, 'menejer');
    const admin = await adminLogin(t, 'administrator');
    const put = (headers: { cookie: string }, qolda: unknown) =>
      t.app.inject({ method: 'PUT', url: '/admin/api/kviz/byudjet', headers, payload: { qolda } });

    expect((await put(menejer, [{ dan: null, gacha: mln(500) }, { dan: mln(500), gacha: null }])).statusCode).toBe(403);
    expect((await put(admin, [{ dan: mln(500), gacha: mln(400) }, { dan: mln(500), gacha: null }])).statusCode).toBe(400);
    expect((await put(admin, [{ dan: null, gacha: null }])).statusCode).toBe(400); // fewer than 2
  });
});
