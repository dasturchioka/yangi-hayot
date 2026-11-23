/**
 * Muddatli to'lov va ipoteka kalkulyatori (TZ 6-b.). Pure: the Mini App shows
 * results with it as the Mijoz types, the server recomputes with it before an
 * Ariza goes to amoCRM. Currency UZS; every result is rounded to a whole so'm.
 *
 * - Muddatli to'lov: (S − V)(1 + k) / N; k = ustama (ulush), N = months.
 * - Annuitet: P·r / (1 − (1 + r)^−n); P = S − V, r = yillik stavka / 12, n = months.
 * - Differensial: P/n + (P − P/n·(i − 1))·r; first (i = 1) and last (i = n) shown.
 *
 * Totals are computed from the exact payments and rounded once, so the
 * ortiqcha / umumiy agree with a spreadsheet to ≤ 1 so'm.
 */

export const KALKULYATOR_SXEMALARI = ['muddatli', 'annuitet', 'differensial'] as const;
export type KalkulyatorSxemasi = (typeof KALKULYATOR_SXEMALARI)[number];

export interface Bank {
  /** Stable key, stored in a hisob and sent by the Mini App. */
  id: string;
  nomi: string;
  /** Yillik stavka, %. */
  stavka: number;
  minBoshlangichFoiz: number;
  /** Muddatlar the bank offers, in years, ascending. */
  muddatlarYil: number[];
}

export interface KalkulyatorSozlamalari {
  /** Muddatli to'lov (bo'lib to'lash) — S5: may be switched off (then only ipoteka). */
  muddatli: {
    yoqilgan: boolean;
    minBoshlangichFoiz: number;
    maxMuddatOy: number;
    /** Ustama on the remainder, % (0 = no ustama). */
    ustamaFoiz: number;
  };
  /** Ipoteka banks; the first one is shown first (Xalq banki). */
  banklar: Bank[];
}

/**
 * Defaults until the Buyurtmachi gives the real terms (M9 muddatli to'lov,
 * M7 bank rates). Administrators change them in the admin-panel.
 * TODO(M7, M9): placeholder numbers.
 */
export const DEFAULT_KALKULYATOR: KalkulyatorSozlamalari = {
  muddatli: { yoqilgan: true, minBoshlangichFoiz: 30, maxMuddatOy: 24, ustamaFoiz: 0 },
  banklar: [
    { id: 'xalq', nomi: 'Xalq banki', stavka: 18, minBoshlangichFoiz: 25, muddatlarYil: [5, 10, 15, 20] },
  ],
};

/** A hand-typed stavka: any muddat up to this many years. */
export const QOLDA_MAX_YIL = 30;
/** Hand-typed stavka offers these muddatlar (years). */
export const QOLDA_MUDDATLAR_YIL = [5, 10, 15, 20];

export interface MuddatliKirish {
  sxema: 'muddatli';
  /** S, UZS */
  narx: number;
  /** V, UZS */
  boshlangich: number;
  oylar: number;
}

export interface IpotekaKirish {
  sxema: 'annuitet' | 'differensial';
  narx: number;
  boshlangich: number;
  yillar: number;
  /** A bank from the settings… */
  bankId?: string;
  /** …or a hand-typed yillik stavka, % (used when bankId is absent). */
  stavka?: number;
}

export type KalkulyatorKirish = MuddatliKirish | IpotekaKirish;

interface Umumiy {
  /** S − V, UZS */
  kredit: number;
  /** What is paid above the narx. */
  ortiqcha: number;
  /** V + all payments. */
  umumiy: number;
}

export interface MuddatliNatija extends Umumiy {
  sxema: 'muddatli';
  oylik: number;
  ustamaFoiz: number;
}
export interface AnnuitetNatija extends Umumiy {
  sxema: 'annuitet';
  oylik: number;
  stavka: number;
  /** Bank name, or null for a hand-typed stavka. */
  bank: string | null;
}
export interface DifferensialNatija extends Umumiy {
  sxema: 'differensial';
  birinchi: number;
  oxirgi: number;
  stavka: number;
  bank: string | null;
}
export type KalkulyatorNatija = MuddatliNatija | AnnuitetNatija | DifferensialNatija;

