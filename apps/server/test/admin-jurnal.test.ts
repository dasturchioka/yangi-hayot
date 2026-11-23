import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { createTestApp, DEFAULT_NOW, type TestApp } from './support/test-app';

describe('Jurnal of catalog changes', () => {
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
    t.app.inject({ method, url: `/admin/api${url}`, headers, payload });

  async function createPlanirovka() {
    const loyiha = (
      await call('POST', '/katalog/loyihalar', admin, {
        nomi: 'Jozibali Maskan',
        shahar: 'toshkent',
        holat: 'sotuvda',
        manzil: { ru: 'Яшнабад', uz: 'Yashnobod' },
      })
    ).json().loyiha;
    const blok = (await call('POST', `/katalog/loyihalar/${loyiha.id}/bloklar`, admin, { nomi: 'A' })).json().blok;
    const planirovka = (
      await call('POST', `/katalog/bloklar/${blok.id}/planirovkalar`, admin, {
        xonalar: 2,
        maydon: 54,
        boshlangichNarx: 400_000_000,
        bosh: 5,
      })
    ).json().planirovka;
    return { loyiha, planirovka };
  }

  it("records kim, qachon, nima edi and nima bo'ldi for a price change and a move", async () => {
    const { planirovka } = await createPlanirovka();
    const menejer = await adminLogin(t, 'menejer', { nomi: 'Dilnoza' });

    t.clock.advance({ minutes: 5 });
    await call('PATCH', `/katalog/planirovkalar/${planirovka.id}`, admin, { boshlangichNarx: 420_000_000 });
    t.clock.advance({ minutes: 5 });
    await call('POST', `/katalog/planirovkalar/${planirovka.id}/kochirish`, menejer, { dan: 'bosh', ga: 'bron', soni: 2 });

    const { yozuvlar } = (await call('GET', `/jurnal?obyekt=planirovka&obyektId=${planirovka.id}`, admin)).json();
    expect(yozuvlar.slice(0, 2)).toEqual([
      expect.objectContaining({
        at: new Date(DEFAULT_NOW.getTime() + 10 * 60_000).toISOString(),
        admin: expect.objectContaining({ nomi: 'Dilnoza' }),
        amal: 'kochirildi',
        tavsif: 'Jozibali Maskan · A blok · 2 xona, 54 m²',
        oldin: { bosh: 5, bron: 0 },
        keyin: { bosh: 3, bron: 2 },
      }),
      expect.objectContaining({
        at: new Date(DEFAULT_NOW.getTime() + 5 * 60_000).toISOString(),
        admin: expect.objectContaining({ nomi: 'Rahbar' }),
        amal: 'tahrirlandi',
        oldin: { boshlangichNarx: 400_000_000 },
        keyin: { boshlangichNarx: 420_000_000 },
      }),
    ]);
    expect(yozuvlar[2]).toMatchObject({ amal: 'yaratildi', oldin: null });
  });

  it('records a Loyiha holati change and a jami correction', async () => {
    const { loyiha, planirovka } = await createPlanirovka();

    await call('PATCH', `/katalog/loyihalar/${loyiha.id}`, admin, { holat: 'topshirilgan' });
    await call('PATCH', `/katalog/planirovkalar/${planirovka.id}`, admin, { jami: 7 });

    const { yozuvlar } = (await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json();
    expect(yozuvlar.slice(0, 2).map((y: { oldin: unknown; keyin: unknown }) => [y.oldin, y.keyin])).toEqual([
      [
        { bosh: 5, jami: 5 },
        { bosh: 7, jami: 7 },
      ],
      [{ holat: 'sotuvda' }, { holat: 'topshirilgan' }],
    ]);
  });

  it('writes nothing when nothing changed or the change was refused', async () => {
    const { loyiha, planirovka } = await createPlanirovka();
    const before = (await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json().yozuvlar.length;

    await call('PATCH', `/katalog/planirovkalar/${planirovka.id}`, admin, { boshlangichNarx: 400_000_000 });
    await call('POST', `/katalog/planirovkalar/${planirovka.id}/kochirish`, admin, { dan: 'bron', ga: 'bosh', soni: 1 });

    expect((await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json().yozuvlar).toHaveLength(before);
  });

  it('pages back through older rows', async () => {
    const { planirovka } = await createPlanirovka();
    for (let i = 0; i < 4; i++) {
      await call('POST', `/katalog/planirovkalar/${planirovka.id}/kochirish`, admin, { dan: 'bosh', ga: 'sotilgan', soni: 1 });
    }

    const page1 = (await call('GET', '/jurnal?limit=3', admin)).json().yozuvlar;
    const page2 = (await call('GET', `/jurnal?limit=3&beforeId=${page1[2].id}`, admin)).json().yozuvlar;

    expect(page1.map((y: { keyin: { bosh?: number } }) => y.keyin.bosh)).toEqual([1, 2, 3]);
    expect(page2.map((y: { keyin: { bosh?: number } }) => y.keyin.bosh)).toEqual([4, 5, undefined]);
  });
});
