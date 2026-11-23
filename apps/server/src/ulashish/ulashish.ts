import { parseUlashishParam, ulashishStartParam, type StartDto } from '@yh/shared';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';
import { manbaFromStartParam, SHARED_MANBA } from '../mijoz/manba';

/** What a Mini App launch's start parameter means for the Mijoz opening it. */
export interface StartVisit {
  /** Screen to open, or null. */
  start: StartDto | null;
  /** Manba of this visit (null = untagged, changes nothing). */
  manba: string | null;
  /** The «Ulashish» link behind manba «mijoz ulashdi». */
  ulashishId: number | null;
}

/**
 * «Ulashish» (#16): a Mijoz sends a Planirovka to a Telegram chat as a direct
 * Mini App link (`<miniAppLink>?startapp=pl<id>_u<n>`). Whoever opens it lands
 * on that Planirovka; another Mijoz also gets Manba «mijoz ulashdi».
 */
export function createUlashish(deps: { db: pg.Pool; katalog: Katalog; miniAppLink?: string }) {
  const { db, katalog } = deps;
  return {
    /** null when the Planirovka is not in the katalog. The Mijoz must exist. */
    async create(mijozId: string, planirovkaId: number, now: Date): Promise<{ url: string } | null> {
      if (!deps.miniAppLink) throw new Error('MINIAPP_LINK is not configured');
      if (!(await katalog.planirovka(planirovkaId, 'uz'))) return null;
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO ulashish (mijoz_id, planirovka_id, created_at) VALUES ($1, $2, $3) RETURNING id`,
        [mijozId, planirovkaId, now],
      );
      const startParam = ulashishStartParam({ planirovkaId, ulashishId: rows[0]!.id });
      return { url: `${deps.miniAppLink}?startapp=${startParam}` };
    },

    /**
     * Resolves a signed start parameter for the Mijoz `telegramId`. A share
     * link always opens its Planirovka; it counts as «mijoz ulashdi» only when
     * the share is real, of that Planirovka, and by someone else.
     */
    async visit(startParam: string | undefined, telegramId: string): Promise<StartVisit> {
      const link = parseUlashishParam(startParam);
      if (!link) return { start: null, manba: manbaFromStartParam(startParam), ulashishId: null };
      const start: StartDto = { ekran: 'planirovka', planirovkaId: link.planirovkaId };
      const { rows } = await db.query<{ mijoz_id: string }>(
        `SELECT mijoz_id FROM ulashish WHERE id = $1 AND planirovka_id = $2`,
        [link.ulashishId, link.planirovkaId],
      );
      const sharer = rows[0]?.mijoz_id;
      if (sharer === undefined || String(sharer) === telegramId) return { start, manba: null, ulashishId: null };
      return { start, manba: SHARED_MANBA, ulashishId: link.ulashishId };
    },
  };
}

export type Ulashish = ReturnType<typeof createUlashish>;
