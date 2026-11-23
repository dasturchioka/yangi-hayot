import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { createTestApp, type TestApp } from './support/test-app';

describe('Admin-panel users', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, headers: { cookie: string }, payload?: object) =>
    t.app.inject({ method, url: `/admin/api${url}`, headers, payload });
  const login = (login: string, password: string) =>
    t.app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: { login, password } });

  it('lets an Administrator add a Menejer who can then log in', async () => {
    const admin = await adminLogin(t, 'administrator');

    const res = await call('POST', '/users', admin, { login: 'Sardor', nomi: 'Sardor', rol: 'menejer', password: 'yangi-parol-1' });
    expect(res.statusCode).toBe(200);

    const logged = await login('sardor', 'yangi-parol-1');
    expect(logged.json().admin).toMatchObject({ login: 'sardor', rol: 'menejer' });
    expect((await call('POST', '/users', admin, { login: 'sardor', nomi: 'X', rol: 'menejer', password: 'yangi-parol-1' })).statusCode).toBe(409);
  });

  it('logs out and locks out a deactivated user', async () => {
    const admin = await adminLogin(t, 'administrator');
    const menejer = await adminLogin(t, 'menejer', { login: 'ketgan' });
    const me = (await call('GET', '/auth/me', menejer)).json().admin;

    expect((await call('PATCH', `/users/${me.id}`, admin, { faol: false })).statusCode).toBe(200);

    expect((await call('GET', '/auth/me', menejer)).statusCode).toBe(401);
    expect((await login('ketgan', 'test-parol-123')).statusCode).toBe(401);
  });

  it('does not let a Menejer manage users', async () => {
    const menejer = await adminLogin(t, 'menejer');

    expect((await call('GET', '/users', menejer)).statusCode).toBe(403);
    expect((await call('POST', '/users', menejer, { login: 'boss', nomi: 'B', rol: 'administrator', password: 'yangi-parol-1' })).statusCode).toBe(403);
  });

  it('does not let an Administrator deactivate themselves', async () => {
    const admin = await adminLogin(t, 'administrator');
    const me = (await call('GET', '/auth/me', admin)).json().admin;

    expect((await call('PATCH', `/users/${me.id}`, admin, { faol: false })).statusCode).toBe(409);
  });
});
