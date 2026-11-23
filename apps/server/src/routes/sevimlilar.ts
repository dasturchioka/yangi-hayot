import { LANGS, TAQQOSLASH_MAX, type SevimlilarResponse, type TaqqoslashResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Clock } from '../clock';
import { ensureMijoz } from '../mijoz/mijoz';
import type { Sevimlilar } from '../sevimlilar/sevimlilar';

const LangQuery = z.object({ lang: z.enum(LANGS).default('uz') });
const Id = z.coerce.number().int().positive().max(2_147_483_647);
const IdParams = z.object({ id: Id });
/** `ids=1,2,3`; a long list is cut early (the limit check needs only the distinct count). */
const TaqqoslashQuery = z.object({
  ids: z
    .string()
    .max(200)
    .transform((s) => s.split(',').filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().positive().max(2_147_483_647)).min(1)),
  lang: z.enum(LANGS).default('uz'),
});

/** Mini App sevimlilar. Register inside a scope guarded by `requireMiniAppUser`. */
export async function sevimlilarRoutes(
  app: FastifyInstance,
  deps: { db: pg.Pool; clock: Clock; sevimlilar: Sevimlilar },
) {
  app.get('/sevimlilar', async (req, reply): Promise<SevimlilarResponse | void> => {
    const q = LangQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    return { planirovkalar: await deps.sevimlilar.list(String(req.telegramUser.id), q.data.lang) };
  });

  app.get('/taqqoslash', async (req, reply): Promise<TaqqoslashResponse | void> => {
    const q = TaqqoslashQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    const ids = [...new Set(q.data.ids)];
    if (ids.length > TAQQOSLASH_MAX) return reply.code(400).send({ error: 'taqqoslash_3_tadan_kop' });
    return { planirovkalar: await deps.sevimlilar.taqqosla(ids, q.data.lang) };
  });

  app.put('/sevimlilar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    const now = deps.clock.now();
    const m = await ensureMijoz(deps.db, req.telegramUser, now);
    if (!(await deps.sevimlilar.add(m.telegramId, p.data.id, now))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.code(204).send();
  });

  app.delete('/sevimlilar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    if (p.success) await deps.sevimlilar.remove(String(req.telegramUser.id), p.data.id);
    return reply.code(204).send();
  });
}
