import type { AdminYozilishDto, Daraja, Davomat, Lang, YozilishDto, YozilishHolati } from '@yh/shared';
import type pg from 'pg';
import type { Crm } from '../adapters/crm/crm';
import type { Messenger } from '../adapters/messenger/messenger';
import { ArizaKontekstError, CRM_RETRY_EVERY_MS, CRM_RETRY_FOR_MS, type Arizalar } from '../ariza/ariza';
import { formatSom } from '../ariza/note';
import { addDays, tashkentInstant, toTashkent, type Clock } from '../clock';
import { yozilishHodisasi } from '../hodisa/hodisa';
import { getSetting } from '../settings/settings';
import { slotBormi } from './slotlar';

/** The asked slot is not offered (passed, holiday, closed hour, too far). */
export class YozilishSlotError extends Error {
  override name = 'YozilishSlotError';
}

/** No such yozilish of this Mijoz. */
export class YozilishNotFoundError extends Error {
  override name = 'YozilishNotFoundError';
}

/** The yozilish cannot change any more (cancelled, already passed, davomat set) or davomat is too early. */
export class YozilishHolatError extends Error {
  override name = 'YozilishHolatError';
  constructor(readonly code: 'bekor' | 'otgan' | 'kelajak') {
    super(code);
  }
}

/**
 * «Keldi» / «kelmadi» was set (or changed, or cleared) in the admin-panel.
 * Dojim (#17: «kelmadi» → offer a new time; «keldi» → «Qanday bo'ldi?») and
 * the funnel (#20: yozilish → keldi) hook here; the same facts are in the
 * `yozilish` table (davomat, davomat_at) for jobs that look at the database.
 */
export interface DavomatHodisa {
  yozilishId: number;
  arizaId: number;
  mijozId: string;
  loyihaId: number;
  planirovkaId: number | null;
  /** The visit time. */
  vaqt: Date;
  davomat: Davomat | null;
  oldingi: Davomat | null;
  /** When it was set. */
  at: Date;
  admin: { id: number; nomi: string };
}

export interface NewYozilish {
  telegramId: string;
  loyihaId: number;
  planirovkaId?: number;
  /** The Xonadon the booking is about (#25); must be in the Loyiha. */
  xonadonId?: number;
  /** Tashkent `YYYY-MM-DD` and `HH:mm`; must be an offered slot. */
  sana: string;
  vaqt: string;
  name: string;
  /** Normalized `+998XXXXXXXXX`. */
  phone: string;
}

export interface Yozilishlar {
  /** Books a visit: an Ariza `visit` (CRM Bitim + «Uchrashuv» task) and a note to the managers group. */
  create(input: NewYozilish): Promise<{ id: number; duplicate: boolean }>;
  /** Moves the Mijoz's own booking to another offered slot. */
  kochir(telegramId: string, id: number, sana: string, vaqt: string): Promise<void>;
  /** Cancels the Mijoz's own booking: CRM task closed + note, Bitim stays open. */
  bekor(telegramId: string, id: number): Promise<void>;
  /** The Mijoz's bookings: upcoming (soonest first), then the rest (newest first). */
  ofMijoz(telegramId: string, lang: Lang): Promise<YozilishDto[]>;
  /** One of the Mijoz's bookings, or null. */
  get(telegramId: string, id: number, lang: Lang): Promise<YozilishDto | null>;
  /** Admin list: visits on Tashkent days `dan`…`gacha` (inclusive), by time. */
  adminList(dan: string, gacha: string): Promise<AdminYozilishDto[]>;
  /** Admin «keldi / kelmadi» (null clears). Only for faol bookings whose day has come. */
  setDavomat(id: number, davomat: Davomat | null, admin: { id: number; nomi: string }): Promise<AdminYozilishDto>;
  /** Subscribe to davomat changes. A failing listener is logged, never breaks the mark. */
  onDavomat(listener: (e: DavomatHodisa) => void | Promise<void>): void;
  /** Job: pushes moves / cancellations to the CRM (after the Ariza itself is there), retrying for 24 h. */
  syncCrm(yozilishId?: number): Promise<void>;
}

export interface YozilishDeps {
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
  arizalar: Arizalar;
  log?: { warn(obj: object, msg: string): void; error(obj: object, msg: string): void };
  /** Lead skoringi (#18): a cancelled booking no longer counts for the Daraja. */
  skoring?: { harakat(telegramId: string): Promise<unknown> };
}

const HAFTA = ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'];

/** «25.11.2026» from `2026-11-25`. */
function sanaUz(sana: string): string {
  const [y, m, d] = sana.split('-');
  return `${d}.${m}.${y}`;
}