const whole = (n: number) => Math.round(n);

export function muddatliTolov(a: { narx: number; boshlangich: number; oylar: number; ustamaFoiz: number }) {
  const kredit = a.narx - a.boshlangich;
  const jami = kredit * (1 + a.ustamaFoiz / 100);
  return {
    kredit,
    oylik: whole(jami / a.oylar),
    ortiqcha: whole(jami - kredit),
    umumiy: whole(a.boshlangich + jami),
  };
}

export function ipotekaAnnuitet(a: { narx: number; boshlangich: number; yillar: number; stavka: number }) {
  const P = a.narx - a.boshlangich;
  const r = a.stavka / 100 / 12;
  const n = a.yillar * 12;
  const M = r === 0 ? P / n : (P * r) / (1 - (1 + r) ** -n);
  return { kredit: P, oylik: whole(M), ortiqcha: whole(M * n - P), umumiy: whole(a.boshlangich + M * n) };
}

export function ipotekaDifferensial(a: { narx: number; boshlangich: number; yillar: number; stavka: number }) {
  const P = a.narx - a.boshlangich;
  const r = a.stavka / 100 / 12;
  const n = a.yillar * 12;
  const tolov = (i: number) => P / n + (P - (P / n) * (i - 1)) * r;
  // Σ interest = P·r·(n + 1)/2 (arithmetic series of the remaining debt).
  const foiz = (P * r * (n + 1)) / 2;
  return {
    kredit: P,
    birinchi: whole(tolov(1)),
    oxirgi: whole(tolov(n)),
    ortiqcha: whole(foiz),
    umumiy: whole(a.narx + foiz),
  };
}

export type KalkulyatorXatosi =
  | 'narx'
  | 'boshlangich_kam'
  | 'boshlangich_kop'
  | 'muddat_kop'
  | 'muddat'
  | 'sxema_yoq'
  | 'bank_yoq'
  | 'stavka';

/** Minimal boshlang'ich to'lov in so'm for a narx and a percentage (rounded up to a whole so'm). */
export function minBoshlangich(narx: number, foiz: number): number {
  return Math.ceil((narx * foiz) / 100);
}

/** Ipoteka limits for the chosen bank (or a hand-typed stavka); null for an unknown bank. */
export function ipotekaChegaralari(
  sozlama: KalkulyatorSozlamalari,
  bankId: string | undefined,
): { minBoshlangichFoiz: number; muddatlarYil: number[]; maxYil: number } | null {
  if (bankId === undefined) {
    const min = Math.min(...sozlama.banklar.map((b) => b.minBoshlangichFoiz), 100);
    return { minBoshlangichFoiz: min === 100 ? 0 : min, muddatlarYil: QOLDA_MUDDATLAR_YIL, maxYil: QOLDA_MAX_YIL };
  }
  const bank = sozlama.banklar.find((b) => b.id === bankId);
  if (!bank) return null;
  return {
    minBoshlangichFoiz: bank.minBoshlangichFoiz,
    muddatlarYil: bank.muddatlarYil,
    maxYil: Math.max(0, ...bank.muddatlarYil),
  };
}

