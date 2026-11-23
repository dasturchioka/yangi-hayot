import type { ByudjetOraligi, Shahar } from '@yh/shared';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';
import { getSetting } from '../settings/settings';

const MLN = 1_000_000;

/** Rounding units for range bounds, coarsest first: whole millions read best («455–570 mln so'm»). */
const UNITS = [MLN, 100_000, 10_000, 1_000, 1];

/**
 * Automatic kviz budget answers (S13): 4 equal ranges from the cheapest to
 * the dearest Boshlang'ich narx. Bounds are rounded to the coarsest unit
 * (whole millions, else 100 000, …) that still leaves 4 distinct ranges, so
 * close prices give finer bounds rather than fewer ranges. One range only
 * when every price is the same (or under 4 so'm apart); none without prices.
 */
export function avtomatikByudjet(narx: { min: number; max: number } | null): ByudjetOraligi[] {
  if (!narx) return [];
  const unit = UNITS.find((u) => Math.ceil(narx.max / u) - Math.floor(narx.min / u) >= 4);
  if (unit === undefined) {
    // Equal prices (or a few so'm apart): nothing to split.
    const from = Math.floor(narx.min / MLN);
    return [{ dan: from * MLN, gacha: Math.max(Math.ceil(narx.max / MLN), from + 1) * MLN }];
  }
  const from = Math.floor(narx.min / unit);
  const to = Math.ceil(narx.max / unit);
  const step = (to - from) / 4;
  const bounds = [0, 1, 2, 3, 4].map((i) => (i === 4 ? to : Math.round(from + i * step)) * unit);
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
