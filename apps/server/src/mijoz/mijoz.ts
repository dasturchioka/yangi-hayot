import type { Lang } from '@yh/shared';
import type pg from 'pg';
import type { TelegramUser } from '../auth/init-data';

export interface Mijoz {
  telegramId: string;
  name: string;
  lang: Lang;
}

/** Language for a Mijoz seen for the first time: Uzbek Telegram → UZ, otherwise RU. */
export function langFromTelegram(languageCode: string | undefined): Lang {
  return languageCode?.toLowerCase().startsWith('uz') ? 'uz' : 'ru';
}

/**
 * Returns the Mijoz for this Telegram user, creating it on first sight.
 * A known Mijoz keeps the name and language already stored (the language may
 * have been chosen in the bot).
 */
export async function ensureMijoz(db: pg.Pool, user: TelegramUser, now: Date): Promise<Mijoz> {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const { rows } = await db.query<{ telegram_id: string; name: string; lang: Lang }>(
    `INSERT INTO mijoz (telegram_id, name, lang, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
     RETURNING telegram_id, name, lang`,
    [user.id, name, langFromTelegram(user.language_code), now],
  );
  const row = rows[0]!;
  return { telegramId: String(row.telegram_id), name: row.name, lang: row.lang };
}
