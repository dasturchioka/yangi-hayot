import {
  DEFAULT_KALKULYATOR,
  DEFAULT_SKORING,
  type BizHaqimizdaKontent,
  type BotMedia,
  type ByudjetOraligi,
  type KalkulyatorSozlamalari,
  type KontaktlarKontent,
  type Lang,
  type SkoringQoidalari,
  type SotibOlishKontent,
} from '@yh/shared';
import { DEFAULT_BIZ_HAQIMIZDA, DEFAULT_KONTAKTLAR, DEFAULT_SOTIB_OLISH } from '../kontent/defaults';
import type pg from 'pg';
import type { WorkingHours } from '../ariza/working-hours';

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
  /**
   * Deadline of «Qo'ng'iroq qilish» / «Bog'lanish» CRM tasks (8-bo'lim):
   * `minutes` of working time from the Ariza.
   */
  crmTaskDue: { minutes: number; workingHours: WorkingHours };
  /** Set when admins were alerted about an amoCRM auth error; cleared by the next successful delivery. */
  crmAuthAlertedAt: string | null;
  /** Kviz budget answers set by the Administrator (#10); null = automatic (kviz/byudjet.ts). */
  kvizByudjet: ByudjetOraligi[] | null;
  /** Muddatli to'lov terms and ipoteka banks (TZ 6-b., UF-2); the Administrator edits them (#12). */
  kalkulyator: KalkulyatorSozlamalari;
  /** Ball qoidalari of the lead skoringi (UF-4, #18); the Administrator edits them. */
  skoring: SkoringQoidalari;
}

const DEFAULTS: Settings = {
  admins: [],
  managersGroupId: null,
  welcome: null,
  sotibOlish: DEFAULT_SOTIB_OLISH,
  bizHaqimizda: DEFAULT_BIZ_HAQIMIZDA,
  kontaktlar: DEFAULT_KONTAKTLAR,
  // TZ: 15 minutes «ish vaqtida». Office hours not confirmed yet (M11): Mon–Sat 9:00–19:00.
  crmTaskDue: { minutes: 15, workingHours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] } },
  crmAuthAlertedAt: null,
  kvizByudjet: null,
  kalkulyator: DEFAULT_KALKULYATOR,
  skoring: DEFAULT_SKORING,
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
