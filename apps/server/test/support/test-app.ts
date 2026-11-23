import { randomUUID } from 'node:crypto';
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

export interface TestApp {
  app: ReturnType<typeof buildApp>;
  clock: FakeClock;
  crm: RecordingCrm;
  messenger: RecordingMessenger;
  /** Pool on this test's own database (cloned from the migrated template). */
  db: pg.Pool;
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
  const app = buildApp({
    config: { botToken: TEST_BOT_TOKEN, botApiSecret: TEST_BOT_API_SECRET, aiApiKey: TEST_AI_API_KEY },
    db,
    clock,
    crm,
    messenger,
  });
  await app.ready();

  return {
    app,
    clock,
    crm,
    messenger,
    db,
    async close() {
      await app.close();
      await db.end();
    },
  };
}
