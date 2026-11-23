import type { Migration } from './index';

/**
 * Ko'chirish (#8): data carried over from the old bot and the old Mini App.
 *
 * Mijozlar go into `mijoz` itself. What the old bot knew about them but the
 * new `mijoz` table has no column for yet (telefon, «botni bloklagan»,
 * amoCRM kontakt ID, shaharga qiziqish) is kept in `legacy_mijoz`, and old
 * Arizalar in `legacy_ariza`, so this ticket does not race the Ariza (#9)
 * and Rassilka (#14) schemas. Those tickets read or fold these tables in.
 * `legacy_planirovka` remembers which Planirovka each old catalog entry
 * became, so re-running the importer never duplicates.
 */
export const m0005_t8_kochirish: Migration = {
  name: '0005_t8_kochirish',
  sql: `
    CREATE TABLE legacy_mijoz (
      telegram_id        bigint PRIMARY KEY REFERENCES mijoz(telegram_id) ON DELETE CASCADE,
      -- +998XXXXXXXXX when recognisable, otherwise as written in the old bot
      telefon            text,
      bot_bloklagan      boolean NOT NULL DEFAULT false,
      amocrm_kontakt_id  bigint,
      shahar_qiziqish    text[] NOT NULL DEFAULT '{}',
      -- first seen by the old bot
      created_at         timestamptz,
      raw                jsonb NOT NULL,
      imported_at        timestamptz NOT NULL
    );

    CREATE TABLE legacy_ariza (
      id                 serial PRIMARY KEY,
      -- 'id:<old id>' or 'sha256:<hash of the line>'
      legacy_key         text NOT NULL UNIQUE,
      telegram_id        bigint REFERENCES mijoz(telegram_id) ON DELETE SET NULL,
      tur                text NOT NULL,
      loyiha_nomi        text,
      loyiha_id          integer REFERENCES loyiha(id) ON DELETE SET NULL,
      ism                text,
      telefon            text,
      manba              text,
      amocrm_bitim_id    bigint,
      amocrm_kontakt_id  bigint,
      created_at         timestamptz,
      raw                jsonb NOT NULL,
      imported_at        timestamptz NOT NULL
    );
    CREATE INDEX legacy_ariza_telegram_id ON legacy_ariza (telegram_id);

    CREATE TABLE legacy_planirovka (
      legacy_key     text PRIMARY KEY,
      planirovka_id  integer NOT NULL REFERENCES planirovka(id) ON DELETE CASCADE,
      imported_at    timestamptz NOT NULL
    );
  `,
};
