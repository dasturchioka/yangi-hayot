import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Registers a preHandler that accepts only `Authorization: Bearer <AI_API_KEY>`.
 * Used by the AI-menejer (separate contract) to read the Katalog. Without a
 * configured key every request is rejected.
 */
export function requireAiKey(app: FastifyInstance, apiKey: string | undefined) {
  app.addHook('preHandler', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!apiKey || !given || !timingSafeEqual(digest(given), digest(apiKey))) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
