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
