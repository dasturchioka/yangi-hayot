import type { Migration } from './index';

export const m0001_mijoz: Migration = {
  name: '0001_mijoz',
  sql: `
    CREATE TABLE mijoz (
      telegram_id bigint PRIMARY KEY,
      name        text NOT NULL,
      lang        text NOT NULL CHECK (lang IN ('ru', 'uz')),
      created_at  timestamptz NOT NULL,
      updated_at  timestamptz NOT NULL
    );
  `,
};
