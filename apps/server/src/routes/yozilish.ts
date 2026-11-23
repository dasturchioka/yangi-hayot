import type { Lang, YozilishlarResponse, YozilishResponse, YozilishSlotlarResponse } from '@yh/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ArizaKontekstError, ArizaRateLimitError } from '../ariza/ariza';
import { normalizePhone } from '../ariza/phone';
import type { Clock } from '../clock';
import type { Dojim } from '../dojim/dojim';
import { manbaFromStartParam } from '../mijoz/manba';
import { ensureMijoz } from '../mijoz/mijoz';
import { getSetting } from '../settings/settings';
import { slotlar } from '../yozilish/slotlar';
import {
  YozilishHolatError,
  YozilishNotFoundError,
  YozilishSlotError,
  type Yozilishlar,
} from '../yozilish/yozilish';

const Sana = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Vaqt = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Id = z.number().int().positive().max(2_147_483_647);

const CreateBody = z.object({
  loyihaId: Id,
  planirovkaId: Id.optional(),
  xonadonId: Id.optional(),
  sana: Sana,
  vaqt: Vaqt,
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(40),
  /** The dojim whose button opened this Mini App launch (#17): the booking counts as «dojimdan». */
  dojimId: Id.optional(),
});
const KochirishBody = z.object({ sana: Sana, vaqt: Vaqt });
const IdParams = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
const LangQuery = z.object({ lang: z.enum(['uz', 'ru']).default('uz') });

/** Maps the booking errors to HTTP answers; anything else is rethrown. */
export function yozilishError(reply: FastifyReply, error: unknown) {
  if (error instanceof YozilishSlotError) return reply.code(409).send({ error: 'slot' });
  if (error instanceof YozilishHolatError) return reply.code(409).send({ error: error.code });
  if (error instanceof YozilishNotFoundError) return reply.code(404).send({ error: 'not_found' });
  if (error instanceof ArizaKontekstError) return reply.code(400).send({ error: 'kontekst' });
  if (error instanceof ArizaRateLimitError) return reply.code(429).send({ error: 'rate_limited' });
  throw error;
}

/** Mini App: «Ko'rishga yozilish» (TZ 2-b.). Mounted under /api inside an initData scope. */
export async function yozilishRoutes(
  app: FastifyInstance,
  deps: { db: pg.Pool; clock: Clock; yozilishlar: Yozilishlar; dojim?: Pick<Dojim, 'yozilishgaBogla'> },
) {
  const { yozilishlar } = deps;
  const lang = (q: unknown): Lang => LangQuery.safeParse(q).data?.lang ?? 'uz';

  app.get('/yozilish/slotlar', async (): Promise<YozilishSlotlarResponse> => ({
    kunlar: slotlar(deps.clock.now(), await getSetting(deps.db, 'yozilish')),
  }));

  app.post('/yozilishlar', async (req, reply) => {
    const body = CreateBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const phone = normalizePhone(body.data.phone);
    if (!phone) return reply.code(400).send({ error: 'phone' });
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: manbaFromStartParam(req.startParam),
    });
    try {
      const { dojimId, ...input } = body.data;
      const { id, duplicate } = await yozilishlar.create({ ...input, telegramId: mijoz.telegramId, phone });
      if (dojimId) await deps.dojim?.yozilishgaBogla(mijoz.telegramId, id, dojimId);
      const res: YozilishResponse = { yozilish: (await yozilishlar.get(mijoz.telegramId, id, lang(req.query)))! };
      return reply.code(duplicate ? 200 : 201).send(res);
    } catch (error) {
      return yozilishError(reply, error);
    }
  });

  app.get('/yozilishlar', async (req): Promise<YozilishlarResponse> => {
    const mijoz = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now());
    return { yozilishlar: await yozilishlar.ofMijoz(mijoz.telegramId, lang(req.query)) };
  });

  app.get('/yozilishlar/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const y = await yozilishlar.get(String(req.telegramUser.id), params.data.id, lang(req.query));
    if (!y) return reply.code(404).send({ error: 'not_found' });
    return { yozilish: y } satisfies YozilishResponse;
  });

  app.post('/yozilishlar/:id/kochirish', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const body = KochirishBody.safeParse(req.body);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const telegramId = String(req.telegramUser.id);
    try {
      await yozilishlar.kochir(telegramId, params.data.id, body.data.sana, body.data.vaqt);
    } catch (error) {
      return yozilishError(reply, error);
    }
    return { yozilish: (await yozilishlar.get(telegramId, params.data.id, lang(req.query)))! } satisfies YozilishResponse;
  });

  app.post('/yozilishlar/:id/bekor', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const telegramId = String(req.telegramUser.id);
    try {
      await yozilishlar.bekor(telegramId, params.data.id);
    } catch (error) {
      return yozilishError(reply, error);
    }
    return { yozilish: (await yozilishlar.get(telegramId, params.data.id, lang(req.query)))! } satisfies YozilishResponse;
  });
}
