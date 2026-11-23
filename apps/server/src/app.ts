import Fastify from 'fastify';
import type pg from 'pg';
import type { Crm } from './adapters/crm/crm';
import type { Messenger } from './adapters/messenger/messenger';
import type { Clock } from './clock';
import { onlyRol, requireAdmin } from './auth/admin-auth';
import { requireAiKey } from './auth/ai-auth';
import { requireMiniAppUser } from './auth/mini-app-auth';
import { createArizalar, type Arizalar } from './ariza/ariza';
import { foldLegacyArizalar } from './ariza/legacy';
import { Jobs } from './jobs/jobs';
import { createKalkulyator } from './kalkulyator/kalkulyator';
import { createKatalog } from './katalog/katalog';
import { adminAuthRoutes } from './routes/admin-auth';
import { adminKatalogRoutes } from './routes/admin-katalog';
import { adminKvizRoutes } from './routes/admin-kviz';
import { adminRassilkaRoutes } from './routes/admin-rassilka';
import { adminTaklifRoutes } from './routes/admin-taklif';
import { arizaRoutes } from './routes/ariza';
import { botInternalRoutes } from './routes/bot-internal';
import { katalogRoutes } from './routes/katalog';
import { adminKalkulyatorRoutes, kalkulyatorRoutes } from './routes/kalkulyator';
import { katalogQiziqishHook } from './routes/katalog-qiziqish';
import { kvizRoutes } from './routes/kviz';
import { adminKontentRoutes, kontentRoutes } from './routes/kontent';
import { miniAppRoutes } from './routes/mini-app';
import { sevimlilarRoutes } from './routes/sevimlilar';
import { createSevimlilar } from './sevimlilar/sevimlilar';
import { adminSkoringRoutes } from './routes/admin-skoring';
import { createSkoring, type Skoring } from './skoring/skoring';
import { createTaklif } from './taklif/taklif';
import { createUlashish } from './ulashish/ulashish';

/** Everything the app needs from the outside world. Tests pass fakes. */
export interface AppDeps {
  /**
   * botApiSecret: shared secret apps/bot sends on /internal/bot/*.
   * aiApiKey: Bearer key of the AI-menejer for /ai/*; unset → /ai/* rejects everything.
   * miniAppLink: direct Mini App link (`https://t.me/<bot>/<app>`) «Ulashish» links are built on;
   *   unset → POST /api/ulashish and GET /api/taklif answer 503 (the taklif bot link is derived from it).
   * crmBaseUrl: amoCRM account URL (AMO_BASE_URL), for Bitim links in the admin-panel; unset → no links.
   */
  config: { botToken: string; botApiSecret: string; aiApiKey?: string; miniAppLink?: string; crmBaseUrl?: string };
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
    /** Lead skoringi (#18): `harakat(telegramId)` after any action that may change the Daraja. */
    skoring: Skoring;
  }
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } // initData, the bot secret and admin sessions must not reach the logs
      : false,
  });

  const katalog = createKatalog({ db: deps.db, clock: deps.clock });
  const jobs = new Jobs((name, err) => app.log.error({ err, job: name }, 'job failed'));
  const skoring = createSkoring({ ...deps, log: app.log });
  const arizalar = createArizalar({ ...deps, log: app.log, skoring });
  jobs.register('ariza-legacy', async () => void (await foldLegacyArizalar(deps.db)));
  jobs.register('ariza-crm-retry', () => arizalar.retryDue());
  app.decorate('jobs', jobs);
  app.decorate('arizalar', arizalar);
  app.decorate('skoring', skoring);
  const kalkulyator = createKalkulyator({ db: deps.db, clock: deps.clock, arizalar });
  const sevimlilar = createSevimlilar({ db: deps.db, katalog });
  const ulashish = createUlashish({ db: deps.db, katalog, miniAppLink: deps.config.miniAppLink });

  const taklif = createTaklif({ db: deps.db, miniAppLink: deps.config.miniAppLink, crmBaseUrl: deps.config.crmBaseUrl });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, { ...deps, ulashish, taklif, skoring }), { prefix: '/api' });
  app.register((scope) => botInternalRoutes(scope, { ...deps, skoring }), { prefix: '/internal/bot' });
  app.register((scope) => adminAuthRoutes(scope, deps), { prefix: '/admin/api' });
  app.register((scope) => adminKatalogRoutes(scope, deps, katalog), { prefix: '/admin/api' });
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      scope.addHook('preSerialization', katalogQiziqishHook(deps, katalog));
      await katalogRoutes(scope, katalog, deps);
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
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await kvizRoutes(scope, { db: deps.db, clock: deps.clock, arizalar });
    },
    { prefix: '/api/kviz' },
  );
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await sevimlilarRoutes(scope, { db: deps.db, clock: deps.clock, sevimlilar });
    },
    { prefix: '/api' },
  );
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await kontentRoutes(scope, deps);
    },
    { prefix: '/api' },
  );
  app.register(
    async (scope) => {
      requireAdmin(scope, deps);
      scope.addHook('preHandler', onlyRol('administrator'));
      await adminKontentRoutes(scope, deps);
    },
    { prefix: '/admin/api' },
  );
  app.register(
    async (scope) => {
      requireAiKey(scope, deps.config.aiApiKey);
      await katalogRoutes(scope, katalog, deps);
    },
    { prefix: '/ai/katalog' },
  );
  app.register(
    async (scope) => {
      requireAdmin(scope, deps);
      scope.addHook('preHandler', onlyRol('administrator'));
      await adminRassilkaRoutes(scope, deps);
      await adminKalkulyatorRoutes(scope, deps);
      await adminTaklifRoutes(scope, taklif);
      await adminSkoringRoutes(scope, deps);
    },
    { prefix: '/admin/api' },
  );
  app.register(
    async (scope) => {
      requireAdmin(scope, deps);
      scope.addHook('preHandler', onlyRol('administrator'));
      await adminKvizRoutes(scope, deps, katalog);
    },
    { prefix: '/admin/api' },
  );
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      await kalkulyatorRoutes(scope, { ...deps, kalkulyator, skoring });
    },
    { prefix: '/api' },
  );

  return app;
}
