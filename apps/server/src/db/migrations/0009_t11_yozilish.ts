import type { Migration } from './index';

/**
 * Ko'rishga yozilish (#11, TZ 2-b.). A yozilish is an Ariza of type `visit`
 * plus its visit time and later life: moved, cancelled, keldi / kelmadi.
 *
 * Moving and cancelling must reach amoCRM even when it is down, so each one
 * is a row in `yozilish_crm` (an outbox) that the job `yozilish-crm` retries
 * — after the Ariza itself has reached the CRM.
 *
 * Also: the Loyiha's ko'rsatuv manzili (where showings happen; null = its
 * address) and, on the Ariza, the name a new Bitim gets and whether this
 * Ariza created it (only then does moving rename the Bitim).
 */
export const m0009_t11_yozilish: Migration = {
  name: '0009_t11_yozilish',
  sql: `
    ALTER TABLE loyiha ADD COLUMN korsatuv_manzili jsonb;

    ALTER TABLE ariza ADD COLUMN crm_bitim_nomi text;
    ALTER TABLE ariza ADD COLUMN crm_bitim_created boolean NOT NULL DEFAULT false;

    CREATE TABLE yozilish (
      id                serial PRIMARY KEY,
      ariza_id          integer NOT NULL UNIQUE REFERENCES ariza(id),
      mijoz_id          bigint NOT NULL REFERENCES mijoz(telegram_id),
      loyiha_id         integer NOT NULL REFERENCES loyiha(id),
      planirovka_id     integer REFERENCES planirovka(id) ON DELETE SET NULL,
      vaqt              timestamptz NOT NULL,
      holat             text NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor')),
      kochirildi        integer NOT NULL DEFAULT 0,
      bekor_at          timestamptz,
      -- set in the admin-panel; dojim (#17) and the funnel (#20) read these
      davomat           text CHECK (davomat IN ('keldi', 'kelmadi')),
      davomat_at        timestamptz,
      davomat_admin_id  integer REFERENCES admin_user(id) ON DELETE SET NULL,
      created_at        timestamptz NOT NULL,
      updated_at        timestamptz NOT NULL
    );
    CREATE INDEX yozilish_vaqt ON yozilish (vaqt);
    CREATE INDEX yozilish_mijoz ON yozilish (mijoz_id, vaqt);

    CREATE TABLE yozilish_crm (
      id               serial PRIMARY KEY,
      yozilish_id      integer NOT NULL REFERENCES yozilish(id) ON DELETE CASCADE,
      amal             text NOT NULL CHECK (amal IN ('kochirish', 'bekor')),
      oldingi_vaqt     timestamptz NOT NULL,
      vaqt             timestamptz NOT NULL,
      created_at       timestamptz NOT NULL,
      task_done        boolean NOT NULL DEFAULT false,
      note_added       boolean NOT NULL DEFAULT false,
      attempts         integer NOT NULL DEFAULT 0,
      next_attempt_at  timestamptz NOT NULL,
      last_error       text,
      status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed'))
    );
    CREATE INDEX yozilish_crm_due ON yozilish_crm (next_attempt_at) WHERE status = 'pending';
  `,
};
