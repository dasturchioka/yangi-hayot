import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { addDays, toTashkent } from '../clock';
import { voronka } from '../hodisa/voronka';
import { getSetting, setSetting } from '../settings/settings';
import { Sana } from './admin-yozilish';

const Body = z.object({
  qabulQiluvchilar: z.array(z.string().trim().regex(/^-?\d{1,20}$/)).max(10),
});

const VoronkaQuery = z.object({
  dan: Sana.optional(),
  gacha: Sana.optional(),
  manba: z.string().trim().min(1).max(200).optional(),
  loyihaId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
});
/** Longest period the funnel is asked for at once. */
const VORONKA_MAX_KUN = 366;

/**
 * Where the 19:30 daily / Monday weekly report goes (#15). Administrator only.
 * Empty list = the managers group.
 */
export async function adminHisobotRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'clock'>) {
  // Funnel (UF-7, #20): default — the last 7 days including today.
  app.get('/voronka', async (req, reply) => {
    const q = VoronkaQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    const today = toTashkent(deps.clock.now()).date;
    const gacha = q.data.gacha ?? (q.data.dan && q.data.dan > today ? q.data.dan : today);
    const dan = q.data.dan ?? addDays(gacha, -6);
    if (dan > gacha || addDays(dan, VORONKA_MAX_KUN) <= gacha) return reply.code(400).send({ error: 'bad_period' });
    return voronka(deps.db, { dan, gacha, manba: q.data.manba ?? null, loyihaId: q.data.loyihaId ?? null });
  });

  app.get('/hisobot-sozlamalari', async () => getSetting(deps.db, 'hisobot'));

  app.put('/hisobot-sozlamalari', async (req, reply) => {
    const body = Body.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const value = { qabulQiluvchilar: [...new Set(body.data.qabulQiluvchilar)] };
    await setSetting(deps.db, 'hisobot', value, deps.clock.now());
    return value;
  });
}
