import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedKatalog } from '../src/katalog/seed';
import { SEED_LOYIHALAR } from '../src/katalog/seed-data';
import { importLegacyBot } from '../src/kochirish/bot-import';
import { extractLegacyKatalog, importLegacyKatalog } from '../src/kochirish/katalog-import';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/legacy/${name}`, import.meta.url), 'utf8');
const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

describe("Ko'chirish: old Mini App catalog (HTML)", () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const get = async (url: string) =>
    (await t.app.inject({ method: 'GET', url, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) })).json();
  const loyihaBySlug = async (slug: string) => {
    const { loyihalar } = await get('/api/katalog/loyihalar?shahar=toshkent');
    const card = loyihalar.find((l: { slug: string }) => l.slug === slug);
    return (await get(`/api/katalog/loyihalar/${card.id}`)).loyiha;
  };
  const planirovkalar = (loyiha: { bloklar: { nomi: string; guruhlar: { planirovkalar: unknown[] }[] }[] }) =>
    loyiha.bloklar.flatMap((b) =>
      b.guruhlar.flatMap((g) =>
        (g.planirovkalar as { xonalar: number; maydon: number; boshlangichNarx: number | null; holat: string }[]).map(
          (p) => [b.nomi, p.xonalar, p.maydon, p.boshlangichNarx, p.holat],
        ),
      ),
    );

  it('reads the projects array out of the HTML', () => {
    const data = extractLegacyKatalog(fixture('katalog.html'));
    expect(data.map((p) => (p as { name: string }).name)).toEqual(['Jozibali Maskan', 'Sayhun', 'Gulzor']);
  });

  const xonadonCount = async () => Number((await t.db.query('SELECT count(*) FROM xonadon')).rows[0].count);
  const shaxmatka = async (loyiha: { bloklar: { id: number; nomi: string }[] }) => {
    const out: (string | number)[][] = [];
    for (const b of loyiha.bloklar) {
      const { xonadonlar } = await get(`/api/katalog/bloklar/${b.id}/xonadonlar`);
      for (const x of xonadonlar) out.push([b.nomi, x.qavat, x.raqam, x.xonalar, x.holat]);
    }
    return out;
  };

  it('moves Sayhun (6) and Jozibali Maskan (3) Xonadonlar as Xonadonlar, grouped into Planirovkalar, with matching counts', async () => {
    const before = await xonadonCount();
    const report = await importLegacyKatalog(t.db, extractLegacyKatalog(fixture('katalog.html')), t.clock.now());

    expect(report.source).toMatchObject({ loyihalar: 3, planirovkalar: 9, xonadonlar: 9, rejected: [] });
    expect(report.db).toEqual({ loyihalar: 3, planirovkalar: 9, xonadonlar: 9 });
    expect(report.ok).toBe(true);
    expect((await xonadonCount()) - before).toBe(9);

    const sayhun = await loyihaBySlug('sayhun');
    expect(planirovkalar(sayhun)).toEqual([
      ['A', 1, 36, null, 'sotuvda'],
      ['A', 2, 52, null, 'sotuvda'],
      ['A', 2, 58.5, null, 'sotuvda'],
      ['A', 3, 74, null, 'band'],
      ['A', 3, 81, null, 'sotilgan'],
      ['A', 4, 98, 1_200_000_000, 'sotuvda'],
    ]);
    // No floor / number in the old data: numbered in order at the end of the Blok.
    expect(await shaxmatka(sayhun)).toEqual([
      ['A', 1, 1, 1, 'bosh'],
      ['A', 1, 2, 2, 'bosh'],
      ['A', 1, 3, 2, 'bosh'],
      ['A', 1, 4, 3, 'bron'],
      ['A', 2, 5, 3, 'sotilgan'],
      ['A', 2, 6, 4, 'bosh'],
    ]);
    // Price per m² (TZ 0.4) becomes the whole Xonadon's price.
    const jozibali = await loyihaBySlug('jozibali');
    expect(planirovkalar(jozibali)).toEqual([
      ['A', 2, 54.3, 455_500_000, 'sotuvda'],
      ['A', 3, 72, null, 'band'],
      ['B', 1, 38.5, 346_500_000, 'sotilgan'],
    ]);
    // Their own floor and number.
    expect(await shaxmatka(jozibali)).toEqual([
      ['A', 3, 12, 2, 'bosh'],
      ['A', 5, 21, 3, 'bron'],
      ['B', 1, 2, 1, 'sotilgan'],
    ]);
    // Topshirilgan Loyiha is moved but not shown in the katalog.
    expect((await get('/api/katalog/loyihalar?shahar=navoiy')).loyihalar).toEqual([]);
  });

  it('rejects an old Xonadon whose Blok, floor and number repeat another one', async () => {
    const data = [
      {
        id: 'x',
        name: 'X',
        city: 'tashkent',
        status: 'sale',
        apartments: [
          { block: 'A', floor: 2, number: 5, rooms: 1, area: 40 },
          { block: 'A', floor: 2, number: 5, rooms: 2, area: 60 },
        ],
      },
    ];
    const before = await xonadonCount();
    const report = await importLegacyKatalog(t.db, data, t.clock.now());

    expect(report.ok).toBe(false);
    expect(report.source.rejected).toEqual([
      { where: 'PROJECTS[0] X apartments[1]', reason: 'same block, floor and number as apartments[0]' },
    ]);
    expect(report.db.xonadonlar).toBe(1);
    expect((await xonadonCount()) - before).toBe(1);
  });

  it('creates no duplicates when run again', async () => {
    const data = extractLegacyKatalog(fixture('katalog.html'));
    await importLegacyKatalog(t.db, data, t.clock.now());
    const again = await importLegacyKatalog(t.db, data, t.clock.now());

    expect(again.added).toEqual({ loyihalar: 0, planirovkalar: 0 });
    expect(again.ok).toBe(true);
    expect(planirovkalar(await loyihaBySlug('sayhun'))).toHaveLength(6);
  });

  it('adds to a Loyiha already in the Katalog (matched by name) instead of creating another', async () => {
    await seedKatalog(t.db, SEED_LOYIHALAR);
    const sayhunBefore = await loyihaBySlug('sayhun');

    const report = await importLegacyKatalog(t.db, extractLegacyKatalog(fixture('katalog.html')), t.clock.now());

    expect(report.added.loyihalar).toBe(0);
    // The seeded (DEMO) B blok already has a Xonadon on floor 1 with number 2: that one is reported, not overwritten.
    expect(report.source.rejected).toEqual([
      { where: 'PROJECTS[0] Jozibali Maskan apartments[2]', reason: 'its block, floor and number are taken in the database' },
    ]);
    expect(report.ok).toBe(false);
    t.clock.advance({ minutes: 1 }); // Katalog cache
    const sayhun = await loyihaBySlug('sayhun');
    expect(sayhun.id).toBe(sayhunBefore.id);
    expect(planirovkalar(sayhun)).toHaveLength(6);
  });

  it('links old Arizalar to the moved Loyiha', async () => {
    await importLegacyKatalog(t.db, extractLegacyKatalog(fixture('katalog.html')), t.clock.now());
    await importLegacyBot(t.db, { leadsJsonl: fixture('leads.jsonl') }, t.clock.now());

    const { rows } = await t.db.query(
      `SELECT a.loyiha_nomi, l.slug FROM legacy_ariza a LEFT JOIN loyiha l ON l.id = a.loyiha_id
        WHERE a.loyiha_nomi IS NOT NULL ORDER BY a.created_at`,
    );
    expect(rows.map((r) => [r.loyiha_nomi, r.slug])).toEqual([
      ['Jozibali Maskan', 'jozibali'],
      ['Jozibali Maskan', 'jozibali'],
      ['Sayhun', 'sayhun'],
      ['Gulzor', 'gulzor'],
    ]);
  });
});