/** «25.11.2026 (chorshanba) 12:00» — how managers read a visit time. */
export function vaqtMatni(at: Date): string {
  const l = toTashkent(at);
  return `${sanaUz(l.date)} (${HAFTA[l.isoWeekday - 1]}) ${l.time}`;
}

/** TZ 2-b.: «Ko'rish: <loyiha>, <sana> <vaqt> — <ism>». */
export function bitimNomi(loyiha: string, at: Date, ism: string): string {
  const l = toTashkent(at);
  return `Ko'rish: ${loyiha}, ${sanaUz(l.date)} ${l.time} — ${ism}`;
}

interface Row {
  id: number;
  ariza_id: number;
  mijoz_id: string;
  loyiha_id: number;
  planirovka_id: number | null;
  vaqt: Date;
  holat: YozilishHolati;
  kochirildi: number;
  davomat: Davomat | null;
  davomat_at: Date | null;
  davomat_admin: string | null;
  loyiha_nomi: string;
  manzil: Record<Lang, string>;
  lat: number | null;
  lng: number | null;
  xonalar: number | null;
  maydon: string | null;
  narx: string | null;
  blok_nomi: string | null;
  name: string;
  phone: string | null;
  manba: string;
  username: string | null;
  daraja: Daraja | null;
}

const SELECT = `
  SELECT y.id, y.ariza_id, y.mijoz_id::text AS mijoz_id, y.loyiha_id, y.planirovka_id, y.vaqt, y.holat,
         y.kochirildi, y.davomat, y.davomat_at, au.nomi AS davomat_admin,
         l.nomi AS loyiha_nomi, COALESCE(l.korsatuv_manzili, l.manzil) AS manzil, l.lat, l.lng,
         p.xonalar, p.maydon, p.boshlangich_narx AS narx, b.nomi AS blok_nomi,
         a.name, a.phone, a.manba, m.username, m.daraja
    FROM yozilish y
    JOIN loyiha l ON l.id = y.loyiha_id
    JOIN ariza a ON a.id = y.ariza_id
    JOIN mijoz m ON m.telegram_id = y.mijoz_id
    LEFT JOIN planirovka_view p ON p.id = y.planirovka_id
    LEFT JOIN blok b ON b.id = p.blok_id
    LEFT JOIN admin_user au ON au.id = y.davomat_admin_id`;

function maydonMatni(m: number): string {
  return String(Number(m.toFixed(2))).replace('.', ',');
}

function planirovkaMatni(r: Row): string | null {
  if (r.xonalar === null || r.maydon === null) return null;
  return `${r.blok_nomi} blok · ${r.xonalar} xonali, ${maydonMatni(Number(r.maydon))} m²`;
}

