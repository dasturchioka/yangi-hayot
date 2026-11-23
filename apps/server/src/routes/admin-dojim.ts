import { DOJIM_MATN_MAX, type DojimSozlamalari } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { getSetting, setSetting } from '../settings/settings';

const Matn = z.string().trim().min(1).max(DOJIM_MATN_MAX);
const Ssenariy = z.object({ yoqilgan: z.boolean(), matn: z.object({ uz: Matn, ru: Matn }) });
const Body = z.object({ korish: Ssenariy, sevimliBand: Ssenariy, kelmadi: Ssenariy, keldi: Ssenariy });

/** Dojim texts RU/UZ and on/off per ssenariy (#17). Mounted in an Administrator-only scope. */
export async function adminDojimRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'clock'>) {
  app.get('/dojim', async (): Promise<DojimSozlamalari> => getSetting(deps.db, 'dojim'));

  app.put('/dojim', async (req, reply) => {
    const body = Body.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const value: DojimSozlamalari = body.data;
    await setSetting(deps.db, 'dojim', value, deps.clock.now());
    return value;
  });
}
