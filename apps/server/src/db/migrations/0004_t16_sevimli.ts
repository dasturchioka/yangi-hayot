import type { Migration } from './index';

/**
 * Sevimlilar va «Ulashish» (#16).
 * - `sevimli`: a Mijoz's sevimli Planirovkalar (server-side, so they follow
 *   the Mijoz across devices).
 * - `ulashish`: one row per «Ulashish» press; its id travels in the share
 *   link's startapp parameter, so we know who shared which Planirovka.
 * - `mijoz.last_ulashish_id`: the share link that last brought this Mijoz in
 *   (set together with last Manba «mijoz ulashdi»).
 */
export const m0004_t16_sevimli: Migration = {
  name: '0004_t16_sevimli',
  sql: `
    CREATE TABLE sevimli (
      mijoz_id      bigint  NOT NULL REFERENCES mijoz (telegram_id) ON DELETE CASCADE,
      planirovka_id integer NOT NULL REFERENCES planirovka (id) ON DELETE CASCADE,
      created_at    timestamptz NOT NULL,
      PRIMARY KEY (mijoz_id, planirovka_id)
    );

    CREATE TABLE ulashish (
      id            serial  PRIMARY KEY,
      mijoz_id      bigint  NOT NULL REFERENCES mijoz (telegram_id) ON DELETE CASCADE,
      planirovka_id integer NOT NULL REFERENCES planirovka (id) ON DELETE CASCADE,
      created_at    timestamptz NOT NULL
    );

    ALTER TABLE mijoz ADD COLUMN last_ulashish_id integer REFERENCES ulashish (id) ON DELETE SET NULL;
  `,
};