export function createYozilishlar(deps: YozilishDeps): Yozilishlar {
  const { db, clock, crm, messenger, arizalar } = deps;
  const listeners: Array<(e: DavomatHodisa) => void | Promise<void>> = [];

  async function load(where: string, params: unknown[]): Promise<Row[]> {
    return (await db.query<Row>(`${SELECT} WHERE ${where}`, params)).rows;
  }

  function dto(r: Row, lang: Lang): YozilishDto {
    const l = toTashkent(r.vaqt);
    return {
      id: r.id,
      loyihaId: r.loyiha_id,
      loyihaNomi: r.loyiha_nomi,
      planirovka:
        r.planirovka_id !== null && r.xonalar !== null
          ? { id: r.planirovka_id, xonalar: r.xonalar, maydon: Number(r.maydon), blokNomi: r.blok_nomi ?? '' }
          : null,
      sana: l.date,
      vaqt: l.time,
      haftaKuni: l.isoWeekday,
      at: r.vaqt.toISOString(),
      holat: r.holat,
      davomat: r.davomat,
      manzil: r.manzil[lang] ?? r.manzil.uz,
      xarita: r.lat === null || r.lng === null ? null : { lat: r.lat, lng: r.lng },
      ozgartirsaBoladi: r.holat === 'faol' && r.davomat === null && r.vaqt.getTime() > clock.now().getTime(),
    };
  }

  function adminDto(r: Row): AdminYozilishDto {
    const l = toTashkent(r.vaqt);
    return {
      id: r.id,
      arizaId: r.ariza_id,
      sana: l.date,
      vaqt: l.time,
      at: r.vaqt.toISOString(),
      mijoz: { telegramId: r.mijoz_id, name: r.name, phone: r.phone, username: r.username },
      loyiha: { id: r.loyiha_id, nomi: r.loyiha_nomi },
      planirovka: planirovkaMatni(r),
      manba: r.manba,
      daraja: r.daraja,
      holat: r.holat,
      davomat: r.davomat,
      kochirildi: r.kochirildi,
      belgiladi: r.davomat_at ? { nomi: r.davomat_admin ?? '—', at: r.davomat_at.toISOString() } : null,
    };
  }

  /** Lines about the booking, for the managers group. */
  function tafsilot(r: Row): string[] {
    const p = planirovkaMatni(r);
    return [
      `Loyiha: ${r.loyiha_nomi}`,
      p ? `Planirovka: ${p}${r.narx === null ? '' : `, ${formatSom(Number(r.narx))} so'mdan`}` : null,
      `Ism: ${r.name}`,
      r.phone ? `Telefon: ${r.phone}` : null,
      `Telegram: ${[r.username ? `@${r.username}` : null, `ID ${r.mijoz_id}`].filter(Boolean).join(' · ')}`,
      `Manba: ${r.manba}`,
    ].filter((x): x is string => x !== null);
  }

  async function toGroup(text: string): Promise<void> {
    const groupId = await getSetting(db, 'managersGroupId');
    if (!groupId) return;
    try {
      await messenger.send({ chatId: groupId, text });
    } catch (err) {
      deps.log?.warn({ err }, 'managers group message failed');
    }
  }

  async function own(telegramId: string, id: number): Promise<Row> {
    const r = (await load('y.id = $1 AND y.mijoz_id = $2', [id, telegramId]))[0];
    if (!r) throw new YozilishNotFoundError('not found');
    return r;
  }

  function changeable(r: Row): void {
    if (r.holat === 'bekor') throw new YozilishHolatError('bekor');
    if (r.davomat !== null || r.vaqt.getTime() <= clock.now().getTime()) throw new YozilishHolatError('otgan');
  }

  async function create(input: NewYozilish): Promise<{ id: number; duplicate: boolean }> {
    const now = clock.now();
    if (!slotBormi(now, await getSetting(db, 'yozilish'), input.sana, input.vaqt)) throw new YozilishSlotError('slot');
    const at = tashkentInstant(input.sana, input.vaqt);
    const loyiha = (
      await db.query<{ nomi: string; manzil: { uz: string } }>(
        `SELECT nomi, COALESCE(korsatuv_manzili, manzil) AS manzil FROM loyiha WHERE id = $1 AND holat = 'sotuvda'`,
        [input.loyihaId],
      )
    ).rows[0];
    if (!loyiha) throw new ArizaKontekstError('unknown Loyiha');

    const ariza = await arizalar.create({
      tur: 'visit',
      telegramId: input.telegramId,
      name: input.name,
      phone: input.phone,
      loyihaId: input.loyihaId,
      planirovkaId: input.planirovkaId ?? null,
      xonadonId: input.xonadonId ?? null,
      izoh: [`Ko'rish vaqti: ${vaqtMatni(at)}`, `Ko'rsatuv manzili: ${loyiha.manzil.uz}`],
      taskDueAt: at,
      bitimNomi: bitimNomi(loyiha.nomi, at, input.name),
      payload: { sana: input.sana, vaqt: input.vaqt },
    });

    const inserted = await db.query<{ id: number }>(
      // Planirovka and Xonadon as the Ariza resolved them (a Xonadon implies its Planirovka).
      `INSERT INTO yozilish (ariza_id, mijoz_id, loyiha_id, planirovka_id, xonadon_id, vaqt, created_at, updated_at)
       SELECT a.id, $2, $3, a.planirovka_id, a.xonadon_id, $4, $5, $5 FROM ariza a WHERE a.id = $1
       ON CONFLICT (ariza_id) DO NOTHING RETURNING id`,
      [ariza.id, input.telegramId, input.loyihaId, at, now],
    );
    const row = inserted.rows[0];
    if (!row) {
      const existing = await db.query<{ id: number }>('SELECT id FROM yozilish WHERE ariza_id = $1', [ariza.id]);
      return { id: existing.rows[0]!.id, duplicate: true };
    }
    await yozilishHodisasi(db, row.id); // analytics (#15)
    const r = (await load('y.id = $1', [row.id]))[0]!;
    await toGroup([`📅 Ko'rishga yozilish #${r.id}`, `Vaqt: ${vaqtMatni(at)}`, ...tafsilot(r)].join('\n'));
    return { id: row.id, duplicate: false };
  }

  async function kochir(telegramId: string, id: number, sana: string, vaqt: string): Promise<void> {
    const r = await own(telegramId, id);
    changeable(r);
    const now = clock.now();
    const at = tashkentInstant(sana, vaqt);
    if (at.getTime() === r.vaqt.getTime()) return;
    if (!slotBormi(now, await getSetting(db, 'yozilish'), sana, vaqt)) throw new YozilishSlotError('slot');

    await db.query('UPDATE yozilish SET vaqt = $2, kochirildi = kochirildi + 1, updated_at = $3 WHERE id = $1', [id, at, now]);
    // Not delivered yet → the delivery itself uses the new time and name.
    await arizalar.setTaskDue(r.ariza_id, at, bitimNomi(r.loyiha_nomi, at, r.name));
    await outbox(id, 'kochirish', r.vaqt, at, now);
    await toGroup(
      [`🔁 Ko'rish ko'chirildi #${id}`, `Eski vaqt: ${vaqtMatni(r.vaqt)}`, `Yangi vaqt: ${vaqtMatni(at)}`, ...tafsilot(r)].join(
        '\n',
      ),
    );
    await syncCrm(id);
  }

  async function bekor(telegramId: string, id: number): Promise<void> {
    const r = await own(telegramId, id);
    changeable(r);
    const now = clock.now();
    await db.query(`UPDATE yozilish SET holat = 'bekor', bekor_at = $2, updated_at = $2 WHERE id = $1`, [id, now]);
    await outbox(id, 'bekor', r.vaqt, r.vaqt, now);
    await toGroup([`❌ Ko'rish bekor qilindi #${id}`, `Vaqt edi: ${vaqtMatni(r.vaqt)}`, ...tafsilot(r)].join('\n'));
    await syncCrm(id);
    await deps.skoring?.harakat(r.mijoz_id);
  }

  async function outbox(id: number, amal: 'kochirish' | 'bekor', oldingi: Date, vaqt: Date, now: Date) {
    await db.query(
      `INSERT INTO yozilish_crm (yozilish_id, amal, oldingi_vaqt, vaqt, created_at, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [id, amal, oldingi, vaqt, now],
    );
  }

  interface OutboxRow {
    id: number;
    yozilish_id: number;
    ariza_id: number;
    amal: 'kochirish' | 'bekor';
    oldingi_vaqt: Date;
    vaqt: Date;
    created_at: Date;
    task_done: boolean;
    note_added: boolean;
  }

  async function syncCrm(yozilishId?: number): Promise<void> {
    const now = clock.now();
    // Lease the due rows (as the Ariza retry job does) so a request and a job tick never send twice.
    const { rows } = await db.query<OutboxRow>(
      `UPDATE yozilish_crm o SET next_attempt_at = $2
        FROM yozilish y
        WHERE y.id = o.yozilish_id
          AND o.id IN (SELECT id FROM yozilish_crm
                        WHERE status = 'pending' AND next_attempt_at <= $1 AND ($3::int IS NULL OR yozilish_id = $3)
                        ORDER BY id FOR UPDATE SKIP LOCKED)
        RETURNING o.id, o.yozilish_id, y.ariza_id, o.amal, o.oldingi_vaqt, o.vaqt, o.created_at, o.task_done, o.note_added`,
      [now, new Date(now.getTime() + CRM_RETRY_EVERY_MS), yozilishId ?? null],
    );
    const blocked = new Set<number>(); // a booking's changes go in order
    for (const o of rows.sort((a, b) => a.id - b.id)) {
      if (blocked.has(o.yozilish_id)) continue;
      if (!(await pushOne(o, now))) blocked.add(o.yozilish_id);
    }
  }

  /** One attempt; true when done (or nothing left to do). */
  async function pushOne(o: OutboxRow, now: Date): Promise<boolean> {
    const ids = await arizalar.crmIds(o.ariza_id);
    if (!ids || ids.status === 'failed') {
      // The booking itself never reached the CRM (managers were told to enter it by hand).
      await db.query(`UPDATE yozilish_crm SET status = 'failed', last_error = 'ariza_failed' WHERE id = $1`, [o.id]);
      return true;
    }
    if (ids.status !== 'sent' || !ids.bitimId || !ids.taskId) return false; // wait for the Ariza's own delivery

    const r = (await load('y.id = $1', [o.yozilish_id]))[0]!;
    try {
      if (!o.task_done) {
        if (o.amal === 'kochirish') {
          await crm.rescheduleTask(ids.taskId, o.vaqt);
          if (ids.bitimCreated) await crm.renameBitim(ids.bitimId, bitimNomi(r.loyiha_nomi, o.vaqt, r.name));
        } else {
          await crm.closeTask(ids.taskId, "Mijoz ko'rishni bekor qildi");
        }
        await db.query('UPDATE yozilish_crm SET task_done = true WHERE id = $1', [o.id]);
      }
      if (!o.note_added) {
        const text =
          o.amal === 'kochirish'
            ? `Ko'rish ko'chirildi (yozilish #${o.yozilish_id}): ${vaqtMatni(o.oldingi_vaqt)} → ${vaqtMatni(o.vaqt)}`
            : `Mijoz ko'rishni bekor qildi (yozilish #${o.yozilish_id}): ${vaqtMatni(o.oldingi_vaqt)}. Bitim ochiq qoladi.`;
        await crm.addNote(ids.bitimId, text);
        await db.query('UPDATE yozilish_crm SET note_added = true WHERE id = $1', [o.id]);
      }
      await db.query(
        `UPDATE yozilish_crm SET status = 'sent', attempts = attempts + 1, last_error = NULL WHERE id = $1`,
        [o.id],
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      deps.log?.warn({ yozilishId: o.yozilish_id, err: message }, 'yozilish change not delivered to CRM');
      const giveUp = now.getTime() - o.created_at.getTime() >= CRM_RETRY_FOR_MS;
      await db.query(
        `UPDATE yozilish_crm SET attempts = attempts + 1, last_error = $2, status = $3, next_attempt_at = $4 WHERE id = $1`,
        [o.id, message, giveUp ? 'failed' : 'pending', new Date(now.getTime() + CRM_RETRY_EVERY_MS)],
      );
      if (giveUp) {
        const what = o.amal === 'kochirish' ? `ko'chirish (${vaqtMatni(o.oldingi_vaqt)} → ${vaqtMatni(o.vaqt)})` : 'bekor qilish';
        await toGroup(
          [`❌ amoCRM'da 24 soat davomida yangilanmadi — qo'lda kiriting: yozilish #${o.yozilish_id}, ${what}`, ...tafsilot(r)].join(
            '\n',
          ),
        );
      }
      return false;
    }
  }

  async function ofMijoz(telegramId: string, lang: Lang): Promise<YozilishDto[]> {
    const rows = await load('y.mijoz_id = $1 ORDER BY y.vaqt', [telegramId]);
    const now = clock.now().getTime();
    const upcoming = rows.filter((r) => r.holat === 'faol' && r.vaqt.getTime() > now);
    const rest = rows.filter((r) => !upcoming.includes(r)).reverse();
    return [...upcoming, ...rest].map((r) => dto(r, lang));
  }

  async function get(telegramId: string, id: number, lang: Lang): Promise<YozilishDto | null> {
    const r = (await load('y.id = $1 AND y.mijoz_id = $2', [id, telegramId]))[0];
    return r ? dto(r, lang) : null;
  }

  async function adminList(dan: string, gacha: string): Promise<AdminYozilishDto[]> {
    const rows = await load('y.vaqt >= $1 AND y.vaqt < $2 ORDER BY y.vaqt, y.id', [
      tashkentInstant(dan, '00:00'),
      tashkentInstant(addDays(gacha, 1), '00:00'),
    ]);
    return rows.map(adminDto);
  }

  async function setDavomat(id: number, davomat: Davomat | null, admin: { id: number; nomi: string }) {
    const r = (await load('y.id = $1', [id]))[0];
    if (!r) throw new YozilishNotFoundError('not found');
    if (r.holat === 'bekor') throw new YozilishHolatError('bekor');
    const now = clock.now();
    if (toTashkent(r.vaqt).date > toTashkent(now).date) throw new YozilishHolatError('kelajak');
    if (r.davomat !== davomat) {
      await db.query(
        'UPDATE yozilish SET davomat = $2, davomat_at = $3, davomat_admin_id = $4, updated_at = $5 WHERE id = $1',
        [id, davomat, davomat ? now : null, davomat ? admin.id : null, now],
      );
      const e: DavomatHodisa = {
        yozilishId: id,
        arizaId: r.ariza_id,
        mijozId: r.mijoz_id,
        loyihaId: r.loyiha_id,
        planirovkaId: r.planirovka_id,
        vaqt: r.vaqt,
        davomat,
        oldingi: r.davomat,
        at: now,
        admin,
      };
      for (const listener of listeners) {
        try {
          await listener(e);
        } catch (err) {
          deps.log?.error({ err, yozilishId: id }, 'davomat listener failed');
        }
      }
    }
    return adminDto((await load('y.id = $1', [id]))[0]!);
  }

  return {
    create,
    kochir,
    bekor,
    ofMijoz,
    get,
    adminList,
    setDavomat,
    onDavomat: (l) => void listeners.push(l),
    syncCrm,
  };
}
