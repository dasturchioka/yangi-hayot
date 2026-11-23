import { m0001_mijoz } from './0001_mijoz';
import { m0002_bot_mijoz_manba } from './0002_bot_mijoz_manba';
import { m0003_katalog } from './0003_katalog';
import { m0004_rassilka } from './0004_rassilka';
import { m0005_t8_kochirish } from './0005_t8_kochirish';
import { m0006_t16_sevimli } from './0006_t16_sevimli';
import { m0007_t5_admin } from './0007_t5_admin';
import { m0008_t9_ariza } from './0008_t9_ariza';

export interface Migration {
  /** Unique, sortable: `NNNN_short_name`. */
  name: string;
  sql: string;
}

/** All migrations in apply order. Append new ones at the end. */
export const migrations: Migration[] = [
  m0001_mijoz,
  m0002_bot_mijoz_manba,
  m0003_katalog,
  m0004_rassilka,
  m0005_t8_kochirish,
  m0006_t16_sevimli,
  m0007_t5_admin,
  m0008_t9_ariza,
];
