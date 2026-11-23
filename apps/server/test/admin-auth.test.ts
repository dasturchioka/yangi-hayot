import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin, createAdmin } from './support/admin';
import { createTestApp, type TestApp } from './support/test-app';

describe('Admin-panel login', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const login = (login: string, password: string) =>
    t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { login, password } });
  const me = (headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'GET', url: '/admin/api/auth/me', headers });

  it('logs in with login and password and tells who is logged in', async () => {
    await createAdmin(t, { login: 'dilnoza', password: 'kuchli-parol-1', rol: 'menejer', nomi: 'Dilnoza' });

    const res = await login('dilnoza', 'kuchli-parol-1');
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);

    const who = await me({ cookie: cookie.split(';')[0]! });
    expect(who.statusCode).toBe(200);
    expect(who.json().admin).toMatchObject({ login: 'dilnoza', nomi: 'Dilnoza', rol: 'menejer' });
  });

  it('rejects a wrong password and an unknown login the same way', async () => {
    await createAdmin(t, { login: 'dilnoza', password: 'kuchli-parol-1', rol: 'menejer' });

    const wrong = await login('dilnoza', 'boshqa-parol');
    const unknown = await login('nobody', 'kuchli-parol-1');

    expect([wrong.statusCode, unknown.statusCode]).toEqual([401, 401]);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('requires a session for admin routes', async () => {
    expect((await me()).statusCode).toBe(401);
    expect((await me({ cookie: 'yh_admin=forged' })).statusCode).toBe(401);
  });

  it('ends the session on logout', async () => {
    const headers = await adminLogin(t, 'administrator');

    expect((await t.app.inject({ method: 'POST', url: '/admin/api/auth/logout', headers })).statusCode).toBe(200);
    expect((await me(headers)).statusCode).toBe(401);
  });

  it('expires a session after 7 days', async () => {
    const headers = await adminLogin(t, 'administrator');
    t.clock.advance({ days: 7, minutes: 1 });

    expect((await me(headers)).statusCode).toBe(401);
  });

  it('locks a login for 15 minutes after 5 wrong passwords', async () => {
    await createAdmin(t, { login: 'dilnoza', password: 'kuchli-parol-1', rol: 'menejer' });
    for (let i = 0; i < 5; i++) await login('dilnoza', 'xato');

    expect((await login('dilnoza', 'kuchli-parol-1')).statusCode).toBe(429);
    t.clock.advance({ minutes: 15 });
    expect((await login('dilnoza', 'kuchli-parol-1')).statusCode).toBe(200);
  });
});
