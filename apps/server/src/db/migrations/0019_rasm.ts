import type { Migration } from './index';

/**
 * Images uploaded in the admin-panel (Loyiha fotolari, Planirovka chizmasi,
 * kontent rasmlari, Rassilka foto). Kept in the database so the daily backup
 * covers them and no volume is needed. `id` is the content hash: the same
 * file uploaded twice is one row.
 */
export const m0019_rasm: Migration = {
  name: '0019_rasm',
  sql: `
    CREATE TABLE rasm (
      id text PRIMARY KEY,
      mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
      data bytea NOT NULL,
      created_at timestamptz NOT NULL
    );
  `,
};
