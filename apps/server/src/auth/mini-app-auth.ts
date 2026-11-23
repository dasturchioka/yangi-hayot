import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Clock } from '../clock';
import { verifyInitData, type TelegramUser } from './init-data';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireMiniAppUser` on Mini App routes. */
    telegramUser: TelegramUser;
  }
}

/**
 * Registers a preHandler that accepts only requests carrying valid Mini App
 * initData in `Authorization: tma <initData>`. Register it inside the plugin
 * scope that holds the Mini App routes.
 */
export function requireMiniAppUser(app: FastifyInstance, deps: { botToken: string; clock: Clock }) {
  app.decorateRequest('telegramUser', null as unknown as TelegramUser);
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const [scheme, initData] = [header.slice(0, 4), header.slice(4)];
    if (scheme.toLowerCase() !== 'tma ' || !initData) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const result = verifyInitData(initData, { botToken: deps.botToken, now: deps.clock.now() });
    if (!result.ok) {
      req.log.info({ reason: result.reason }, 'initData rejected');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    req.telegramUser = result.user;
  });
}
