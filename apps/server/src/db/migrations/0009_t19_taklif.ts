import type { Migration } from './index';

/**
 * «Do'stingni taklif qil» (#19, UF-6).
 * - `mijoz.taklif_kod`: the Mijoz's personal link code (`taklif_<kod>`), made on first request.
 * - `mijoz.taklif_qilgan_id`: who invited this Mijoz; set only when the Mijoz first
 *   came by that link, never changed afterwards.
 */
export const m0009_t19_taklif: Migration = {
  name: '0009_t19_taklif',
  sql: `
    ALTER TABLE mijoz ADD COLUMN taklif_kod text UNIQUE;
    ALTER TABLE mijoz ADD COLUMN taklif_qilgan_id bigint REFERENCES mijoz (telegram_id) ON DELETE SET NULL;
    CREATE INDEX mijoz_taklif_qilgan_idx ON mijoz (taklif_qilgan_id) WHERE taklif_qilgan_id IS NOT NULL;
  `,
};