/** What is wrong with an input under the settings; [] = it can be computed and sent. */
export function kalkulyatorXatolari(k: KalkulyatorKirish, sozlama: KalkulyatorSozlamalari): KalkulyatorXatosi[] {
  const x: KalkulyatorXatosi[] = [];
  if (!(Number.isFinite(k.narx) && k.narx > 0)) return ['narx'];
  if (!(Number.isFinite(k.boshlangich) && k.boshlangich >= 0)) return ['boshlangich_kam'];

  if (k.sxema === 'muddatli') {
    const m = sozlama.muddatli;
    if (!m.yoqilgan) return ['sxema_yoq'];
    if (k.boshlangich < minBoshlangich(k.narx, m.minBoshlangichFoiz)) x.push('boshlangich_kam');
    if (k.boshlangich >= k.narx) x.push('boshlangich_kop');
    if (!Number.isInteger(k.oylar) || k.oylar < 1) x.push('muddat');
    else if (k.oylar > m.maxMuddatOy) x.push('muddat_kop');
    return x;
  }

  const ch = ipotekaChegaralari(sozlama, k.bankId);
  if (!ch) return ['bank_yoq'];
  if (k.bankId === undefined && !(typeof k.stavka === 'number' && k.stavka > 0 && k.stavka < 100)) x.push('stavka');
  if (k.boshlangich < minBoshlangich(k.narx, ch.minBoshlangichFoiz)) x.push('boshlangich_kam');
  if (k.boshlangich >= k.narx) x.push('boshlangich_kop');
  if (!Number.isInteger(k.yillar) || k.yillar < 1) x.push('muddat');
  else if (k.bankId !== undefined ? !ch.muddatlarYil.includes(k.yillar) : k.yillar > ch.maxYil) x.push('muddat_kop');
  return x;
}

/**
 * Computes a valid input (check kalkulyatorXatolari first) with the settings:
 * ustama for muddatli to'lov, the bank's stavka for ipoteka.
 */
export function hisobla(k: KalkulyatorKirish, sozlama: KalkulyatorSozlamalari): KalkulyatorNatija {
  if (k.sxema === 'muddatli') {
    const ustamaFoiz = sozlama.muddatli.ustamaFoiz;
    return { sxema: 'muddatli', ustamaFoiz, ...muddatliTolov({ ...k, ustamaFoiz }) };
  }
  const bank = k.bankId === undefined ? undefined : sozlama.banklar.find((b) => b.id === k.bankId);
  const stavka = bank ? bank.stavka : (k.stavka ?? 0);
  const a = { narx: k.narx, boshlangich: k.boshlangich, yillar: k.yillar, stavka };
  const meta = { stavka, bank: bank?.nomi ?? null };
  return k.sxema === 'annuitet'
    ? { sxema: 'annuitet', ...meta, ...ipotekaAnnuitet(a) }
    : { sxema: 'differensial', ...meta, ...ipotekaDifferensial(a) };
}

/**
 * A typical monthly payment for a narx (taqqoslash, #16): muddatli to'lov with
 * the minimal boshlang'ich to'lov over the maximal muddat; when muddatli to'lov
 * is off, annuitet of the first bank over its longest muddat. null without a narx.
 */
export function namunaviyOylik(narx: number | null, sozlama: KalkulyatorSozlamalari): number | null {
  if (narx === null || narx <= 0) return null;
  const m = sozlama.muddatli;
  if (m.yoqilgan) {
    const boshlangich = minBoshlangich(narx, m.minBoshlangichFoiz);
    return muddatliTolov({ narx, boshlangich, oylar: m.maxMuddatOy, ustamaFoiz: m.ustamaFoiz }).oylik;
  }
  const bank = sozlama.banklar[0];
  if (!bank || bank.muddatlarYil.length === 0) return null;
  const boshlangich = minBoshlangich(narx, bank.minBoshlangichFoiz);
  return ipotekaAnnuitet({ narx, boshlangich, yillar: Math.max(...bank.muddatlarYil), stavka: bank.stavka }).oylik;
}

/** POST /api/kalkulyator/hisob — the Mini App records a result the Mijoz looked at (dojim #17, Daraja #18). */
export interface KalkulyatorHisobRequest {
  kirish: KalkulyatorKirish;
  planirovkaId?: number;
  /** The Xonadon whose narx was put in (#25); its Planirovka is implied. */
  xonadonId?: number;
}

/** POST /api/kalkulyator/ariza — «Hisobni menejerga yuborish». */
export interface KalkulyatorArizaRequest extends KalkulyatorHisobRequest {
  name: string;
  phone: string;
}

/** GET /api/kalkulyator — the settings the Mini App limits its inputs with. */
export interface KalkulyatorResponse {
  sozlama: KalkulyatorSozlamalari;
}
