import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KALKULYATOR,
  hisobla,
  ipotekaAnnuitet,
  ipotekaDifferensial,
  kalkulyatorXatolari,
  muddatliTolov,
  type KalkulyatorSozlamalari,
} from './kalkulyator';

/**
 * TZ 6-b. «Qabul»: 3 examples per scheme from the Buyurtmachi's Excel, ≤ 1 so'm.
 * TODO(M10): the Excel has not arrived. These expected values were computed by
 * hand (50-digit decimal arithmetic, independent of this module) from the TZ
 * formulas; replace them with the Excel rows when M10 comes.
 */
const within1 = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe("muddatli to'lov: (S − V)(1 + k) / N", () => {
  it.each([
    // S, V, N, ustama %, oylik, ortiqcha, umumiy
    [455_500_000, 136_650_000, 24, 0, 13_285_417, 0, 455_500_000],
    [600_000_000, 180_000_000, 12, 5, 36_750_000, 21_000_000, 621_000_000],
    [387_250_000, 150_000_000, 18, 10, 14_498_611, 23_725_000, 410_975_000],
  ])('S=%i V=%i N=%i k=%i%% → %i so\'m a month', (narx, boshlangich, oylar, ustamaFoiz, oylik, ortiqcha, umumiy) => {
    const r = muddatliTolov({ narx, boshlangich, oylar, ustamaFoiz });
    within1(r.oylik, oylik);
    within1(r.ortiqcha, ortiqcha);
    within1(r.umumiy, umumiy);
    expect(Number.isInteger(r.oylik) && Number.isInteger(r.ortiqcha) && Number.isInteger(r.umumiy)).toBe(true);
  });
});

describe('ipoteka annuitet: P·r / (1 − (1 + r)^−n)', () => {
  it.each([
    // S, V, yil, stavka %, oylik, ortiqcha, umumiy
    [455_500_000, 136_650_000, 15, 18, 5_134_827, 605_418_947, 1_060_918_947],
    [600_000_000, 120_000_000, 20, 17, 7_040_643, 1_209_754_233, 1_809_754_233],
    [387_250_000, 116_175_000, 10, 22.5, 5_695_607, 412_397_807, 799_647_807],
  ])('S=%i V=%i %i yil %s%% → %i so\'m a month', (narx, boshlangich, yillar, stavka, oylik, ortiqcha, umumiy) => {
    const r = ipotekaAnnuitet({ narx, boshlangich, yillar, stavka });
    within1(r.oylik, oylik);
    within1(r.ortiqcha, ortiqcha);
    within1(r.umumiy, umumiy);
  });

  it('0% stavka: the credit split evenly, no ortiqcha', () => {
    const r = ipotekaAnnuitet({ narx: 120_000_000, boshlangich: 0, yillar: 1, stavka: 0 });
    expect(r).toMatchObject({ oylik: 10_000_000, ortiqcha: 0, umumiy: 120_000_000 });
  });
});

describe('ipoteka differensial: P/n + (P − P/n·(i − 1))·r', () => {
  it.each([
    // S, V, yil, stavka %, birinchi, oxirgi, ortiqcha, umumiy
    [455_500_000, 136_650_000, 15, 18, 6_554_139, 1_797_960, 432_838_875, 888_338_875],
    [600_000_000, 120_000_000, 20, 17, 8_800_000, 2_028_333, 819_400_000, 1_419_400_000],
    [387_250_000, 116_175_000, 10, 22.5, 7_341_615, 2_301_314, 307_500_703, 694_750_703],
  ])(
    'S=%i V=%i %i yil %s%% → first %i, last %i',
    (narx, boshlangich, yillar, stavka, birinchi, oxirgi, ortiqcha, umumiy) => {
      const r = ipotekaDifferensial({ narx, boshlangich, yillar, stavka });
      within1(r.birinchi, birinchi);
      within1(r.oxirgi, oxirgi);
      within1(r.ortiqcha, ortiqcha);
      within1(r.umumiy, umumiy);
    },
  );
});

const sozlama: KalkulyatorSozlamalari = {
  muddatli: { yoqilgan: true, minBoshlangichFoiz: 30, maxMuddatOy: 24, ustamaFoiz: 0 },
  banklar: [
    { id: 'xalq', nomi: 'Xalq banki', stavka: 18, minBoshlangichFoiz: 25, muddatlarYil: [10, 15, 20] },
    { id: 'ipoteka', nomi: 'Ipoteka-bank', stavka: 19, minBoshlangichFoiz: 20, muddatlarYil: [5, 10, 15] },
  ],
};

