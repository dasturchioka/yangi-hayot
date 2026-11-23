import type { Migration } from './index';

/**
 * Kalkulyator (#12): every result a Mijoz looked at («hisobladi»), with the
 * input, the settings-applied result and the Ariza it was sent with (if any).
 * Read by dojim #17 («hisobladi va 24 soat ichida Ariza yo'q») and Daraja #18.
 */
export const m0009_t12_kalkulyator: Migration = {
  name: '0009_t12_kalkulyator',
  sql: `
    CREATE TABLE kalkulyator_hisob (
      id            serial  PRIMARY KEY,
      mijoz_id      bigint  NOT NULL REFERENCES mijoz (telegram_id) ON DELETE CASCADE,
      planirovka_id integer REFERENCES planirovka (id) ON DELETE SET NULL,
      sxema         text    NOT NULL CHECK (sxema IN ('muddatli', 'annuitet', 'differensial')),
      kirish        jsonb   NOT NULL,
      natija        jsonb   NOT NULL,
      ariza_id      integer REFERENCES ariza (id) ON DELETE SET NULL,
      created_at    timestamptz NOT NULL
    );
    CREATE INDEX kalkulyator_hisob_mijoz ON kalkulyator_hisob (mijoz_id, created_at DESC);
  `,
};
