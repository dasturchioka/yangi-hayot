import type { YozilishSlotlarResponse } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/settings';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser = aziz) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now() }));
}

async function slotlar(): Promise<YozilishSlotlarResponse> {
  const res = await t.app.inject({ method: 'GET', url: '/api/yozilish/slotlar', headers: auth() });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('slots', () => {
  it('offers the nearest 14 days with hourly slots 9:00–17:00, hiding the passed ones of today', async () => {
    const { kunlar } = await slotlar();

    expect(kunlar).toHaveLength(14);
    expect(kunlar[0]).toEqual({
      sana: '2026-11-23',
      haftaKuni: 1,
      vaqtlar: ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
    });
    expect(kunlar[1]!.vaqtlar).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    expect(kunlar[13]!.sana).toBe('2026-12-06');
  });

  it('hides closed weekdays and holidays set by the Administrator', async () => {
    await setSetting(t.db, 'yozilish', {
      haftaKunlari: [1, 2, 3, 4, 5, 6],
      vaqtlar: ['15:00', '10:00'],
      bayramlar: ['2026-11-25'],
      kunlarSoni: 7,
    }, t.clock.now());

    const { kunlar } = await slotlar();

    expect(kunlar.map((k) => [k.sana, k.vaqtlar.join(' ')])).toEqual([
      ['2026-11-23', '15:00'],
      ['2026-11-24', '10:00 15:00'],
      ['2026-11-25', ''], // holiday
      ['2026-11-26', '10:00 15:00'],
      ['2026-11-27', '10:00 15:00'],
      ['2026-11-28', '10:00 15:00'],
      ['2026-11-29', ''], // Sunday off
    ]);
  });

  it('moves with the clock: late in the evening today has no slots left', async () => {
    t.clock.set(new Date('2026-11-23T12:30:00Z')); // 17:30 Tashkent
    const { kunlar } = await slotlar();
    expect(kunlar[0]).toEqual({ sana: '2026-11-23', haftaKuni: 1, vaqtlar: [] });

    t.clock.set(new Date('2026-11-23T19:30:00Z')); // 00:30 next day in Tashkent
    expect((await slotlar()).kunlar[0]!.sana).toBe('2026-11-24');
  });
});
