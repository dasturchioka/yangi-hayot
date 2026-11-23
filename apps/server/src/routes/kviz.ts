import {
  KVIZ_MUDDATLARI,
  KVIZ_TOLOV_USULLARI,
  KVIZ_TURLARI,
  SHAHARLAR,
  type KvizJavoblari,
  type KvizResponse,
} from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Arizalar } from '../ariza/ariza';
import { ArizaRateLimitError } from '../ariza/ariza';
import { normalizePhone } from '../ariza/phone';
import type { Clock } from '../clock';
import { kvizFiltri, kvizIzohi } from '../kviz/kviz';
import { manbaFromStartParam } from '../mijoz/manba';
import { ensureMijoz } from '../mijoz/mijoz';
import { recordShaharQiziqish } from '../mijoz/shahar-qiziqish';

const Narx = z.number().int().nonnegative().max(1e13).nullable();
const Body = z.object({
  shahar: z.enum(SHAHARLAR),
  tur: z.enum(KVIZ_TURLARI),
  xonalar: z.array(z.number().int().min(1).max(4)).min(1).max(4),
  byudjet: z.object({ dan: Narx, gacha: Narx }).nullable(),
  muddat: z.enum(KVIZ_MUDDATLARI),
  tolov: z.enum(KVIZ_TOLOV_USULLARI),
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(40),
});

/**
 * POST /api/kviz — last step of «Xonadon tanlash»: the answers and the
 * contact. Creates a bot_quiz Ariza (8-bo'lim), records Shaharga qiziqish,
 * answers with the filter of matching Planirovkalar.
 */
export async function kvizRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock; arizalar: Arizalar }) {
  app.post('/', async (req, reply) => {
    const body = Body.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const phone = normalizePhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: 'phone' });
    const { name, phone: _raw, ...rest } = body.data;
    const javoblar: KvizJavoblari = { ...rest, xonalar: [...new Set(rest.xonalar)].sort((a, b) => a - b) };

    const now = deps.clock.now();
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, now, { manba: manbaFromStartParam(req.startParam) });
    await recordShaharQiziqish(deps.db, mijoz.telegramId, javoblar.shahar, 'kviz', now);
    try {
      const created = await deps.arizalar.create({
        tur: 'quiz',
        telegramId: mijoz.telegramId,
        name,
        phone,
        izoh: kvizIzohi(javoblar),
        payload: { kviz: javoblar },
      });
      const res: KvizResponse = { id: created.id, filtr: kvizFiltri(javoblar) };
      return reply.code(created.duplicate ? 200 : 201).send(res);
    } catch (error) {
      if (error instanceof ArizaRateLimitError) return reply.code(429).send({ error: 'rate_limited' });
      throw error;
    }
  });
}
