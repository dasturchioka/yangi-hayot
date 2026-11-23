import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000201, first_name: 'Aziz', language_code: 'uz' };

describe('GET /api/taqqoslash', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const taqqosla = (ids: number[], lang = 'uz') =>
    t.app.inject({
      method: 'GET',
      url: `/api/taqqoslash?ids=${ids.join(',')}&lang=${lang}`,
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });

  async function seed() {
    const l = await seedLoyiha(t.db, {
      nomi: 'Jozibali Maskan',
      bloklar: [
        blok('A', [{ xonalar: 2, maydon: 50, boshlangichNarx: 400_000_000, bosh: 3 }]),
        blok('B', [
          { xonalar: 3, maydon: 75.5, boshlangichNarx: 600_000_000, bosh: 0, bron: 1 },
          { xonalar: 1, maydon: 30, boshlangichNarx: null },
          { xonalar: 4, maydon: 110 },
        ]),
      ],
    });
    return l.bloklar.flatMap((b) => b.planirovkalar.map((p) => p.id));
  }

  it('compares Planirovkalar by narx, maydon, xonalar, Blok and to‘lov, in the order asked, without qavat', async () => {
    const [a2, b3, b1] = await seed();

    const res = await taqqosla([b3!, a2!, b1!]);

    expect(res.statusCode).toBe(200);
    expect(res.json().planirovkalar).toEqual([
      {
        id: b3,
        loyihaNomi: 'Jozibali Maskan',
        blokNomi: 'B',
        nomi: null,
        xonalar: 3,
        maydon: 75.5,
        boshlangichNarx: 600_000_000,
        kvMetrNarxi: 7_947_020,
        oylikTolov: 17_500_000, // default muddatli: 30%, 24 oy, ustama 0 → 420 000 000 / 24
        holat: 'band',
      },
      {
        id: a2,
        loyihaNomi: 'Jozibali Maskan',
        blokNomi: 'A',
        nomi: null,
        xonalar: 2,
        maydon: 50,
        boshlangichNarx: 400_000_000,
        kvMetrNarxi: 8_000_000,
        oylikTolov: 11_666_667, // 280 000 000 / 24
        holat: 'sotuvda',
      },
      {
        id: b1,
        loyihaNomi: 'Jozibali Maskan',
        blokNomi: 'B',
        nomi: null,
        xonalar: 1,
        maydon: 30,
        boshlangichNarx: null,
        kvMetrNarxi: null,
        oylikTolov: null,
        holat: 'sotuvda',
      },
    ]);
    expect(JSON.stringify(res.json())).not.toMatch(/qavat/i);
  });

  it('refuses more than 3 Planirovkalar', async () => {
    const ids = await seed();

    const res = await taqqosla(ids);

    expect(ids).toHaveLength(4);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'taqqoslash_3_tadan_kop' });
  });

  it('counts a repeated Planirovka once', async () => {
    const [a2, b3, b1] = await seed();

    const res = await taqqosla([a2!, a2!, b3!, b1!]);

    expect(res.statusCode).toBe(200);
    expect(res.json().planirovkalar.map((p: { id: number }) => p.id)).toEqual([a2, b3, b1]);
  });

  it('leaves out Planirovkalar that are no longer in the katalog', async () => {
    const [a2] = await seed();

    const res = await taqqosla([a2!, 999_999]);

    expect(res.json().planirovkalar.map((p: { id: number }) => p.id)).toEqual([a2]);
  });

  it('needs at least one id', async () => {
    expect((await taqqosla([])).statusCode).toBe(400);
  });
});
