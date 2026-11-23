import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/test-app';
import { signInitData, tmaAuth } from './support/init-data';

const aziz = { id: 700000001, first_name: 'Aziz', last_name: 'Karimov', language_code: 'uz' };

describe('GET /api/me', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  it('returns the Mijoz name and language for valid initData', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      mijoz: { telegramId: '700000001', name: 'Aziz Karimov', lang: 'uz' },
      manba: { first: "Telegram (to'g'ridan-to'g'ri)", last: "Telegram (to'g'ridan-to'g'ri)" },
      start: null,
    });
  });

  it('gives Russian to a Mijoz whose Telegram is not in Uzbek', async () => {
    const olga = { id: 700000002, first_name: 'Ольга', language_code: 'ru' };
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: tmaAuth(signInitData(olga, { authDate: t.clock.now() })),
    });

    expect(res.json().mijoz).toEqual({ telegramId: '700000002', name: 'Ольга', lang: 'ru' });
  });

  it('rejects initData signed with another bot token', async () => {
    const forged = signInitData(aziz, { authDate: t.clock.now(), botToken: '999:someone-else' });
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: tmaAuth(forged) });

    expect(res.statusCode).toBe(401);
  });

  it('rejects initData whose user was tampered with after signing', async () => {
    const signed = new URLSearchParams(signInitData(aziz, { authDate: t.clock.now() }));
    signed.set('user', JSON.stringify({ ...aziz, id: 1 }));
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: tmaAuth(signed.toString()) });

    expect(res.statusCode).toBe(401);
  });

  it('rejects initData older than 24 hours', async () => {
    const initData = signInitData(aziz, { authDate: t.clock.now() });
    t.clock.advance({ hours: 24, minutes: 1 });
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: tmaAuth(initData) });

    expect(res.statusCode).toBe(401);
  });

  it('still accepts initData just under 24 hours old', async () => {
    const initData = signInitData(aziz, { authDate: t.clock.now() });
    t.clock.advance({ hours: 23, minutes: 59 });
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: tmaAuth(initData) });

    expect(res.statusCode).toBe(200);
  });

  it('rejects requests without initData', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });
});
