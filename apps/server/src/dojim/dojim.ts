import { dojimStartParam, type DojimSsenariy, type Lang } from '@yh/shared';
import type pg from 'pg';
import type { MessageButton, Messenger, OutgoingMessage } from '../adapters/messenger/messenger';
import { fill, texts } from '../bot/texts';
import { toTashkent, type Clock } from '../clock';
import { belgilaDojim } from '../hodisa/hodisa';
import { getSetting } from '../settings/settings';
import type { DavomatHodisa } from '../yozilish/yozilish';

/**
 * Dojim (UF-3, #17): the bot's gentle reminders.
 *
 * Triggers write a `dojim` row (planned reminder); the job `dojim` sends what
 * is due. Every rule that may have changed meanwhile is checked at send time:
 * «Yubormang», bot blocked, ≤ 1 message per Mijoz in 7 days, an Ariza left
 * after the view, the davomat corrected, the favourite back on sale.
 */

/** «Ko'rdi yoki hisobladi» → reminder after this long without an Ariza. */
export const KORISH_KUTISH_MS = 24 * 3600_000;
/** At most one dojim per Mijoz in this window. */
export const LIMIT_MS = 7 * 24 * 3600_000;
/** «Keldi» / «kelmadi» → reminder this long after the mark (and not before the visit): room to correct a wrong mark. */
export const DAVOMAT_KUTISH_MS = 3600_000;
/** A reminder that could not go out for this long is dropped (stale). */
export const ESKIRISH_MS = 48 * 3600_000;
/** Reminders go out only in these Tashkent hours (no night messages); outside them they wait. */
export const YUBORISH_SOATLARI = { dan: '09:00', gacha: '21:00' };
/** «O'xshash Planirovka»: same xonalar, maydon within this share, Sotuvda. */
export const OXSHASH_MAYDON_ULUSHI = 0.15;
export const OXSHASH_MAX = 3;

/** Bot callback of the «Yubormang» button. */
export const DOJIM_STOP_CALLBACK = 'dojim:stop';

/** Send order when several are due for one Mijoz at once (only the first goes: 7-day rule). */
const USTUVORLIK: DojimSsenariy[] = ['kelmadi', 'keldi', 'sevimliBand', 'korish'];

export interface DojimDeps {
  db: pg.Pool;
  clock: Clock;
  messenger: Messenger;
  log?: { warn(obj: object, msg: string): void };
}

export interface Dojim {
  /** `yozilishlar.onDavomat` listener: plans «kelmadi» / «keldi», cancels the plan of a corrected mark. */
  davomat(e: DavomatHodisa): Promise<void>;
  /** «Yubormang»: no dojim for this Mijoz ever again. */
  toxtat(mijozId: string, at: Date): Promise<void>;
  /**
   * Links a booking to the dojim whose button opened the Mini App (#15 counts
   * «dojimdan kelgan yozilishlar»). Ignored unless that dojim was sent to this Mijoz.
   */
  yozilishgaBogla(mijozId: string, yozilishId: number, dojimId: number): Promise<void>;
  /** Job: plans «ko'rdi/hisobladi» reminders from the facts, then sends the due ones. */
  run(): Promise<void>;
}

/**
 * Inside the transaction that changes a Planirovka's counts (the one choke
 * point of admin edits, Menejer «ko'chirish» and Excel import): when bo'sh
 * drops to 0, every Mijoz who has it among sevimlilar gets a planned dojim.
 */
export async function sevimliBandBoldi(c: pg.PoolClient, planirovkaId: number, at: Date): Promise<void> {
  await c.query(
    `INSERT INTO dojim (mijoz_id, ssenariy, planirovka_id, hodisa_at, due_at, created_at)
     SELECT s.mijoz_id, 'sevimliBand', s.planirovka_id, $2, $2, $2
       FROM sevimli s JOIN mijoz m ON m.telegram_id = s.mijoz_id
      WHERE s.planirovka_id = $1 AND m.dojim_toxtatildi_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM dojim d WHERE d.mijoz_id = s.mijoz_id AND d.planirovka_id = s.planirovka_id
                          AND d.ssenariy = 'sevimliBand' AND d.holat = 'kutilmoqda')`,
    [planirovkaId, at],
  );
}

