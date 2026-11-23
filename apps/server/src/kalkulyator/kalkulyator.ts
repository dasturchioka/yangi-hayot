import {
  hisobla,
  kalkulyatorXatolari,
  type KalkulyatorKirish,
  type KalkulyatorNatija,
  type KalkulyatorXatosi,
} from '@yh/shared';
import type pg from 'pg';
import type { Arizalar } from '../ariza/ariza';
import { formatSom } from '../ariza/note';
import type { Clock } from '../clock';
import { getSetting } from '../settings/settings';

export class KalkulyatorKirishError extends Error {
  constructor(readonly xatolar: KalkulyatorXatosi[]) {
    super(`kalkulyator kirish: ${xatolar.join(', ')}`);
  }
}

const SXEMA_NOMI = {
  muddatli: "Muddatli to'lov",
  annuitet: 'Ipoteka, annuitet',
  differensial: 'Ipoteka, differensial',
} as const;

const foiz = (n: number) => `${String(n).replace('.', ',')}%`;
const som = (n: number) => `${formatSom(n)} so'm`;

/** Note lines managers read in amoCRM (TZ 8-bo'lim: sxema, narx, boshlang'ich to'lov, muddat, stavka, to'lov). */
export function hisobIzohi(k: KalkulyatorKirish, n: KalkulyatorNatija): string[] {
  const lines = [
    `Sxema: ${SXEMA_NOMI[n.sxema]}`,
    `Narx: ${som(k.narx)}`,
    `Boshlang'ich to'lov: ${som(k.boshlangich)} (${foiz(Math.round((k.boshlangich / k.narx) * 1000) / 10)})`,
  ];
  if (k.sxema === 'muddatli' && n.sxema === 'muddatli') {
    lines.push(`Muddat: ${k.oylar} oy`, `Ustama: ${foiz(n.ustamaFoiz)}`, `Oylik to'lov: ${som(n.oylik)}`);
  } else if (k.sxema !== 'muddatli' && n.sxema !== 'muddatli') {
    lines.push(`Muddat: ${k.yillar} yil`, `Stavka: ${foiz(n.stavka)} (${n.bank ?? "qo'lda"})`);
    if (n.sxema === 'annuitet') lines.push(`Oylik to'lov: ${som(n.oylik)}`);
    else lines.push(`Birinchi to'lov: ${som(n.birinchi)}`, `Oxirgi to'lov: ${som(n.oxirgi)}`);
  }
  lines.push(`Kredit summasi: ${som(n.kredit)}`, `Ortiqcha to'lov: ${som(n.ortiqcha)}`, `Umumiy summa: ${som(n.umumiy)}`);
  lines.push('Hisob taxminiy, oferta emas');
  return lines;
}

/**
 * Kalkulyator on the server: recomputes what the Mini App showed with the
 * current settings (the client's numbers are never trusted), records each
 * hisob for dojim (#17) and Daraja (#18), and sends a bot_calc Ariza.
 */
export function createKalkulyator(deps: { db: pg.Pool; clock: Clock; arizalar: Arizalar }) {
  const { db, clock, arizalar } = deps;

  async function compute(kirish: KalkulyatorKirish) {
    const sozlama = await getSetting(db, 'kalkulyator');
    const xatolar = kalkulyatorXatolari(kirish, sozlama);
    if (xatolar.length > 0) throw new KalkulyatorKirishError(xatolar);
    return hisobla(kirish, sozlama);
  }

  async function record(
    mijozId: string,
    kirish: KalkulyatorKirish,
    natija: KalkulyatorNatija,
    joy: HisobJoyi,
    arizaId: number | null,
  ): Promise<number> {
    // Unknown ids are dropped, not errors (a «hisobladi» fact is kept anyway); a Xonadon implies its Planirovka.
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO kalkulyator_hisob (mijoz_id, planirovka_id, xonadon_id, sxema, kirish, natija, ariza_id, created_at)
       VALUES ($1, COALESCE((SELECT planirovka_id FROM xonadon WHERE id = $8), (SELECT id FROM planirovka WHERE id = $2)),
               (SELECT id FROM xonadon WHERE id = $8), $3, $4, $5, $6, $7) RETURNING id`,
      [
        mijozId,
        joy.planirovkaId ?? null,
        kirish.sxema,
        JSON.stringify(kirish),
        JSON.stringify(natija),
        arizaId,
        clock.now(),
        joy.xonadonId ?? null,
      ],
    );
    return rows[0]!.id;
  }

  return {
    /** «Hisobladi»: the Mijoz looked at a result. Throws KalkulyatorKirishError for an input outside the settings. */
    async hisob(mijozId: string, kirish: KalkulyatorKirish, joy: HisobJoyi = {}): Promise<KalkulyatorNatija> {
      const natija = await compute(kirish);
      await record(mijozId, kirish, natija, joy, null);
      return natija;
    },

    /** «Hisobni menejerga yuborish»: a bot_calc Ariza with the hisob in the note. */
    async ariza(a: {
      telegramId: string;
      name: string;
      phone: string;
      kirish: KalkulyatorKirish;
      planirovkaId?: number;
      xonadonId?: number;
    }): Promise<{ id: number; duplicate: boolean }> {
      const natija = await compute(a.kirish);
      const created = await arizalar.create({
        tur: 'calc',
        telegramId: a.telegramId,
        name: a.name,
        phone: a.phone,
        planirovkaId: a.planirovkaId,
        xonadonId: a.xonadonId,
        izoh: hisobIzohi(a.kirish, natija),
        payload: { kirish: a.kirish, natija },
      });
      if (!created.duplicate) await record(a.telegramId, a.kirish, natija, a, created.id);
      return created;
    },
  };
}

export type Kalkulyator = ReturnType<typeof createKalkulyator>;

/** What the hisob was about: a Planirovka (its Boshlang'ich narx) or a Xonadon (its narx, #25). */
export interface HisobJoyi {
  planirovkaId?: number;
  xonadonId?: number;
}

/**
 * Latest hisob of a Mijoz (for dojim #17 / Daraja #18): when, which
 * Planirovka, scheme, input and result; null if the Mijoz never calculated.
 */
export async function oxirgiHisob(db: pg.Pool, mijozId: string) {
  const { rows } = await db.query<{
    id: number;
    planirovka_id: number | null;
    sxema: KalkulyatorKirish['sxema'];
    kirish: KalkulyatorKirish;
    natija: KalkulyatorNatija;
    ariza_id: number | null;
    created_at: Date;
  }>(
    `SELECT id, planirovka_id, sxema, kirish, natija, ariza_id, created_at
       FROM kalkulyator_hisob WHERE mijoz_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [mijozId],
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        planirovkaId: r.planirovka_id,
        sxema: r.sxema,
        kirish: r.kirish,
        natija: r.natija,
        arizaId: r.ariza_id,
        at: r.created_at,
      }
    : null;
}
