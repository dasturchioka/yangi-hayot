import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { importLegacyBot } from '../src/kochirish/bot-import';
import { createBackups, pgDumper, type Dumper } from '../src/zaxira/zaxira';
import { withDatabase } from './support/global-setup';
import { createTestApp, type TestApp } from './support/test-app';

/** Writes a marker instead of running pg_dump. */
const fakeDumper: Dumper = {
  async dump(file) {
    writeFileSync(file, 'dump');
  },
  async restore() {},
};

describe('Zaxira nusxa: daily, kept 14 days', () => {
  let dir: string;
  let t: TestApp;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'yh-zaxira-'));
    t = await createTestApp(); // 2026-11-23 10:00 Tashkent
  });
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    await t.close();
  });

  it('makes one backup a day, after the set time', async () => {
    const backups = createBackups({ dir, dumper: fakeDumper, clock: t.clock, at: '03:00' });

    t.clock.set(new Date('2026-11-23T21:30:00Z')); // 02:30 on the 24th in Tashkent
    expect(await backups.runIfDue()).toBeNull();
    t.clock.advance({ hours: 1 }); // 03:30
    expect(await backups.runIfDue()).toMatch(/yangi-hayot-2026-11-24_0330\.dump$/);
    t.clock.advance({ hours: 5 });
    expect(await backups.runIfDue()).toBeNull();

    expect(readdirSync(dir)).toEqual(['yangi-hayot-2026-11-24_0330.dump']);
  });

  it('keeps the last 14 days and deletes older backups', async () => {
    const backups = createBackups({ dir, dumper: fakeDumper, clock: t.clock, at: '03:00' });
    writeFileSync(join(dir, 'unrelated.txt'), 'keep me');

    for (let day = 0; day < 20; day++) {
      await backups.runIfDue();
      t.clock.advance({ days: 1 });
    }

    const list = (await backups.list()).map((b) => b.date);
    expect(list).toHaveLength(14);
    expect(list[0]).toBe('2026-11-29');
    expect(list.at(-1)).toBe('2026-12-12');
    expect(readdirSync(dir)).toContain('unrelated.txt');
  });

  it('restores a backup into an empty database with the same data', async () => {
    const fixture = (name: string) => readFileSync(new URL(`./fixtures/legacy/${name}`, import.meta.url), 'utf8');
    await importLegacyBot(t.db, { usersJson: fixture('users.json'), leadsJsonl: fixture('leads.jsonl') }, t.clock.now());

    const adminUrl = inject('pgAdminUrl');
    const { rows } = await t.db.query<{ db: string }>('SELECT current_database() AS db');
    const backups = createBackups({
      dir,
      dumper: pgDumper({ databaseUrl: withDatabase(adminUrl, rows[0]!.db), binDir: process.env.PG_BIN_DIR }),
      clock: t.clock,
    });
    const file = await backups.backupNow();

    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query('CREATE DATABASE restored');
    await admin.end();
    const restoredUrl = withDatabase(adminUrl, 'restored');
    await backups.restore(file, restoredUrl);

    const restored = new pg.Pool({ connectionString: restoredUrl });
    const counts = await restored.query(
      `SELECT (SELECT count(*) FROM mijoz)::int AS mijozlar, (SELECT count(*) FROM legacy_ariza)::int AS arizalar,
              (SELECT telefon FROM legacy_mijoz WHERE telegram_id = 1001) AS telefon`,
    );
    await restored.end();
    expect(counts.rows[0]).toEqual({ mijozlar: 4, arizalar: 5, telefon: '+998901234567' });
  });
});