/** «Yubormang» (bot callback): no dojim for this Mijoz ever again; the planned ones are dropped. */
export async function toxtatDojim(db: pg.Pool, mijozId: string, at: Date): Promise<void> {
  await db.query(`UPDATE mijoz SET dojim_toxtatildi_at = COALESCE(dojim_toxtatildi_at, $2) WHERE telegram_id = $1`, [
    mijozId,
    at,
  ]);
  await db.query(
    `UPDATE dojim SET holat = 'otkazildi', sabab = 'toxtatildi', hal_at = $2 WHERE mijoz_id = $1 AND holat = 'kutilmoqda'`,
    [mijozId, at],
  );
}

interface DueRow {
  id: number;
  mijoz_id: string;
  ssenariy: DojimSsenariy;
  planirovka_id: number | null;
  yozilish_id: number | null;
  hodisa_at: Date;
  due_at: Date;
  lang: Lang;
  bot_blocked: boolean;
  toxtatildi: boolean;
}

interface PlanirovkaInfo {
  id: number;
  loyihaId: number;
  loyihaNomi: string;
  blokNomi: string;
  xonalar: number;
  maydon: number;
  bosh: number;
}

type Reja = { ok: true; message: Omit<OutgoingMessage, 'chatId'> } | { ok: false; sabab: string };

