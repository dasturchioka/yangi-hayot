import type pg from 'pg';
import { migrations } from './migrations';

/**
 * Applies pending migrations in order, each in its own transaction.
 * Applied names are kept in `schema_migrations`. Migrations are append-only:
 * never edit one that has been merged, add a new one instead.
 */
export async function migrate(db: pg.Pool): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const done: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
      await client.query('COMMIT');
      done.push(m.name);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  return done;
}
