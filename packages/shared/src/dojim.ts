import type { Matn } from './kontent';

/**
 * Dojim (UF-3, #17): the bot's gentle reminder to a Mijoz. Four ssenariylar:
 * - `korish`      — viewed or calculated a Xonadon / Planirovka, no Ariza in 24 h;
 * - `sevimliBand` — a favourite Xonadon went bron / sotilgan (#25), or a
 *                   favourite Planirovka has no bo'sh Xonadon left;
 * - `kelmadi`     — marked «kelmadi» for a ko'rish;
 * - `keldi`       — marked «keldi» («Qanday bo'ldi?»).
 */
export const DOJIM_SSENARIYLARI = ['korish', 'sevimliBand', 'kelmadi', 'keldi'] as const;
export type DojimSsenariy = (typeof DOJIM_SSENARIYLARI)[number];

export interface DojimSsenariySozlamasi {
  /** Off → this ssenariy sends nothing. */
  yoqilgan: boolean;
  /** Message text; `{planirovka}` and `{loyiha}` are filled in. */
  matn: Matn;
}

/** GET/PUT /admin/api/dojim (Administrator). */
export type DojimSozlamalari = Record<DojimSsenariy, DojimSsenariySozlamasi>;

/** Max length of one dojim text (Telegram allows 4096; reminders stay short). */
export const DOJIM_MATN_MAX = 1000;

/** Placeholders each ssenariy's text may use. */
export const DOJIM_OZGARUVCHILAR: Record<DojimSsenariy, string[]> = {
  korish: ['{planirovka}', '{loyiha}'],
  sevimliBand: ['{planirovka}', '{loyiha}'],
  kelmadi: ['{loyiha}'],
  keldi: ['{loyiha}'],
};

// ---- Mini App start parameter of dojim buttons ----

/**
 * Where a dojim button opens the Mini App. `dojimId` travels with it so a
 * ko'rishga yozilish made in that launch is counted as «dojimdan» (#15 report).
 */
export type DojimEkran =
  | { ekran: 'planirovka'; planirovkaId: number }
  | { ekran: 'xonadon'; xonadonId: number }
  | { ekran: 'yozilish'; loyihaId: number; planirovkaId?: number; xonadonId?: number }
  | { ekran: 'kalkulyator'; planirovkaId?: number };

export interface DojimParam {
  dojimId: number;
  ekran: DojimEkran;
}

/**
 * `dj<dojim>_pl<planirovka>` | `dj<dojim>_xn<xonadon>` | `dj<dojim>_yz<loyiha>[p<planirovka>[x<xonadon>]]` | `dj<dojim>_kk[<planirovka>]`
 * (≤ 64 chars, Telegram's startapp alphabet).
 */
export function dojimStartParam(p: DojimParam): string {
  const e = p.ekran;
  const tail =
    e.ekran === 'planirovka'
      ? `pl${e.planirovkaId}`
      : e.ekran === 'xonadon'
        ? `xn${e.xonadonId}`
        : e.ekran === 'yozilish'
          ? `yz${e.loyihaId}${e.planirovkaId ? `p${e.planirovkaId}${e.xonadonId ? `x${e.xonadonId}` : ''}` : ''}`
          : `kk${e.planirovkaId ?? ''}`;
  return `dj${p.dojimId}_${tail}`;
}

const ID = '([1-9][0-9]{0,9})';
const DOJIM = new RegExp(`^dj${ID}_(?:pl${ID}|yz${ID}(?:p${ID}(?:x${ID})?)?|kk${ID}?|xn${ID})$`);
const MAX_ID = 2_147_483_647;

/** The dojim button in this start parameter, or null. */
export function parseDojimParam(param: string | null | undefined): DojimParam | null {
  const m = param ? DOJIM.exec(param) : null;
  if (!m) return null;
  const ids = m.slice(1).map((s) => (s === undefined ? undefined : Number(s)));
  if (ids.some((n) => n !== undefined && n > MAX_ID)) return null;
  const [dojimId, pl, yz, yzp, yzx, kk, xn] = ids as [number, number?, number?, number?, number?, number?, number?];
  if (xn !== undefined) return { dojimId, ekran: { ekran: 'xonadon', xonadonId: xn } };
  if (pl !== undefined) return { dojimId, ekran: { ekran: 'planirovka', planirovkaId: pl } };
  if (yz !== undefined)
    return {
      dojimId,
      ekran: {
        ekran: 'yozilish',
        loyihaId: yz,
        ...(yzp !== undefined ? { planirovkaId: yzp } : {}),
        ...(yzx !== undefined ? { xonadonId: yzx } : {}),
      },
    };
  return { dojimId, ekran: { ekran: 'kalkulyator', ...(kk !== undefined ? { planirovkaId: kk } : {}) } };
}
