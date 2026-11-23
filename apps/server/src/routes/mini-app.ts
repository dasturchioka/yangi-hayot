import type { MeResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { requireMiniAppUser } from '../auth/mini-app-auth';
import { manbaFromStartParam } from '../mijoz/manba';
import { ensureMijoz } from '../mijoz/mijoz';

/** Mini App API: every route here requires valid initData. Mounted under /api. */
export async function miniAppRoutes(app: FastifyInstance, deps: AppDeps) {
  requireMiniAppUser(app, { botToken: deps.config.botToken, clock: deps.clock });

  app.get('/me', async (req): Promise<MeResponse> => {
    const m = await ensureMijoz(deps.db, req.telegramUser, deps.clock.now(), {
      manba: manbaFromStartParam(req.startParam),
    });
    return {
      mijoz: { telegramId: m.telegramId, name: m.name, lang: m.lang },
      manba: { first: m.firstManba, last: m.lastManba },
    };
  });
}
