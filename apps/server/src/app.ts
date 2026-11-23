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
import { createDojim } from './dojim/dojim';
import { createKalkulyator } from './kalkulyator/kalkulyator';
import { createKatalog } from './katalog/katalog';
import { adminAuthRoutes } from './routes/admin-auth';
import { adminDojimRoutes } from './routes/admin-dojim';
import { adminKatalogRoutes } from './routes/admin-katalog';
import { adminKvizRoutes } from './routes/admin-kviz';
import { adminRassilkaRoutes } from './routes/admin-rassilka';
import { adminTaklifRoutes } from './routes/admin-taklif';
import { arizaRoutes } from './routes/ariza';
import { botInternalRoutes } from './routes/bot-internal';
import { katalogRoutes } from './routes/katalog';
import { adminKalkulyatorRoutes, kalkulyatorRoutes } from './routes/kalkulyator';
import { dojimKorishHook, katalogQiziqishHook } from './routes/katalog-qiziqish';
import { kvizRoutes } from './routes/kviz';
import { adminKontentRoutes, kontentRoutes } from './routes/kontent';
import { miniAppRoutes } from './routes/mini-app';
import { sevimlilarRoutes } from './routes/sevimlilar';
import { yozilishRoutes } from './routes/yozilish';
import { adminYozilishRoutes } from './routes/admin-yozilish';
import { createYozilishlar, type Yozilishlar } from './yozilish/yozilish';
import { createSevimlilar } from './sevimlilar/sevimlilar';
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
    /** Ko'rishga yozilish (#11): `onDavomat` is the hook for dojim (#17) and the funnel (#20). */
    yozilishlar: Yozilishlar;
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
  const arizalar = createArizalar({ ...deps, log: app.log });
  jobs.register('ariza-legacy', async () => void (await foldLegacyArizalar(deps.db)));
  jobs.register('ariza-crm-retry', () => arizalar.retryDue());
  app.decorate('jobs', jobs);
  app.decorate('arizalar', arizalar);
  const yozilishlar = createYozilishlar({ ...deps, arizalar, log: app.log });
  jobs.register('yozilish-crm', () => yozilishlar.syncCrm()); // after ariza-crm-retry: a move waits for its Ariza
  app.decorate('yozilishlar', yozilishlar);
  const dojim = createDojim({ ...deps, log: app.log });
  yozilishlar.onDavomat((e) => dojim.davomat(e));
  jobs.register('dojim', () => dojim.run());
  const kalkulyator = createKalkulyator({ db: deps.db, clock: deps.clock, arizalar, dojim });
  const sevimlilar = createSevimlilar({ db: deps.db, katalog });
  const ulashish = createUlashish({ db: deps.db, katalog, miniAppLink: deps.config.miniAppLink });

  const taklif = createTaklif({ db: deps.db, miniAppLink: deps.config.miniAppLink, crmBaseUrl: deps.config.crmBaseUrl });

  app.get('/health', async () => ({ ok: true }));
  app.register((scope) => miniAppRoutes(scope, { ...deps, ulashish, taklif }), { prefix: '/api' });
  app.register((scope) => botInternalRoutes(scope, deps), { prefix: '/internal/bot' });
  app.register((scope) => adminAuthRoutes(scope, deps), { prefix: '/admin/api' });
  app.register((scope) => adminKatalogRoutes(scope, deps, katalog), { prefix: '/admin/api' });
  app.register(
    async (scope) => {
      requireAdmin(scope, deps); // both roles: yozilishlar are the Menejer's work too
      await adminYozilishRoutes(scope, { db: deps.db, clock: deps.clock, yozilishlar });
    },
    { prefix: '/admin/api' },
  );
  app.register(
    async (scope) => {
      requireMiniAppUser(scope, { botToken: deps.config.botToken, clock: deps.clock });
      scope.addHook('preSerialization', katalogQiziqishHook(deps, katalog));
      scope.addHook('preSerialization', dojimKorishHook(deps, dojim));
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
      await yozilishRoutes(scope, { db: deps.db, clock: deps.clock, yozilishlar, dojim });
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
      await adminDojimRoutes(scope, deps);
      await adminTaklifRoutes(scope, taklif);
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
      await kalkulyatorRoutes(scope, { ...deps, kalkulyator });
    },
    { prefix: '/api' },
  );

  return app;
}
