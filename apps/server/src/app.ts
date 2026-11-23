import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { requireAiKey } from './auth/ai-auth';
import { requireMiniAppUser } from './auth/mini-app-auth';
import { createArizalar, type Arizalar } from './ariza/ariza';
import { Jobs } from './jobs/jobs';
import { createKatalog } from './katalog/katalog';
import { arizaRoutes } from './routes/ariza';
import { botInternalRoutes } from './routes/bot-internal';
import { katalogRoutes } from './routes/katalog';
import { miniAppRoutes } from './routes/mini-app';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  /**
   * botApiSecret: shared secret apps/bot sends on /internal/bot/*.
   * aiApiKey: Bearer key of the AI-menejer for /ai/*; unset → /ai/* rejects everything.
   */
  config: { botToken: string; botApiSecret: string; aiApiKey?: string };
  db: pg.Pool;
  clock: Clock;
  crm: Crm;
  messenger: Messenger;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Background jobs; main.ts ticks them, tests call `app.jobs.runAll()`. */
    jobs: Jobs;
    /** Ariza module: every entry point (form, quiz, booking, calculator, AI) creates Arizalar here. */
    arizalar: Arizalar;
  }
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger
      ? { redact: ['req.headers.authorization'] } // initData and the bot secret must not reach the logs
      : false,
  });

  const katalog = createKatalog({ db: deps.db, clock: deps.clock });
  const jobs = new Jobs((name, err) => app.log.error({ err, job: name }, 'job failed'));
  const arizalar = createArizalar({ ...deps, log: app.log });
  jobs.register('ariza-crm-retry', () => arizalar.retryDue());
  app.decorate('jobs', jobs);
  app.decorate('arizalar', arizalar);

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, deps), { prefix: '/api' });
  app.register((scope) => botInternalRoutes(scope, deps), { prefix: '/internal/bot' });
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await katalogRoutes(scope, katalog);
    },
    { prefix: '/api/katalog' },
  );
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await arizaRoutes(scope, { db: deps.db, clock: deps.clock, arizalar });
    },
    { prefix: '/api/arizalar' },
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
