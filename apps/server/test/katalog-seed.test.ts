import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedKatalog } from '../src/katalog/seed';
import { SEED_LOYIHALAR } from '../src/katalog/seed-data';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

describe('Starting Katalog (seed)', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const get = (url: string) =>
    t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });

  it('shows Jozibali Maskan with its 5 Bloklar, 12 floors and 396 Xonadonlar', async () => {
    await seedKatalog(t.db, SEED_LOYIHALAR);

    const { loyihalar } = (await get('/api/katalog/loyihalar?shahar=toshkent')).json();
    const jozibali = loyihalar.find((l: { slug: string }) => l.slug === 'jozibali-maskan');
    const { loyiha } = (await get(`/api/katalog/loyihalar/${jozibali.id}`)).json();

    expect(loyihalar.map((l: { nomi: string }) => l.nomi)).toEqual(['Jozibali Maskan', 'Sayhun']);
    expect([loyiha.bloklarSoni, loyiha.qavatlarSoni, loyiha.jamiXonadonlar]).toEqual([5, 12, 396]);
    expect(loyiha.bloklar.map((b: { nomi: string }) => b.nomi)).toEqual(['A', 'B', 'V', 'G', 'D']);
  });

  it('can run again without duplicating Loyihalar', async () => {
    await seedKatalog(t.db, SEED_LOYIHALAR);
    const again = await seedKatalog(t.db, SEED_LOYIHALAR);

    expect(again).toEqual([]);
    expect((await get('/api/katalog/loyihalar?shahar=toshkent')).json().loyihalar).toHaveLength(2);
  });
});
