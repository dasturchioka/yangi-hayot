import type { Migration } from './index';

/**
 * Bot ↔ server (#7): Mijoz Manba (first/last), explicit language choice,
 * Telegram username, the bot's unfinished step, and the key-value settings
 * store (admins, managers group, welcome text).
 */
export const m0002_bot_mijoz_manba: Migration = {
  name: '0002_bot_mijoz_manba',
  sql: `
    ALTER TABLE mijoz
      ADD COLUMN username      text,
      -- true once the Mijoz picked RU/UZ in the bot; until then /start asks
      ADD COLUMN lang_chosen   boolean NOT NULL DEFAULT false,
      ADD COLUMN first_source  text NOT NULL DEFAULT 'Telegram (to''g''ridan-to''g''ri)',
      ADD COLUMN last_source   text NOT NULL DEFAULT 'Telegram (to''g''ridan-to''g''ri)',
      -- unfinished bot step (e.g. /welcome editing); cleared by /restart
      ADD COLUMN bot_step      text,
      ADD COLUMN bot_step_data jsonb;
    ALTER TABLE mijoz ALTER COLUMN first_source DROP DEFAULT, ALTER COLUMN last_source DROP DEFAULT;

    CREATE TABLE settings (
      key        text PRIMARY KEY,
      value      jsonb NOT NULL,
      updated_at timestamptz NOT NULL
    );
  `,
};
