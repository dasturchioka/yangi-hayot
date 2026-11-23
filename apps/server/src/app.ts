import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { miniAppRoutes } from './routes/mini-app';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  config: { botToken: string };
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger
      ? { redact: ['req.headers.authorization'] } // initData must not reach the logs
      : false,
  });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, deps), { prefix: '/api' });

  return app;
}
