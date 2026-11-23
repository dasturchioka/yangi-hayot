import { DAVOMATLAR, type AdminYozilishlarResponse, type YozilishSozlamalari } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { onlyRol } from '../auth/admin-auth';
import { toTashkent, type Clock } from '../clock';
import { getSetting, setSetting } from '../settings/settings';
import type { Yozilishlar } from '../yozilish/yozilish';
import type pg from 'pg';
import { yozilishError } from './yozilish';

const Sana = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s));
const ListQuery = z.object({ dan: Sana.optional(), gacha: Sana.optional() });
const IdParams = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
const DavomatBody = z.object({ davomat: z.enum(DAVOMATLAR).nullable() });
const Sozlamalar = z.object({
  haftaKunlari: z.array(z.number().int().min(1).max(7)).max(7),
  vaqtlar: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(48),
  bayramlar: z.array(Sana).max(366),
  kunlarSoni: z.number().int().min(1).max(60),
});

/**
 * Admin «Ko'rishga yozilishlar» (both roles: list, keldi / kelmadi) and
 * «Ko'rish kunlari va vaqtlari» (read: both, change: Administrator).
 * Mounted under /admin/api inside a `requireAdmin` scope.
 */
export async function adminYozilishRoutes(
  app: FastifyInstance,
  deps: { db: pg.Pool; clock: Clock; yozilishlar: Yozilishlar },
) {
  app.get('/yozilishlar', async (req, reply) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    const today = toTashkent(deps.clock.now()).date;
    const dan = q.data.dan ?? today;
    const gacha = q.data.gacha ?? dan;
    if (gacha < dan) return reply.code(400).send({ error: 'bad_request' });
    return { yozilishlar: await deps.yozilishlar.adminList(dan, gacha) } satisfies AdminYozilishlarResponse;
  });

  app.patch('/yozilishlar/:id/davomat', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = DavomatBody.safeParse(req.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: 'bad_request' });
    try {
      return { yozilish: await deps.yozilishlar.setDavomat(p.data.id, body.data.davomat, req.admin) };
    } catch (error) {
      return yozilishError(reply, error);
    }
  });

  app.get('/yozilish-sozlamalari', async () => ({ sozlamalar: await getSetting(deps.db, 'yozilish') }));

  app.put('/yozilish-sozlamalari', { preHandler: onlyRol('administrator') }, async (req, reply) => {
    const body = Sozlamalar.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const sozlamalar: YozilishSozlamalari = {
      haftaKunlari: [...new Set(body.data.haftaKunlari)].sort((a, b) => a - b),
      vaqtlar: [...new Set(body.data.vaqtlar)].sort(),
      bayramlar: [...new Set(body.data.bayramlar)].sort(),
      kunlarSoni: body.data.kunlarSoni,
    };
    await setSetting(deps.db, 'yozilish', sozlamalar, deps.clock.now());
    return { sozlamalar };
  });
}
