import { ADMIN_ROLLAR, type AdminDto, type AdminMeResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAdminUser,
  listAdminUsers,
  LoginTakenError,
  LoginThrottle,
  login,
  logout,
  MIN_PASSWORD_LENGTH,
  SESSION_TTL_MS,
  updateAdminUser,
} from '../admin/accounts';
import { onlyRol, requireAdmin, sessionCookie } from '../auth/admin-auth';
import type { AppDeps } from '../app';

const LoginBody = z.object({ login: z.string().min(1).max(64), password: z.string().min(1).max(256) });
const Password = z.string().min(MIN_PASSWORD_LENGTH).max(256);
const CreateUserBody = z.object({
  login: z.string().regex(/^[a-zA-Z0-9._-]{3,32}$/),
  nomi: z.string().trim().min(1).max(100),
  rol: z.enum(ADMIN_ROLLAR),
  password: Password,
});
const UpdateUserBody = z
  .object({
    nomi: z.string().trim().min(1).max(100),
    rol: z.enum(ADMIN_ROLLAR),
    faol: z.boolean(),
    password: Password,
  })
  .partial();
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** /admin/api: login, logout, who am I, and (Administrator) the list of admin-panel users. */
export async function adminAuthRoutes(app: FastifyInstance, deps: AppDeps) {
  const throttle = new LoginThrottle();

  app.post('/auth/login', async (req, reply): Promise<AdminMeResponse | void> => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const now = deps.clock.now();
    if (throttle.locked(body.data.login, now)) return reply.code(429).send({ error: 'too_many_attempts' });

    const session = await login(deps.db, body.data.login, body.data.password, now);
    if (!session) {
      throttle.fail(body.data.login, now);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    throttle.reset(body.data.login);
    reply.header('set-cookie', sessionCookie(session.token, SESSION_TTL_MS / 1000));
    return { admin: session.admin };
  });

  app.register(async (scope) => {
    requireAdmin(scope, deps);

    scope.get('/auth/me', async (req): Promise<AdminMeResponse> => ({ admin: req.admin }));

    scope.post('/auth/logout', async (req, reply) => {
      await logout(deps.db, req.adminToken);
      reply.header('set-cookie', sessionCookie('', 0));
      return { ok: true };
    });

    scope.get('/users', { preHandler: onlyRol('administrator') }, async (): Promise<{ users: AdminDto[] }> => ({
      users: await listAdminUsers(deps.db),
    }));

    scope.post('/users', { preHandler: onlyRol('administrator') }, async (req, reply) => {
      const body = CreateUserBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      try {
        return { user: await createAdminUser(deps.db, body.data, deps.clock.now()) };
      } catch (err) {
        if (err instanceof LoginTakenError) return reply.code(409).send({ error: 'login_taken' });
        throw err;
      }
    });

    scope.patch('/users/:id', { preHandler: onlyRol('administrator') }, async (req, reply) => {
      const p = IdParams.safeParse(req.params);
      const body = UpdateUserBody.safeParse(req.body);
      if (!p.success || !body.success) return reply.code(400).send({ error: 'bad_request' });
      // An Administrator cannot lock themselves out.
      if (p.data.id === req.admin.id && (body.data.faol === false || body.data.rol === 'menejer')) {
        return reply.code(409).send({ error: 'cannot_demote_self' });
      }
      const user = await updateAdminUser(deps.db, p.data.id, body.data, deps.clock.now());
      if (!user) return reply.code(404).send({ error: 'not_found' });
      return { user };
    });
  });
}
