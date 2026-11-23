import type { ArizaDto, ArizaTuri } from '@yh/shared';
import type pg from 'pg';
import type { Crm } from '../adapters/crm/crm';
import { CrmAuthError } from '../adapters/crm/crm';
import type { Messenger } from '../adapters/messenger/messenger';
import type { Clock } from '../clock';
import { SHARED_MANBA } from '../mijoz/manba';
import { getSetting, setSetting } from '../settings/settings';
import { taklifQilganLines } from '../taklif/taklif';
import { knownCrmContact, knownPhone } from './legacy';
import { arizaNote, type ArizaKontekst } from './note';
import { ARIZA_TURI, TASK_TEXT } from './turlar';
import { addWorkingMinutes } from './working-hours';

/**
 * One Ariza to create. Every entry point (form, quiz, booking, calculator,
 * AI, «Menejer kerak») builds one of these and calls `Arizalar.create`.
 */
export interface NewAriza {
  tur: ArizaTuri;
  /** The Mijoz must already exist (`ensureMijoz`). */
  telegramId: string;
  name: string;
  /** Already normalized `+998XXXXXXXXX` (see `normalizePhone`), if the Mijoz gave one. */
  phone?: string | null;
  loyihaId?: number | null;
  /** Its Loyiha and Blok are taken from it; `loyihaId` may be omitted. */
  planirovkaId?: number | null;
  /** Manba of this Ariza when it is not the Mijoz's last Manba (e.g. «mijoz ulashdi»). */
  manba?: string;
  /** Type-specific lines for the CRM note (quiz answers, calculation, booking date, AI summary…). */
  izoh?: string[];
  /** Extra Bitim tags besides the type tag and the Manba (e.g. Daraja). */
  tags?: string[];
  /** Task deadline. Default: `crmTaskDue` working minutes from now. Booking passes the visit time. */
  taskDueAt?: Date;
  /** Raw data kept with the Ariza (for reports); not sent to the CRM. */
  payload?: unknown;
  /** Name of the Bitim if one has to be created (booking: «Ko'rish: …»). Default: «<ism> — <loyiha>». */
  bitimNomi?: string;
}

export interface CreatedAriza {
  id: number;
  /** True when this was a repeat of an Ariza sent moments ago: nothing new was created. */
  duplicate: boolean;
}

/** Unknown or not visible Loyiha / Planirovka. */
export class ArizaKontekstError extends Error {
  override name = 'ArizaKontekstError';
}

/** Too many Arizalar from one Mijoz (spam protection). */
export class ArizaRateLimitError extends Error {
  override name = 'ArizaRateLimitError';
}

/** Retry policy when the CRM is down (8-bo'lim, 4-qoida). */
export const CRM_RETRY_EVERY_MS = 5 * 60_000;
export const CRM_RETRY_FOR_MS = 24 * 3_600_000;

/** Spam protection: at most this many Arizalar per Mijoz per hour… */
export const ARIZA_LIMIT_PER_HOUR = 5;
/** …and the same Ariza repeated within this window is the same Ariza (double tap, resend). */
export const ARIZA_REPEAT_WINDOW_MS = 10 * 60_000;

export interface ArizaDeps {
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
  log?: { warn(obj: object, msg: string): void; error(obj: object, msg: string): void };
}

export interface Arizalar {
  /**
   * Stores the Ariza, then delivers it to the CRM. A CRM failure is not an
   * error for the caller: the Ariza is queued for retries and the managers
   * group is told. Throws ArizaKontekstError / ArizaRateLimitError.
   */
  create(input: NewAriza): Promise<CreatedAriza>;
  /** The Mijoz's own Arizalar, newest first. */
  ofMijoz(telegramId: string): Promise<ArizaDto[]>;
  /** CRM IDs of a delivered Ariza (booking reschedule / cancel need the Bitim and task). */
  crmIds(id: number): Promise<{
    contactId: string | null;
    bitimId: string | null;
    taskId: string | null;
    /** True when this Ariza created the Bitim (not added to an open one). */
    bitimCreated: boolean;
    status: 'pending' | 'sent' | 'failed';
  } | null>;
  /**
   * A moved booking: the task deadline and the new-Bitim name used by a delivery
   * that has not happened yet. Already delivered tasks are moved by the caller.
   */
  setTaskDue(id: number, dueAt: Date, bitimNomi?: string): Promise<void>;
  /** Job: retries every Ariza whose next attempt is due. */
  retryDue(): Promise<void>;
}