export function createDojim(deps: DojimDeps): Dojim {
  const { db, clock, messenger } = deps;

  /**
   * «Ko'rdi yoki hisobladi»: the facts are #15's `hodisa` (planirovka_korildi,
   * one row per opening) and #12's `kalkulyator_hisob`. 24 h after a Mijoz's
   * latest such activity a `korish` dojim is planned for the Planirovka seen
   * last — once per activity (a newer activity plans again; the 7-day rule
   * decides whether it goes). Activities older than the stale window are ignored.
   */
  async function rejalaKorish(now: Date) {
    const gacha = new Date(now.getTime() - KORISH_KUTISH_MS);
    const dan = new Date(gacha.getTime() - ESKIRISH_MS);
    await db.query(
      `WITH faollik AS (
         SELECT mijoz_id, planirovka_id, at FROM hodisa WHERE tur = 'planirovka_korildi' AND at > $1
         UNION ALL
         SELECT mijoz_id, planirovka_id, created_at FROM kalkulyator_hisob WHERE created_at > $1
       ), oxirgi AS (
         SELECT mijoz_id, max(at) AS at,
                (array_agg(planirovka_id ORDER BY at DESC) FILTER (WHERE planirovka_id IS NOT NULL))[1] AS planirovka_id
           FROM faollik GROUP BY mijoz_id
       )
       INSERT INTO dojim (mijoz_id, ssenariy, planirovka_id, hodisa_at, due_at, created_at)
       SELECT o.mijoz_id, 'korish', o.planirovka_id, o.at, o.at + interval '24 hours', $3
         FROM oxirgi o JOIN mijoz m ON m.telegram_id = o.mijoz_id
        WHERE o.at <= $2 AND m.dojim_toxtatildi_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM dojim d WHERE d.mijoz_id = o.mijoz_id AND d.ssenariy = 'korish' AND d.hodisa_at >= o.at)
       ON CONFLICT (mijoz_id) WHERE ssenariy = 'korish' AND holat = 'kutilmoqda'
       DO UPDATE SET planirovka_id = EXCLUDED.planirovka_id, hodisa_at = EXCLUDED.hodisa_at, due_at = EXCLUDED.due_at`,
      [dan, gacha, now],
    );
  }

  async function otkaz(id: number, sabab: string, now: Date) {
    await db.query(`UPDATE dojim SET holat = 'otkazildi', sabab = $2, hal_at = $3 WHERE id = $1`, [id, sabab, now]);
  }

  async function planirovka(id: number | null): Promise<PlanirovkaInfo | null> {
    if (id === null) return null;
    const r = (
      await db.query<{ id: number; loyiha_id: number; loyiha_nomi: string; blok_nomi: string; xonalar: number; maydon: string; bosh: number }>(
        `SELECT p.id, b.loyiha_id, l.nomi AS loyiha_nomi, b.nomi AS blok_nomi, p.xonalar, p.maydon, p.bosh
           FROM planirovka p JOIN blok b ON b.id = p.blok_id JOIN loyiha l ON l.id = b.loyiha_id
          WHERE p.id = $1 AND l.holat = 'sotuvda'`,
        [id],
      )
    ).rows[0];
    return r
      ? { id: r.id, loyihaId: r.loyiha_id, loyihaNomi: r.loyiha_nomi, blokNomi: r.blok_nomi, xonalar: r.xonalar, maydon: Number(r.maydon), bosh: r.bosh }
      : null;
  }

  async function oxshash(p: PlanirovkaInfo): Promise<PlanirovkaInfo[]> {
    const { rows } = await db.query<{ id: number; loyiha_id: number; loyiha_nomi: string; blok_nomi: string; xonalar: number; maydon: string; bosh: number }>(
      `SELECT p.id, b.loyiha_id, l.nomi AS loyiha_nomi, b.nomi AS blok_nomi, p.xonalar, p.maydon, p.bosh
         FROM planirovka p JOIN blok b ON b.id = p.blok_id JOIN loyiha l ON l.id = b.loyiha_id
        WHERE l.holat = 'sotuvda' AND p.bosh > 0 AND p.id <> $1 AND p.xonalar = $2
          AND abs(p.maydon - $3) <= $3 * $4
        ORDER BY (b.loyiha_id = $5) DESC, abs(p.maydon - $3), p.id
        LIMIT $6`,
      [p.id, p.xonalar, p.maydon, OXSHASH_MAYDON_ULUSHI, p.loyihaId, OXSHASH_MAX],
    );
    return rows.map((r) => ({
      id: r.id,
      loyihaId: r.loyiha_id,
      loyihaNomi: r.loyiha_nomi,
      blokNomi: r.blok_nomi,
      xonalar: r.xonalar,
      maydon: Number(r.maydon),
      bosh: r.bosh,
    }));
  }

  /** What to send for this row, or why not (the ssenariy's own conditions). */
  async function reja(d: DueRow, now: Date): Promise<Reja> {
    const sozlama = (await getSetting(db, 'dojim'))[d.ssenariy];
    if (!sozlama.yoqilgan) return { ok: false, sabab: 'ochirilgan' };
    const t = texts(d.lang);
    const matn = sozlama.matn[d.lang];
    const btn = (text: string, ekran: Parameters<typeof dojimStartParam>[0]['ekran']): MessageButton => ({
      text,
      startapp: dojimStartParam({ dojimId: d.id, ekran }),
    });

    switch (d.ssenariy) {
      case 'korish': {
        const ariza = await db.query(`SELECT 1 FROM ariza WHERE mijoz_id = $1 AND created_at >= $2 LIMIT 1`, [
          d.mijoz_id,
          new Date(d.hodisa_at.getTime() - KORISH_KUTISH_MS),
        ]);
        if (ariza.rowCount) return { ok: false, sabab: 'ariza' };
        const p = await planirovka(d.planirovka_id);
        if (!p) return { ok: false, sabab: 'planirovka_yoq' };
        return {
          ok: true,
          message: {
            text: fill(matn, { planirovka: planirovkaMatni(p, d.lang), loyiha: p.loyihaNomi }),
            buttons: [
              [btn(t.btnDojimPlanirovka, { ekran: 'planirovka', planirovkaId: p.id })],
              [btn(t.btnBooking, { ekran: 'yozilish', loyihaId: p.loyihaId, planirovkaId: p.id })],
            ],
          },
        };
      }
      case 'sevimliBand': {
        const p = await planirovka(d.planirovka_id);
        if (!p) return { ok: false, sabab: 'planirovka_yoq' };
        if (p.bosh > 0) return { ok: false, sabab: 'bosh_bor' };
        const sevimli = await db.query(`SELECT 1 FROM sevimli WHERE mijoz_id = $1 AND planirovka_id = $2`, [d.mijoz_id, p.id]);
        if (!sevimli.rowCount) return { ok: false, sabab: 'sevimli_emas' };
        const variantlar = await oxshash(p);
        if (variantlar.length === 0) return { ok: false, sabab: 'oxshash_yoq' };
        return {
          ok: true,
          message: {
            text: fill(matn, { planirovka: planirovkaMatni(p, d.lang), loyiha: p.loyihaNomi }),
            buttons: variantlar.map((v) => [btn(variantTugmasi(v, d.lang), { ekran: 'planirovka', planirovkaId: v.id })]),
          },
        };
      }
      case 'kelmadi':
      case 'keldi': {
        const y = (
          await db.query<{ loyiha_id: number; loyiha_nomi: string; planirovka_id: number | null; davomat: string | null; holat: string }>(
            `SELECT y.loyiha_id, l.nomi AS loyiha_nomi, y.planirovka_id, y.davomat, y.holat
               FROM yozilish y JOIN loyiha l ON l.id = y.loyiha_id WHERE y.id = $1`,
            [d.yozilish_id],
          )
        ).rows[0];
        if (!y || y.davomat !== d.ssenariy || y.holat !== 'faol') return { ok: false, sabab: 'ozgardi' };
        if (d.ssenariy === 'kelmadi') {
          const keyingi = await db.query(
            `SELECT 1 FROM yozilish WHERE mijoz_id = $1 AND holat = 'faol' AND vaqt > $2 LIMIT 1`,
            [d.mijoz_id, now],
          );
          if (keyingi.rowCount) return { ok: false, sabab: 'yangi_yozilish' };
          const planirovkaId = y.planirovka_id ?? undefined;
          return {
            ok: true,
            message: {
              text: fill(matn, { loyiha: y.loyiha_nomi }),
              buttons: [[btn(t.btnDojimYangiVaqt, { ekran: 'yozilish', loyihaId: y.loyiha_id, ...(planirovkaId ? { planirovkaId } : {}) })]],
            },
          };
        }
        return {
          ok: true,
          message: {
            text: fill(matn, { loyiha: y.loyiha_nomi }),
            buttons: [[btn(t.btnDojimHisoblash, { ekran: 'kalkulyator', ...(y.planirovka_id ? { planirovkaId: y.planirovka_id } : {}) })]],
          },
        };
      }
    }
  }

  async function yubor(d: DueRow, now: Date): Promise<void> {
    if (d.toxtatildi) return otkaz(d.id, 'toxtatildi', now);
    if (d.bot_blocked) return otkaz(d.id, 'bloklagan', now);
    if (now.getTime() - d.due_at.getTime() > ESKIRISH_MS) return otkaz(d.id, 'eskirgan', now);
    const r = await reja(d, now);
    if (!r.ok) return otkaz(d.id, r.sabab, now);
    // Claim under the limit check in one statement: at most once, ≤ 1 per 7 days even with two ticks racing.
    const claimed = await db.query(
      `UPDATE dojim SET holat = 'yuborildi', hal_at = $2
        WHERE id = $1 AND holat = 'kutilmoqda'
          AND NOT EXISTS (SELECT 1 FROM dojim o WHERE o.mijoz_id = $3 AND o.holat = 'yuborildi' AND o.hal_at > $4)`,
      [d.id, now, d.mijoz_id, new Date(now.getTime() - LIMIT_MS)],
    );
    if (!claimed.rowCount) return otkaz(d.id, 'limit', now);
    const t = texts(d.lang);
    const message: OutgoingMessage = {
      chatId: d.mijoz_id,
      ...r.message,
      buttons: [...(r.message.buttons ?? []), [{ text: t.btnDojimStop, callbackData: DOJIM_STOP_CALLBACK }]],
    };
    let result;
    try {
      result = await messenger.send(message);
    } catch (error) {
      result = { status: 'error' as const, error: String(error) };
    }
    if (result.status === 'delivered') {
      await db.query(`UPDATE dojim SET message_id = $2 WHERE id = $1`, [d.id, result.messageId]);
    } else if (result.status === 'blocked') {
      await db.query('UPDATE mijoz SET bot_blocked = true WHERE telegram_id = $1', [d.mijoz_id]);
      await otkaz(d.id, 'bloklagan', now);
    } else {
      deps.log?.warn({ dojimId: d.id, error: result.error }, 'dojim not sent');
      await otkaz(d.id, `xato: ${result.error}`.slice(0, 500), now);
    }
  }

  return {
    async davomat(e) {
      await db.query(
        `UPDATE dojim SET holat = 'otkazildi', sabab = 'ozgardi', hal_at = $2
          WHERE yozilish_id = $1 AND holat = 'kutilmoqda'`,
        [e.yozilishId, e.at],
      );
      if (!e.davomat) return;
      const due = new Date(Math.max(e.at.getTime(), e.vaqt.getTime()) + DAVOMAT_KUTISH_MS);
      await db.query(
        `INSERT INTO dojim (mijoz_id, ssenariy, planirovka_id, yozilish_id, hodisa_at, due_at, created_at)
         SELECT telegram_id, $2, $3, $4, $5, $6, $5 FROM mijoz WHERE telegram_id = $1 AND dojim_toxtatildi_at IS NULL`,
        [e.mijozId, e.davomat, e.planirovkaId, e.yozilishId, e.at, due],
      );
    },

    async toxtat(mijozId, at) {
      await toxtatDojim(db, mijozId, at);
    },

    async yozilishgaBogla(mijozId, yozilishId, dojimId) {
      const bogla = await db.query(
        `UPDATE yozilish y SET dojim_id = d.id FROM dojim d
          WHERE y.id = $1 AND y.mijoz_id = $2 AND y.dojim_id IS NULL
            AND d.id = $3 AND d.mijoz_id = $2 AND d.holat = 'yuborildi'`,
        [yozilishId, mijozId, dojimId],
      );
      if (bogla.rowCount) await belgilaDojim(db, yozilishId); // #15: «Dojimdan kelgan yozilishlar»
    },

    async run() {
      const now = clock.now();
      await rejalaKorish(now);
      const soat = toTashkent(now).time;
      if (soat < YUBORISH_SOATLARI.dan || soat >= YUBORISH_SOATLARI.gacha) return;
      const { rows } = await db.query<DueRow>(
        `SELECT d.id, d.mijoz_id::text AS mijoz_id, d.ssenariy, d.planirovka_id, d.yozilish_id, d.hodisa_at, d.due_at,
                m.lang, m.bot_blocked, m.dojim_toxtatildi_at IS NOT NULL AS toxtatildi
           FROM dojim d JOIN mijoz m ON m.telegram_id = d.mijoz_id
          WHERE d.holat = 'kutilmoqda' AND d.due_at <= $1
          ORDER BY array_position($2::text[], d.ssenariy), d.due_at, d.id`,
        [now, USTUVORLIK],
      );
      for (const d of rows) await yubor(d, now);
    },
  };
}

function formatMaydon(m: number): string {
  return String(Number(m.toFixed(2))).replace('.', ',');
}

/** «2 xonali, 54,5 m²» / «2-комн., 54,5 м²». */
export function planirovkaMatni(p: { xonalar: number; maydon: number }, lang: Lang): string {
  return lang === 'uz'
    ? `${p.xonalar} xonali, ${formatMaydon(p.maydon)} m²`
    : `${p.xonalar}-комн., ${formatMaydon(p.maydon)} м²`;
}

/** Button of an o'xshash Planirovka: «Sayhun · A · 52 m²». */
function variantTugmasi(p: PlanirovkaInfo, lang: Lang): string {
  return `${p.loyihaNomi} · ${p.blokNomi} · ${formatMaydon(p.maydon)} ${lang === 'uz' ? 'm²' : 'м²'}`;
}
