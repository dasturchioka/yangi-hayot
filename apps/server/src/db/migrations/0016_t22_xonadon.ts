import type { Migration } from './index';

/**
 * Xonadon yozuvi (#22, ADR 0003, ADR 0001 o'rniga). Each Xonadon is a row:
 * Blok, qavat, raqam, Planirovka, narx (optional), holat. A Planirovka keeps
 * no counts any more: bo'sh / bron / sotilgan / jami are counted from its
 * Xonadonlar, and its own price becomes the «qo'lda kiritilgan narx» used
 * only when none of its bo'sh Xonadonlar has a narx.
 *
 * Existing counts are turned into Xonadonlar numbered 1.. per Blok, laid out
 * on floors (Loyiha qavatlar soni, else 9), so nothing is lost.
 *
 * Readers use the view `planirovka_view`: planirovka.* plus derived bosh,
 * bron, sotilgan, jami and boshlangich_narx (ADR 0003 rule).
 */
export const m0016_t22_xonadon: Migration = {
  name: '0016_t22_xonadon',
  sql: `
    ALTER TABLE planirovka ADD CONSTRAINT planirovka_id_blok UNIQUE (id, blok_id);

    CREATE TABLE xonadon (
      id             serial PRIMARY KEY,
      blok_id        integer NOT NULL REFERENCES blok(id) ON DELETE CASCADE,
      planirovka_id  integer NOT NULL,
      qavat          integer NOT NULL CHECK (qavat BETWEEN -5 AND 200),
      raqam          integer NOT NULL CHECK (raqam > 0),
      narx           bigint CHECK (narx > 0),
      holat          text NOT NULL DEFAULT 'bosh' CHECK (holat IN ('bosh', 'bron', 'sotilgan')),
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      -- a Xonadon's Planirovka is always of the same Blok
      FOREIGN KEY (planirovka_id, blok_id) REFERENCES planirovka(id, blok_id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT xonadon_joyi UNIQUE (blok_id, qavat, raqam)
    );
    CREATE INDEX xonadon_planirovka ON xonadon (planirovka_id);

    INSERT INTO xonadon (blok_id, planirovka_id, qavat, raqam, holat, created_at, updated_at)
    SELECT s.blok_id, s.planirovka_id,
           (s.raqam - 1) / GREATEST(1, ceil(s.blokda::numeric / s.qavatlar))::int + 1,
           s.raqam, s.holat, s.created_at, s.created_at
      FROM (
        SELECT x.blok_id, x.planirovka_id, x.holat, x.created_at, x.qavatlar,
               row_number() OVER (PARTITION BY x.blok_id ORDER BY x.tartib, x.planirovka_id, x.n)::int AS raqam,
               count(*) OVER (PARTITION BY x.blok_id)::int AS blokda
          FROM (
            SELECT p.blok_id, p.id AS planirovka_id, p.tartib, p.created_at, COALESCE(l.qavatlar_soni, 9) AS qavatlar,
                   h.holat, g.n
              FROM planirovka p
              JOIN blok b ON b.id = p.blok_id
              JOIN loyiha l ON l.id = b.loyiha_id
              CROSS JOIN LATERAL (VALUES ('sotilgan', p.sotilgan), ('bron', p.bron), ('bosh', p.bosh)) AS h(holat, soni)
              CROSS JOIN LATERAL generate_series(1, h.soni) AS g(n)
          ) x
      ) s;

    ALTER TABLE planirovka DROP COLUMN bosh, DROP COLUMN bron, DROP COLUMN sotilgan;
    ALTER TABLE planirovka RENAME COLUMN boshlangich_narx TO qolda_narx;

    CREATE VIEW planirovka_view AS
    SELECT p.*,
           COALESCE(s.bosh, 0) AS bosh,
           COALESCE(s.bron, 0) AS bron,
           COALESCE(s.sotilgan, 0) AS sotilgan,
           COALESCE(s.jami, 0) AS jami,
           COALESCE(s.min_bosh_narx, p.qolda_narx) AS boshlangich_narx
      FROM planirovka p
      LEFT JOIN (
        SELECT planirovka_id,
               (count(*) FILTER (WHERE holat = 'bosh'))::int AS bosh,
               (count(*) FILTER (WHERE holat = 'bron'))::int AS bron,
               (count(*) FILTER (WHERE holat = 'sotilgan'))::int AS sotilgan,
               count(*)::int AS jami,
               min(narx) FILTER (WHERE holat = 'bosh') AS min_bosh_narx
          FROM xonadon GROUP BY planirovka_id
      ) s ON s.planirovka_id = p.id;

    ALTER TABLE jurnal DROP CONSTRAINT jurnal_obyekt_check;
    ALTER TABLE jurnal ADD CONSTRAINT jurnal_obyekt_check CHECK (obyekt IN ('loyiha', 'blok', 'planirovka', 'xonadon'));
  `,
};
