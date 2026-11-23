import type { Migration } from './index';

/**
 * Dojim (UF-3, #17). One `dojim` row = one reminder the bot plans to send a
 * Mijoz: written when its trigger happens (outbox), sent by the job `dojim`
 * when due, or skipped with a reason. Planning and sending are apart so the
 * «7 kunda ≤ 1» rule, «Yubormang» and a later Ariza are checked at send time.
 *
 * - `korish` rows: at most one waiting per Mijoz; every view/calculation moves
 *   it (planirovka, hodisa_at, due_at = +24 h). This is also the only record of
 *   «Planirovkani ko'rdi» so far (#15's analytics may replace the producer).
 * - `holat`: kutilmoqda → yuborildi (claimed before sending: at most once)
 *   | otkazildi (`sabab`: toxtatildi, bloklagan, limit, ariza, ...).
 * - `mijoz.dojim_toxtatildi_at`: «Yubormang» pressed; nothing is sent after it.
 * - `yozilish.dojim_id`: the booking was made from that dojim's button (#15 report).
 */
export const m0013_t17_dojim: Migration = {
  name: '0013_t17_dojim',
  sql: `
    ALTER TABLE mijoz ADD COLUMN dojim_toxtatildi_at timestamptz;

    CREATE TABLE dojim (
      id             serial PRIMARY KEY,
      mijoz_id       bigint NOT NULL REFERENCES mijoz(telegram_id) ON DELETE CASCADE,
      ssenariy       text NOT NULL CHECK (ssenariy IN ('korish', 'sevimliBand', 'kelmadi', 'keldi')),
      planirovka_id  integer REFERENCES planirovka(id) ON DELETE SET NULL,
      yozilish_id    integer REFERENCES yozilish(id) ON DELETE CASCADE,
      hodisa_at      timestamptz NOT NULL,
      due_at         timestamptz NOT NULL,
      holat          text NOT NULL DEFAULT 'kutilmoqda' CHECK (holat IN ('kutilmoqda', 'yuborildi', 'otkazildi')),
      sabab          text,
      message_id     text,
      hal_at         timestamptz,
      created_at     timestamptz NOT NULL
    );
    CREATE UNIQUE INDEX dojim_korish_kutilmoqda ON dojim (mijoz_id) WHERE ssenariy = 'korish' AND holat = 'kutilmoqda';
    CREATE INDEX dojim_due ON dojim (due_at) WHERE holat = 'kutilmoqda';
    CREATE INDEX dojim_yuborildi ON dojim (mijoz_id, hal_at) WHERE holat = 'yuborildi';

    ALTER TABLE yozilish ADD COLUMN dojim_id integer REFERENCES dojim(id) ON DELETE SET NULL;
  `,
};
