import type { AdminDto, AdminRol } from '@yh/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { adminBySession } from '../admin/accounts';
import type { Clock } from '../clock';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAdmin` on admin-panel routes: the logged-in user. */
    admin: AdminDto;
    /** Raw session token of that user (for logout). */
    adminToken: string;
  }
}

/** Session cookie of the admin-panel. HttpOnly, SameSite=Strict, Path=/admin. */
export const ADMIN_COOKIE = 'yh_admin';

export function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${ADMIN_COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/**
 * Registers a preHandler that accepts only requests with a live admin-panel
 * session (cookie `yh_admin`) of an active user and sets `req.admin`.
 * Register it inside the plugin scope that holds the admin routes; narrow a
 * route to roles with `{ preHandler: onlyRol('administrator') }`.
 */
export function requireAdmin(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock }) {
  app.decorateRequest('admin', null as unknown as AdminDto);
  app.decorateRequest('adminToken', '');
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = readCookie(req, ADMIN_COOKIE);
    const admin = token ? await adminBySession(deps.db, token, deps.clock.now()) : null;
    if (!token || !admin) return reply.code(401).send({ error: 'unauthorized' });
    req.admin = admin;
    req.adminToken = token;
  });
}

/** Route-level preHandler: 403 unless the logged-in user has one of the roles. Use after `requireAdmin`. */
export function onlyRol(...rollar: AdminRol[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!rollar.includes(req.admin.rol)) return reply.code(403).send({ error: 'forbidden' });
  };
}
