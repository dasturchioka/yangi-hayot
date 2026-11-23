import type { Migration } from './index';

/**
 * Rassilka (#14): "botni bloklagan" flag on Mijoz, city interest (shaharga
 * qiziqish) facts, Rassilkalar and their per-recipient queue.
 */
export const m0004_rassilka: Migration = {
  name: '0004_rassilka',
  sql: `
    ALTER TABLE mijoz ADD COLUMN bot_blocked boolean NOT NULL DEFAULT false;

    -- Why a Mijoz counts as interested in a city: opened its Loyihalar,
    -- picked it in the quiz, or left an Ariza on one of its Loyihalar.
    CREATE TABLE mijoz_shahar_qiziqish (
      telegram_id bigint NOT NULL REFERENCES mijoz (telegram_id),
      shahar      text NOT NULL CHECK (shahar IN ('toshkent', 'navoiy')),
      sabab       text NOT NULL CHECK (sabab IN ('loyiha', 'kviz', 'ariza')),
      created_at  timestamptz NOT NULL,
      PRIMARY KEY (telegram_id, shahar, sabab)
    );
    CREATE INDEX mijoz_shahar_qiziqish_shahar ON mijoz_shahar_qiziqish (shahar);

    CREATE TABLE rassilka (
      id          bigserial PRIMARY KEY,
      audience    text NOT NULL CHECK (audience IN ('all', 'ru', 'uz', 'toshkent', 'navoiy')),
      -- { text, media?: {kind, fileId}, button?: {text, url} | {text, startapp} }
      content     jsonb NOT NULL,
      status      text NOT NULL CHECK (status IN ('draft', 'sending', 'done', 'cancelled')),
      -- Telegram id of the administrator who made it in the bot (gets the report); null = admin-panel
      created_by  text,
      created_at  timestamptz NOT NULL,
      started_at  timestamptz,
      finished_at timestamptz
    );

    -- The queue: one row per recipient, snapshotted at confirmation.
    -- pending → sending (claimed, being sent) → delivered | blocked | error.
    -- A row left in 'sending' by a crash is never re-sent (no duplicates).
    CREATE TABLE rassilka_qabul (
      rassilka_id bigint NOT NULL REFERENCES rassilka (id),
      telegram_id bigint NOT NULL,
      status      text NOT NULL CHECK (status IN ('pending', 'sending', 'delivered', 'blocked', 'error')),
      error       text,
      sent_at     timestamptz,
      PRIMARY KEY (rassilka_id, telegram_id)
    );
    CREATE INDEX rassilka_qabul_pending ON rassilka_qabul (rassilka_id, telegram_id) WHERE status = 'pending';
  `,
};
