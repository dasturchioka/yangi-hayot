import type { BizHaqimizdaKontent, BotMedia, KontaktlarKontent, Lang, SotibOlishKontent } from '@yh/shared';
import { DEFAULT_BIZ_HAQIMIZDA, DEFAULT_KONTAKTLAR, DEFAULT_SOTIB_OLISH } from '../kontent/defaults';
import type pg from 'pg';

/** Welcome (salomlashish) set by an administrator with /welcome. */
export type WelcomeContent = Record<Lang, { text: string; media?: BotMedia }>;

/**
 * Settings changed without code (by administrators in the bot or in the
 * admin-panel). New keys: add a field + default here, no migration needed. Stored as JSON in the `settings` table, one row per key.
 */
export interface Settings {
  /** Telegram IDs of administrators (/welcome, /broadcast, /report). */
  admins: string[];
  /** Telegram chat id of the managers group; null = not configured yet. */
  managersGroupId: string | null;
  /** Welcome text and media; null = built-in default text. */
  welcome: WelcomeContent | null;
  /** «Qanday sotib olish» + FAQ (admin-panel → Kontent, #13). */
  sotibOlish: SotibOlishKontent;
  /** «Biz haqimizda» text and company numbers (#13). */
  bizHaqimizda: BizHaqimizdaKontent;
  /** Phone (1349), office address, working hours, map (#13). */
  kontaktlar: KontaktlarKontent;
}

const DEFAULTS: Settings = {
  admins: [],
  managersGroupId: null,
  welcome: null,
  sotibOlish: DEFAULT_SOTIB_OLISH,
  bizHaqimizda: DEFAULT_BIZ_HAQIMIZDA,
  kontaktlar: DEFAULT_KONTAKTLAR,
};

export async function getSetting<K extends keyof Settings>(db: pg.Pool, key: K): Promise<Settings[K]> {
  const { rows } = await db.query<{ value: Settings[K] }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : DEFAULTS[key];
}

export async function setSetting<K extends keyof Settings>(
  db: pg.Pool,
  key: K,
  value: Settings[K],
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(value), now],
  );
}

/**
 * Writes initial values (from env at server start) only for keys that were
 * never set, so later changes made without code are not overwritten.
 */
export async function seedSettings(db: pg.Pool, values: Partial<Settings>, now: Date): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value), now],
    );
  }
}

export async function isAdmin(db: pg.Pool, telegramId: string): Promise<boolean> {
  return (await getSetting(db, 'admins')).includes(telegramId);
}
