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

  /** A Planirovka with 5 bo'sh Xonadonlar. */
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
      await call('POST', `/katalog/bloklar/${blok.id}/planirovkalar`, admin, { xonalar: 2, maydon: 54, qoldaNarx: 400_000_000 })
    ).json().planirovka;
    const xonadonlar: { id: number }[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await call('POST', `/katalog/bloklar/${blok.id}/xonadonlar`, admin, { planirovkaId: planirovka.id, qavat: i, raqam: i });
      xonadonlar.push(res.json().xonadon);
    }
    return { loyiha, planirovka, xonadonlar };
  }

  it("records kim, qachon, nima edi and nima bo'ldi for a price change and a holat change", async () => {
    const { planirovka, xonadonlar } = await createPlanirovka();
    const menejer = await adminLogin(t, 'menejer', { nomi: 'Dilnoza' });

    t.clock.advance({ minutes: 5 });
    await call('PATCH', `/katalog/planirovkalar/${planirovka.id}`, admin, { qoldaNarx: 420_000_000 });
    t.clock.advance({ minutes: 5 });
    await call('PATCH', `/katalog/xonadonlar/${xonadonlar[1]!.id}`, menejer, { holat: 'bron' });

    const narx = (await call('GET', `/jurnal?obyekt=planirovka&obyektId=${planirovka.id}`, admin)).json().yozuvlar;
    expect(narx).toEqual([
      expect.objectContaining({
        at: new Date(DEFAULT_NOW.getTime() + 5 * 60_000).toISOString(),
        admin: expect.objectContaining({ nomi: 'Rahbar' }),
        amal: 'tahrirlandi',
        tavsif: 'Jozibali Maskan · A blok · 2 xona, 54 m²',
        oldin: { qoldaNarx: 400_000_000 },
        keyin: { qoldaNarx: 420_000_000 },
      }),
      expect.objectContaining({ amal: 'yaratildi', oldin: null }),
    ]);
    const holat = (await call('GET', `/jurnal?obyekt=xonadon&obyektId=${xonadonlar[1]!.id}`, admin)).json().yozuvlar;
    expect(holat[0]).toEqual(
      expect.objectContaining({
        at: new Date(DEFAULT_NOW.getTime() + 10 * 60_000).toISOString(),
        admin: expect.objectContaining({ nomi: 'Dilnoza' }),
        amal: 'tahrirlandi',
        tavsif: 'Jozibali Maskan · A blok · 2-qavat, 2-xonadon · 2 xona, 54 m²',
        oldin: { holat: 'bosh' },
        keyin: { holat: 'bron' },
      }),
    );
  });

  it('records a Loyiha holati change and a removed Xonadon', async () => {
    const { loyiha, xonadonlar } = await createPlanirovka();

    await call('PATCH', `/katalog/loyihalar/${loyiha.id}`, admin, { holat: 'topshirilgan' });
    await t.app.inject({ method: 'DELETE', url: `/admin/api/katalog/xonadonlar/${xonadonlar[4]!.id}`, headers: admin });

    const { yozuvlar } = (await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json();
    expect(yozuvlar.slice(0, 2).map((y: { amal: string; oldin: unknown; keyin: unknown }) => [y.amal, y.oldin, y.keyin])).toEqual([
      ['ochirildi', { planirovkaId: expect.any(Number), qavat: 5, raqam: 5, narx: null, holat: 'bosh' }, {}],
      ['tahrirlandi', { holat: 'sotuvda' }, { holat: 'topshirilgan' }],
    ]);
  });

  it('writes nothing when nothing changed or the change was refused', async () => {
    const { loyiha, planirovka, xonadonlar } = await createPlanirovka();
    const before = (await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json().yozuvlar.length;

    await call('PATCH', `/katalog/planirovkalar/${planirovka.id}`, admin, { qoldaNarx: 400_000_000 });
    await call('PATCH', `/katalog/xonadonlar/${xonadonlar[0]!.id}`, admin, { holat: 'bosh' });
    await call('PATCH', `/katalog/xonadonlar/${xonadonlar[0]!.id}`, admin, { raqam: 2, qavat: 2 }); // taken → 409

    expect((await call('GET', `/jurnal?loyihaId=${loyiha.id}`, admin)).json().yozuvlar).toHaveLength(before);
  });

  it('pages back through older rows', async () => {
    const { xonadonlar } = await createPlanirovka();
    for (const x of xonadonlar.slice(0, 4)) {
      await call('PATCH', `/katalog/xonadonlar/${x.id}`, admin, { holat: 'sotilgan' });
    }

    const page1 = (await call('GET', '/jurnal?limit=3', admin)).json().yozuvlar;
    const page2 = (await call('GET', `/jurnal?limit=3&beforeId=${page1[2].id}`, admin)).json().yozuvlar;

    const raqam = (y: { tavsif: string; amal: string }) => `${y.amal} ${y.tavsif.split(' · ')[2]}`;
    expect(page1.map(raqam)).toEqual(['tahrirlandi 4-qavat, 4-xonadon', 'tahrirlandi 3-qavat, 3-xonadon', 'tahrirlandi 2-qavat, 2-xonadon']);
    expect(page2.map(raqam)).toEqual(['tahrirlandi 1-qavat, 1-xonadon', 'yaratildi 5-qavat, 5-xonadon', 'yaratildi 4-qavat, 4-xonadon']);
  });
});
