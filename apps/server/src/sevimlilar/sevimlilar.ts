import {
  namunaviyOylik,
  taqqoslashKaliti,
  type KalkulyatorSozlamalari,
  type Lang,
  type PlanirovkaDto,
  type PlanirovkaHolati,
  type SevimliXonadonDto,
  type SevimlilarResponse,
  type TaqqoslashDto,
  type XonadonHolati,
} from '@yh/shared';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';
import { getSetting } from '../settings/settings';

/**
 * A Mijoz's sevimli Xonadonlar (#25) and Planirovkalar (#16), kept on the server so they follow the
 * Mijoz across devices. Only Planirovkalar still in the katalog are listed
 * (a Loyiha that became Topshirilgan drops out; its rows stay).
 */
export function createSevimlilar(deps: { db: pg.Pool; katalog: Katalog }) {
  const { db, katalog } = deps;
  return {
    /** false when the Planirovka is not in the katalog. Adding twice is a no-op. */
    async add(mijozId: string, planirovkaId: number, now: Date): Promise<boolean> {
      if (!(await katalog.planirovka(planirovkaId, 'uz'))) return false;
      await db.query(
        `INSERT INTO sevimli (mijoz_id, planirovka_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [mijozId, planirovkaId, now],
      );
      return true;
    },

    async remove(mijozId: string, planirovkaId: number): Promise<void> {
      await db.query(`DELETE FROM sevimli WHERE mijoz_id = $1 AND planirovka_id = $2`, [mijozId, planirovkaId]);
    },

    /** false when the Xonadon is not in the katalog (#25). Adding twice is a no-op. */
    async addXonadon(mijozId: string, xonadonId: number, now: Date): Promise<boolean> {
      if (!(await katalog.xonadon(xonadonId))) return false;
      await db.query(
        `INSERT INTO sevimli_xonadon (mijoz_id, xonadon_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [mijozId, xonadonId, now],
      );
      return true;
    },

    async removeXonadon(mijozId: string, xonadonId: number): Promise<void> {
      await db.query(`DELETE FROM sevimli_xonadon WHERE mijoz_id = $1 AND xonadon_id = $2`, [mijozId, xonadonId]);
    },

    /** Both kinds, newest first. */
    async list(mijozId: string, lang: Lang): Promise<SevimlilarResponse> {
      const [pl, xn] = await Promise.all([
        db.query<{ planirovka_id: number }>(
          `SELECT planirovka_id FROM sevimli WHERE mijoz_id = $1 ORDER BY created_at DESC, planirovka_id DESC`,
          [mijozId],
        ),
        db.query<{ xonadon_id: number }>(
          `SELECT xonadon_id FROM sevimli_xonadon WHERE mijoz_id = $1 ORDER BY created_at DESC, xonadon_id DESC`,
          [mijozId],
        ),
      ]);
      const planirovkalar = await Promise.all(pl.rows.map((r) => katalog.planirovka(r.planirovka_id, lang)));
      const xonadonlar = await Promise.all(xn.rows.map((r) => sevimliXonadon(r.xonadon_id, lang)));
      return {
        xonadonlar: xonadonlar.filter((x): x is SevimliXonadonDto => x !== null),
        planirovkalar: planirovkalar.filter((p): p is PlanirovkaDto => p !== null),
      };
    },

    /**
     * Taqqoslash columns for up to TAQQOSLASH_MAX distinct Xonadonlar /
     * Planirovkalar, in the order given. The caller checks the limit.
     */
    async taqqosla(kalitlar: { tur: 'xonadon' | 'planirovka'; id: number }[], lang: Lang): Promise<TaqqoslashDto[]> {
      const sozlama = await getSetting(db, 'kalkulyator');
      const all = await Promise.all(
        kalitlar.map(async (k) => {
          if (k.tur === 'xonadon') {
            const s = await sevimliXonadon(k.id, lang);
            return s && xonadonUstuni(s, sozlama);
          }
          const p = await katalog.planirovka(k.id, lang);
          return p && planirovkaUstuni(p, await boshQavatlari(p.id), sozlama);
        }),
      );
      return all.filter((u): u is TaqqoslashDto => u !== null);
    },
  };

  async function sevimliXonadon(id: number, lang: Lang): Promise<SevimliXonadonDto | null> {
    const xonadon = await katalog.xonadon(id);
    const planirovka = xonadon && (await katalog.planirovka(xonadon.planirovkaId, lang));
    return xonadon && planirovka ? { xonadon, planirovka } : null;
  }

  /** Lowest–highest qavat of the Planirovka's bo'sh Xonadonlar. */
  async function boshQavatlari(planirovkaId: number): Promise<TaqqoslashDto['qavat']> {
    const { rows } = await db.query<{ dan: number | null; gacha: number | null }>(
      `SELECT min(qavat) AS dan, max(qavat) AS gacha FROM xonadon WHERE planirovka_id = $1 AND holat = 'bosh'`,
      [planirovkaId],
    );
    const r = rows[0];
    return r && r.dan !== null && r.gacha !== null ? { dan: r.dan, gacha: r.gacha } : null;
  }
}

export type Sevimlilar = ReturnType<typeof createSevimlilar>;

const XONADON_HOLATI: Record<XonadonHolati, PlanirovkaHolati> = { bosh: 'sotuvda', bron: 'band', sotilgan: 'sotilgan' };

const kvMetr = (narx: number | null, maydon: number) => (narx === null || maydon <= 0 ? null : Math.round(narx / maydon));

function xonadonUstuni({ xonadon: x, planirovka: p }: SevimliXonadonDto, sozlama: KalkulyatorSozlamalari): TaqqoslashDto {
  return {
    kalit: taqqoslashKaliti('xonadon', x.id),
    tur: 'xonadon',
    id: x.id,
    raqam: `${x.blokNomi}-${x.raqam}`,
    qavat: { dan: x.qavat, gacha: x.qavat },
    loyihaNomi: p.loyihaNomi,
    blokNomi: x.blokNomi,
    nomi: p.nomi,
    xonalar: x.xonalar,
    maydon: x.maydon,
    boshlangichNarx: x.narx,
    kvMetrNarxi: kvMetr(x.narx, x.maydon),
    oylikTolov: namunaviyOylik(x.narx, sozlama),
    holat: XONADON_HOLATI[x.holat],
  };
}

function planirovkaUstuni(p: PlanirovkaDto, qavat: TaqqoslashDto['qavat'], sozlama: KalkulyatorSozlamalari): TaqqoslashDto {
  return {
    kalit: taqqoslashKaliti('planirovka', p.id),
    tur: 'planirovka',
    id: p.id,
    raqam: null,
    qavat,
    loyihaNomi: p.loyihaNomi,
    blokNomi: p.blokNomi,
    nomi: p.nomi,
    xonalar: p.xonalar,
    maydon: p.maydon,
    boshlangichNarx: p.boshlangichNarx,
    kvMetrNarxi: kvMetr(p.boshlangichNarx, p.maydon),
    oylikTolov: namunaviyOylik(p.boshlangichNarx, sozlama),
    holat: p.holat,
  };
}
