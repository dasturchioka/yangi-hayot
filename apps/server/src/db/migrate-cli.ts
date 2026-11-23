import pg from 'pg';
import { loadConfig } from '../config';
import { migrate } from './migrate';

const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply');
} finally {
  await db.end();
}
