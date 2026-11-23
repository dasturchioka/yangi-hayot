import { DEFAULT_KALKULYATOR, type BotMedia, type KalkulyatorSozlamalari, type Lang } from '@yh/shared';
import type pg from 'pg';
import type { WorkingHours } from '../ariza/working-hours';

/** Welcome (salomlashish) set by an administrator with /welcome. */
export type WelcomeContent = Record<Lang, { text: string; media?: BotMedia }>;

/**
 * Settings changed without code (by administrators in the bot, later in the
 * admin-panel). Stored as JSON in the `settings` table, one row per key.
 */
export interface Settings {
  /** Telegram IDs of administrators (/welcome, /broadcast, /report). */
  admins: string[];
  /** Telegram chat id of the managers group; null = not configured yet. */
  managersGroupId: string | null;
  /** Welcome text and media; null = built-in default text. */
  welcome: WelcomeContent | null;
  /**
   * Deadline of «Qo'ng'iroq qilish» / «Bog'lanish» CRM tasks (8-bo'lim):
   * `minutes` of working time from the Ariza.
   */
  crmTaskDue: { minutes: number; workingHours: WorkingHours };
  /** Set when admins were alerted about an amoCRM auth error; cleared by the next successful delivery. */
  crmAuthAlertedAt: string | null;
  /** Muddatli to'lov terms and ipoteka banks (TZ 6-b., UF-2); the Administrator edits them (#12). */
  kalkulyator: KalkulyatorSozlamalari;
}

const DEFAULTS: Settings = {
  admins: [],
  managersGroupId: null,
  welcome: null,
  // TZ: 15 minutes «ish vaqtida». Office hours not confirmed yet (M11): Mon–Sat 9:00–19:00.
  crmTaskDue: { minutes: 15, workingHours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] } },
  crmAuthAlertedAt: null,
  kalkulyator: DEFAULT_KALKULYATOR,
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
