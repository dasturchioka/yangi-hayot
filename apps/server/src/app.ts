import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { requireAdmin } from './auth/admin-auth';
import { requireAiKey } from './auth/ai-auth';
import { requireMiniAppUser } from './auth/mini-app-auth';
import { createKatalog } from './katalog/katalog';
import { adminRassilkaRoutes } from './routes/admin-rassilka';
import { botInternalRoutes } from './routes/bot-internal';
import { katalogRoutes } from './routes/katalog';
import { katalogQiziqishHook } from './routes/katalog-qiziqish';
import { miniAppRoutes } from './routes/mini-app';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  /**
   * botApiSecret: shared secret apps/bot sends on /internal/bot/*.
   * aiApiKey: Bearer key of the AI-menejer for /ai/*; unset → /ai/* rejects everything.
   * adminApiToken: temporary admin-panel token until #5 (login, roles); unset → /admin/api/* rejects everything.
   */
  config: { botToken: string; botApiSecret: string; aiApiKey?: string; adminApiToken?: string };
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

  const katalog = createKatalog({ db: deps.db, clock: deps.clock });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, deps), { prefix: '/api' });
  app.register((scope) => botInternalRoutes(scope, deps), { prefix: '/internal/bot' });
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      scope.addHook('preSerialization', katalogQiziqishHook(deps, katalog));
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
  app.register(
    async (scope) => {
      scope.addHook('preHandler', requireAdmin(deps.config.adminApiToken));
      await adminRassilkaRoutes(scope, deps);
    },
    { prefix: '/admin/api' },
  );

  return app;
}
