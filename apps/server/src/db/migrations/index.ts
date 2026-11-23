import { m0001_mijoz } from './0001_mijoz';
import { m0002_bot_mijoz_manba } from './0002_bot_mijoz_manba';
import { m0003_rassilka } from './0003_rassilka';

export interface Migration {
  /** Unique, sortable: `NNNN_short_name`. */
  name: string;
  sql: string;
}

/** All migrations in apply order. Append new ones at the end. */
export const migrations: Migration[] = [m0001_mijoz, m0002_bot_mijoz_manba, m0003_rassilka];