describe('limits from the settings', () => {
  it("muddatli: below the minimal boshlang'ich to'lov and beyond the maximal muddat are refused", () => {
    expect(
      kalkulyatorXatolari({ sxema: 'muddatli', narx: 100_000_000, boshlangich: 29_000_000, oylar: 25 }, sozlama),
    ).toEqual(['boshlangich_kam', 'muddat_kop']);
    expect(
      kalkulyatorXatolari({ sxema: 'muddatli', narx: 100_000_000, boshlangich: 30_000_000, oylar: 24 }, sozlama),
    ).toEqual([]);
  });

  it('muddatli switched off → refused', () => {
    const off = { ...sozlama, muddatli: { ...sozlama.muddatli, yoqilgan: false } };
    expect(
      kalkulyatorXatolari({ sxema: 'muddatli', narx: 100_000_000, boshlangich: 50_000_000, oylar: 12 }, off),
    ).toEqual(['sxema_yoq']);
  });

  it("ipoteka with a bank: its minimal boshlang'ich to'lov and only its muddatlar", () => {
    const base = { sxema: 'annuitet' as const, narx: 100_000_000, bankId: 'xalq' };
    expect(kalkulyatorXatolari({ ...base, boshlangich: 25_000_000, yillar: 15 }, sozlama)).toEqual([]);
    expect(kalkulyatorXatolari({ ...base, boshlangich: 24_000_000, yillar: 5 }, sozlama)).toEqual([
      'boshlangich_kam',
      'muddat_kop',
    ]);
    expect(kalkulyatorXatolari({ ...base, bankId: 'yoq', boshlangich: 50_000_000, yillar: 15 }, sozlama)).toEqual([
      'bank_yoq',
    ]);
  });

  it('ipoteka with a hand-typed stavka needs a stavka in (0; 100) and a muddat up to 30 years', () => {
    const base = { sxema: 'differensial' as const, narx: 100_000_000, boshlangich: 20_000_000 };
    expect(kalkulyatorXatolari({ ...base, stavka: 21, yillar: 30 }, sozlama)).toEqual([]);
    expect(kalkulyatorXatolari({ ...base, stavka: 0, yillar: 31 }, sozlama)).toEqual(['stavka', 'muddat_kop']);
  });

  it('price must be positive and the down payment below the price', () => {
    expect(kalkulyatorXatolari({ sxema: 'muddatli', narx: 0, boshlangich: 0, oylar: 12 }, sozlama)).toContain('narx');
    expect(
      kalkulyatorXatolari({ sxema: 'muddatli', narx: 100_000_000, boshlangich: 100_000_000, oylar: 12 }, sozlama),
    ).toEqual(['boshlangich_kop']);
  });
});

describe('hisobla: one entry for all three schemes, settings applied', () => {
  it('muddatli takes the ustama from the settings', () => {
    const s = { ...sozlama, muddatli: { ...sozlama.muddatli, ustamaFoiz: 5 } };
    const r = hisobla({ sxema: 'muddatli', narx: 600_000_000, boshlangich: 180_000_000, oylar: 12 }, s);
    expect(r).toMatchObject({ sxema: 'muddatli', oylik: 36_750_000, kredit: 420_000_000, ustamaFoiz: 5 });
  });

  it("annuitet with a bank takes the bank's stavka", () => {
    const r = hisobla(
      { sxema: 'annuitet', narx: 455_500_000, boshlangich: 136_650_000, yillar: 15, bankId: 'xalq' },
      sozlama,
    );
    expect(r).toMatchObject({ sxema: 'annuitet', stavka: 18, bank: 'Xalq banki' });
    if (r.sxema !== 'annuitet') throw new Error();
    within1(r.oylik, 5_134_827);
  });

  it('differensial with a hand-typed stavka', () => {
    const r = hisobla(
      { sxema: 'differensial', narx: 600_000_000, boshlangich: 120_000_000, yillar: 20, stavka: 17 },
      sozlama,
    );
    expect(r).toMatchObject({ sxema: 'differensial', stavka: 17, bank: null, birinchi: 8_800_000 });
  });
});

describe('defaults', () => {
  it('Xalq banki is the first bank', () => {
    expect(DEFAULT_KALKULYATOR.banklar[0]?.nomi).toBe('Xalq banki');
  });
});
