import type pg from 'pg';
import type { Messenger } from '../adapters/messenger/messenger';
import { toTashkent, type Clock } from '../clock';
import { getSetting } from '../settings/settings';
import { haftalikHisobot, haftalikMatn, kunlikHisobot, kunlikMatn } from './hisobot';

/** TZ 4-b.: every day at 19:30 Tashkent. */
export const HISOBOT_VAQTI = '19:30';

type Tur = 'kunlik' | 'haftalik';

/**
 * Job `hisobot`: from 19:30 until midnight (Tashkent), sends today's report to
 * every recipient that has not got it yet. Missed evenings are not sent the
 * next day (a stale "today" is useless). What reached whom is in
 * `hisobot_yuborish`, so ticks and restarts never repeat it; a chat Telegram
 * refused is retried on the next tick.
 */
export function hisobotJob(deps: { db: pg.Pool; clock: Clock; messenger: Messenger }) {
  return async () => {
    const now = toTashkent(deps.clock.now());
    if (now.time < HISOBOT_VAQTI) return;
    const chats = await qabulQiluvchilar(deps.db);
    if (chats.length === 0) return;
    await yubor(deps, 'kunlik', now.date, chats, async () => kunlikMatn(await kunlikHisobot(deps.db, now.date)));
    if (now.isoWeekday === 1) {
      await yubor(deps, 'haftalik', now.date, chats, async () => haftalikMatn(await haftalikHisobot(deps.db, now.date)));
    }
  };
}

/** Recipients from the settings; none set → the managers group (if configured). */
export async function qabulQiluvchilar(db: pg.Pool): Promise<string[]> {
  const { qabulQiluvchilar } = await getSetting(db, 'hisobot');
  if (qabulQiluvchilar.length > 0) return qabulQiluvchilar;
  const group = await getSetting(db, 'managersGroupId');
  return group ? [group] : [];
}

async function yubor(
  deps: { db: pg.Pool; clock: Clock; messenger: Messenger },
  tur: Tur,
  sana: string,
  chats: string[],
  matn: () => Promise<string>,
): Promise<void> {
  const done = await deps.db.query<{ chat_id: string }>(
    'SELECT chat_id FROM hisobot_yuborish WHERE tur = $1 AND sana = $2',
    [tur, sana],
  );
  const due = chats.filter((c) => !done.rows.some((r) => r.chat_id === c));
  if (due.length === 0) return;
  const text = await matn();
  for (const chatId of due) {
    const result = await deps.messenger.send({ chatId, text });
    if (result.status === 'error') continue; // next tick tries again
    // delivered, or the chat blocked the bot (nothing to retry)
    await deps.db.query(
      `INSERT INTO hisobot_yuborish (tur, sana, chat_id, sent_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [tur, sana, chatId, deps.clock.now()],
    );
  }
}
