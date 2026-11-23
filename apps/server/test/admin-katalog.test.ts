import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, TEST_AI_API_KEY, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

const jozibali = {
  nomi: 'Jozibali Maskan',
  shahar: 'toshkent',
  holat: 'sotuvda',
  manzil: { ru: 'Яшнабадский район', uz: 'Yashnobod tumani' },
};

describe('Katalog in the admin-panel', () => {
  let t: TestApp;
  let admin: { cookie: string };
  beforeEach(async () => {
    t = await createTestApp();
    admin = await adminLogin(t, 'administrator', { nomi: 'Rahbar' });
  });
  afterEach(async () => {
    await t.close();
  });

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, headers: { cookie: string }, payload?: object) =>
    t.app.inject({ method, url: `/admin/api/katalog${url}`, headers, payload });
  const miniApp = (url: string) =>
    t.app.inject({ method: 'GET', url: `/api/katalog${url}`, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });
  const ai = (url: string) =>
    t.app.inject({ method: 'GET', url: `/ai/katalog${url}`, headers: { authorization: `Bearer ${TEST_AI_API_KEY}` } });

  /** Loyiha → Blok A → one Planirovka, through the admin API. */
  async function createKatalog(p: object = {}) {
    const loyiha = (await call('POST', '/loyihalar', admin, jozibali)).json().loyiha;
    const blok = (await call('POST', `/loyihalar/${loyiha.id}/bloklar`, admin, { nomi: 'A' })).json().blok;
    const res = await call('POST', `/bloklar/${blok.id}/planirovkalar`, admin, {
      xonalar: 2,
      maydon: 54.5,
      boshlangichNarx: 455_500_000,
      bosh: 5,
      bron: 1,
      sotilgan: 4,
      ...p,
    });
    expect(res.statusCode).toBe(200);
    return { loyiha, blok, planirovka: res.json().planirovka };
  }

  it('lets the Administrator create a Loyiha, Blok and Planirovka that the Mini App shows', async () => {
    const { loyiha, planirovka } = await createKatalog({ nomi: { ru: 'Угловая', uz: 'Burchak' } });

    expect(planirovka).toMatchObject({ bosh: 5, bron: 1, sotilgan: 4, jami: 10, holat: 'sotuvda' });
    const shown = (await miniApp(`/planirovkalar/${planirovka.id}?lang=uz`)).json().planirovka;
    expect(shown).toMatchObject({
      loyihaId: loyiha.id,
      blokNomi: 'A',
      xonalar: 2,
      maydon: 54.5,
      nomi: 'Burchak',
      boshlangichNarx: 455_500_000,
      bosh: 5,
      holat: 'sotuvda',
    });
  });

  it('shows an admin change in the Mini App and the AI API at once (well within one minute)', async () => {
    const { planirovka } = await createKatalog({ bosh: 1, bron: 0, boshlangichNarx: 400_000_000 });
    const menejer = await adminLogin(t, 'menejer');
    await miniApp(`/planirovkalar/${planirovka.id}`);
    await ai(`/planirovkalar/${planirovka.id}`);

    await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { boshlangichNarx: 420_000_000 });
    await call('POST', `/planirovkalar/${planirovka.id}/kochirish`, menejer, { dan: 'bosh', ga: 'bron', soni: 1 });

    for (const res of [await miniApp(`/planirovkalar/${planirovka.id}`), await ai(`/planirovkalar/${planirovka.id}`)]) {
      const { planirovka: shown } = res.json();
      expect([shown.holat, shown.boshlangichNarx]).toEqual(['band', 420_000_000]);
    }
  });

  it("moves Xonadonlar bo'sh → bron → sotilgan and back keeping bo'sh + bron + sotilgan = jami", async () => {
    const { planirovka } = await createKatalog({ bosh: 5, bron: 1, sotilgan: 4 });
    const menejer = await adminLogin(t, 'menejer');
    const move = (dan: string, ga: string, soni: number) =>
      call('POST', `/planirovkalar/${planirovka.id}/kochirish`, menejer, { dan, ga, soni });

    const counts = async (dan: string, ga: string, soni: number) => {
      const p = (await move(dan, ga, soni)).json().planirovka;
      return [p.bosh, p.bron, p.sotilgan, p.jami];
    };

    expect(await counts('bosh', 'bron', 2)).toEqual([3, 3, 4, 10]);
    expect(await counts('bron', 'sotilgan', 3)).toEqual([3, 0, 7, 10]);
    expect(await counts('sotilgan', 'bron', 1)).toEqual([3, 1, 6, 10]);
    expect(await counts('bron', 'bosh', 1)).toEqual([4, 0, 6, 10]);
  });

  it("shows who changed each Planirovka last («Oxirgi o'zgarish»)", async () => {
    const { loyiha, planirovka } = await createKatalog();
    const menejer = await adminLogin(t, 'menejer', { nomi: 'Dilnoza' });
    t.clock.advance({ hours: 2 });
    await call('POST', `/planirovkalar/${planirovka.id}/kochirish`, menejer, { dan: 'bosh', ga: 'bron', soni: 1 });

    const tree = (await call('GET', `/loyihalar/${loyiha.id}`, admin)).json().loyiha;
    expect(tree.bloklar[0].planirovkalar[0].oxirgiOzgarish).toEqual({
      nomi: 'Dilnoza',
      at: t.clock.now().toISOString(),
    });
  });

  it('refuses to move more Xonadonlar than there are', async () => {
    const { planirovka } = await createKatalog({ bosh: 1, bron: 0, sotilgan: 0 });

    const res = await call('POST', `/planirovkalar/${planirovka.id}/kochirish`, admin, { dan: 'bosh', ga: 'sotilgan', soni: 2 });

    expect(res.statusCode).toBe(409);
    const shown = (await miniApp(`/planirovkalar/${planirovka.id}`)).json().planirovka;
    expect([shown.bosh, shown.holat]).toEqual([1, 'sotuvda']);
  });

  it("lets only the Administrator change jami, through bo'sh, never below bron + sotilgan", async () => {
    const { planirovka } = await createKatalog({ bosh: 2, bron: 1, sotilgan: 4 });
    const menejer = await adminLogin(t, 'menejer');

    expect((await call('PATCH', `/planirovkalar/${planirovka.id}`, menejer, { jami: 12 })).statusCode).toBe(403);

    const up = (await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { jami: 12 })).json().planirovka;
    expect([up.bosh, up.bron, up.sotilgan, up.jami]).toEqual([7, 1, 4, 12]);
    expect((await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { jami: 4 })).statusCode).toBe(409);
    const down = (await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { jami: 5 })).json().planirovka;
    expect([down.bosh, down.bron, down.sotilgan, down.jami]).toEqual([0, 1, 4, 5]);
  });

  it('lets a Menejer only read the katalog and move Xonadonlar', async () => {
    const { loyiha, blok, planirovka } = await createKatalog();
    const menejer = await adminLogin(t, 'menejer');

    expect((await call('GET', '/loyihalar', menejer)).statusCode).toBe(200);
    expect((await call('GET', `/loyihalar/${loyiha.id}`, menejer)).statusCode).toBe(200);
    expect((await call('POST', '/loyihalar', menejer, jozibali)).statusCode).toBe(403);
    expect((await call('PATCH', `/loyihalar/${loyiha.id}`, menejer, { holat: 'topshirilgan' })).statusCode).toBe(403);
    expect((await call('POST', `/loyihalar/${loyiha.id}/bloklar`, menejer, { nomi: 'B' })).statusCode).toBe(403);
    expect((await call('PATCH', `/bloklar/${blok.id}`, menejer, { nomi: 'B' })).statusCode).toBe(403);
    expect((await call('POST', `/bloklar/${blok.id}/planirovkalar`, menejer, { xonalar: 1, maydon: 30, bosh: 1 })).statusCode).toBe(403);
    expect((await call('PATCH', `/planirovkalar/${planirovka.id}`, menejer, { boshlangichNarx: 1 })).statusCode).toBe(403);
    expect((await call('POST', `/planirovkalar/${planirovka.id}/kochirish`, menejer, { dan: 'bosh', ga: 'bron', soni: 1 })).statusCode).toBe(200);
  });

  it('hides a Loyiha from the Mini App once it is Topshirilgan, but keeps it in the admin-panel', async () => {
    const { loyiha } = await createKatalog();

    await call('PATCH', `/loyihalar/${loyiha.id}`, admin, { holat: 'topshirilgan' });

    expect((await miniApp(`/loyihalar/${loyiha.id}`)).statusCode).toBe(404);
    const list = (await call('GET', '/loyihalar', admin)).json().loyihalar;
    expect(list).toEqual([
      expect.objectContaining({ id: loyiha.id, holat: 'topshirilgan', bloklarSoni: 1, planirovkalarSoni: 1, jami: 10 }),
    ]);
  });

  it('edits Planirovka fields and returns the whole Loyiha tree to the admin', async () => {
    const { loyiha, blok, planirovka } = await createKatalog();

    await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, {
      xonalar: 3,
      maydon: 72,
      nomi: { ru: 'Угловая', uz: 'Burchak' },
      chizma: '/media/planirovka/a-3.webp',
      video: 'https://t.me/yangihayot/123',
      boshlangichNarx: null,
    });
    await call('PATCH', `/bloklar/${blok.id}`, admin, { nomi: 'B' });

    const tree = (await call('GET', `/loyihalar/${loyiha.id}`, admin)).json().loyiha;
    expect(tree.bloklar).toEqual([
      expect.objectContaining({
        nomi: 'B',
        planirovkalar: [
          expect.objectContaining({
            xonalar: 3,
            maydon: 72,
            nomi: { ru: 'Угловая', uz: 'Burchak' },
            chizma: '/media/planirovka/a-3.webp',
            video: 'https://t.me/yangihayot/123',
            boshlangichNarx: null,
          }),
        ],
      }),
    ]);
    const shown = (await miniApp(`/planirovkalar/${planirovka.id}`)).json().planirovka;
    expect([shown.blokNomi, shown.boshlangichNarx, shown.video]).toEqual(['B', null, { kind: 'telegram', url: 'https://t.me/yangihayot/123' }]);
  });

  it('rejects a video link the Mini App cannot open and a duplicate Blok', async () => {
    const { loyiha, planirovka } = await createKatalog();

    expect((await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { video: 'https://vimeo.com/1' })).statusCode).toBe(400);
    expect((await call('POST', `/loyihalar/${loyiha.id}/bloklar`, admin, { nomi: 'A' })).statusCode).toBe(409);
  });

  it('gives a new Loyiha a slug from its nomi and refuses a taken one', async () => {
    const first = await call('POST', '/loyihalar', admin, { ...jozibali, nomi: "Bog'i Eram" });
    expect(first.json().loyiha.slug).toBe('bogi-eram');
    expect((await call('POST', '/loyihalar', admin, { ...jozibali, nomi: "Bog'i Eram" })).statusCode).toBe(409);
  });
});
