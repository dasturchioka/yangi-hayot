import type { Lang } from '@yh/shared';
import type pg from 'pg';
import type { Messenger, SendResult } from '../adapters/messenger/messenger';
import type { Clock } from '../clock';
import { fill, texts } from '../bot/texts';
import { getRassilka, toOutgoing, type RassilkaContent } from './rassilka';

export interface WorkerDeps {
  db: pg.Pool;
  clock: Clock;
  messenger: Messenger;
}

export interface DrainOptions {
  /** Upper bound on sends per second (TZ: ≤ 25/s). */
  maxPerSecond?: number;
  /** Waits `ms` (real timer in production; tests move the fake clock). */
  sleep: (ms: number) => Promise<void>;
}

export const MAX_PER_SECOND = 25;

/**
 * Sends everything in the queue, oldest Rassilka first, at most
 * `maxPerSecond` messages per second (measured with `deps.clock`), then
 * finishes completed Rassilkalar and reports to whoever made them in the bot.
 *
 * Each recipient is claimed (`pending → sending`) in its own statement before
 * the send and resolved after it, so after a crash at most the one in-flight
 * recipient per worker is left in `sending`; `recoverRassilkaQueue` marks it
 * as an error instead of re-sending (no duplicates).
 */
export async function drainRassilkaQueue(deps: WorkerDeps, opts: DrainOptions): Promise<void> {
  const limit = opts.maxPerSecond ?? MAX_PER_SECOND;
  for (;;) {
    const windowStart = deps.clock.now().getTime();
    let sent = 0;
    while (sent < limit) {
      const item = await claimNext(deps.db);
      if (!item) break;
      const result = await safeSend(deps.messenger, item.telegramId, item.content);
      await resolve(deps.db, item, result, deps.clock.now());
      sent++;
    }
    await finishCompleted(deps);
    if (sent < limit) return;
    const wait = 1000 - (deps.clock.now().getTime() - windowStart);
    if (wait > 0) await opts.sleep(wait);
  }
}

/**
 * Run once at server start, before the worker: recipients left in `sending`
 * by a crash may or may not have got the message, so they are reported as
 * errors and never sent again.
 */
export async function recoverRassilkaQueue(db: pg.Pool, now: Date): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE rassilka_qabul SET status = 'error', error = 'interrupted by restart', sent_at = $1 WHERE status = 'sending'`,
    [now],
  );
  return rowCount ?? 0;
}

/**
 * Production loop: recovers the queue, then drains it every `pollMs`.
 * Single server instance assumed (recovery would otherwise hit other workers).
 */
export function startRassilkaWorker(
  deps: WorkerDeps,
  opts: { pollMs?: number; onError?: (e: unknown) => void } = {},
): { stop(): Promise<void> } {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let stopped = false;
  const loop = (async () => {
    await recoverRassilkaQueue(deps.db, deps.clock.now());
    while (!stopped) {
      try {
        await drainRassilkaQueue(deps, { sleep });
      } catch (e) {
        opts.onError?.(e);
      }
      await sleep(opts.pollMs ?? 2000);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await loop.catch(() => {});
    },
  };
}

interface Claimed {
  rassilkaId: string;
  telegramId: string;
  content: RassilkaContent;
}

async function claimNext(db: pg.Pool): Promise<Claimed | null> {
  const { rows } = await db.query<{ rassilka_id: string; telegram_id: string; content: RassilkaContent }>(
    `WITH next AS (
       SELECT q.rassilka_id, q.telegram_id FROM rassilka_qabul q
       WHERE q.status = 'pending'
       ORDER BY q.rassilka_id, q.telegram_id
       LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE rassilka_qabul q SET status = 'sending'
     FROM next, rassilka r
     WHERE q.rassilka_id = next.rassilka_id AND q.telegram_id = next.telegram_id AND r.id = q.rassilka_id
     RETURNING q.rassilka_id, q.telegram_id, r.content`,
  );
  const row = rows[0];
  return row ? { rassilkaId: String(row.rassilka_id), telegramId: String(row.telegram_id), content: row.content } : null;
}

async function safeSend(messenger: Messenger, chatId: string, content: RassilkaContent): Promise<SendResult> {
  try {
    return await messenger.send(toOutgoing(chatId, content));
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

async function resolve(db: pg.Pool, item: Claimed, result: SendResult, now: Date): Promise<void> {
  await db.query(
    `UPDATE rassilka_qabul SET status = $3, error = $4, sent_at = $5 WHERE rassilka_id = $1 AND telegram_id = $2`,
    [item.rassilkaId, item.telegramId, result.status, result.status === 'error' ? result.error : null, now],
  );
  // "Botni bloklagan": left out of later Rassilkalar until they write to the bot again.
  if (result.status === 'blocked') {
    await db.query('UPDATE mijoz SET bot_blocked = true WHERE telegram_id = $1', [item.telegramId]);
  }
}

/** Marks Rassilkalar with an empty queue as done and sends the report to their author. */
async function finishCompleted(deps: WorkerDeps): Promise<void> {
  const { rows } = await deps.db.query<{ id: string }>(
    `UPDATE rassilka r SET status = 'done', finished_at = $1
     WHERE r.status = 'sending'
       AND NOT EXISTS (SELECT 1 FROM rassilka_qabul q WHERE q.rassilka_id = r.id AND q.status IN ('pending', 'sending'))
     RETURNING r.id`,
    [deps.clock.now()],
  );
  for (const { id } of rows) {
    const r = (await getRassilka(deps.db, id))!;
    if (!r.createdBy) continue;
    const { rows: m } = await deps.db.query<{ lang: Lang }>('SELECT lang FROM mijoz WHERE telegram_id = $1', [
      r.createdBy,
    ]);
    const t = texts(m[0]?.lang ?? 'ru');
    await safeSend(deps.messenger, r.createdBy, {
      text: fill(t.bcReport, { id: r.id, ...r.stats }),
    });
  }
}
