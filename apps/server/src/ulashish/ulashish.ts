import {
  parseUlashishParam,
  parseXonadonParam,
  parseXonadonUlashishParam,
  ulashishStartParam,
  xonadonUlashishStartParam,
  type StartDto,
  type UlashishRequest,
} from '@yh/shared';
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
 * «Ulashish» (#16, #25): a Mijoz sends a Xonadon (`xn<id>_u<n>`) or a
 * Planirovka (`pl<id>_u<n>`) to a Telegram chat as a direct Mini App link.
 * Whoever opens it lands on it; another Mijoz also gets Manba «mijoz ulashdi».
 */
export function createUlashish(deps: { db: pg.Pool; katalog: Katalog; miniAppLink?: string }) {
  const { db, katalog } = deps;
  return {
    /** null when the Xonadon / Planirovka is not in the katalog. The Mijoz must exist. */
    async create(mijozId: string, what: UlashishRequest, now: Date): Promise<{ url: string } | null> {
      if (!deps.miniAppLink) throw new Error('MINIAPP_LINK is not configured');
      if ('xonadonId' in what) {
        const x = await katalog.xonadon(what.xonadonId);
        if (!x) return null;
        const ulashishId = await insert(mijozId, x.planirovkaId, x.id, now);
        return { url: `${deps.miniAppLink}?startapp=${xonadonUlashishStartParam({ xonadonId: x.id, ulashishId })}` };
      }
      const { planirovkaId } = what;
      if (!(await katalog.planirovka(planirovkaId, 'uz'))) return null;
      const ulashishId = await insert(mijozId, planirovkaId, null, now);
      return { url: `${deps.miniAppLink}?startapp=${ulashishStartParam({ planirovkaId, ulashishId })}` };
    },

    /**
     * Resolves a signed start parameter for the Mijoz `telegramId`. A share
     * link always opens its Planirovka; it counts as «mijoz ulashdi» only when
     * the share is real, of that Planirovka, and by someone else.
     */
    async visit(startParam: string | undefined, telegramId: string): Promise<StartVisit> {
      const xonadonLink = parseXonadonUlashishParam(startParam);
      const link = parseUlashishParam(startParam);
      const xonadonId = parseXonadonParam(startParam);
      if (xonadonId) return { start: { ekran: 'xonadon', xonadonId }, manba: null, ulashishId: null };
      if (!link && !xonadonLink) return { start: null, manba: manbaFromStartParam(startParam), ulashishId: null };
      const start: StartDto = xonadonLink
        ? { ekran: 'xonadon', xonadonId: xonadonLink.xonadonId }
        : { ekran: 'planirovka', planirovkaId: link!.planirovkaId };
      const ulashishId = (xonadonLink ?? link)!.ulashishId;
      const { rows } = await db.query<{ mijoz_id: string }>(
        xonadonLink
          ? `SELECT mijoz_id FROM ulashish WHERE id = $1 AND xonadon_id = $2`
          : `SELECT mijoz_id FROM ulashish WHERE id = $1 AND planirovka_id = $2 AND xonadon_id IS NULL`,
        [ulashishId, xonadonLink ? xonadonLink.xonadonId : link!.planirovkaId],
      );
      const sharer = rows[0]?.mijoz_id;
      if (sharer === undefined || String(sharer) === telegramId) return { start, manba: null, ulashishId: null };
      return { start, manba: SHARED_MANBA, ulashishId };
    },
  };

  async function insert(mijozId: string, planirovkaId: number, xonadonId: number | null, now: Date): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO ulashish (mijoz_id, planirovka_id, xonadon_id, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
      [mijozId, planirovkaId, xonadonId, now],
    );
    return rows[0]!.id;
  }
}

export type Ulashish = ReturnType<typeof createUlashish>;
