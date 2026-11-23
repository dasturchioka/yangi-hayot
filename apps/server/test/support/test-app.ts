import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { inject } from 'vitest';
import { buildApp } from '../../src/app';
import { FakeClock } from '../../src/clock';
import { RecordingCrm } from '../../src/adapters/crm/recording-crm';
import { RecordingMessenger } from '../../src/adapters/messenger/recording-messenger';
import { TEMPLATE_DB, withDatabase } from './global-setup';
import { TEST_BOT_API_SECRET } from './bot';
import { TEST_BOT_TOKEN } from './init-data';

/** Default fake "now": Monday 2026-11-23 10:00 in Tashkent (05:00 UTC). */
export const DEFAULT_NOW = new Date('2026-11-23T05:00:00Z');

/** API key the AI-menejer uses for /ai/* in tests. */
export const TEST_AI_API_KEY = 'test-ai-api-key-0123456789';

/** Direct Mini App link share links are built on. */
export const TEST_MINIAPP_LINK = 'https://t.me/YangiHayotTestBot/app';

/** Temporary admin-panel token (until #5) the test app accepts on /admin/api. */
export const TEST_ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

export interface TestApp {
  app: FastifyInstance;
  clock: FakeClock;
  crm: RecordingCrm;
  messenger: RecordingMessenger;
  /** Pool on this test's own database (cloned from the migrated template). */
  db: pg.Pool;
  /** Runs every background job once (move `clock` first); fails if a job threw. */
  runJobs(): Promise<void>;
  /**
   * Simulates a server restart: a new app on the same database, clock and
   * adapters. Nothing kept in memory survives.
   */
  restart(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Builds the real HTTP app on a fresh, migrated PostgreSQL database with fake
 * adapters (CRM, Messenger) and a fake clock. Call `close()` in afterEach/afterAll.
 */
export async function createTestApp(opts: { now?: Date } = {}): Promise<TestApp> {
  const adminUrl = inject('pgAdminUrl');
  const dbName = `t_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`);
  await admin.end();

  const db = new pg.Pool({ connectionString: withDatabase(adminUrl, dbName), max: 4 });
  const clock = new FakeClock(opts.now ?? DEFAULT_NOW);
  const crm = new RecordingCrm();
  const messenger = new RecordingMessenger();
  const build = async () => {
    const app = buildApp({
      config: {
        botToken: TEST_BOT_TOKEN,
        botApiSecret: TEST_BOT_API_SECRET,
        aiApiKey: TEST_AI_API_KEY,
        adminApiToken: TEST_ADMIN_TOKEN,
        miniAppLink: TEST_MINIAPP_LINK,
      },
      db,
      clock,
      crm,
      messenger,
    });
    await app.ready();
    return app;
  };

  const t: TestApp = {
    app: await build(),
    clock,
    crm,
    messenger,
    db,
    async runJobs() {
      const failures = await t.app.jobs.runAll();
      if (failures.length > 0) throw failures[0]!.error;
    },
    async restart() {
      await t.app.close();
      t.app = await build();
    },
    async close() {
      await t.app.close();
      await db.end();
    },
  };
  return t;
}
