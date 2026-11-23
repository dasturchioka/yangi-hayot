import type { Migration } from './index';

/**
 * Shaxmatka (#23): opening a Xonadon kartochkasi is an analitika event
 * `xonadon_korildi` (funnel «ko'rdi» step, with `planirovka_korildi`). The
 * row keeps the Xonadon and its Planirovka (most viewed Planirovkalar).
 */
export const m0017_t23_xonadon_korildi: Migration = {
  name: '0017_t23_xonadon_korildi',
  sql: `
    ALTER TABLE hodisa DROP CONSTRAINT hodisa_tur_check;
    ALTER TABLE hodisa ADD CONSTRAINT hodisa_tur_check
      CHECK (tur IN ('bot_kirdi', 'planirovka_korildi', 'xonadon_korildi', 'ariza', 'yozilish', 'keldi'));
    ALTER TABLE hodisa ADD COLUMN xonadon_id integer REFERENCES xonadon(id) ON DELETE SET NULL;
  `,
};
