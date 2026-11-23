import { describe, expect, it } from 'vitest';
import { FakeClock, toTashkent } from '../src/clock';

describe('Tashkent time', () => {
  it('is UTC+5: 20:30 UTC on Dec 31 is 01:30 on Jan 1 (Thursday) in Tashkent', () => {
    expect(toTashkent(new Date('2026-12-31T20:30:00Z'))).toEqual({
      date: '2027-01-01',
      time: '01:30',
      isoWeekday: 5,
    });
  });

  it('report time 19:30 Tashkent is 14:30 UTC', () => {
    expect(toTashkent(new Date('2026-11-23T14:30:00Z'))).toMatchObject({ date: '2026-11-23', time: '19:30', isoWeekday: 1 });
  });
});

describe('FakeClock', () => {
  it('stands still until advanced', () => {
    const clock = new FakeClock(new Date('2026-11-23T05:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-11-23T05:00:00.000Z');

    clock.advance({ days: 7, hours: 1, minutes: 30 });
    expect(clock.now().toISOString()).toBe('2026-11-30T06:30:00.000Z');
  });
});
