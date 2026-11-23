import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import {
  AUDIENCES,
  cancelDraft,
  confirmRassilka,
  contentTooLong,
  countAudience,
  createDraft,
  getRassilka,
  listRassilkalar,
  MAX_CAPTION,
  MAX_TEXT,
} from '../rassilka/rassilka';

const ContentSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_TEXT),
    media: z
      .object({
        kind: z.enum(['photo', 'video']),
        /** Telegram file_id or an https URL Telegram can download. */
        fileId: z.string().min(1).max(2048),
      })
      .optional(),
    button: z
      .union([
        z.object({ text: z.string().trim().min(1).max(64), url: z.url({ protocol: /^https?$/ }) }),
        z.object({ text: z.string().trim().min(1).max(64), startapp: z.string().regex(/^[A-Za-z0-9_-]{0,64}$/) }),
      ])
      .optional(),
  })
  .refine((c) => !contentTooLong(c), { message: `caption longer than ${MAX_CAPTION}` });

const CreateSchema = z.object({ audience: z.enum(AUDIENCES), content: ContentSchema });

/**
 * Admin-panel Rassilka API (mounted at /admin/api, behind the admin auth
 * preHandler). Same functions as /broadcast in the bot; the queue worker
 * sends after confirmation.
 */
export async function adminRassilkaRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/rassilka/audiences', async () => {
    const counts: Record<string, number> = {};
    for (const a of AUDIENCES) counts[a] = await countAudience(deps.db, a);
    return counts;
  });

  app.get('/rassilka', async () => ({ items: await listRassilkalar(deps.db) }));

  app.post('/rassilka', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    const draft = await createDraft(deps.db, { ...parsed.data, createdBy: null }, deps.clock.now());
    return reply.code(201).send({ ...draft, recipients: await countAudience(deps.db, draft.audience) });
  });

  app.get<{ Params: { id: string } }>('/rassilka/:id', async (req, reply) => {
    const r = await getRassilka(deps.db, req.params.id);
    return r ?? reply.code(404).send({ error: 'not_found' });
  });

  app.post<{ Params: { id: string } }>('/rassilka/:id/confirm', async (req, reply) => {
    const res = await confirmRassilka(deps.db, req.params.id, deps.clock.now());
    if (!res.ok) return reply.code(res.reason === 'not_found' ? 404 : 409).send({ error: res.reason });
    return res.rassilka;
  });

  app.post<{ Params: { id: string } }>('/rassilka/:id/cancel', async (req, reply) => {
    if (!(await cancelDraft(deps.db, req.params.id))) {
      return reply.code((await getRassilka(deps.db, req.params.id)) ? 409 : 404).send({ error: 'not_draft' });
    }
    return getRassilka(deps.db, req.params.id);
  });
}
