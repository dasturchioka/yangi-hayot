import type pg from 'pg';
import { insertLoyiha, type BlokInput, type LoyihaInput, type PlanirovkaInput } from '../../src/katalog/seed';

let seq = 0;

/**
 * Inserts a Loyiha with its Bloklar and Planirovkalar. Only what the test
 * cares about needs to be given; the rest gets dull defaults (Toshkent, Sotuvda).
 */
export function seedLoyiha(db: pg.Pool, overrides: Partial<LoyihaInput> = {}) {
  seq += 1;
  return insertLoyiha(db, {
    slug: `loyiha-${seq}`,
    nomi: `Loyiha ${seq}`,
    shahar: 'toshkent',
    holat: 'sotuvda',
    manzil: { ru: 'Мирзо-Улугбекский район', uz: "Mirzo Ulug'bek tumani" },
    ...overrides,
  });
}

/** A Blok with the given Planirovkalar (defaults: 2 xona, 54 m², no price). */
export function blok(nomi: string, planirovkalar: Partial<PlanirovkaInput>[]): BlokInput {
  return { nomi, planirovkalar: planirovkalar.map((p) => planirovka(p)) };
}

export function planirovka(p: Partial<PlanirovkaInput> = {}): PlanirovkaInput {
  return { xonalar: 2, maydon: 54, bosh: 1, ...p };
}

/** Id of one Xonadon of the Planirovka in that holat (lowest raqam), to change it through the admin API. */
export async function xonadonOf(db: pg.Pool, planirovkaId: number, holat: 'bosh' | 'bron' | 'sotilgan'): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'SELECT id FROM xonadon WHERE planirovka_id = $1 AND holat = $2 ORDER BY raqam LIMIT 1',
    [planirovkaId, holat],
  );
  if (!rows[0]) throw new Error(`no ${holat} Xonadon in Planirovka ${planirovkaId}`);
  return rows[0].id;
}
