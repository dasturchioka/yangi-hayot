import type { AdminRol } from '@yh/shared';
import { createAdminUser } from '../../src/admin/accounts';
import type { TestApp } from './test-app';

let seq = 0;

/** Creates an admin-panel user directly (as the `admin:create` CLI does). */
export async function createAdmin(
  t: TestApp,
  u: { login?: string; password?: string; rol: AdminRol; nomi?: string },
) {
  seq += 1;
  const login = u.login ?? `${u.rol}${seq}`;
  return createAdminUser(
    t.db,
    { login, password: u.password ?? TEST_ADMIN_PASSWORD, rol: u.rol, nomi: u.nomi ?? login },
    t.clock.now(),
  );
}

export const TEST_ADMIN_PASSWORD = 'test-parol-123';

/**
 * Creates a user with the role and logs in through the API. Returns headers
 * to pass to `t.app.inject` for any route behind `requireAdmin`:
 *
 *   const headers = await adminLogin(t, 'menejer');
 *   await t.app.inject({ method: 'GET', url: '/admin/api/...', headers });
 */
export async function adminLogin(
  t: TestApp,
  rol: AdminRol,
  u: { login?: string; nomi?: string } = {},
): Promise<{ cookie: string }> {
  const user = await createAdmin(t, { rol, ...u });
  const res = await t.app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    payload: { login: user.login, password: TEST_ADMIN_PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`admin login failed: ${res.statusCode} ${res.body}`);
  return { cookie: String(res.headers['set-cookie']).split(';')[0]! };
}
