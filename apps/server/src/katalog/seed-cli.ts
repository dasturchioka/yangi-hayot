import pg from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrate';
import { seedKatalog } from './seed';
import { readKontent, saveKontentBolimi } from '../kontent/kontent';
import { DEMO_LOYIHALAR, DEMO_RAQAMLAR, SEED_LOYIHALAR } from './seed-data';

/**
 * `pnpm --filter @yh/server seed`: adds the starting Katalog; Loyihalar already present (by slug) are left alone.
 * `seed:demo` (`--demo`): the full DEMO catalog for showing the product — see seed-data.ts.
 */
const demo = process.argv.includes('--demo');
const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
try {
  await migrate(db);
  const added = await seedKatalog(db, demo ? DEMO_LOYIHALAR : SEED_LOYIHALAR);
  console.log(added.length ? `Seeded${demo ? ' (DEMO)' : ''}: ${added.join(', ')}` : 'Katalog already seeded');
  if (demo) {
    // «Biz haqimizda» figures that the seeded catalog itself proves, instead of the [XX] placeholders.
    const { bizHaqimizda } = await readKontent(db);
    if (bizHaqimizda.raqamlar.some((r) => r.qiymat.startsWith('['))) {
      await saveKontentBolimi(db, 'bizHaqimizda', { ...bizHaqimizda, raqamlar: DEMO_RAQAMLAR }, new Date());
      console.log('«Biz haqimizda» raqamlari: DEMO');
    }
  }
} finally {
  await db.end();
}
