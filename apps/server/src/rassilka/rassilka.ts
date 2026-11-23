import type { BotMedia } from '@yh/shared';
import type pg from 'pg';
import type { OutgoingMessage } from '../adapters/messenger/messenger';

/**
 * Rassilka: one message (text, optional photo/video, optional single button)
 * sent by an administrator to an audience of Mijozlar. Made in the bot
 * (/broadcast) or in the admin-panel; both go through these functions.
 *
 * Lifecycle: draft → (confirm) sending → done, or draft → cancelled.
 * Confirmation snapshots the recipients into the queue (`rassilka_qabul`);
 * the worker (./worker.ts) sends from the queue.
 */

/** Telegram limits: message text and media caption. */
export const MAX_TEXT = 4096;
export const MAX_CAPTION = 1024;

/** Telegram would reject this content (text or caption too long). */
export function contentTooLong(content: { text: string; media?: unknown }): boolean {
  return content.text.length > (content.media ? MAX_CAPTION : MAX_TEXT);
}

export const AUDIENCES =['all', 'ru', 'uz', 'toshkent', 'navoiy'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type RassilkaButton = { text: string; url: string } | { text: string; startapp: string };

export interface RassilkaContent {
  text: string;
  media?: BotMedia;
  button?: RassilkaButton;
}

export type RassilkaStatus = 'draft' | 'sending' | 'done' | 'cancelled';

export interface RassilkaStats {
  total: number;
  pending: number;
  delivered: number;
  blocked: number;
  error: number;
}

export interface Rassilka {
  id: string;
  audience: Audience;
  content: RassilkaContent;
  status: RassilkaStatus;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stats: RassilkaStats;
}

/**
 * Condition selecting the Mijozlar of an audience (alias `m`). Mijozlar who
 * blocked the bot are never included. Shaharga qiziqish: see ../mijoz/shahar-qiziqish.ts.
 */
function audienceWhere(audience: Audience): { sql: string; params: unknown[] } {
  const base = 'NOT m.bot_blocked';
  switch (audience) {
    case 'all':
      return { sql: base, params: [] };
    case 'ru':
    case 'uz':
      return { sql: `${base} AND m.lang = $1`, params: [audience] };
    case 'toshkent':
    case 'navoiy':
      return {
        sql: `${base} AND EXISTS (SELECT 1 FROM mijoz_shahar_qiziqish q WHERE q.telegram_id = m.telegram_id AND q.shahar = $1)`,
        params: [audience],
      };
  }
}

/** How many Mijozlar the audience has right now. */
export async function countAudience(db: pg.Pool, audience: Audience): Promise<number> {
  const w = audienceWhere(audience);
  const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM mijoz m WHERE ${w.sql}`, w.params);
  return Number(rows[0]!.n);
}

export async function createDraft(
  db: pg.Pool,
  input: { audience: Audience; content: RassilkaContent; createdBy: string | null },
  now: Date,
): Promise<Rassilka> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO rassilka (audience, content, status, created_by, created_at) VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
    [input.audience, JSON.stringify(input.content), input.createdBy, now],
  );
  return (await getRassilka(db, rows[0]!.id))!;
}

export type ConfirmResult = { ok: true; rassilka: Rassilka } | { ok: false; reason: 'not_found' | 'not_draft' };

/**
 * Confirms a draft: snapshots the audience into the queue and starts sending.
 * Only a draft can be confirmed, so a double press sends nothing twice.
 */
export async function confirmRassilka(db: pg.Pool, id: string, now: Date): Promise<ConfirmResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ audience: Audience; status: RassilkaStatus }>(
      'SELECT audience, status FROM rassilka WHERE id = $1 FOR UPDATE',
      [id],
    );
    const r = rows[0];
    if (!r || r.status !== 'draft') {
      await client.query('ROLLBACK');
      return { ok: false, reason: r ? 'not_draft' : 'not_found' };
    }
    const w = audienceWhere(r.audience);
    const idParam = `$${w.params.length + 1}`;
    await client.query(
      `INSERT INTO rassilka_qabul (rassilka_id, telegram_id, status)
       SELECT ${idParam}, m.telegram_id, 'pending' FROM mijoz m WHERE ${w.sql}`,
      [...w.params, id],
    );
    await client.query(`UPDATE rassilka SET status = 'sending', started_at = $2 WHERE id = $1`, [id, now]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { ok: true, rassilka: (await getRassilka(db, id))! };
}

/** Cancels a draft (a confirmed Rassilka cannot be stopped). */
export async function cancelDraft(db: pg.Pool, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE rassilka SET status = 'cancelled' WHERE id = $1 AND status = 'draft'`, [
    id,
  ]);
  return rowCount === 1;
}

interface Row {
  id: string;
  audience: Audience;
  content: RassilkaContent;
  status: RassilkaStatus;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  total: string;
  pending: string;
  delivered: string;
  blocked: string;
  error: string;
}

const SELECT = `
  SELECT r.*,
    count(q.*) AS total,
    count(*) FILTER (WHERE q.status IN ('pending', 'sending')) AS pending,
    count(*) FILTER (WHERE q.status = 'delivered') AS delivered,
    count(*) FILTER (WHERE q.status = 'blocked') AS blocked,
    count(*) FILTER (WHERE q.status = 'error') AS error
  FROM rassilka r LEFT JOIN rassilka_qabul q ON q.rassilka_id = r.id`;

function toRassilka(row: Row): Rassilka {
  return {
    id: String(row.id),
    audience: row.audience,
    content: row.content,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    stats: {
      total: Number(row.total),
      pending: Number(row.pending),
      delivered: Number(row.delivered),
      blocked: Number(row.blocked),
      error: Number(row.error),
    },
  };
}

export async function getRassilka(db: pg.Pool, id: string): Promise<Rassilka | null> {
  if (!/^\d+$/.test(id)) return null;
  const { rows } = await db.query<Row>(`${SELECT} WHERE r.id = $1 GROUP BY r.id`, [id]);
  return rows[0] ? toRassilka(rows[0]) : null;
}

/** Newest first. */
export async function listRassilkalar(db: pg.Pool, limit = 50): Promise<Rassilka[]> {
  const { rows } = await db.query<Row>(`${SELECT} GROUP BY r.id ORDER BY r.id DESC LIMIT $1`, [limit]);
  return rows.map(toRassilka);
}

/** The message a recipient gets (also used as the preview). */
export function toOutgoing(chatId: string, content: RassilkaContent): OutgoingMessage {
  return {
    chatId,
    text: content.text,
    ...(content.media ? { media: content.media } : {}),
    ...(content.button ? { buttons: [[content.button]] } : {}),
  };
}
