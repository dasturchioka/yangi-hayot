import type pg from 'pg';

/**
 * Old bot data (#8, tables `legacy_mijoz`, `legacy_ariza`) seen through the
 * Ariza module:
 *
 * - old Arizalar are copied into `ariza` (idempotent; run as a job, because
 *   the importer CLI may run at any time), marked as already sent — they are
 *   in amoCRM already and must never be sent again;
 * - the phone and amoCRM contact the old bot knew feed contact dedupe.
 */

/** Old bot type → Ariza type. Unknown old types count as a form. */
const TUR: Record<string, string> = {
  bot_form: 'form',
  bot_quiz: 'quiz',
  bot_booking: 'visit',
  bot_visit: 'visit',
  bot_calc: 'calc',
  bot_ai: 'ai',
  bot_manager: 'human',
  bot_human: 'human',
};

/** Copies old Arizalar of known Mijozlar that are not in `ariza` yet. Returns how many. */
export async function foldLegacyArizalar(db: pg.Pool): Promise<number> {
  const turCase = Object.entries(TUR)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ');
  const { rowCount } = await db.query(
    `INSERT INTO ariza (mijoz_id, tur, name, phone, lang, first_manba, manba, loyiha_id, payload, created_at,
                        crm_status, crm_contact_id, crm_bitim_id, crm_note_added, crm_sent_at, group_notified,
                        legacy_ariza_id)
     SELECT l.telegram_id, CASE l.tur ${turCase} ELSE 'form' END, coalesce(l.ism, m.name),
            CASE WHEN l.telefon ~ '^\\+998[0-9]{9}$' THEN l.telefon END, m.lang, m.first_source,
            coalesce(l.manba, m.last_source), l.loyiha_id,
            jsonb_build_object('legacy', jsonb_build_object('tur', l.tur, 'loyiha', l.loyiha_nomi, 'key', l.legacy_key)),
            coalesce(l.created_at, l.imported_at),
            'sent', l.amocrm_kontakt_id::text, l.amocrm_bitim_id::text, true, coalesce(l.created_at, l.imported_at), true,
            l.id
       FROM legacy_ariza l JOIN mijoz m ON m.telegram_id = l.telegram_id
      WHERE NOT EXISTS (SELECT 1 FROM ariza a WHERE a.legacy_ariza_id = l.id)
      ORDER BY l.id`,
  );
  return rowCount ?? 0;
}

/**
 * The amoCRM contact the bot database already links to this Mijoz: from our
 * own delivered Arizalar first, else from the old bot. «Bot bazasidagi
 * Telegram ID bo'yicha» (8-bo'lim, 1-qoida).
 */
export async function knownCrmContact(db: pg.Pool, telegramId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string | null }>(
    `SELECT coalesce(
       (SELECT crm_contact_id FROM ariza
         WHERE mijoz_id = $1 AND crm_contact_id IS NOT NULL AND legacy_ariza_id IS NULL
         ORDER BY id DESC LIMIT 1),
       (SELECT amocrm_kontakt_id::text FROM legacy_mijoz WHERE telegram_id = $1),
       (SELECT amocrm_kontakt_id::text FROM legacy_ariza
         WHERE telegram_id = $1 AND amocrm_kontakt_id IS NOT NULL ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1)
     ) AS id`,
    [telegramId],
  );
  return rows[0]?.id ?? null;
}

/** The phone the bot knows for this Mijoz: given in the Mini App, else from the old bot. */
export async function knownPhone(db: pg.Pool, telegramId: string): Promise<string | null> {
  const { rows } = await db.query<{ phone: string | null }>(
    `SELECT coalesce(m.phone, CASE WHEN l.telefon ~ '^\\+998[0-9]{9}$' THEN l.telefon END) AS phone
       FROM mijoz m LEFT JOIN legacy_mijoz l ON l.telegram_id = m.telegram_id
      WHERE m.telegram_id = $1`,
    [telegramId],
  );
  return rows[0]?.phone ?? null;
}
