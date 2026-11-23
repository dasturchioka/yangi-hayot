import {
  DARAJALAR,
  darajaHisobla,
  type Daraja,
  type KalkulyatorKirish,
  type SkoringNatija,
  type SkoringSignallari,
} from '@yh/shared';
import type pg from 'pg';
import type { Crm } from '../adapters/crm/crm';
import type { Messenger } from '../adapters/messenger/messenger';
import { addWorkingMinutes } from '../ariza/working-hours';
import { toTashkent, type Clock } from '../clock';
import { oxirgiKvizJavoblari } from '../kviz/kviz';
import { getSetting } from '../settings/settings';

/**
 * Lead skoringi (UF-4, #18). The Daraja belongs to the Mijoz (`mijoz.daraja`);
 * a Bitim only shows it as a tag. Recomputed on every Ariza (Arizalar calls
 * `arizaOldidan`, its delivery writes the tag) and on every other action
 * (`harakat`, which updates the open Bitim itself).
 *
 * Becoming issiq: a mark in the managers group at once, and one
 * «Qo'ng'iroq qilish» task due in `issiqVazifaDaqiqa` working minutes on the
 * open Bitim — created by whoever reaches that Bitim first (`issiq_vazifa_kerak`).
 */
export interface Skoring {
  /**
   * Hook for any action of the Mijoz that may change the Daraja and is not an
   * Ariza (booking cancelled / attendance #11, kalkulyator hisob, dojim #17…).
   * Never throws on CRM errors. Returns the new Daraja.
   */
  harakat(telegramId: string): Promise<Daraja>;
  /** The Mijoz opened the bot (/start) or the Mini App: a new Tashkent day is a re-entry. */
  kirish(telegramId: string): Promise<void>;
  /** Arizalar only: recompute after the Ariza is stored, before its delivery writes the tag. */
  arizaOldidan(telegramId: string): Promise<void>;
}

export interface SkoringDeps {
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
  log?: { warn(obj: object, msg: string): void };
}

/** Kalkulyator sxema → «To'lov usuli» when the kviz did not ask. */
const SXEMA_TOLOV = { muddatli: 'muddatli', annuitet: 'ipoteka', differensial: 'ipoteka' } as const;

/** What is known about the Mijoz, from kviz / kalkulyator / Arizalar / kirish days. */
export async function skoringSignallari(db: pg.Pool, telegramId: string): Promise<SkoringSignallari> {
  const kviz = await oxirgiKvizJavoblari(db, telegramId);
  const { rows } = await db.query<{
    yozilishlar: number;
    yuborilgan: number;
    hisoblar: number;
    sxema: KalkulyatorKirish['sxema'] | null;
    qaytishlar: number;
  }>(
    `SELECT
       -- A booking counts unless it was cancelled (#11); its yozilish row comes after the Ariza.
       (SELECT count(*)::int FROM ariza a LEFT JOIN yozilish y ON y.ariza_id = a.id
         WHERE a.mijoz_id = m.telegram_id AND a.tur = 'visit' AND y.holat IS DISTINCT FROM 'bekor') AS yozilishlar,
       (SELECT count(*)::int FROM ariza WHERE mijoz_id = m.telegram_id AND tur = 'calc') AS yuborilgan,
       (SELECT count(*)::int FROM kalkulyator_hisob WHERE mijoz_id = m.telegram_id) AS hisoblar,
       (SELECT s.sxema FROM (
           SELECT sxema, created_at FROM kalkulyator_hisob WHERE mijoz_id = m.telegram_id
           UNION ALL
           SELECT payload->'kirish'->>'sxema', created_at FROM ariza
            WHERE mijoz_id = m.telegram_id AND tur = 'calc' AND payload ? 'kirish'
         ) s ORDER BY s.created_at DESC LIMIT 1) AS sxema,
       (SELECT count(*)::int FROM mijoz_kirish k
         WHERE k.mijoz_id = m.telegram_id AND k.kun > (m.created_at AT TIME ZONE 'Asia/Tashkent')::date) AS qaytishlar
     FROM mijoz m WHERE m.telegram_id = $1`,
    [telegramId],
  );
  const r = rows[0] ?? { yozilishlar: 0, yuborilgan: 0, hisoblar: 0, sxema: null, qaytishlar: 0 };
  const kvizByudjet = kviz?.byudjet != null && (kviz.byudjet.dan !== null || kviz.byudjet.gacha !== null);
  return {
    muddat: kviz?.muddat ?? null,
    tolov: kviz?.tolov ?? (r.sxema ? SXEMA_TOLOV[r.sxema] : null),
    // A price in the kalkulyator is a budget too.
    byudjet: kvizByudjet || r.sxema !== null ? true : kviz ? false : null,
    hisobladi: r.hisoblar > 0 || r.yuborilgan > 0,
    yubordi: r.yuborilgan > 0,
    yozilishlar: r.yozilishlar,
    qaytishlar: r.qaytishlar,
  };
}

/** Current Daraja of the Mijoz for the Ariza delivery (tag, task deadline); null = never scored. */
export async function mijozDarajasi(db: pg.Pool, telegramId: string): Promise<Daraja | null> {
  const { rows } = await db.query<{ daraja: Daraja | null }>('SELECT daraja FROM mijoz WHERE telegram_id = $1', [
    telegramId,
  ]);
  return rows[0]?.daraja ?? null;
}

