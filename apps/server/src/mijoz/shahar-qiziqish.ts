import type { Shahar } from '@yh/shared';
import type pg from 'pg';

/**
 * Why a Mijoz counts as interested in a city (Rassilka audiences «Toshkentga
 * qiziqish» / «Navoiyga qiziqish»):
 * - `loyiha` — opened that city's Loyihalar (catalog, Mini App);
 * - `kviz`   — picked the city in the «Xonadon tanlash» quiz;
 * - `ariza`  — left an Ariza on one of the city's Loyihalar.
 * A Mijoz can be interested in both cities.
 */
export type QiziqishSabab = 'loyiha' | 'kviz' | 'ariza';

/**
 * Records that the Mijoz is interested in `shahar`. Idempotent. Call it from
 * the catalog (city opened — wired in routes/katalog-qiziqish.ts), the quiz and
 * Ariza handling. Does nothing for an unknown Mijoz.
 */
export async function recordShaharQiziqish(
  db: pg.Pool | pg.PoolClient,
  telegramId: string,
  shahar: Shahar,
  sabab: QiziqishSabab,
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO mijoz_shahar_qiziqish (telegram_id, shahar, sabab, created_at)
     SELECT telegram_id, $2, $3, $4 FROM mijoz WHERE telegram_id = $1
     ON CONFLICT DO NOTHING`,
    [telegramId, shahar, sabab, now],
  );
}
