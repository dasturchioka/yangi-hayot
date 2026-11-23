import { LANGS, parseTaqqoslashKaliti, TAQQOSLASH_MAX, type SevimlilarResponse, type TaqqoslashResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Clock } from '../clock';
import { ensureMijoz } from '../mijoz/mijoz';
import type { Sevimlilar } from '../sevimlilar/sevimlilar';

const LangQuery = z.object({ lang: z.enum(LANGS).default('uz') });
const Id = z.coerce.number().int().positive().max(2_147_483_647);
const IdParams = z.object({ id: Id });
/** `ids=x12,p5,7` (x = Xonadon, p or bare = Planirovka); a long list is cut early (the limit check needs only the distinct count). */
const Kalit = z.string().transform((s, ctx) => parseTaqqoslashKaliti(s) ?? (ctx.addIssue({ code: 'custom' }), z.NEVER));
const TaqqoslashQuery = z.object({
  ids: z
    .string()
    .max(200)
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(Kalit).min(1)),
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
    return deps.sevimlilar.list(String(req.telegramUser.id), q.data.lang);
  });

  app.get('/taqqoslash', async (req, reply): Promise<TaqqoslashResponse | void> => {
    const q = TaqqoslashQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    const seen = new Set<string>();
    const kalitlar = q.data.ids.filter((k) => !seen.has(`${k.tur}${k.id}`) && seen.add(`${k.tur}${k.id}`));
    if (kalitlar.length > TAQQOSLASH_MAX) return reply.code(400).send({ error: 'taqqoslash_3_tadan_kop' });
    return { ustunlar: await deps.sevimlilar.taqqosla(kalitlar, q.data.lang) };
  });

  app.put('/sevimlilar/xonadonlar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'not_found' });
    const now = deps.clock.now();
    const m = await ensureMijoz(deps.db, req.telegramUser, now);
    if (!(await deps.sevimlilar.addXonadon(m.telegramId, p.data.id, now))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.code(204).send();
  });

  app.delete('/sevimlilar/xonadonlar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    if (p.success) await deps.sevimlilar.removeXonadon(String(req.telegramUser.id), p.data.id);
    return reply.code(204).send();
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
