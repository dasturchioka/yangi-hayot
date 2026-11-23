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

describe('Xonadonlar (ADR 0003)', () => {
  let t: TestApp;
  let admin: { cookie: string };
  beforeEach(async () => {
    t = await createTestApp();
    admin = await adminLogin(t, 'administrator', { nomi: 'Rahbar' });
  });
  afterEach(async () => {
    await t.close();
  });

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: { cookie: string }, payload?: object) =>
    t.app.inject({ method, url: `/admin/api/katalog${url}`, headers, payload });
  const miniApp = (url: string) =>
    t.app.inject({ method: 'GET', url: `/api/katalog${url}`, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });
  const ai = (url: string) =>
    t.app.inject({ method: 'GET', url: `/ai/katalog${url}`, headers: { authorization: `Bearer ${TEST_AI_API_KEY}` } });

  /** Loyiha → Blok A → one Planirovka (no Xonadonlar yet), through the admin API. */
  async function createPlanirovka(p: object = {}) {
    const loyiha = (await call('POST', '/loyihalar', admin, jozibali)).json().loyiha;
    const blok = (await call('POST', `/loyihalar/${loyiha.id}/bloklar`, admin, { nomi: 'A' })).json().blok;
    const res = await call('POST', `/bloklar/${blok.id}/planirovkalar`, admin, { xonalar: 2, maydon: 54.5, ...p });
    expect(res.statusCode).toBe(200);
    return { loyiha, blok, planirovka: res.json().planirovka };
  }

  async function addXonadon(blokId: number, x: object) {
    const res = await call('POST', `/bloklar/${blokId}/xonadonlar`, admin, x);
    expect(res.statusCode).toBe(200);
    return res.json().xonadon;
  }

  it("counts a Planirovka's bo'sh / bron / sotilgan and jami from its Xonadonlar", async () => {
    const { blok, planirovka } = await createPlanirovka();
    const holatlar = ['bosh', 'bosh', 'bron', 'sotilgan', 'sotilgan', 'sotilgan'];
    for (const [i, holat] of holatlar.entries()) {
      await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: i + 2, raqam: i + 1, holat });
    }

    const shown = (await miniApp(`/planirovkalar/${planirovka.id}`)).json().planirovka;
    expect([shown.bosh, shown.holat]).toEqual([2, 'sotuvda']);
    const tree = (await call('GET', `/loyihalar/${blok.loyihaId}`, admin)).json().loyiha;
    const p = tree.bloklar[0].planirovkalar[0];
    expect([p.bosh, p.bron, p.sotilgan, p.jami]).toEqual([2, 1, 3, 6]);
  });

  it("takes the Boshlang'ich narx from the cheapest bo'sh Xonadon, else the Planirovka's qo'lda narx, else none", async () => {
    const { blok, planirovka } = await createPlanirovka({ qoldaNarx: 500_000_000 });
    const narx = async () => (await miniApp(`/planirovkalar/${planirovka.id}`)).json().planirovka.boshlangichNarx;

    expect(await narx()).toBe(500_000_000); // qo'lda: no Xonadon yet
    const arzon = await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 2, raqam: 5, narx: 450_000_000 });
    await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 9, raqam: 33, narx: 480_000_000 });
    await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 1, raqam: 1, narx: 400_000_000, holat: 'sotilgan' });
    expect(await narx()).toBe(450_000_000); // narxli: cheapest bo'sh, the sold one does not count

    await call('PATCH', `/xonadonlar/${arzon.id}`, admin, { holat: 'bron' });
    expect(await narx()).toBe(480_000_000);

    await call('PATCH', `/xonadonlar/${arzon.id}`, admin, { holat: 'bosh', narx: null });
    const qolgan = (await call('GET', `/bloklar/${blok.id}/xonadonlar`, admin)).json().xonadonlar;
    for (const x of qolgan) await call('PATCH', `/xonadonlar/${x.id}`, admin, { narx: null });
    expect(await narx()).toBe(500_000_000); // narxsiz Xonadonlar → qo'lda

    await call('PATCH', `/planirovkalar/${planirovka.id}`, admin, { qoldaNarx: null });
    expect(await narx()).toBeNull(); // «Narx so'rov bo'yicha»
  });

  it('refuses a second Xonadon with the same qavat and raqam in one Blok, but not in another Blok', async () => {
    const { loyiha, blok, planirovka } = await createPlanirovka();
    await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 3, raqam: 12 });

    const twice = await call('POST', `/bloklar/${blok.id}/xonadonlar`, admin, { planirovkaId: planirovka.id, qavat: 3, raqam: 12 });
    expect([twice.statusCode, twice.json().error]).toEqual([409, 'xonadon_taken']);

    const b = (await call('POST', `/loyihalar/${loyiha.id}/bloklar`, admin, { nomi: 'B' })).json().blok;
    const pb = (await call('POST', `/bloklar/${b.id}/planirovkalar`, admin, { xonalar: 2, maydon: 54.5 })).json().planirovka;
    expect((await call('POST', `/bloklar/${b.id}/xonadonlar`, admin, { planirovkaId: pb.id, qavat: 3, raqam: 12 })).statusCode).toBe(200);
    // a Planirovka of another Blok cannot be used
    expect((await call('POST', `/bloklar/${b.id}/xonadonlar`, admin, { planirovkaId: planirovka.id, qavat: 4, raqam: 13 })).statusCode).toBe(400);
  });

  it('lets a Menejer change only the holat; the Administrator changes everything', async () => {
    const { blok, planirovka } = await createPlanirovka();
    const x = await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 3, raqam: 12, narx: 450_000_000 });
    const menejer = await adminLogin(t, 'menejer');

    expect((await call('GET', `/bloklar/${blok.id}/xonadonlar`, menejer)).statusCode).toBe(200);
    const bron = await call('PATCH', `/xonadonlar/${x.id}`, menejer, { holat: 'bron' });
    expect([bron.statusCode, bron.json().xonadon.holat]).toEqual([200, 'bron']);
    expect((await call('PATCH', `/xonadonlar/${x.id}`, menejer, { narx: 1 })).statusCode).toBe(403);
    expect((await call('PATCH', `/xonadonlar/${x.id}`, menejer, { holat: 'bosh', qavat: 4 })).statusCode).toBe(403);
    expect((await call('POST', `/bloklar/${blok.id}/xonadonlar`, menejer, { planirovkaId: planirovka.id, qavat: 1, raqam: 1 })).statusCode).toBe(403);
    expect((await call('DELETE', `/xonadonlar/${x.id}`, menejer)).statusCode).toBe(403);
    const many = await call('POST', '/xonadonlar/holat', menejer, { ids: [x.id], holat: 'sotilgan' });
    expect(many.json().xonadonlar.map((y: { holat: string }) => y.holat)).toEqual(['sotilgan']);

    const edited = await call('PATCH', `/xonadonlar/${x.id}`, admin, { qavat: 4, raqam: 15, narx: 470_000_000, holat: 'bosh' });
    expect(edited.json().xonadon).toMatchObject({ qavat: 4, raqam: 15, narx: 470_000_000, holat: 'bosh' });
    expect((await call('DELETE', `/xonadonlar/${x.id}`, admin)).statusCode).toBe(200);
    const tree = (await call('GET', `/loyihalar/${blok.loyihaId}`, admin)).json().loyiha;
    expect(tree.bloklar[0].planirovkalar[0].jami).toBe(0);
  });

  it('writes every holat and narx change to the jurnal: kim, qachon, nima edi, nima bo\'ldi', async () => {
    const { blok, planirovka } = await createPlanirovka();
    const x = await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 3, raqam: 12, narx: 450_000_000 });
    const menejer = await adminLogin(t, 'menejer', { nomi: 'Dilnoza' });
    t.clock.advance({ hours: 1 });

    await call('PATCH', `/xonadonlar/${x.id}`, menejer, { holat: 'bron' });
    await call('PATCH', `/xonadonlar/${x.id}`, admin, { narx: 460_000_000 });
    await call('PATCH', `/xonadonlar/${x.id}`, admin, { narx: 460_000_000 }); // no change → no row

    const res = await t.app.inject({ method: 'GET', url: `/admin/api/jurnal?obyekt=xonadon&obyektId=${x.id}`, headers: admin });
    expect(res.json().yozuvlar.map((y: Record<string, unknown>) => [y.admin, y.amal, y.oldin, y.keyin, y.tavsif])).toEqual([
      [expect.objectContaining({ nomi: 'Rahbar' }), 'tahrirlandi', { narx: 450_000_000 }, { narx: 460_000_000 }, 'Jozibali Maskan · A blok · 3-qavat, 12-xonadon · 2 xona, 54.5 m²'],
      [expect.objectContaining({ nomi: 'Dilnoza' }), 'tahrirlandi', { holat: 'bosh' }, { holat: 'bron' }, expect.any(String)],
      [expect.objectContaining({ nomi: 'Rahbar' }), 'yaratildi', null, expect.objectContaining({ qavat: 3, raqam: 12 }), expect.any(String)],
    ]);
    expect(res.json().yozuvlar[1].at).toBe(t.clock.now().toISOString());
  });

  it('shows a Xonadon change in the Mini App and the AI API within a minute, and returns the Xonadonlar there', async () => {
    const { blok, planirovka } = await createPlanirovka();
    const x = await addXonadon(blok.id, { planirovkaId: planirovka.id, qavat: 3, raqam: 12 });
    await miniApp(`/bloklar/${blok.id}/xonadonlar`);
    await ai(`/planirovkalar/${planirovka.id}`);

    // a change that does not go through the admin API (no invalidate) still shows within the cache TTL
    await t.db.query(`UPDATE xonadon SET holat = 'bron' WHERE id = $1`, [x.id]);
    t.clock.advance({ minutes: 1 });

    const shaxmatka = (await miniApp(`/bloklar/${blok.id}/xonadonlar`)).json();
    expect(shaxmatka.blok).toMatchObject({ id: blok.id, nomi: 'A', loyihaNomi: 'Jozibali Maskan' });
    expect(shaxmatka.xonadonlar).toEqual([
      { id: x.id, loyihaId: blok.loyihaId, blokId: blok.id, blokNomi: 'A', planirovkaId: planirovka.id, qavat: 3, raqam: 12, xonalar: 2, maydon: 54.5, narx: null, holat: 'bron' },
    ]);
    expect((await ai(`/xonadonlar/${x.id}`)).json().xonadon.holat).toBe('bron');
    expect((await ai(`/planirovkalar/${planirovka.id}`)).json().planirovka.holat).toBe('band');

    await call('PATCH', `/xonadonlar/${x.id}`, admin, { holat: 'sotilgan' }); // admin write: at once
    expect((await ai(`/xonadonlar/${x.id}`)).json().xonadon.holat).toBe('sotilgan');
  });
});
