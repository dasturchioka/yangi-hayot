import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedKatalog } from '../src/katalog/seed';
import { DEMO_LOYIHALAR, SEED_LOYIHALAR } from '../src/katalog/seed-data';
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

  it('leaves Sayhun and Navoiy without Planirovkalar (they come from import:legacy)', async () => {
    await seedKatalog(t.db, SEED_LOYIHALAR);

    const { loyihalar } = (await get('/api/katalog/loyihalar')).json();

    expect(loyihalar.filter((l: { boshlangichNarx: number | null }) => l.boshlangichNarx !== null).map((l: { slug: string }) => l.slug)).toEqual([
      'jozibali-maskan',
    ]);
  });

  it('DEMO seed: every Loyiha on sale has priced Planirovkalar with drawings, Topshirilganlar make the portfolio', async () => {
    await seedKatalog(t.db, DEMO_LOYIHALAR);

    const { loyihalar } = (await get('/api/katalog/loyihalar')).json();
    const { bizHaqimizda } = (await get('/api/kontent')).json();

    expect(loyihalar).toHaveLength(7);
    for (const l of loyihalar) {
      expect(l.boshlangichNarx, l.slug).toBeGreaterThan(0);
      expect(l.boshXonadonlar, l.slug).toBeGreaterThan(0);
    }
    const { loyiha } = (await get(`/api/katalog/loyihalar/${loyihalar[0].id}`)).json();
    const planirovka = loyiha.bloklar[0].guruhlar[0].planirovkalar[0];
    expect(planirovka.chizma).toMatch(/^\/media\/chizma\/.+\.svg$/);
    expect(bizHaqimizda.portfolio.map((p: { nomi: string }) => p.nomi)).toEqual(['Kamalak', 'Nur', 'Qizilqum', 'Tarobiy']);
  });
});
