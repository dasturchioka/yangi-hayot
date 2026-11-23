import type { ByudjetOraligi, Shahar } from '@yh/shared';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';
import { getSetting } from '../settings/settings';

const MLN = 1_000_000;

/**
 * Automatic kviz budget answers (S13): 4 equal ranges from the cheapest to
 * the dearest Boshlang'ich narx, bounds rounded to whole millions so they
 * read well («455–570 mln so'm»). One range when prices are (almost) equal;
 * none without prices.
 */
export function avtomatikByudjet(narx: { min: number; max: number } | null): ByudjetOraligi[] {
  if (!narx) return [];
  const from = Math.floor(narx.min / MLN);
  const to = Math.ceil(narx.max / MLN);
  if (to - from < 4) return [{ dan: from * MLN, gacha: Math.max(to, from + 1) * MLN }];
  const step = (to - from) / 4;
  const bounds = [0, 1, 2, 3, 4].map((i) => (i === 4 ? to : Math.round(from + i * step)) * MLN);
  return [0, 1, 2, 3].map((i) => ({ dan: bounds[i]!, gacha: bounds[i + 1]! }));
}

/** The Administrator's ranges: 2–6, ascending, not overlapping; only the first may be open below, only the last above. */
export function byudjetXatosi(list: ByudjetOraligi[]): string | null {
  if (list.length < 2 || list.length > 6) return 'count';
  for (const [i, r] of list.entries()) {
    if (r.dan === null && i !== 0) return 'open_dan';
    if (r.gacha === null && i !== list.length - 1) return 'open_gacha';
    if (r.dan !== null && r.gacha !== null && r.dan >= r.gacha) return 'order';
    const prev = list[i - 1];
    if (prev && (prev.gacha === null || r.dan === null || r.dan < prev.gacha)) return 'overlap';
  }
  return null;
}

/** Budget answers the kviz offers: the Administrator's own (settings `kvizByudjet`) or the automatic ones. */
export async function kvizByudjet(db: pg.Pool, katalog: Katalog, shahar?: Shahar): Promise<ByudjetOraligi[]> {
  const qolda = await getSetting(db, 'kvizByudjet');
  if (qolda) return qolda;
  return avtomatikByudjet((await katalog.filtrVariantlari(shahar)).narx);
}
