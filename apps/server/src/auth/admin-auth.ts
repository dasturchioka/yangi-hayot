import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * TEMPORARY admin-panel auth until #5 (login, roles Administrator / Menejer):
 * one shared token, `Authorization: Bearer <ADMIN_API_TOKEN>`. No token
 * configured → every admin request is refused.
 *
 * #5 replaces this function (same shape: a Fastify preHandler) with a
 * session check and per-route roles; Rassilka routes need «Administrator».
 */
export function requireAdmin(token: string | undefined) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !given || !same(given, token)) return reply.code(401).send({ error: 'unauthorized' });
  };
}

function same(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}
