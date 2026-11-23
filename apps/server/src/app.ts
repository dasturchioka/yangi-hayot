import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { requireAdmin } from './auth/admin-auth';
import { adminRassilkaRoutes } from './routes/admin-rassilka';
import { botInternalRoutes } from './routes/bot-internal';
import { miniAppRoutes } from './routes/mini-app';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  /** botApiSecret: shared secret apps/bot sends on /internal/bot/*. */
  /** adminApiToken: temporary admin-panel token until #5 (login, roles); unset = admin API closed. */
  config: { botToken: string; botApiSecret: string; adminApiToken?: string };
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger
      ? { redact: ['req.headers.authorization'] } // initData and the bot secret must not reach the logs
      : false,
  });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, deps), { prefix: '/api' });
  app.register((scope) => botInternalRoutes(scope, deps), { prefix: '/internal/bot' });
  app.register(
    async (scope) => {
      scope.addHook('preHandler', requireAdmin(deps.config.adminApiToken));
      await adminRassilkaRoutes(scope, deps);
    },
    { prefix: '/admin/api' },
  );

  return app;
}
