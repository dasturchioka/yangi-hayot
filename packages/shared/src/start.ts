/**
 * Mini App `startapp` parameter (Telegram: A-Z a-z 0-9 _ -, ≤ 64 chars).
 * Pure helpers, used by the server (signed initData `start_param`) and the
 * Mini App (to open the right screen at once).
 *
 * Known forms:
 * - `src_<nomi>`          — Manba tag (#7), handled by the server's manba module;
 * - `pl<id>_u<ulashish>`  — «Ulashish» link (#16): opens Planirovka <id>,
 *                            <ulashish> names who shared it;
 * - `xn<id>_u<ulashish>`  — «Ulashish» of a Xonadon (#25): opens Xonadon <id>;
 * - `xn<id>`              — opens Xonadon <id> (#23, no tracked share);
 * - `taklif_<kod>`        — personal «Do'stingni taklif qil» link (#19);
 * - `booking`, `ariza`, ''— bot buttons (#7), screens of later tickets.
 */

/** Screen the Mini App opens with, as resolved from the start parameter. */
export type StartDto = { ekran: 'planirovka'; planirovkaId: number } | { ekran: 'xonadon'; xonadonId: number };

export interface UlashishParam {
  planirovkaId: number;
  ulashishId: number;
}

export function ulashishStartParam(p: UlashishParam): string {
  return `pl${p.planirovkaId}_u${p.ulashishId}`;
}

const ULASHISH = /^pl([1-9][0-9]{0,9})_u([1-9][0-9]{0,9})$/;

/** The «Ulashish» link in this start parameter, or null. */
export function parseUlashishParam(param: string | null | undefined): UlashishParam | null {
  const m = param ? ULASHISH.exec(param) : null;
  if (!m) return null;
  const planirovkaId = Number(m[1]);
  const ulashishId = Number(m[2]);
  if (planirovkaId > 2_147_483_647 || ulashishId > 2_147_483_647) return null;
  return { planirovkaId, ulashishId };
}

export interface XonadonUlashishParam {
  xonadonId: number;
  ulashishId: number;
}

export function xonadonUlashishStartParam(p: XonadonUlashishParam): string {
  return `xn${p.xonadonId}_u${p.ulashishId}`;
}

const XONADON_ULASHISH = /^xn([1-9][0-9]{0,9})_u([1-9][0-9]{0,9})$/;

/** The «Ulashish» link of a Xonadon (#25) in this start parameter, or null. */
export function parseXonadonUlashishParam(param: string | null | undefined): XonadonUlashishParam | null {
  const m = param ? XONADON_ULASHISH.exec(param) : null;
  if (!m) return null;
  const xonadonId = Number(m[1]);
  const ulashishId = Number(m[2]);
  if (xonadonId > 2_147_483_647 || ulashishId > 2_147_483_647) return null;
  return { xonadonId, ulashishId };
}

/**
 * «Do'stingni taklif qil» (#19): a Mijoz's personal link carries
 * `taklif_<kod>` (bot `?start=` and, as well, Mini App `startapp`).
 */
const TAKLIF = /^taklif_([a-z0-9]{6,32})$/;

export function taklifStartParam(kod: string): string {
  return `taklif_${kod}`;
}

/** The personal taklif code in this start parameter, or null. */
export function parseTaklifParam(param: string | null | undefined): string | null {
  return param ? (TAKLIF.exec(param)?.[1] ?? null) : null;
}
