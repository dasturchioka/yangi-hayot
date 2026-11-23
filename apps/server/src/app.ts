import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { requireAiKey } from './auth/ai-auth';
import { requireMiniAppUser } from './auth/mini-app-auth';
import { createKatalog } from './katalog/katalog';
import { katalogRoutes } from './routes/katalog';
import { miniAppRoutes } from './routes/mini-app';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  /** aiApiKey: Bearer key of the AI-menejer for /ai/*; unset → /ai/* rejects everything. */
  config: { botToken: string; aiApiKey?: string };
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

  const katalog = createKatalog({ db: deps.db, clock: deps.clock });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, deps), { prefix: '/api' });
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await katalogRoutes(scope, katalog);
    },
    { prefix: '/api/katalog' },
  );
  app.register(
    async (scope) => {
      requireAiKey(scope, deps.config.aiApiKey);
      await katalogRoutes(scope, katalog);
    },
    { prefix: '/ai/katalog' },
  );

  return app;
}
