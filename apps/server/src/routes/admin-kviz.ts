import type { KvizByudjetSozlamasi } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { Katalog } from '../katalog/katalog';
import { avtomatikByudjet, byudjetXatosi } from '../kviz/byudjet';
import { getSetting, setSetting } from '../settings/settings';

const Narx = z.number().int().nonnegative().max(1e13).nullable();
const Body = z.object({
  qolda: z.array(z.object({ dan: Narx, gacha: Narx })).nullable(),
});

/**
 * Admin-panel «Matnlar va sozlamalar» → kviz budget answers (#10). Mounted
 * under /admin/api in a scope that allows the Administrator only.
 */
export async function adminKvizRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock }, katalog: Katalog) {
  async function current(): Promise<KvizByudjetSozlamasi> {
    return {
      qolda: await getSetting(deps.db, 'kvizByudjet'),
      avtomatik: avtomatikByudjet((await katalog.filtrVariantlari()).narx),
    };
  }

  app.get('/kviz/byudjet', current);

  app.put('/kviz/byudjet', async (req, reply) => {
    const body = Body.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const { qolda } = body.data;
    const xato = qolda && byudjetXatosi(qolda);
    if (xato) return reply.code(400).send({ error: xato });
    await setSetting(deps.db, 'kvizByudjet', qolda, deps.clock.now());
    return current();
  });
}
