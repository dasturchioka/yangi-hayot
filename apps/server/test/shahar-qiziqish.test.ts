import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInitData, tmaAuth } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { adminLogin } from './support/admin';
import { createTestApp, type TestApp } from './support/test-app';

// Shaharga qiziqish from the catalog: a Mijoz who opened a city's Loyihalar
// lands in that city's Rassilka audience (quiz and Ariza add theirs later).

let t: TestApp;
let nextId = 730000000;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

async function miniAppUser() {
  const user = { id: ++nextId, first_name: 'M' };
  const get = (url: string) =>
    t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(user, { authDate: t.clock.now() })) });
  await get('/api/me');
  return get;
}

async function audiences() {
  const res = await t.app.inject({
    method: 'GET',
    url: '/admin/api/rassilka/audiences',
    headers: await adminLogin(t, 'administrator'),
  });
  return res.json();
}

describe('Shaharga qiziqish from the catalog', () => {
  it("opening a city's Loyihalar, a Loyiha or a Planirovka counts as interest in that city", async () => {
    const navoiy = await seedLoyiha(t.db, { shahar: 'navoiy', bloklar: [blok('A', [{}])] });
    const toshkent = await seedLoyiha(t.db, { shahar: 'toshkent', bloklar: [blok('A', [{}])] });
    const planirovkaId = toshkent.bloklar[0]!.planirovkalar[0]!.id;

    const listsNavoiy = await miniAppUser();
    await listsNavoiy('/api/katalog/loyihalar?shahar=navoiy');
    const opensLoyiha = await miniAppUser();
    await opensLoyiha(`/api/katalog/loyihalar/${navoiy.id}`);
    const opensPlanirovka = await miniAppUser();
    await opensPlanirovka(`/api/katalog/planirovkalar/${planirovkaId}`);
    const listsAll = await miniAppUser();
    await listsAll('/api/katalog/loyihalar'); // no city chosen: no interest

    expect(await audiences()).toMatchObject({ all: 4, navoiy: 2, toshkent: 1 });
  });

  it('both cities when the Mijoz opened both', async () => {
    const get = await miniAppUser();
    await get('/api/katalog/loyihalar?shahar=navoiy');
    await get('/api/katalog/loyihalar?shahar=toshkent');
    await get('/api/katalog/loyihalar?shahar=toshkent');

    expect(await audiences()).toMatchObject({ all: 1, navoiy: 1, toshkent: 1 });
  });
});
