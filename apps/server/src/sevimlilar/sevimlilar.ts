import type { Lang, PlanirovkaDto, TaqqoslashDto } from '@yh/shared';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';

/**
 * A Mijoz's sevimli Planirovkalar, kept on the server so they follow the
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

    /** Newest first. */
    async list(mijozId: string, lang: Lang): Promise<PlanirovkaDto[]> {
      const { rows } = await db.query<{ planirovka_id: number }>(
        `SELECT planirovka_id FROM sevimli WHERE mijoz_id = $1 ORDER BY created_at DESC, planirovka_id DESC`,
        [mijozId],
      );
      const all = await Promise.all(rows.map((r) => katalog.planirovka(r.planirovka_id, lang)));
      return all.filter((p): p is PlanirovkaDto => p !== null);
    },

    /**
     * Taqqoslash columns for up to TAQQOSLASH_MAX distinct Planirovkalar, in
     * the order given. The caller checks the limit.
     */
    async taqqosla(ids: number[], lang: Lang): Promise<TaqqoslashDto[]> {
      const all = await Promise.all(ids.map((id) => katalog.planirovka(id, lang)));
      return all.filter((p): p is PlanirovkaDto => p !== null).map(taqqoslashDto);
    },
  };
}

export type Sevimlilar = ReturnType<typeof createSevimlilar>;

function taqqoslashDto(p: PlanirovkaDto): TaqqoslashDto {
  return {
    id: p.id,
    loyihaNomi: p.loyihaNomi,
    blokNomi: p.blokNomi,
    nomi: p.nomi,
    xonalar: p.xonalar,
    maydon: p.maydon,
    boshlangichNarx: p.boshlangichNarx,
    kvMetrNarxi: p.boshlangichNarx === null || p.maydon <= 0 ? null : Math.round(p.boshlangichNarx / p.maydon),
    // TODO(#12): muddatli to'lov (S − V)(1 + k) / N from the kalkulyator settings.
    oylikTolov: null,
    holat: p.holat,
  };
}
