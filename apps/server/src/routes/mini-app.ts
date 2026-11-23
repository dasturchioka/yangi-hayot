import type { MeResponse, TaklifResponse, UlashishResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { requireMiniAppUser } from '../auth/mini-app-auth';
import { ensureMijoz } from '../mijoz/mijoz';
import { taklifVisit, type Taklif } from '../taklif/taklif';
import type { Skoring } from '../skoring/skoring';
import type { Ulashish } from '../ulashish/ulashish';

const UlashishBody = z.object({ planirovkaId: z.number().int().positive().max(2_147_483_647) });

/** Mini App API: every route here requires valid initData. Mounted under /api. */
export async function miniAppRoutes(app: FastifyInstance, deps: AppDeps & { ulashish: Ulashish; taklif: Taklif; skoring: Skoring }) {
  requireMiniAppUser(app, { botToken: deps.config.botToken, clock: deps.clock });

  /**
   * Called once per Mini App launch: records the Mijoz and the Manba of this
   * launch's signed start parameter (`src_<nomi>` tag or «Ulashish» link) and
   * names the screen to open.
   */
  app.get('/me', async (req): Promise<MeResponse> => {
    const telegramId = String(req.telegramUser.id);
    const taklif = await taklifVisit(deps.db, req.startParam, telegramId);
    const visit = taklif
      ? { start: null, manba: taklif.manba, ulashishId: null }
      : await deps.ulashish.visit(req.startParam, telegramId);
    const m = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: visit.manba,
      ulashishId: visit.ulashishId,
      taklifQilganId: taklif?.taklifQilganId,
    });
    await deps.skoring.kirish(m.telegramId); // a Mini App launch on a new day is a re-entry (UF-4)
    return {
      mijoz: { telegramId: m.telegramId, name: m.name, lang: m.lang },
      manba: { first: m.firstManba, last: m.lastManba },
      start: visit.start,
    };
  });

  /** «Do'stingni taklif qil»: the Mijoz's personal bot link and how many friends came by it. */
  app.get('/taklif', async (req, reply): Promise<TaklifResponse | void> => {
    if (!deps.config.miniAppLink) return reply.code(503).send({ error: 'taklif_sozlanmagan' });
    const m = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now());
    return deps.taklif.link(m.telegramId);
  });

  /** «Ulashish»: a link to send this Planirovka into a Telegram chat. */
  app.post('/ulashish', async (req, reply): Promise<UlashishResponse | void> => {
    const body = UlashishBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    if (!deps.config.miniAppLink) return reply.code(503).send({ error: 'ulashish_sozlanmagan' });
    const now = deps.clock.now();
    const m = await ensureMijoz(deps.db, req.telegramUser, now);
    const link = await deps.ulashish.create(m.telegramId, body.data.planirovkaId, now);
    if (!link) return reply.code(404).send({ error: 'not_found' });
    return link;
  });
}
