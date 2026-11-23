import type pg from 'pg';
import type { DavomatHodisa } from '../yozilish/yozilish';

/**
 * Analitika events (TZ «Analitika», #15; the funnel #20 reads them):
 *
 *   bot_kirdi → planirovka_korildi | xonadon_korildi → ariza → yozilish → keldi
 *
 * One row per fact in `hodisa`, each with the Mijoz, the Manba it is
 * credited to and the Loyiha when there is one. Only the bot database —
 * amoCRM is never read for analytics.
 *
 * Manba per event: bot_kirdi / planirovka_korildi / xonadon_korildi — the Mijoz's last Manba
 * at that moment; ariza — `ariza.manba`; yozilish / keldi — their Ariza's.
 */
export type HodisaTuri = 'bot_kirdi' | 'planirovka_korildi' | 'xonadon_korildi' | 'ariza' | 'yozilish' | 'keldi';

export const VORONKA: HodisaTuri[] = ['bot_kirdi', 'planirovka_korildi', 'ariza', 'yozilish', 'keldi'];

/** The Mijoz opened the bot (/start, with or without a Manba tag). */
export async function botKirdi(db: pg.Pool, mijozId: string, at: Date): Promise<void> {
  await db.query(
    `INSERT INTO hodisa (tur, mijoz_id, manba, at)
     SELECT 'bot_kirdi', telegram_id, last_source, $2 FROM mijoz WHERE telegram_id = $1`,
    [mijozId, at],
  );
}

/** The Mijoz opened a Planirovka card in the Mini App (every opening is a row). */
export async function planirovkaKorildi(db: pg.Pool, mijozId: string, planirovkaId: number, at: Date): Promise<void> {
  await db.query(
    `INSERT INTO hodisa (tur, mijoz_id, manba, loyiha_id, planirovka_id, at)
     SELECT 'planirovka_korildi', m.telegram_id, m.last_source, b.loyiha_id, p.id, $3
       FROM mijoz m, planirovka p JOIN blok b ON b.id = p.blok_id
      WHERE m.telegram_id = $1 AND p.id = $2`,
    [mijozId, planirovkaId, at],
  );
}

/** The Mijoz opened a Xonadon kartochkasi (#23); it also counts as a view of its Planirovka. */
export async function xonadonKorildi(db: pg.Pool, mijozId: string, xonadonId: number, at: Date): Promise<void> {
  await db.query(
    `INSERT INTO hodisa (tur, mijoz_id, manba, loyiha_id, planirovka_id, xonadon_id, at)
     SELECT 'xonadon_korildi', m.telegram_id, m.last_source, b.loyiha_id, x.planirovka_id, x.id, $3
       FROM mijoz m, xonadon x JOIN blok b ON b.id = x.blok_id
      WHERE m.telegram_id = $1 AND x.id = $2`,
    [mijozId, xonadonId, at],
  );
}

/** A new Ariza (any type) was stored. Idempotent. */
export async function arizaHodisasi(db: pg.Pool, arizaId: number): Promise<void> {
  await db.query(
    `INSERT INTO hodisa (tur, mijoz_id, manba, loyiha_id, planirovka_id, ariza_id, at)
     SELECT 'ariza', mijoz_id, manba, loyiha_id, planirovka_id, id, created_at FROM ariza WHERE id = $1
     ON CONFLICT DO NOTHING`,
    [arizaId],
  );
}

/** A new ko'rishga yozilish was stored. Idempotent. */
export async function yozilishHodisasi(db: pg.Pool, yozilishId: number): Promise<void> {
  await db.query(
    `INSERT INTO hodisa (tur, mijoz_id, manba, loyiha_id, planirovka_id, ariza_id, yozilish_id, at)
     SELECT 'yozilish', y.mijoz_id, a.manba, y.loyiha_id, y.planirovka_id, y.ariza_id, y.id, y.created_at
       FROM yozilish y JOIN ariza a ON a.id = y.ariza_id WHERE y.id = $1
     ON CONFLICT DO NOTHING`,
    [yozilishId],
  );
}

/**
 * Keldi / kelmadi changed in the admin-panel (`yozilishlar.onDavomat`): a
 * `keldi` row exists exactly while the yozilish is marked «keldi».
 */
export async function davomatHodisasi(db: pg.Pool, e: DavomatHodisa): Promise<void> {
  if (e.davomat === 'keldi') {
    await db.query(
      `INSERT INTO hodisa (tur, mijoz_id, manba, loyiha_id, planirovka_id, ariza_id, yozilish_id, at)
       SELECT 'keldi', y.mijoz_id, a.manba, y.loyiha_id, y.planirovka_id, y.ariza_id, y.id, $2
         FROM yozilish y JOIN ariza a ON a.id = y.ariza_id WHERE y.id = $1
       ON CONFLICT DO NOTHING`,
      [e.yozilishId, e.at],
    );
  } else {
    await db.query(`DELETE FROM hodisa WHERE tur = 'keldi' AND yozilish_id = $1`, [e.yozilishId]);
  }
}

/**
 * Hook for dojim (#17): this yozilish came from a dojim message. The weekly
 * summary counts such yozilishlar («Dojimdan kelgan yozilishlar»).
 */
export async function belgilaDojim(db: pg.Pool, yozilishId: number): Promise<void> {
  await yozilishHodisasi(db, yozilishId);
  await db.query(`UPDATE hodisa SET dojim = true WHERE tur = 'yozilish' AND yozilish_id = $1`, [yozilishId]);
}

export interface HodisaSoni {
  /** Rows (events). */
  jami: number;
  /** Distinct Mijozlar. */
  mijozlar: number;
}

/**
 * Counts per event type in [dan, gacha). The funnel (#20) filters by Manba /
 * Loyiha on top of the same table.
 */
export async function hodisaSonlari(db: pg.Pool, dan: Date, gacha: Date): Promise<Record<HodisaTuri, HodisaSoni>> {
  const { rows } = await db.query<{ tur: HodisaTuri; jami: number; mijozlar: number }>(
    `SELECT tur, count(*)::int AS jami, count(DISTINCT mijoz_id)::int AS mijozlar
       FROM hodisa WHERE at >= $1 AND at < $2 GROUP BY tur`,
    [dan, gacha],
  );
  const turlar: HodisaTuri[] = [...VORONKA, 'xonadon_korildi'];
  const out = Object.fromEntries(turlar.map((t) => [t, { jami: 0, mijozlar: 0 }])) as Record<HodisaTuri, HodisaSoni>;
  for (const r of rows) out[r.tur] = { jami: r.jami, mijozlar: r.mijozlar };
  return out;
}

/** Yozilishlar in [dan, gacha) that came from dojim. */
export async function dojimYozilishlari(db: pg.Pool, dan: Date, gacha: Date): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM hodisa WHERE tur = 'yozilish' AND dojim AND at >= $1 AND at < $2`,
    [dan, gacha],
  );
  return rows[0]!.n;
}
