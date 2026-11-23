import { describe, expect, it } from 'vitest';
import { DEFAULT_SKORING, SKORING_NAMUNALARI, darajaHisobla, type SkoringQoidalari, type SkoringSignallari } from './skoring';

// UF-4: Daraja from kviz / kalkulyator answers and behaviour, by the ball qoidalari in settings.

const bosh: SkoringSignallari = {
  muddat: null,
  tolov: null,
  byudjet: null,
  hisobladi: false,
  yubordi: false,
  yozilishlar: 0,
  qaytishlar: 0,
};

describe('darajaHisobla', () => {
  it('a Mijoz with no answers and no actions is sovuq with 0 ball', () => {
    expect(darajaHisobla(DEFAULT_SKORING, bosh)).toEqual({ ball: 0, daraja: 'sovuq', qismlar: [] });
  });

  it('adds the ball of each answer and action and names each part for managers', () => {
    const natija = darajaHisobla(DEFAULT_SKORING, {
      ...bosh,
      muddat: 'shu_oy',
      tolov: 'toliq',
      byudjet: true,
    });
    expect(natija).toEqual({
      ball: 65,
      daraja: 'issiq',
      qismlar: [
        { nomi: 'Xarid muddati: shu oy', ball: 30 },
        { nomi: "To'lov usuli: to'liq", ball: 25 },
        { nomi: "Byudjet ko'rsatilgan", ball: 10 },
      ],
    });
  });

  it('counts re-entries up to the limit only', () => {
    const natija = darajaHisobla(DEFAULT_SKORING, { ...bosh, qaytishlar: 10 });
    expect(natija.ball).toBe(15);
    expect(natija.qismlar).toEqual([{ nomi: 'Qayta kirishlar: 10', ball: 15 }]);
  });

  it('the thresholds are inclusive: exactly iliq ball → iliq, exactly issiq ball → issiq', () => {
    const q: SkoringQoidalari = { ...DEFAULT_SKORING, chegara: { iliq: 30, issiq: 40 } };
    expect(darajaHisobla(q, { ...bosh, yozilishlar: 1 }).daraja).toBe('iliq'); // 30
    expect(darajaHisobla(q, { ...bosh, yozilishlar: 1, hisobladi: true }).daraja).toBe('issiq'); // 40
    expect(darajaHisobla(q, { ...bosh, muddat: '1_3_oy' }).daraja).toBe('sovuq'); // 20
  });

  it('uses the Administrator\'s own ball qoidalari', () => {
    const q: SkoringQoidalari = {
      ...DEFAULT_SKORING,
      muddat: { ...DEFAULT_SKORING.muddat, bilmayman: -10 },
      yozilish: 70,
    };
    expect(darajaHisobla(q, { ...bosh, muddat: 'bilmayman', yozilishlar: 2 })).toMatchObject({ ball: 60, daraja: 'issiq' });
  });

  it('never goes below 0 ball', () => {
    const q: SkoringQoidalari = { ...DEFAULT_SKORING, muddat: { ...DEFAULT_SKORING.muddat, bilmayman: -20 } };
    expect(darajaHisobla(q, { ...bosh, muddat: 'bilmayman' }).ball).toBe(0);
  });
});

// Qabul (UF-4): 5 test anketasi. TODO(M14): replace the expected Daraja with the
// ball jadvali agreed with the sotuv bo'limi rahbari.
describe('5 test anketasi (M14)', () => {
  const kutilgan = ['issiq', 'iliq', 'sovuq', 'issiq', 'sovuq'] as const;
  it.each(SKORING_NAMUNALARI.map((n, i) => [n.nomi, n.signallar, kutilgan[i]] as const))(
    '%s → %s',
    (_nomi, signallar, daraja) => {
      expect(darajaHisobla(DEFAULT_SKORING, signallar).daraja).toBe(daraja);
    },
  );
});
