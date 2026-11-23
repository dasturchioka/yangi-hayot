import type { Migration } from './index';

/**
 * Ariza (#9, TZ 8-bo'lim). Every Ariza is stored first, then delivered to
 * amoCRM; `crm_*` columns track that delivery (and its retries for 24 h).
 * The contact / Bitim / task IDs stay here: booking reschedule/cancel and
 * reports rely on them (8-bo'lim, 5-qoida).
 *
 * Old-bot Arizalar (`legacy_ariza`, #8) are copied in by the job
 * `ariza-legacy` (see ariza/legacy.ts), marked as already sent.
 *
 * Also: the Mijoz's phone (form prefill), the Loyiha mas'ul in amoCRM, and the
 * amoCRM OAuth tokens (only when OAuth is used instead of a long-lived token).
 */
export const m0007_t9_ariza: Migration = {
  name: '0007_t9_ariza',
  sql: `
    ALTER TABLE mijoz ADD COLUMN phone text;

    -- amoCRM user id of the Loyiha mas'ul (new Bitimlar go to them); null = default
    ALTER TABLE loyiha ADD COLUMN crm_responsible_id text;

    CREATE TABLE ariza (
      id                  serial PRIMARY KEY,
      mijoz_id            bigint NOT NULL REFERENCES mijoz(telegram_id),
      tur                 text NOT NULL CHECK (tur IN ('form', 'quiz', 'visit', 'calc', 'ai', 'human')),
      name                text NOT NULL,
      phone               text,
      lang                text NOT NULL,
      first_manba         text NOT NULL,
      manba               text NOT NULL,
      loyiha_id           integer REFERENCES loyiha(id) ON DELETE SET NULL,
      planirovka_id       integer REFERENCES planirovka(id) ON DELETE SET NULL,
      -- context frozen at creation (names, price), so the note does not change later
      kontekst            jsonb,
      izoh                text[] NOT NULL DEFAULT '{}',
      tags                text[] NOT NULL DEFAULT '{}',
      task_due_at         timestamptz,
      payload             jsonb,
      created_at          timestamptz NOT NULL,

      -- delivery to amoCRM
      crm_status          text NOT NULL DEFAULT 'pending' CHECK (crm_status IN ('pending', 'sent', 'failed')),
      crm_attempts        integer NOT NULL DEFAULT 0,
      crm_next_attempt_at timestamptz,
      crm_last_error      text,
      crm_contact_id      text,
      crm_bitim_id        text,
      crm_note_added      boolean NOT NULL DEFAULT false,
      crm_task_id         text,
      crm_sent_at         timestamptz,
      -- managers group was told about the CRM failure
      group_notified      boolean NOT NULL DEFAULT false,
      -- Ariza carried over from the old bot (#8); never sent to the CRM again
      legacy_ariza_id     integer UNIQUE REFERENCES legacy_ariza(id) ON DELETE SET NULL
    );
    CREATE INDEX ariza_mijoz ON ariza (mijoz_id, created_at);
    CREATE INDEX ariza_crm_due ON ariza (crm_next_attempt_at) WHERE crm_status = 'pending';

    CREATE TABLE crm_oauth (
      id            integer PRIMARY KEY CHECK (id = 1),
      access_token  text NOT NULL,
      refresh_token text NOT NULL,
      expires_at    timestamptz NOT NULL,
      updated_at    timestamptz NOT NULL
    );
  `,
};
