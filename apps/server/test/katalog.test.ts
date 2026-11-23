import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, planirovka, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

describe('Katalog in the Mini App', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const get = (url: string) =>
    t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });

  it('lists only Sotuvdagi Loyihalar of the chosen city', async () => {
    await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', shahar: 'toshkent' });
    await seedLoyiha(t.db, { nomi: 'Sayhun', shahar: 'toshkent' });
    await seedLoyiha(t.db, { nomi: 'Qizilqum', shahar: 'navoiy' });
    await seedLoyiha(t.db, { nomi: 'Bahor', shahar: 'toshkent', holat: 'topshirilgan' });

    const res = await get('/api/katalog/loyihalar?shahar=toshkent');

    expect(res.statusCode).toBe(200);
    expect(res.json().loyihalar.map((l: { nomi: string }) => l.nomi)).toEqual(['Jozibali Maskan', 'Sayhun']);
  });

  it("derives Planirovka holati from the counts: bo'sh → Sotuvda, only bron → Band, else Sotilgan", async () => {
    const { id } = await seedLoyiha(t.db, {
      bloklar: [
        blok('A', [
          { xonalar: 1, bosh: 3, bron: 1, sotilgan: 10 },
          { xonalar: 2, bosh: 0, bron: 1, sotilgan: 5 },
          { xonalar: 3, bosh: 0, bron: 0, sotilgan: 7 },
        ]),
      ],
    });

    const res = await get(`/api/katalog/loyihalar/${id}`);

    const holatlar = res
      .json()
      .loyiha.bloklar[0].guruhlar.map((g: { planirovkalar: { holat: string; bosh: number }[] }) => [
        g.planirovkalar[0]!.holat,
        g.planirovkalar[0]!.bosh,
      ]);
    expect(holatlar).toEqual([
      ['sotuvda', 3],
      ['band', 0],
      ['sotilgan', 0],
    ]);
  });

  it('opens a Sotilgan Planirovka too, so the Mini App can show it greyed out', async () => {
    const l = await seedLoyiha(t.db, { bloklar: [blok('A', [{ bosh: 0, bron: 0, sotilgan: 4 }])] });

    const res = await get(`/api/katalog/planirovkalar/${l.bloklar[0]!.planirovkalar[0]!.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().planirovka.holat).toBe('sotilgan');
  });

  it("counts the Loyiha's bo'sh Xonadonlar as the sum over all its Planirovkalar", async () => {
    await seedLoyiha(t.db, {
      bloklar: [
        blok('A', [
          { bosh: 3, bron: 1 },
          { bosh: 0, sotilgan: 9 },
        ]),
        blok('B', [{ bosh: 4 }, { bosh: 2, bron: 2, sotilgan: 1 }]),
      ],
    });

    const [card] = (await get('/api/katalog/loyihalar')).json().loyihalar;
    const { loyiha } = (await get(`/api/katalog/loyihalar/${card.id}`)).json();

    expect(card.boshXonadonlar).toBe(9);
    expect(card.bloklarSoni).toBe(2);
    expect(loyiha.boshXonadonlar).toBe(9);
    expect(loyiha.jamiXonadonlar).toBe(22);
    expect(loyiha.bloklar.map((b: { nomi: string; boshXonadonlar: number }) => [b.nomi, b.boshXonadonlar])).toEqual([
      ['A', 3],
      ['B', 6],
    ]);
  });

  it("groups each Blok's Planirovkalar by xonalar soni, smaller first", async () => {
    const { id } = await seedLoyiha(t.db, {
      bloklar: [
        blok('A', [
          { xonalar: 3, maydon: 82.5 },
          { xonalar: 1, maydon: 38 },
          { xonalar: 2, maydon: 61 },
          { xonalar: 2, maydon: 54, nomi: { ru: 'Угловая', uz: 'Burchak' } },
        ]),
      ],
    });

    const { loyiha } = (await get(`/api/katalog/loyihalar/${id}`)).json();

    const guruhlar = loyiha.bloklar[0].guruhlar.map(
      (g: { xonalar: number; planirovkalar: { maydon: number; nomi: string | null }[] }) => [
        g.xonalar,
        g.planirovkalar.map((p) => [p.maydon, p.nomi]),
      ],
    );
    expect(guruhlar).toEqual([
      [1, [[38, null]]],
      [
        2,
        [
          [54, 'Burchak'],
          [61, null],
        ],
      ],
      [3, [[82.5, null]]],
    ]);
  });

  it("shows the Loyiha's Boshlang'ich narx as the cheapest Planirovka still on sale", async () => {
    await seedLoyiha(t.db, {
      bloklar: [
        blok('A', [
          { boshlangichNarx: 380_000_000, bosh: 0, sotilgan: 5 },
          { boshlangichNarx: 520_000_000, bosh: 2 },
          { boshlangichNarx: 455_500_000, bosh: 1 },
          { boshlangichNarx: null, bosh: 6 },
        ]),
      ],
    });

    const [card] = (await get('/api/katalog/loyihalar')).json().loyihalar;

    expect(card.boshlangichNarx).toBe(455_500_000);
  });

  it("has no price when the Planirovka's Boshlang'ich narx is empty («Narx so'rov bo'yicha»)", async () => {
    const l = await seedLoyiha(t.db, { bloklar: [blok('A', [{ boshlangichNarx: null }])] });

    const { planirovka } = (await get(`/api/katalog/planirovkalar/${l.bloklar[0]!.planirovkalar[0]!.id}`)).json();
    const [card] = (await get('/api/katalog/loyihalar')).json().loyihalar;

    expect(planirovka.boshlangichNarx).toBeNull();
    expect(card.boshlangichNarx).toBeNull();
  });

  it("shows a Sotuvdagi Loyiha without Planirovkalar, with no price and nothing bo'sh", async () => {
    const { id } = await seedLoyiha(t.db, { nomi: 'Gulzor', shahar: 'navoiy' });

    const [card] = (await get('/api/katalog/loyihalar?shahar=navoiy')).json().loyihalar;
    const { loyiha } = (await get(`/api/katalog/loyihalar/${id}`)).json();

    expect(card).toMatchObject({ nomi: 'Gulzor', boshlangichNarx: null, boshXonadonlar: 0, bloklarSoni: 0 });
    expect(loyiha.bloklar).toEqual([]);
  });

  it('hides Topshirilgan Loyihalar and their Planirovkalar entirely', async () => {
    const l = await seedLoyiha(t.db, { holat: 'topshirilgan', bloklar: [blok('A', [{ bosh: 2 }])] });

    expect((await get('/api/katalog/loyihalar')).json().loyihalar).toEqual([]);
    expect((await get(`/api/katalog/loyihalar/${l.id}`)).statusCode).toBe(404);
    expect((await get(`/api/katalog/planirovkalar/${l.bloklar[0]!.planirovkalar[0]!.id}`)).statusCode).toBe(404);
  });

  it('gives a video only for Telegram-channel and YouTube links', async () => {
    const l = await seedLoyiha(t.db, {
      video: 'https://t.me/yangi_hayot_official/120',
      bloklar: [
        blok('A', [
          { xonalar: 1, video: 'https://youtu.be/dQw4w9WgXcQ' },
          { xonalar: 2, video: null },
          { xonalar: 3, video: 'https://example.com/tour.mp4' },
        ]),
      ],
    });

    const { loyiha } = (await get(`/api/katalog/loyihalar/${l.id}`)).json();

    expect(loyiha.video).toEqual({ kind: 'telegram', url: 'https://t.me/yangi_hayot_official/120' });
    expect(
      loyiha.bloklar[0].guruhlar.map((g: { planirovkalar: { video: unknown }[] }) => g.planirovkalar[0]!.video),
    ).toEqual([{ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' }, null, null]);
  });

  it('answers in the language asked for', async () => {
    const { id } = await seedLoyiha(t.db, {
      manzil: { ru: 'Яшнабадский район', uz: 'Yashnobod tumani' },
      infratuzilma: [
        {
          kategoriya: 'transport',
          nomi: { ru: 'Метро Пушкин', uz: 'Pushkin metrosi' },
          masofa: { ru: '1,8 км', uz: '1,8 km' },
        },
      ],
    });

    const ru = (await get(`/api/katalog/loyihalar/${id}?lang=ru`)).json().loyiha;
    const uz = (await get(`/api/katalog/loyihalar/${id}?lang=uz`)).json().loyiha;

    expect([ru.manzil, ru.infratuzilma]).toEqual([
      'Яшнабадский район',
      [{ kategoriya: 'transport', nomi: 'Метро Пушкин', masofa: '1,8 км' }],
    ]);
    expect([uz.manzil, uz.infratuzilma]).toEqual([
      'Yashnobod tumani',
      [{ kategoriya: 'transport', nomi: 'Pushkin metrosi', masofa: '1,8 km' }],
    ]);
  });

  it('requires valid initData', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/katalog/loyihalar' });

    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown city', async () => {
    expect((await get('/api/katalog/loyihalar?shahar=samarqand')).statusCode).toBe(400);
  });
});