/** Takes the pending «issiq» call task (at most one caller gets true). */
export async function issiqVazifaniOl(db: pg.Pool, telegramId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE mijoz SET issiq_vazifa_kerak = false WHERE telegram_id = $1 AND issiq_vazifa_kerak AND daraja = 'issiq'`,
    [telegramId],
  );
  return (rowCount ?? 0) > 0;
}

/** Gives the task back when it could not be created (CRM down): the next delivery or action tries again. */
export async function issiqVazifaniQaytar(db: pg.Pool, telegramId: string): Promise<void> {
  await db.query(`UPDATE mijoz SET issiq_vazifa_kerak = true WHERE telegram_id = $1 AND daraja = 'issiq'`, [telegramId]);
}

/** Deadline of the issiq call task: `issiqVazifaDaqiqa` working minutes from now. */
export async function issiqMuddat(db: pg.Pool, now: Date): Promise<Date> {
  const [q, due] = await Promise.all([getSetting(db, 'skoring'), getSetting(db, 'crmTaskDue')]);
  return addWorkingMinutes(now, q.issiqVazifaDaqiqa, due.workingHours);
}

/** The other Darajalar, removed from a Bitim when it gets this one. */
export const boshqaDarajalar = (d: Daraja): Daraja[] => DARAJALAR.filter((x) => x !== d);

export function createSkoring(deps: SkoringDeps): Skoring {
  const { db, clock, crm, messenger } = deps;

  /** Recomputes and stores; marks the managers group when the Mijoz just became issiq. */
  async function qaytaHisobla(telegramId: string) {
    const qoidalar = await getSetting(db, 'skoring');
    const natija = darajaHisobla(qoidalar, await skoringSignallari(db, telegramId));
    const { rows } = await db.query<{
      oldin: Daraja | null;
      vazifa: boolean;
      name: string;
      phone: string | null;
      username: string | null;
    }>(
      `UPDATE mijoz m SET daraja = $2, daraja_ball = $3, daraja_at = $4,
              issiq_vazifa_kerak = ($2 = 'issiq' AND (o.oldin IS DISTINCT FROM 'issiq' OR m.issiq_vazifa_kerak))
         FROM (SELECT telegram_id, daraja AS oldin FROM mijoz WHERE telegram_id = $1 FOR UPDATE) o
        WHERE m.telegram_id = o.telegram_id
        RETURNING o.oldin, m.issiq_vazifa_kerak AS vazifa, m.name, m.phone, m.username`,
      [telegramId, natija.daraja, natija.ball, clock.now()],
    );
    const r = rows[0];
    if (!r) throw new Error(`Daraja of unknown Mijoz ${telegramId}`);
    const ozgardi = r.oldin !== natija.daraja;
    if (ozgardi && natija.daraja === 'issiq') await belgi(telegramId, r, natija);
    return { natija, ozgardi, vazifa: r.vazifa, mijoz: r };
  }

  async function belgi(
    telegramId: string,
    m: { name: string; phone: string | null; username: string | null },
    natija: SkoringNatija,
  ): Promise<void> {
    const groupId = await getSetting(db, 'managersGroupId');
    if (!groupId) return;
    const kim = [m.name, m.phone, m.username ? `@${m.username}` : null, `ID ${telegramId}`].filter(Boolean).join(' · ');
    const qismlar = natija.qismlar.map((p) => `${p.nomi} ${p.ball > 0 ? '+' : ''}${p.ball}`);
    await messenger.send({
      chatId: groupId,
      text: [`🔥 Issiq Mijoz — ${natija.ball} ball`, kim, '', ...qismlar].join('\n'),
    });
  }

  /** The open Bitim of the Mijoz in the CRM, if the bot already knows their contact. */
  async function ochiqBitim(telegramId: string) {
    const { rows } = await db.query<{ contact: string }>(
      `SELECT crm_contact_id AS contact FROM ariza
        WHERE mijoz_id = $1 AND crm_contact_id IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [telegramId],
    );
    const contact = rows[0]?.contact;
    return contact ? crm.findOpenBitim(contact) : null;
  }

  async function harakat(telegramId: string): Promise<Daraja> {
    const { natija, ozgardi, vazifa, mijoz } = await qaytaHisobla(telegramId);
    if (!ozgardi && !vazifa) return natija.daraja;
    try {
      const bitim = await ochiqBitim(telegramId);
      if (!bitim) return natija.daraja; // the first Ariza's Bitim takes the Daraja from the Mijoz
      if (ozgardi) {
        await crm.removeTags(bitim.id, boshqaDarajalar(natija.daraja));
        await crm.addTags(bitim.id, [natija.daraja]);
      }
      if (await issiqVazifaniOl(db, telegramId)) {
        try {
          await crm.createTask({
            bitimId: bitim.id,
            kind: 'call',
            text: `Qo'ng'iroq qilish: Issiq Mijoz (${natija.ball} ball) — ${[mijoz.name, mijoz.phone].filter(Boolean).join(', ')}`,
            dueAt: await issiqMuddat(db, clock.now()),
            responsibleUserId: bitim.responsibleUserId,
          });
        } catch (error) {
          await issiqVazifaniQaytar(db, telegramId);
          throw error;
        }
      }
    } catch (error) {
      // The action itself must not fail; the next Ariza delivery writes the tag and the task.
      deps.log?.warn({ telegramId, err: String(error) }, 'Daraja not written to CRM');
    }
    return natija.daraja;
  }

  async function kirish(telegramId: string): Promise<void> {
    const { rowCount } = await db.query(
      'INSERT INTO mijoz_kirish (mijoz_id, kun) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [telegramId, toTashkent(clock.now()).date],
    );
    if ((rowCount ?? 0) > 0) await harakat(telegramId);
  }

  async function arizaOldidan(telegramId: string): Promise<void> {
    await qaytaHisobla(telegramId);
  }

  return { harakat, kirish, arizaOldidan };
}
