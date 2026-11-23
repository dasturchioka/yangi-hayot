import { describe, expect, it } from 'vitest';
import { dojimStartParam, parseDojimParam } from './dojim';

describe('dojim start parameter', () => {
  it('round-trips every screen a dojim button opens', () => {
    for (const p of [
      { dojimId: 7, ekran: { ekran: 'planirovka', planirovkaId: 12 } },
      { dojimId: 7, ekran: { ekran: 'xonadon', xonadonId: 345 } },
      { dojimId: 7, ekran: { ekran: 'yozilish', loyihaId: 3 } },
      { dojimId: 7, ekran: { ekran: 'yozilish', loyihaId: 3, planirovkaId: 12 } },
      { dojimId: 7, ekran: { ekran: 'kalkulyator' } },
      { dojimId: 7, ekran: { ekran: 'kalkulyator', planirovkaId: 12 } },
    ] as const) {
      expect(parseDojimParam(dojimStartParam(p))).toEqual(p);
    }
    expect(dojimStartParam({ dojimId: 7, ekran: { ekran: 'yozilish', loyihaId: 3, planirovkaId: 12 } })).toBe('dj7_yz3p12');
  });

  it('rejects other parameters and overflowing ids', () => {
    for (const s of ['', 'booking', 'pl1_u2', 'dj0_pl1', 'dj1_pl', 'dj1_xx1', 'dj9999999999_pl1', 'dj1_pl1 ']) {
      expect(parseDojimParam(s)).toBeNull();
    }
  });
});
