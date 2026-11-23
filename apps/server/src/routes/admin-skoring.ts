import { KVIZ_MUDDATLARI, KVIZ_TOLOV_USULLARI, type SkoringQoidalari, type SkoringResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { getSetting, setSetting } from '../settings/settings';

/** Ball of one rule: whole number, may be negative (e.g. «Hali bilmayman» −10). */
const Ball = z.number().int().min(-100).max(100);
const record = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, Ball])) as Record<K, typeof Ball>);

export const SkoringBody = z
  .object({
    muddat: record(KVIZ_MUDDATLARI),
    tolov: record(KVIZ_TOLOV_USULLARI),
    byudjet: Ball,
    kalkulyator: z.object({ hisobladi: Ball, yubordi: Ball }),
    yozilish: Ball,
    qaytish: z.object({ har: Ball, max: z.number().int().min(0).max(30) }),
    chegara: z.object({ iliq: z.number().int().min(1).max(500), issiq: z.number().int().min(1).max(500) }),
    issiqVazifaDaqiqa: z.number().int().min(1).max(240),
  })
  .strict()
  .refine((q) => q.chegara.iliq < q.chegara.issiq, { message: 'iliq must be below issiq', path: ['chegara'] });

/** Ball qoidalari of the lead skoringi (UF-4, #18). Administrator only (mounted in an onlyRol scope). */
export async function adminSkoringRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'clock'>) {
  app.get('/skoring', async (): Promise<SkoringResponse> => ({ qoidalar: await getSetting(deps.db, 'skoring') }));

  app.put('/skoring', async (req, reply) => {
    const body = SkoringBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request', issues: body.error.issues });
    const qoidalar: SkoringQoidalari = body.data;
    // Applies from the next Ariza or action of each Mijoz; existing Darajalar are not recomputed in bulk.
    await setSetting(deps.db, 'skoring', qoidalar, deps.clock.now());
    const res: SkoringResponse = { qoidalar };
    return res;
  });
}
