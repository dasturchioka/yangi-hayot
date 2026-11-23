import { createHash, timingSafeEqual } from 'node:crypto';
import type { BotEventResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { handleBotEvent } from '../bot/bot';
import type { Skoring } from '../skoring/skoring';

const BotUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

const BotEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), payload: z.string().optional() }),
  z.object({ type: z.literal('command'), name: z.string() }),
  z.object({ type: z.literal('callback'), data: z.string() }),
  z.object({
    type: z.literal('message'),
    message: z.object({
      messageId: z.number().int(),
      kind: z.enum(['text', 'voice', 'photo', 'video', 'other']),
      text: z.string().optional(),
      fileId: z.string().optional(),
    }),
  }),
]);

const BotEventRequestSchema = z.object({ user: BotUserSchema, event: BotEventSchema });

function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * Internal API for apps/bot. Mounted under /internal/bot; every request must
 * carry `Authorization: Bearer <BOT_API_SECRET>`. Not for the Mini App.
 */
export async function botInternalRoutes(app: FastifyInstance, deps: AppDeps & { skoring: Skoring }) {
  app.addHook('preHandler', async (req, reply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !sameSecret(token, deps.config.botApiSecret)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.post('/events', async (req, reply): Promise<BotEventResponse | void> => {
    const parsed = BotEventRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const actions = await handleBotEvent(deps, parsed.data.user, parsed.data.event);
    // /start of a known Mijoz on a new day is a re-entry (UF-4).
    if (parsed.data.event.type === 'start') await deps.skoring.kirish(String(parsed.data.user.id));
    return { actions };
  });
}
