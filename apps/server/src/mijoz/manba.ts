/** Manba of a Mijoz who came without a `src_` tag. */
export const DIRECT_MANBA = "Telegram (to'g'ridan-to'g'ri)";

/** Manba of a Mijoz who came through another Mijoz's «Ulashish» link (#16). */
export const SHARED_MANBA = 'mijoz ulashdi';

/** Manba of a visit by another Mijoz's personal «Do'stingni taklif qil» link (#19). */
export const TAKLIF_MANBA = 'mijoz taklif qildi';

/** `src_<nomi>`: Latin letters, digits, `_`; whole parameter ≤ 64 chars (Telegram limit). */
const SOURCE_TAG = /^src_([A-Za-z0-9_]+)$/;

/**
 * Manba named by a deep-link parameter (`/start src_x` or Mini App
 * `startapp=src_x`), or null when the parameter is absent or not a valid
 * `src_` tag (such a visit counts as untagged).
 */
export function manbaFromStartParam(param: string | undefined | null): string | null {
  if (!param || param.length > 64) return null;
  return SOURCE_TAG.exec(param)?.[1] ?? null;
}
