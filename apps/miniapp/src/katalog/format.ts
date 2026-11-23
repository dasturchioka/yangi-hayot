import type { Translate } from '../i18n';

const decimal = (n: number, max: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }).format(n).replace('.', ',');

/** «455,5 mln so'mdan» / «от 455,5 млн сум»; no price → «Narx so'rov bo'yicha». */
export function formatNarx(t: Translate, narx: number | null): string {
  if (narx === null) return t('narx.onRequest');
  const mln = t('narx.mln', { n: decimal(narx / 1_000_000, 1) });
  return t('narx.from', { narx: mln });
}

/** 54.2 → «54,2» */
export function formatMaydon(m2: number): string {
  return decimal(m2, 1);
}

/** «Toshkent, Mirzo Ulug'bek tumani»; no «Navoiy, Navoiy shahri» when the address already names the city. */
export function joyNomi(shahar: string, manzil: string): string {
  return manzil.toLowerCase().includes(shahar.toLowerCase().slice(0, 4)) ? manzil : `${shahar}, ${manzil}`;
}
