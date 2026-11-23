import { LANGS, SHAHARLAR, type LoyihaResponse, type LoyihalarResponse, type PlanirovkaResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Katalog } from '../katalog/katalog';

const ListQuery = z.object({
  shahar: z.enum(SHAHARLAR).optional(),
  lang: z.enum(LANGS).default('uz'),
});
const LangQuery = z.object({ lang: z.enum(LANGS).default('uz') });
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Katalog read routes. Mounted twice with different auth: under /api/katalog
 * for the Mini App (initData) and under /ai/katalog for the AI-menejer (API key),
 * so both read the same data the same way.
 */
export async function katalogRoutes(app: FastifyInstance, katalog: Katalog) {
  app.get('/loyihalar', async (req, reply): Promise<LoyihalarResponse | void> => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    return { loyihalar: await katalog.loyihalar(q.data) };
  });

  app.get('/loyihalar/:id', async (req, reply): Promise<LoyihaResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const q = LangQuery.safeParse(req.query);
    if (!p.success || !q.success) return reply.code(404).send({ error: 'not_found' });
    const loyiha = await katalog.loyiha(p.data.id, q.data.lang);
    if (!loyiha) return reply.code(404).send({ error: 'not_found' });
    return { loyiha };
  });

  app.get('/planirovkalar/:id', async (req, reply): Promise<PlanirovkaResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const q = LangQuery.safeParse(req.query);
    if (!p.success || !q.success) return reply.code(404).send({ error: 'not_found' });
    const planirovka = await katalog.planirovka(p.data.id, q.data.lang);
    if (!planirovka) return reply.code(404).send({ error: 'not_found' });
    return { planirovka };
  });
}
