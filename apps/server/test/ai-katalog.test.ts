import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, TEST_AI_API_KEY, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

describe('Katalog API for the AI-menejer', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const miniApp = (url: string) =>
    t.app.inject({ method: 'GET', url: `/api/katalog${url}`, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });
  const ai = (url: string, key = TEST_AI_API_KEY) =>
    t.app.inject({ method: 'GET', url: `/ai/katalog${url}`, headers: { authorization: `Bearer ${key}` } });

  it('returns the same prices and holatlar as the Mini App', async () => {
    const l = await seedLoyiha(t.db, {
      nomi: 'Jozibali Maskan',
      bloklar: [
        blok('A', [
          { xonalar: 1, boshlangichNarx: 410_000_000, bosh: 2 },
          { xonalar: 2, boshlangichNarx: 560_000_000, bosh: 0, bron: 1 },
        ]),
        blok('B', [{ xonalar: 3, boshlangichNarx: null, bosh: 0, sotilgan: 3 }]),
      ],
    });
    await seedLoyiha(t.db, { nomi: 'Qizilqum', shahar: 'navoiy' });
    const pid = l.bloklar[0]!.planirovkalar[1]!.id;

    for (const url of ['/loyihalar?shahar=toshkent&lang=ru', `/loyihalar/${l.id}?lang=ru`, `/planirovkalar/${pid}`]) {
      const fromAi = await ai(url);
      expect(fromAi.statusCode).toBe(200);
      expect(fromAi.json()).toEqual((await miniApp(url)).json());
    }
    const { planirovka } = (await ai(`/planirovkalar/${pid}`)).json();
    expect([planirovka.holat, planirovka.boshlangichNarx]).toEqual(['band', 560_000_000]);
  });

  it('rejects a wrong or missing API key', async () => {
    expect((await ai('/loyihalar', 'wrong-key')).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/ai/katalog/loyihalar' })).statusCode).toBe(401);
  });

  it('does not accept Mini App initData instead of the API key', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/ai/katalog/loyihalar',
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });

    expect(res.statusCode).toBe(401);
  });
});