interface Row {
  id: number;
  mijoz_id: string;
  tur: ArizaTuri;
  name: string;
  phone: string | null;
  lang: string;
  first_manba: string;
  manba: string;
  kontekst: ArizaKontekst | null;
  izoh: string[];
  tags: string[];
  task_due_at: Date | null;
  crm_bitim_nomi: string | null;
  created_at: Date;
  crm_contact_id: string | null;
  crm_bitim_id: string | null;
  crm_note_added: boolean;
  crm_task_id: string | null;
  group_notified: boolean;
  username: string | null;
}

export function createArizalar(deps: ArizaDeps): Arizalar {
  const { db, clock, crm, messenger } = deps;
  const lock = keyedMutex();

  async function create(input: NewAriza): Promise<CreatedAriza> {
    return lock(input.telegramId, async () => {
      const now = clock.now();
      const mijoz = await db.query<{ lang: string; first_source: string; last_source: string }>(
        'SELECT lang, first_source, last_source FROM mijoz WHERE telegram_id = $1',
        [input.telegramId],
      );
      const m = mijoz.rows[0];
      if (!m) throw new Error(`Ariza for unknown Mijoz ${input.telegramId}`);
      const kontekst = await loadKontekst(db, input.loyihaId ?? null, input.planirovkaId ?? null);
      const manba = input.manba ?? m.last_source;
      const izoh = [
        ...(manba === SHARED_MANBA ? await sharerLines(db, input.telegramId) : []),
        // #19: the inviter stays on every Ariza of an invited Mijoz, whatever the later Manba.
        ...(await taklifQilganLines(db, input.telegramId)),
        ...(input.izoh ?? []),
      ];
      const phone = input.phone ?? (await knownPhone(db, input.telegramId));

      const repeat = await db.query<{ id: number }>(
        `SELECT id FROM ariza
          WHERE mijoz_id = $1 AND tur = $2 AND created_at > $3
            AND loyiha_id IS NOT DISTINCT FROM $4 AND planirovka_id IS NOT DISTINCT FROM $5
            AND phone IS NOT DISTINCT FROM $6 AND izoh = $7
          ORDER BY id DESC LIMIT 1`,
        [
          input.telegramId,
          input.tur,
          new Date(now.getTime() - ARIZA_REPEAT_WINDOW_MS),
          kontekst?.loyiha.id ?? null,
          kontekst?.planirovka?.id ?? null,
          phone,
          izoh,
        ],
      );
      if (repeat.rows[0]) return { id: repeat.rows[0].id, duplicate: true };

      const recent = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ariza WHERE mijoz_id = $1 AND created_at > $2',
        [input.telegramId, new Date(now.getTime() - 3_600_000)],
      );
      if (recent.rows[0]!.n >= ARIZA_LIMIT_PER_HOUR) throw new ArizaRateLimitError('too many Arizalar');

      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO ariza (mijoz_id, tur, name, phone, lang, first_manba, manba, loyiha_id, planirovka_id,
                            kontekst, izoh, tags, task_due_at, payload, created_at, crm_next_attempt_at, crm_bitim_nomi)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          input.telegramId,
          input.tur,
          input.name,
          phone,
          m.lang,
          m.first_source,
          manba,
          kontekst?.loyiha.id ?? null,
          kontekst?.planirovka?.id ?? null,
          kontekst ? JSON.stringify(kontekst) : null,
          izoh,
          input.tags ?? [],
          input.taskDueAt ?? null,
          input.payload === undefined ? null : JSON.stringify(input.payload),
          now,
          // A lease: if the process dies before the attempt below, the retry job picks it up.
          new Date(now.getTime() + CRM_RETRY_EVERY_MS),
          input.bitimNomi ?? null,
        ],
      );
      if (phone) await db.query('UPDATE mijoz SET phone = $2 WHERE telegram_id = $1', [input.telegramId, phone]);
      const id = rows[0]!.id;
      await deliver(id);
      return { id, duplicate: false };
    });
  }

  /** One delivery attempt. Steps already done (stored IDs) are not repeated. */
  async function deliver(id: number): Promise<void> {
    const row = await loadRow(id);
    if (!row) return;
    try {
      let contactId = row.crm_contact_id;
      if (!contactId) {
        // 8-bo'lim, 1-qoida: by phone, then by Telegram ID — first the contact the
        // bot database already links to this Mijoz (incl. the old bot), then the CRM's own field.
        contactId =
          (row.phone ? (await crm.findContact({ phone: row.phone }))?.id : undefined) ??
          (await knownCrmContact(db, row.mijoz_id)) ??
          (await crm.findContact({ telegramId: row.mijoz_id }))?.id ??
          (await crm.createContact({ name: row.name, phone: row.phone ?? undefined, telegramId: row.mijoz_id })).id;
        await db.query('UPDATE ariza SET crm_contact_id = $2 WHERE id = $1', [id, contactId]);
      }

      let bitimId = row.crm_bitim_id;
      let responsibleUserId = row.kontekst?.loyiha.responsibleId ?? undefined;
      if (!bitimId) {
        const open = await crm.findOpenBitim(contactId);
        const bitim =
          open ??
          (await crm.createBitim({
            contactId,
            name: row.crm_bitim_nomi ?? bitimName(row),
            responsibleUserId,
          }));
        bitimId = bitim.id;
        responsibleUserId = bitim.responsibleUserId ?? responsibleUserId;
        await db.query('UPDATE ariza SET crm_bitim_id = $2, crm_bitim_created = $3 WHERE id = $1', [id, bitimId, !open]);
      }

      const turi = ARIZA_TURI[row.tur];
      await crm.addTags(bitimId, [turi.tag, row.manba, ...row.tags]);
      await crm.setManba(bitimId, row.manba);
      if (!row.crm_note_added) {
        await crm.addNote(bitimId, arizaNote(row));
        await db.query('UPDATE ariza SET crm_note_added = true WHERE id = $1', [id]);
      }
      if (!row.crm_task_id) {
        const dueAt = row.task_due_at ?? (await defaultDueAt());
        const task = await crm.createTask({
          bitimId,
          kind: turi.task,
          text: `${TASK_TEXT[turi.task]}: ${turi.nomi} — ${[row.name, row.phone].filter(Boolean).join(', ')}`,
          dueAt,
          responsibleUserId,
        });
        await db.query('UPDATE ariza SET crm_task_id = $2 WHERE id = $1', [id, task.id]);
      }

      await db.query(
        `UPDATE ariza SET crm_status = 'sent', crm_sent_at = $2, crm_next_attempt_at = NULL,
                          crm_attempts = crm_attempts + 1, crm_last_error = NULL
          WHERE id = $1`,
        [id, clock.now()],
      );
      if (await getSetting(db, 'crmAuthAlertedAt')) await setSetting(db, 'crmAuthAlertedAt', null, clock.now());
    } catch (error) {
      await onFailure(row, error);
    }
  }

  async function onFailure(row: Row, error: unknown): Promise<void> {
    const now = clock.now();
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    deps.log?.warn({ arizaId: row.id, err: message }, 'Ariza not delivered to CRM');
    const giveUp = now.getTime() - row.created_at.getTime() >= CRM_RETRY_FOR_MS;
    await db.query(
      `UPDATE ariza SET crm_attempts = crm_attempts + 1, crm_last_error = $2,
                        crm_status = $3, crm_next_attempt_at = $4
        WHERE id = $1`,
      [row.id, message, giveUp ? 'failed' : 'pending', giveUp ? null : new Date(now.getTime() + CRM_RETRY_EVERY_MS)],
    );

    if (error instanceof CrmAuthError && !(await getSetting(db, 'crmAuthAlertedAt'))) {
      await setSetting(db, 'crmAuthAlertedAt', now.toISOString(), now);
      await toAdmins(
        "🔐 amoCRM avtorizatsiya xatosi: token yoki OAuth'ni tekshiring.\n" +
          "Arizalar bazada saqlanmoqda va 24 soat davomida qayta yuboriladi.",
      );
    }
    if (!row.group_notified) {
      await toGroup(`⚠️ amoCRM'ga yuborilmadi, qayta urinilmoqda (Ariza #${row.id})\n\n${arizaNote(row)}`);
      await db.query('UPDATE ariza SET group_notified = true WHERE id = $1', [row.id]);
    }
    if (giveUp) {
      const text = `❌ Ariza #${row.id} 24 soat davomida amoCRM'ga yuborilmadi — qo'lda kiriting.\n\n${arizaNote(row)}`;
      await toGroup(text);
      await toAdmins(text);
    }
  }

  async function retryDue(): Promise<void> {
    const now = clock.now();
    const { rows } = await db.query<{ id: number; mijoz_id: string }>(
      `UPDATE ariza SET crm_next_attempt_at = $2
        WHERE id IN (SELECT id FROM ariza
                      WHERE crm_status = 'pending' AND crm_next_attempt_at <= $1
                      ORDER BY id FOR UPDATE SKIP LOCKED)
        RETURNING id, mijoz_id`,
      [now, new Date(now.getTime() + CRM_RETRY_EVERY_MS)],
    );
    for (const r of rows.sort((a, b) => a.id - b.id)) {
      await lock(String(r.mijoz_id), () => deliver(r.id));
    }
  }

  async function defaultDueAt(): Promise<Date> {
    const due = await getSetting(db, 'crmTaskDue');
    return addWorkingMinutes(clock.now(), due.minutes, due.workingHours);
  }

  async function toGroup(text: string): Promise<void> {
    const groupId = await getSetting(db, 'managersGroupId');
    if (groupId) await messenger.send({ chatId: groupId, text });
  }

  async function toAdmins(text: string): Promise<void> {
    for (const chatId of await getSetting(db, 'admins')) await messenger.send({ chatId, text });
  }

  async function loadRow(id: number): Promise<Row | null> {
    const { rows } = await db.query<Row>(
      `SELECT a.*, a.mijoz_id::text AS mijoz_id, m.username
         FROM ariza a JOIN mijoz m ON m.telegram_id = a.mijoz_id
        WHERE a.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async function ofMijoz(telegramId: string): Promise<ArizaDto[]> {
    const { rows } = await db.query<{
      id: number;
      tur: ArizaTuri;
      created_at: Date;
      loyiha_id: number | null;
      planirovka_id: number | null;
      loyiha_nomi: string | null;
    }>(
      `SELECT id, tur, created_at, loyiha_id, planirovka_id, kontekst->'loyiha'->>'nomi' AS loyiha_nomi FROM ariza
        WHERE mijoz_id = $1 ORDER BY created_at DESC, id DESC`,
      [telegramId],
    );
    return rows.map((r) => ({
      id: r.id,
      tur: r.tur,
      createdAt: r.created_at.toISOString(),
      loyihaId: r.loyiha_id,
      planirovkaId: r.planirovka_id,
      loyihaNomi: r.loyiha_nomi,
    }));
  }

  async function crmIds(id: number) {
    const { rows } = await db.query<{
      crm_contact_id: string | null;
      crm_bitim_id: string | null;
      crm_task_id: string | null;
      crm_bitim_created: boolean;
      crm_status: 'pending' | 'sent' | 'failed';
    }>('SELECT crm_contact_id, crm_bitim_id, crm_task_id, crm_bitim_created, crm_status FROM ariza WHERE id = $1', [id]);
    const r = rows[0];
    return r
      ? {
          contactId: r.crm_contact_id,
          bitimId: r.crm_bitim_id,
          taskId: r.crm_task_id,
          bitimCreated: r.crm_bitim_created,
          status: r.crm_status,
        }
      : null;
  }

  async function setTaskDue(id: number, dueAt: Date, bitimNomi?: string): Promise<void> {
    await db.query('UPDATE ariza SET task_due_at = $2, crm_bitim_nomi = COALESCE($3, crm_bitim_nomi) WHERE id = $1', [
      id,
      dueAt,
      bitimNomi ?? null,
    ]);
  }

  return { create, ofMijoz, crmIds, setTaskDue, retryDue };
}

/** «mijoz ulashdi»: who shared the link that brought this Mijoz (#16), for the note. */
async function sharerLines(db: pg.Pool, telegramId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string; username: string | null; sharer: string; planirovka_id: number }>(
    `SELECT s.name, s.username, s.telegram_id::text AS sharer, u.planirovka_id
       FROM mijoz m JOIN ulashish u ON u.id = m.last_ulashish_id JOIN mijoz s ON s.telegram_id = u.mijoz_id
      WHERE m.telegram_id = $1`,
    [telegramId],
  );
  const r = rows[0];
  if (!r) return [];
  const who = [r.name, r.username ? `@${r.username}` : null, `ID ${r.sharer}`].filter(Boolean).join(' · ');
  return [`Ulashgan: ${who} (Planirovka #${r.planirovka_id})`];
}

function bitimName(row: Row): string {
  return [row.name, row.kontekst?.loyiha.nomi ?? 'Telegram bot'].join(' — ');
}

/** Context of the Ariza from the catalog, frozen at creation. Only Sotuvdagi Loyihalar. */
async function loadKontekst(db: pg.Pool, loyihaId: number | null, planirovkaId: number | null): Promise<ArizaKontekst | null> {
  if (planirovkaId !== null) {
    const { rows } = await db.query<{
      loyiha_id: number;
      loyiha_nomi: string;
      responsible: string | null;
      blok_nomi: string;
      id: number;
      xonalar: number;
      maydon: string;
      nomi: { ru: string; uz: string } | null;
      narx: string | null;
    }>(
      `SELECT l.id AS loyiha_id, l.nomi AS loyiha_nomi, l.crm_responsible_id AS responsible, b.nomi AS blok_nomi,
              p.id, p.xonalar, p.maydon, p.nomi, p.boshlangich_narx AS narx
         FROM planirovka_view p JOIN blok b ON b.id = p.blok_id JOIN loyiha l ON l.id = b.loyiha_id
        WHERE p.id = $1 AND l.holat = 'sotuvda'`,
      [planirovkaId],
    );
    const r = rows[0];
    if (!r || (loyihaId !== null && loyihaId !== r.loyiha_id)) throw new ArizaKontekstError('unknown Planirovka');
    return {
      loyiha: { id: r.loyiha_id, nomi: r.loyiha_nomi, responsibleId: r.responsible },
      blok: r.blok_nomi,
      planirovka: {
        id: r.id,
        xonalar: r.xonalar,
        maydon: Number(r.maydon),
        nomi: r.nomi?.uz ?? null,
        narx: r.narx === null ? null : Number(r.narx),
      },
    };
  }
  if (loyihaId !== null) {
    const { rows } = await db.query<{ id: number; nomi: string; responsible: string | null }>(
      `SELECT id, nomi, crm_responsible_id AS responsible FROM loyiha WHERE id = $1 AND holat = 'sotuvda'`,
      [loyihaId],
    );
    const r = rows[0];
    if (!r) throw new ArizaKontekstError('unknown Loyiha');
    return { loyiha: { id: r.id, nomi: r.nomi, responsibleId: r.responsible }, blok: null, planirovka: null };
  }
  return null;
}

/** Serializes work per key (one Mijoz): two Arizalar at once must not open two Bitimlar. */
function keyedMutex() {
  const tails = new Map<string, Promise<unknown>>();
  return async function <T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
