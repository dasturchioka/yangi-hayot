import { m0001_mijoz } from './0001_mijoz';
import { m0002_bot_mijoz_manba } from './0002_bot_mijoz_manba';
import { m0003_katalog } from './0003_katalog';
import { m0004_t5_admin } from './0004_t5_admin';

export interface Migration {
  /** Unique, sortable: `NNNN_short_name`. */
  name: string;
  sql: string;
}

/** All migrations in apply order. Append new ones at the end. */
export const migrations: Migration[] = [m0001_mijoz, m0002_bot_mijoz_manba, m0003_katalog, m0004_t5_admin];
