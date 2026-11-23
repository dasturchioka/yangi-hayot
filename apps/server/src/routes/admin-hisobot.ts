import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { getSetting, setSetting } from '../settings/settings';

const Body = z.object({
  qabulQiluvchilar: z.array(z.string().trim().regex(/^-?\d{1,20}$/)).max(10),
});

/**
 * Where the 19:30 daily / Monday weekly report goes (#15). Administrator only.
 * Empty list = the managers group.
 */
export async function adminHisobotRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'clock'>) {
  app.get('/hisobot-sozlamalari', async () => getSetting(deps.db, 'hisobot'));

  app.put('/hisobot-sozlamalari', async (req, reply) => {
    const body = Body.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const value = { qabulQiluvchilar: [...new Set(body.data.qabulQiluvchilar)] };
    await setSetting(deps.db, 'hisobot', value, deps.clock.now());
    return value;
  });
}
