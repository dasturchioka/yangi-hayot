import type { ArizaCreatedResponse, ArizalarResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Arizalar } from '../ariza/ariza';
import { ArizaKontekstError, ArizaRateLimitError } from '../ariza/ariza';
import { knownPhone } from '../ariza/legacy';
import { normalizePhone } from '../ariza/phone';
import type { Clock } from '../clock';
import { manbaFromStartParam } from '../mijoz/manba';
import { ensureMijoz } from '../mijoz/mijoz';
import type pg from 'pg';

const FormBody = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(40),
  loyihaId: z.number().int().positive().optional(),
  planirovkaId: z.number().int().positive().optional(),
});

/**
 * Mini App: «Ariza qoldirish» form and the Mijoz's own Arizalar. Mounted
 * under /api/arizalar inside a scope that requires initData.
 */
export async function arizaRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock; arizalar: Arizalar }) {
  app.post('/', async (req, reply) => {
    const body = FormBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const phone = normalizePhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: 'phone' });

    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: manbaFromStartParam(req.startParam),
    });
    try {
      const created = await deps.arizalar.create({
        tur: 'form',
        telegramId: mijoz.telegramId,
        name: body.data.name,
        phone,
        loyihaId: body.data.loyihaId,
        planirovkaId: body.data.planirovkaId,
      });
      const res: ArizaCreatedResponse = { id: created.id };
      return reply.code(created.duplicate ? 200 : 201).send(res);
    } catch (error) {
      if (error instanceof ArizaKontekstError) return reply.code(400).send({ error: 'kontekst' });
      if (error instanceof ArizaRateLimitError) return reply.code(429).send({ error: 'rate_limited' });
      throw error;
    }
  });

  app.get('/', async (req): Promise<ArizalarResponse> => {
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now());
    return {
      kontakt: { name: mijoz.name, phone: await knownPhone(deps.db, mijoz.telegramId) },
      arizalar: await deps.arizalar.ofMijoz(mijoz.telegramId),
    };
  });
}
