import type { Migration } from './index';

/**
 * Analitika (#15, TZ «Analitika»). `hodisa` is the events table the daily /
 * weekly report and the funnel (#20, UF-7) read — never amoCRM:
 *
 *   bot_kirdi → planirovka_korildi → ariza → yozilish → keldi
 *
 * Every row carries the Mijoz, the Manba it is credited to and the Loyiha
 * (when there is one). `keldi` is one row per yozilish while its davomat is
 * «keldi» (changed / cleared in the admin-panel → the row is removed).
 * `dojim` marks a yozilish that came from a dojim message (#17 sets it).
 *
 * `hisobot_yuborish`: which scheduled report (kunlik / haftalik) of which
 * Tashkent day already reached which chat, so ticks and restarts do not
 * repeat it and a failed chat is retried alone.
 */
export const m0012_t15_hodisa_hisobot: Migration = {
  name: '0012_t15_hodisa_hisobot',
  sql: `
    CREATE TABLE hodisa (
      id             bigserial PRIMARY KEY,
      tur            text NOT NULL CHECK (tur IN ('bot_kirdi', 'planirovka_korildi', 'ariza', 'yozilish', 'keldi')),
      mijoz_id       bigint NOT NULL REFERENCES mijoz(telegram_id),
      manba          text NOT NULL,
      loyiha_id      integer REFERENCES loyiha(id) ON DELETE SET NULL,
      planirovka_id  integer REFERENCES planirovka(id) ON DELETE SET NULL,
      ariza_id       integer REFERENCES ariza(id) ON DELETE CASCADE,
      yozilish_id    integer REFERENCES yozilish(id) ON DELETE CASCADE,
      dojim          boolean NOT NULL DEFAULT false,
      at             timestamptz NOT NULL
    );
    CREATE INDEX hodisa_tur_at ON hodisa (tur, at);
    CREATE UNIQUE INDEX hodisa_ariza ON hodisa (ariza_id) WHERE tur = 'ariza';
    CREATE UNIQUE INDEX hodisa_yozilish ON hodisa (tur, yozilish_id) WHERE tur IN ('yozilish', 'keldi');

    CREATE TABLE hisobot_yuborish (
      tur      text NOT NULL CHECK (tur IN ('kunlik', 'haftalik')),
      sana     date NOT NULL,
      chat_id  text NOT NULL,
      sent_at  timestamptz NOT NULL,
      PRIMARY KEY (tur, sana, chat_id)
    );
  `,
};
