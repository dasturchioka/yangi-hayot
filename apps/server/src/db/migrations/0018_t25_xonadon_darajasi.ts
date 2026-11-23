import type { Migration } from './index';

/**
 * Xonadon darajasi (#25, ADR 0003): sevimlilar, ulashish, Ariza, yozilish,
 * kalkulyator va dojim Xonadonga bog'lanadi. Planirovka darajasidagilari
 * qoladi (Planirovka ekrani va undan kelgan Ariza saqlanadi).
 *
 * - `sevimli_xonadon`: a Mijoz's sevimli Xonadonlar (Planirovka sevimlilari
 *   stay in `sevimli`: a Planirovka has no single Xonadon to migrate to).
 * - `ulashish.xonadon_id`: the share was of this Xonadon (`planirovka_id` is
 *   then its Planirovka, so «Ulashgan» lines keep working).
 * - `ariza.xonadon_id`, `yozilish.xonadon_id`, `kalkulyator_hisob.xonadon_id`:
 *   the Xonadon the Mijoz acted from (optional, like planirovka_id).
 * - `dojim.xonadon_id`: `sevimliBand` of a sevimli Xonadon (bo'sh → bron/sotilgan)
 *   and `korish` after a Xonadon kartochkasi view.
 */
export const m0018_t25_xonadon_darajasi: Migration = {
  name: '0018_t25_xonadon_darajasi',
  sql: `
    CREATE TABLE sevimli_xonadon (
      mijoz_id   bigint  NOT NULL REFERENCES mijoz (telegram_id) ON DELETE CASCADE,
      xonadon_id integer NOT NULL REFERENCES xonadon (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (mijoz_id, xonadon_id)
    );
    CREATE INDEX sevimli_xonadon_xonadon ON sevimli_xonadon (xonadon_id);

    ALTER TABLE ulashish ADD COLUMN xonadon_id integer REFERENCES xonadon (id) ON DELETE CASCADE;
    ALTER TABLE ariza ADD COLUMN xonadon_id integer REFERENCES xonadon (id) ON DELETE SET NULL;
    ALTER TABLE yozilish ADD COLUMN xonadon_id integer REFERENCES xonadon (id) ON DELETE SET NULL;
    ALTER TABLE kalkulyator_hisob ADD COLUMN xonadon_id integer REFERENCES xonadon (id) ON DELETE SET NULL;
    ALTER TABLE dojim ADD COLUMN xonadon_id integer REFERENCES xonadon (id) ON DELETE SET NULL;
  `,
};
