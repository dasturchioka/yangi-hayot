import pg from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrate';
import { seedKatalog } from './seed';
import { SEED_LOYIHALAR } from './seed-data';

/** `pnpm --filter @yh/server seed`: adds the starting Katalog; Loyihalar already present (by slug) are left alone. */
const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
try {
  await migrate(db);
  const added = await seedKatalog(db, SEED_LOYIHALAR);
  console.log(added.length ? `Seeded: ${added.join(', ')}` : 'Katalog already seeded');
} finally {
  await db.end();
}
