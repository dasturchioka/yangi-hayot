import type { Lang } from '@yh/shared';
import type pg from 'pg';
import type { TelegramUser } from '../auth/init-data';
import { DIRECT_MANBA } from './manba';

export interface Mijoz {
  telegramId: string;
  name: string;
  lang: Lang;
}

/** Everything stored about a Mijoz (server-side view). */
export interface MijozRecord extends Mijoz {
  username: string | null;
  /** False until the Mijoz picks RU/UZ in the bot; `lang` is then only a guess. */
  langChosen: boolean;
  /** Manba of the first visit; never overwritten. */
  firstManba: string;
  /** Manba of the latest tagged visit (the first one while there is none). */
  lastManba: string;
  /** Unfinished bot step (e.g. editing /welcome), cleared by /restart. */
  botStep: string | null;
  botStepData: unknown;
}

/** Language for a Mijoz seen for the first time: Uzbek Telegram → UZ, otherwise RU. */
export function langFromTelegram(languageCode: string | undefined): Lang {
  return languageCode?.toLowerCase().startsWith('uz') ? 'uz' : 'ru';
}

const COLUMNS = `telegram_id, name, lang, username, lang_chosen, first_source, last_source, bot_step, bot_step_data`;

interface Row {
  telegram_id: string;
  name: string;
  lang: Lang;
  username: string | null;
  lang_chosen: boolean;
  first_source: string;
  last_source: string;
  bot_step: string | null;
  bot_step_data: unknown;
}

function toRecord(row: Row): MijozRecord {
  return {
    telegramId: String(row.telegram_id),
    name: row.name,
    lang: row.lang,
    username: row.username,
    langChosen: row.lang_chosen,
    firstManba: row.first_source,
    lastManba: row.last_source,
    botStep: row.bot_step,
    botStepData: row.bot_step_data,
  };
}

/**
 * Returns the Mijoz for this Telegram user, creating it on first sight. Used
 * by both the bot and the Mini App, so both see the same Mijoz and Manba.
 *
 * A known Mijoz keeps the stored name and language (the language may have
 * been chosen in the bot). `manba` is the Manba of this visit (null when
 * untagged): it becomes the first Manba of a new Mijoz and the last Manba of
 * a known one; an untagged visit never overwrites a stored Manba.
 */
export async function ensureMijoz(
  db: pg.Pool,
  user: TelegramUser,
  now: Date,
  opts: { manba?: string | null } = {},
): Promise<MijozRecord> {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const { rows } = await db.query<Row>(
    `INSERT INTO mijoz (telegram_id, name, username, lang, first_source, last_source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, coalesce($5, $6), coalesce($5, $6), $7, $7)
     ON CONFLICT (telegram_id) DO UPDATE SET
       updated_at  = EXCLUDED.updated_at,
       username    = coalesce(EXCLUDED.username, mijoz.username),
       last_source = coalesce($5, mijoz.last_source)
     RETURNING ${COLUMNS}`,
    [user.id, name, user.username ?? null, langFromTelegram(user.language_code), opts.manba ?? null, DIRECT_MANBA, now],
  );
  return toRecord(rows[0]!);
}

/** Stores the language the Mijoz chose in the bot. */
export async function chooseLang(db: pg.Pool, telegramId: string, lang: Lang, now: Date): Promise<void> {
  await db.query(`UPDATE mijoz SET lang = $2, lang_chosen = true, updated_at = $3 WHERE telegram_id = $1`, [
    telegramId,
    lang,
    now,
  ]);
}

/** Sets (or, with null, clears) the unfinished bot step. */
export async function setBotStep(
  db: pg.Pool,
  telegramId: string,
  step: string | null,
  data: unknown,
  now: Date,
): Promise<void> {
  await db.query(`UPDATE mijoz SET bot_step = $2, bot_step_data = $3, updated_at = $4 WHERE telegram_id = $1`, [
    telegramId,
    step,
    step === null || data === undefined ? null : JSON.stringify(data),
    now,
  ]);
}
