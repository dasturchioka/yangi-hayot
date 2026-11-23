import type { Shahar } from '@yh/shared';
import type pg from 'pg';

/** Text in both languages. */
export interface Lokal {
  ru: string;
  uz: string;
}

export interface InfratuzilmaInput {
  kategoriya: string;
  nomi: Lokal;
  masofa?: Lokal | null;
}

export interface PlanirovkaInput {
  xonalar: number;
  maydon: number;
  nomi?: Lokal | null;
  chizma?: string | null;
  video?: string | null;
  /** UZS, whole Xonadon; null → «Narx so'rov bo'yicha». */
  boshlangichNarx?: number | null;
  bosh: number;
  bron?: number;
  sotilgan?: number;
}

export interface BlokInput {
  /** Letter or short name, e.g. "A". */
  nomi: string;
  planirovkalar: PlanirovkaInput[];
}

export interface LoyihaInput {
  slug: string;
  nomi: string;
  shahar: Shahar;
  holat: 'sotuvda' | 'topshirilgan';
  manzil: Lokal;
  qisqaTavsif?: Lokal | null;
  tavsif?: Lokal | null;
  fotolar?: string[];
  video?: string | null;
  qavatlarSoni?: number | null;
  xarita?: { lat: number; lng: number } | null;
  infratuzilma?: InfratuzilmaInput[];
  tartib?: number;
  bloklar?: BlokInput[];
}

export interface InsertedLoyiha {
  id: number;
  bloklar: { id: number; nomi: string; planirovkalar: { id: number }[] }[];
}

/**
 * Writes one Loyiha with its Bloklar and Planirovkalar in one transaction.
 * Used by the seed script and by tests until the admin-panel can create them.
 */
export async function insertLoyiha(db: pg.Pool, input: LoyihaInput): Promise<InsertedLoyiha> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO loyiha (slug, nomi, shahar, holat, manzil, qisqa_tavsif, tavsif, fotolar, video_url,
                           qavatlar_soni, lat, lng, infratuzilma, tartib)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        input.slug,
        input.nomi,
        input.shahar,
        input.holat,
        JSON.stringify(input.manzil),
        input.qisqaTavsif ? JSON.stringify(input.qisqaTavsif) : null,
        input.tavsif ? JSON.stringify(input.tavsif) : null,
        input.fotolar ?? [],
        input.video ?? null,
        input.qavatlarSoni ?? null,
        input.xarita?.lat ?? null,
        input.xarita?.lng ?? null,
        JSON.stringify(input.infratuzilma ?? []),
        input.tartib ?? 0,
      ],
    );
    const loyihaId = rows[0]!.id;

    const bloklar: InsertedLoyiha['bloklar'] = [];
    for (const [bi, b] of (input.bloklar ?? []).entries()) {
      const blokRes = await client.query<{ id: number }>(
        'INSERT INTO blok (loyiha_id, nomi, tartib) VALUES ($1, $2, $3) RETURNING id',
        [loyihaId, b.nomi, bi],
      );
      const blokId = blokRes.rows[0]!.id;
      const planirovkalar: { id: number }[] = [];
      for (const [pi, p] of b.planirovkalar.entries()) {
        const pr = await client.query<{ id: number }>(
          `INSERT INTO planirovka (blok_id, xonalar, maydon, nomi, chizma_url, video_url, boshlangich_narx,
                                   bosh, bron, sotilgan, tartib)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            blokId,
            p.xonalar,
            p.maydon,
            p.nomi ? JSON.stringify(p.nomi) : null,
            p.chizma ?? null,
            p.video ?? null,
            p.boshlangichNarx ?? null,
            p.bosh,
            p.bron ?? 0,
            p.sotilgan ?? 0,
            pi,
          ],
        );
        planirovkalar.push({ id: pr.rows[0]!.id });
      }
      bloklar.push({ id: blokId, nomi: b.nomi, planirovkalar });
    }

    await client.query('COMMIT');
    return { id: loyihaId, bloklar };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Inserts each given Loyiha whose slug is not in the database yet. Returns the slugs added. */
export async function seedKatalog(db: pg.Pool, loyihalar: LoyihaInput[]): Promise<string[]> {
  const { rows } = await db.query<{ slug: string }>('SELECT slug FROM loyiha');
  const existing = new Set(rows.map((r) => r.slug));
  const added: string[] = [];
  for (const l of loyihalar) {
    if (existing.has(l.slug)) continue;
    await insertLoyiha(db, l);
    added.push(l.slug);
  }
  return added;
}
