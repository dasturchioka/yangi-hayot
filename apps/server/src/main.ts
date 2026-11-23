import pg from 'pg';
import { RecordingCrm } from './adapters/crm/recording-crm';
import type { Messenger } from './adapters/messenger/messenger';
import { RecordingMessenger } from './adapters/messenger/recording-messenger';
import { TelegramMessenger } from './adapters/messenger/telegram-messenger';
import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { migrate } from './db/migrate';
import { startRassilkaWorker } from './rassilka/worker';
import { seedSettings } from './settings/settings';

const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(db);
await seedSettings(db, config.seed, systemClock.now());

const messenger: Messenger = config.miniAppUrl
  ? new TelegramMessenger({ botToken: config.botToken, miniAppUrl: config.miniAppUrl })
  : new RecordingMessenger();

const app = buildApp(
  {
    config,
    db,
    clock: systemClock,
    // TODO: replace with the amoCRM adapter when it lands.
    crm: new RecordingCrm(),
    messenger,
  },
  { logger: true },
);
app.log.warn('CRM is an in-memory fake: nothing is sent to amoCRM');
if (!config.miniAppUrl) app.log.warn('MINIAPP_URL not set: Messenger is an in-memory fake, nothing is sent to Telegram');

// Rassilka queue: recovers rows interrupted by the last shutdown, then sends ≤ 25/s.
const rassilkaWorker = startRassilkaWorker(
  { db, clock: systemClock, messenger },
  { onError: (e) => app.log.error(e, 'rassilka worker') },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await rassilkaWorker.stop();
    await app.close();
    await db.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
