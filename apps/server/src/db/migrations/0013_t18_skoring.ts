import type { Migration } from './index';

/**
 * Lead skoringi (UF-4, #18).
 * - `mijoz.daraja` / `daraja_ball` / `daraja_at`: the Mijoz's Daraja, recomputed on every Ariza and action.
 * - `mijoz.issiq_vazifa_kerak`: became issiq and the 5-minute «Qo'ng'iroq qilish» task is not in amoCRM yet.
 * - `mijoz_kirish`: days (Tashkent) the Mijoz opened the bot or the Mini App; later days are re-entries.
 */
export const m0013_t18_skoring: Migration = {
  name: '0013_t18_skoring',
  sql: `
    ALTER TABLE mijoz
      ADD COLUMN daraja text CHECK (daraja IN ('issiq', 'iliq', 'sovuq')),
      ADD COLUMN daraja_ball integer,
      ADD COLUMN daraja_at timestamptz,
      ADD COLUMN issiq_vazifa_kerak boolean NOT NULL DEFAULT false;
    CREATE TABLE mijoz_kirish (
      mijoz_id bigint NOT NULL REFERENCES mijoz (telegram_id) ON DELETE CASCADE,
      kun      date   NOT NULL,
      PRIMARY KEY (mijoz_id, kun)
    );
  `,
};
