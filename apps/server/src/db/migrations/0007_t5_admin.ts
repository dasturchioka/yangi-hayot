import type { Migration } from './index';

/**
 * Admin-panel (#5): login accounts with a role, their sessions and the jurnal
 * of catalog changes (kim, qachon, nima edi, nima bo'ldi).
 */
export const m0007_t5_admin: Migration = {
  name: '0007_t5_admin',
  sql: `
    CREATE TABLE admin_user (
      id             serial PRIMARY KEY,
      login          text NOT NULL UNIQUE,
      nomi           text NOT NULL,
      rol            text NOT NULL CHECK (rol IN ('administrator', 'menejer')),
      password_hash  text NOT NULL,
      faol           boolean NOT NULL DEFAULT true,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );

    -- Only a SHA-256 of the session token is stored.
    CREATE TABLE admin_session (
      token_hash  text PRIMARY KEY,
      admin_id    integer NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL,
      expires_at  timestamptz NOT NULL
    );
    CREATE INDEX admin_session_admin_id ON admin_session (admin_id);

    -- One row per admin write. oldin / keyin hold only the fields that changed
    -- (null oldin = created). tavsif is a human label of the object at that time.
    CREATE TABLE jurnal (
      id          bigserial PRIMARY KEY,
      at          timestamptz NOT NULL,
      admin_id    integer REFERENCES admin_user(id) ON DELETE SET NULL,
      admin_nomi  text NOT NULL,
      obyekt      text NOT NULL CHECK (obyekt IN ('loyiha', 'blok', 'planirovka')),
      obyekt_id   integer NOT NULL,
      loyiha_id   integer NOT NULL,
      amal       text NOT NULL,
      tavsif      text NOT NULL,
      oldin       jsonb,
      keyin       jsonb NOT NULL
    );
    CREATE INDEX jurnal_at ON jurnal (at DESC, id DESC);
    CREATE INDEX jurnal_obyekt ON jurnal (obyekt, obyekt_id);
    CREATE INDEX jurnal_loyiha ON jurnal (loyiha_id, at DESC);
  `,
};
