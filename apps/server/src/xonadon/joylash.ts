import type { XonadonHolati } from '@yh/shared';

type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> };

export interface Sonlar {
  bosh: number;
  bron?: number;
  sotilgan?: number;
}

export interface XonadonJoyi {
  /** Index of the Planirovka in the list given. */
  tur: number;
  qavat: number;
  raqam: number;
  holat: XonadonHolati;
}

/**
 * Lays out a Blok's Xonadonlar when only counts are known (demo seed, old
 * counts, the #6 count import): each floor takes one of each Planirovka in
 * turn, numbers go up floor by floor from 1, and each Planirovka's holatlar
 * are spread over its floors (not all sold ones at the bottom).
 *
 * `qavatlarSoni` (the Loyiha's) sets how many fit on a floor; unknown → as
 * many as there are Planirovkalar (at most 8).
 */
export function joylashtir(turlar: Sonlar[], qavatlarSoni: number | null = null): XonadonJoyi[] {
  const holatlar = turlar.map(tarqat);
  const ketma: { tur: number; holat: XonadonHolati }[] = [];
  const used = turlar.map(() => 0);
  for (;;) {
    let added = false;
    turlar.forEach((_, i) => {
      const h = holatlar[i]![used[i]!];
      if (h === undefined) return;
      ketma.push({ tur: i, holat: h });
      used[i]! += 1;
      added = true;
    });
    if (!added) break;
  }
  const perQavat = qavatlarSoni
    ? Math.max(1, Math.ceil(ketma.length / qavatlarSoni))
    : Math.min(8, Math.max(1, turlar.length));
  return ketma.map((x, i) => ({ ...x, qavat: Math.floor(i / perQavat) + 1, raqam: i + 1 }));
}

/** The counts as a sequence of holatlar, each holat spread evenly over it. */
export function tarqat(s: Sonlar): XonadonHolati[] {
  const soni: Record<XonadonHolati, number> = { sotilgan: s.sotilgan ?? 0, bron: s.bron ?? 0, bosh: s.bosh };
  const n = soni.bosh + soni.bron + soni.sotilgan;
  const used: Record<XonadonHolati, number> = { sotilgan: 0, bron: 0, bosh: 0 };
  const out: XonadonHolati[] = [];
  for (let i = 0; i < n; i++) {
    let best: XonadonHolati | null = null;
    let bestDeficit = -Infinity;
    for (const h of ['sotilgan', 'bron', 'bosh'] as const) {
      if (used[h] >= soni[h]) continue;
      const deficit = (soni[h] * (i + 1)) / n - used[h];
      if (deficit > bestDeficit) {
        best = h;
        bestDeficit = deficit;
      }
    }
    used[best!] += 1;
    out.push(best!);
  }
  return out;
}

/** Inserts the Xonadonlar in one statement. */
export async function insertXonadonlar(
  db: Queryable,
  rows: { blokId: number; planirovkaId: number; qavat: number; raqam: number; holat: XonadonHolati; narx?: number | null }[],
  at: Date,
): Promise<void> {
  if (!rows.length) return;
  await db.query(
    `INSERT INTO xonadon (blok_id, planirovka_id, qavat, raqam, holat, narx, created_at, updated_at)
     SELECT * , $7::timestamptz, $7::timestamptz FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::text[], $6::bigint[])`,
    [
      rows.map((r) => r.blokId),
      rows.map((r) => r.planirovkaId),
      rows.map((r) => r.qavat),
      rows.map((r) => r.raqam),
      rows.map((r) => r.holat),
      rows.map((r) => r.narx ?? null),
      at,
    ],
  );
}

/**
 * Adds Xonadonlar of the given holatlar to a Planirovka at the end of its
 * Blok: next numbers, on the top floor while it has room (room = the fullest
 * floor), else on a new floor. For count-based writers only (#6 import).
 */
export async function appendXonadonlar(
  db: Queryable,
  blokId: number,
  planirovkaId: number,
  holatlar: XonadonHolati[],
  at: Date,
): Promise<void> {
  if (!holatlar.length) return;
  const { rows } = (await db.query(
    `SELECT COALESCE(max(raqam), 0)::int AS raqam, COALESCE(max(qavat), 1)::int AS qavat,
            COALESCE((SELECT max(n) FROM (SELECT count(*)::int AS n FROM xonadon WHERE blok_id = $1 GROUP BY qavat) f), 0)::int AS per,
            (SELECT count(*)::int FROM xonadon WHERE blok_id = $1
               AND qavat = (SELECT max(qavat) FROM xonadon WHERE blok_id = $1)) AS tepada
       FROM xonadon WHERE blok_id = $1`,
    [blokId],
  )) as { rows: { raqam: number; qavat: number; per: number; tepada: number }[] };
  let { raqam, qavat, tepada } = rows[0]!;
  const per = rows[0]!.per || 4; // empty Blok: 4 a floor
  const out = holatlar.map((holat) => {
    if (tepada >= per) {
      qavat += 1;
      tepada = 0;
    }
    tepada += 1;
    raqam += 1;
    return { blokId, planirovkaId, qavat, raqam, holat };
  });
  await insertXonadonlar(db, out, at);
}

/**
 * Makes a Planirovka have exactly these counts by changing as few Xonadonlar
 * as possible: surplus Xonadonlar of one holat take a missing holat, the rest
 * are removed (highest raqam first) or added at the end of the Blok. Only for
 * the count-based #6 import, until #24 imports Xonadonlar row by row; the
 * caller writes the Planirovka's jurnal row with the counts.
 */
export async function moslashtirSonlar(
  c: Queryable,
  planirovkaId: number,
  target: { bosh: number; bron: number; sotilgan: number },
  at: Date,
): Promise<void> {
  const rows = (
    (await c.query(
      `SELECT x.id, p.blok_id, x.holat FROM planirovka p LEFT JOIN xonadon x ON x.planirovka_id = p.id
        WHERE p.id = $1 ORDER BY x.raqam DESC`,
      [planirovkaId],
    )) as { rows: { id: number | null; blok_id: number; holat: XonadonHolati }[] }
  ).rows;
  const blokId = rows[0]!.blok_id;
  const xonadonlar = rows.flatMap((r) => (r.id === null ? [] : [{ id: r.id, holat: r.holat }]));
  const ortiqcha: number[] = [];
  const kerak: XonadonHolati[] = [];
  for (const h of ['bosh', 'bron', 'sotilgan'] as const) {
    const bor = xonadonlar.filter((x) => x.holat === h);
    const farqi = bor.length - target[h];
    if (farqi > 0) ortiqcha.push(...bor.slice(0, farqi).map((x) => x.id));
    for (let i = 0; i < -farqi; i++) kerak.push(h);
  }
  const n = Math.min(ortiqcha.length, kerak.length);
  for (let i = 0; i < n; i++) {
    await c.query('UPDATE xonadon SET holat = $1, updated_at = $2 WHERE id = $3', [kerak[i], at, ortiqcha[i]]);
  }
  if (ortiqcha.length > n) await c.query('DELETE FROM xonadon WHERE id = ANY($1::int[])', [ortiqcha.slice(n)]);
  await appendXonadonlar(c, blokId, planirovkaId, kerak.slice(n), at);
}
