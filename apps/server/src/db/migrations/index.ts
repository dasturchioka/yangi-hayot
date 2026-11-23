import { m0001_mijoz } from './0001_mijoz';

export interface Migration {
  /** Unique, sortable: `NNNN_short_name`. */
  name: string;
  sql: string;
}

/** All migrations in apply order. Append new ones at the end. */
export const migrations: Migration[] = [m0001_mijoz];
