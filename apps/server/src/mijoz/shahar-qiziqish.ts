import type pg from 'pg';

export const SHAHARLAR = ['toshkent', 'navoiy'] as const;
export type Shahar = (typeof SHAHARLAR)[number];

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
 * the catalog (city opened), the quiz and Ariza handling; the Mijoz must exist
 * (ensureMijoz runs on every Mini App request).
 */
export async function recordShaharQiziqish(
  db: pg.Pool | pg.PoolClient,
  telegramId: string,
  shahar: Shahar,
  sabab: QiziqishSabab,
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO mijoz_shahar_qiziqish (telegram_id, shahar, sabab, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [telegramId, shahar, sabab, now],
  );
}
