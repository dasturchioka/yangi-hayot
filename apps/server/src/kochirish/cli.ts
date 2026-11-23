import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { systemClock } from '../clock';
import { migrate } from '../db/migrate';
import { importLegacyBot } from './bot-import';
import { extractLegacyKatalog, importLegacyKatalog } from './katalog-import';

/**
 * `pnpm --filter @yh/server import:legacy -- --leads leads.jsonl [--users users.json]
 *   [--katalog-html index.html] [--katalog-var PROJECTS] [--dry-run]`
 *
 * Moves the old bot's and old Mini App's data in (catalog first, so old
 * Arizalar link to their Loyiha), prints the reconciliation report as JSON,
 * exits 1 when counts do not match or lines were rejected. Safe to re-run.
 * Needs only DATABASE_URL.
 */
const { values } = parseArgs({
  options: {
    leads: { type: 'string' },
    users: { type: 'string' },
    'katalog-html': { type: 'string' },
    'katalog-var': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
if (!values.leads && !values['katalog-html']) throw new Error('nothing to import: pass --leads and/or --katalog-html');

const dryRun = values['dry-run'];
const db = new pg.Pool({ connectionString: databaseUrl });
let ok = true;
try {
  await migrate(db);
  if (values['katalog-html']) {
    const data = extractLegacyKatalog(readFileSync(values['katalog-html'], 'utf8'), values['katalog-var']);
    const report = await importLegacyKatalog(db, data, systemClock.now(), { dryRun });
    console.log(JSON.stringify({ katalog: report }, null, 2));
    ok &&= report.ok;
  }
  if (values.leads) {
    const report = await importLegacyBot(
      db,
      {
        leadsJsonl: readFileSync(values.leads, 'utf8'),
        usersJson: values.users ? readFileSync(values.users, 'utf8') : undefined,
      },
      systemClock.now(),
      { dryRun },
    );
    console.log(JSON.stringify({ bot: report }, null, 2));
    ok &&= report.ok;
  }
} finally {
  await db.end();
}
console.log(ok ? 'OK: counts match' : 'MISMATCH: see the report above');
process.exitCode = ok ? 0 : 1;
