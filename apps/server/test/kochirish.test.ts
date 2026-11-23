import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importLegacyBot } from '../src/kochirish/bot-import';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/legacy/${name}`, import.meta.url), 'utf8');
const source = () => ({ usersJson: fixture('users.json'), leadsJsonl: fixture('leads.jsonl') });

describe('Ko\'chirish: old bot Mijozlar and Arizalar (leads.jsonl)', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  it('reports the same Mijozlar and Arizalar counts before and after', async () => {
    const report = await importLegacyBot(t.db, source(), t.clock.now());

    expect(report.source).toMatchObject({ mijozlar: 4, arizalar: 5, rejected: [] });
    expect(report.db).toEqual({ mijozlar: 4, arizalar: 5 });
    expect(report.ok).toBe(true);
  });

  const me = async (id: number) =>
    (
      await t.app.inject({
        method: 'GET',
        url: '/api/me',
        headers: tmaAuth(signInitData({ id, first_name: 'X' }, { authDate: t.clock.now() })),
      })
    ).json();
  const legacyMijoz = async (id: number) =>
    (
      await t.db.query(
        'SELECT telefon, bot_bloklagan, amocrm_kontakt_id::text, shahar_qiziqish FROM legacy_mijoz WHERE telegram_id = $1',
        [id],
      )
    ).rows[0];

  it('keeps first and last Manba, language, phone, «botni bloklagan» and amoCRM IDs', async () => {
    await importLegacyBot(t.db, source(), t.clock.now());

    const aziz = await me(1001);
    expect(aziz.mijoz).toMatchObject({ name: 'Aziz Karimov', lang: 'uz' });
    expect(aziz.manba).toEqual({ first: 'insta_oct', last: 'tg_ads' });
    expect(await legacyMijoz(1001)).toEqual({
      telefon: '+998901234567',
      bot_bloklagan: false,
      amocrm_kontakt_id: '5550001',
      shahar_qiziqish: ['toshkent'],
    });

    // No Manba anywhere → «Telegram (to'g'ridan-to'g'ri)»; blocked; 9-digit phone normalised.
    expect((await me(1002)).manba).toEqual({
      first: "Telegram (to'g'ridan-to'g'ri)",
      last: "Telegram (to'g'ridan-to'g'ri)",
    });
    expect(await legacyMijoz(1002)).toMatchObject({ telefon: '+998901112233', bot_bloklagan: true });
    expect((await legacyMijoz(1003)).shahar_qiziqish).toEqual(['navoiy', 'toshkent']);

    // Mijoz known only from leads: name, language, Manba and IDs come from the lead.
    const dilnoza = await me(1004);
    expect(dilnoza.mijoz).toMatchObject({ name: 'Dilnoza', lang: 'ru' });
    expect(dilnoza.manba).toEqual({ first: 'navoiy_billboard', last: 'navoiy_billboard' });
    expect(await legacyMijoz(1004)).toMatchObject({ telefon: '+998935554433', amocrm_kontakt_id: '5550009' });

    const { rows: arizalar } = await t.db.query(
      `SELECT legacy_key, telegram_id::text, tur, loyiha_nomi, amocrm_bitim_id::text, amocrm_kontakt_id::text
         FROM legacy_ariza ORDER BY created_at`,
    );
    expect(arizalar.map((a) => [a.telegram_id, a.tur, a.loyiha_nomi, a.amocrm_bitim_id, a.amocrm_kontakt_id])).toEqual([
      ['1001', 'bot_form', 'Jozibali Maskan', '7770001', '5550001'],
      ['1001', 'bot_booking', 'Jozibali Maskan', '7770001', '5550001'],
      ['1002', 'bot_quiz', 'Sayhun', null, null],
      ['1004', 'bot_calc', 'Gulzor', '7770009', '5550009'],
      ['1004', 'bot_manager', null, null, null],
    ]);
  });

  it('creates no duplicates when run again', async () => {
    await importLegacyBot(t.db, source(), t.clock.now());
    t.clock.advance({ hours: 1 });
    const again = await importLegacyBot(t.db, source(), t.clock.now());

    expect(again.added).toEqual({ mijozlar: 0, arizalar: 0 });
    expect(again.db).toEqual({ mijozlar: 4, arizalar: 5 });
    expect(again.ok).toBe(true);
    const { rows } = await t.db.query(
      'SELECT (SELECT count(*) FROM mijoz)::int AS m, (SELECT count(*) FROM legacy_ariza)::int AS a',
    );
    expect(rows[0]).toEqual({ m: 4, a: 5 });
  });

  it('merges into a Mijoz the new bot already knows, keeping their newer data', async () => {
    // Aziz opened the new Mini App from a tagged ad before the import.
    await t.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: tmaAuth(
        signInitData({ id: 1001, first_name: 'Aziz', username: 'aziz_new' }, { authDate: t.clock.now(), startParam: 'src_new_ad' }),
      ),
    });

    const report = await importLegacyBot(t.db, source(), t.clock.now());

    expect(report.added.mijozlar).toBe(3);
    expect(report.ok).toBe(true);
    const aziz = await me(1001);
    expect(aziz.mijoz.name).toBe('Aziz');
    expect(aziz.manba).toEqual({ first: 'insta_oct', last: 'new_ad' });
  });

  it('reports lines it could not read and is then not ok', async () => {
    const broken = { leadsJsonl: `${fixture('leads.jsonl')}{not json\n{"user_id":"abc","type":"form"}\n` };

    const report = await importLegacyBot(t.db, broken, t.clock.now());

    expect(report.source.rejected).toEqual([
      { where: 'leads.jsonl:7', reason: 'not valid JSON' },
      { where: 'leads.jsonl:8', reason: 'invalid Telegram ID' },
    ]);
    expect(report.ok).toBe(false);
  });

  it('writes nothing on a dry run', async () => {
    const report = await importLegacyBot(t.db, source(), t.clock.now(), { dryRun: true });

    expect(report).toMatchObject({ dryRun: true, ok: true, db: { mijozlar: 4, arizalar: 5 } });
    const { rows } = await t.db.query('SELECT count(*)::int AS n FROM mijoz');
    expect(rows[0].n).toBe(0);
  });
});
