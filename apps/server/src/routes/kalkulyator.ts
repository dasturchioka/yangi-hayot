import type { ArizaCreatedResponse, KalkulyatorResponse } from '@yh/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { ArizaKontekstError, ArizaRateLimitError } from '../ariza/ariza';
import { normalizePhone } from '../ariza/phone';
import { KalkulyatorKirishError, type Kalkulyator } from '../kalkulyator/kalkulyator';
import { manbaFromStartParam } from '../mijoz/manba';
import { ensureMijoz } from '../mijoz/mijoz';
import { getSetting, setSetting } from '../settings/settings';

const Foiz = z.number().min(0).max(100);
const Som = z.number().int().min(0).max(1e13);

export const SozlamaBody = z.object({
  muddatli: z.object({
    yoqilgan: z.boolean(),
    minBoshlangichFoiz: Foiz,
    maxMuddatOy: z.number().int().min(1).max(240),
    ustamaFoiz: Foiz,
  }),
  banklar: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,32}$/),
        nomi: z.string().trim().min(1).max(60),
        stavka: z.number().gt(0).lt(100),
        minBoshlangichFoiz: Foiz.lt(100),
        muddatlarYil: z
          .array(z.number().int().min(1).max(40))
          .min(1)
          .max(10)
          .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
      }),
    )
    .min(1)
    .max(20)
    .refine((b) => new Set(b.map((x) => x.id)).size === b.length, 'bank ids must be unique'),
});

const Kirish = z.discriminatedUnion('sxema', [
  z.object({ sxema: z.literal('muddatli'), narx: Som, boshlangich: Som, oylar: z.number().int() }),
  z.object({
    sxema: z.enum(['annuitet', 'differensial']),
    narx: Som,
    boshlangich: Som,
    yillar: z.number().int(),
    bankId: z.string().max(32).optional(),
    stavka: z.number().optional(),
  }),
]);

const HisobBody = z.object({ kirish: Kirish, planirovkaId: z.number().int().positive().optional() });
const ArizaBody = HisobBody.extend({ name: z.string().trim().min(1).max(100), phone: z.string().max(40) });

function kirishXatosi(reply: FastifyReply, error: unknown) {
  if (error instanceof KalkulyatorKirishError) return reply.code(400).send({ error: 'kirish', xatolar: error.xatolar });
  if (error instanceof ArizaKontekstError) return reply.code(400).send({ error: 'kontekst' });
  if (error instanceof ArizaRateLimitError) return reply.code(429).send({ error: 'rate_limited' });
  throw error;
}

/** Mini App (initData scope): settings, «hisobladi» and «Hisobni menejerga yuborish». */
export async function kalkulyatorRoutes(
  app: FastifyInstance,
  deps: Pick<AppDeps, 'db' | 'clock'> & { kalkulyator: Kalkulyator },
) {
  app.get('/kalkulyator', async (): Promise<KalkulyatorResponse> => ({
    sozlama: await getSetting(deps.db, 'kalkulyator'),
  }));

  app.post('/kalkulyator/hisob', async (req, reply) => {
    const body = HisobBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: manbaFromStartParam(req.startParam),
    });
    try {
      await deps.kalkulyator.hisob(mijoz.telegramId, body.data.kirish, body.data.planirovkaId);
      return reply.code(204).send();
    } catch (error) {
      return kirishXatosi(reply, error);
    }
  });

  app.post('/kalkulyator/ariza', async (req, reply) => {
    const body = ArizaBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const phone = normalizePhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: 'phone' });
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: manbaFromStartParam(req.startParam),
    });
    try {
      const created = await deps.kalkulyator.ariza({
        telegramId: mijoz.telegramId,
        name: body.data.name,
        phone,
        kirish: body.data.kirish,
        planirovkaId: body.data.planirovkaId,
      });
      const res: ArizaCreatedResponse = { id: created.id };
      return reply.code(created.duplicate ? 200 : 201).send(res);
    } catch (error) {
      return kirishXatosi(reply, error);
    }
  });
}

/** Admin-panel (Administrator only): muddatli to'lov terms and ipoteka banks. */
export async function adminKalkulyatorRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'clock'>) {
  app.get('/kalkulyator', async (): Promise<KalkulyatorResponse> => ({
    sozlama: await getSetting(deps.db, 'kalkulyator'),
  }));

  app.put('/kalkulyator', async (req, reply) => {
    const body = SozlamaBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    await setSetting(deps.db, 'kalkulyator', body.data, deps.clock.now());
    const res: KalkulyatorResponse = { sozlama: body.data };
    return res;
  });
}
