import pg from 'pg';
import { RecordingCrm } from './adapters/crm/recording-crm';
import { RecordingMessenger } from './adapters/messenger/recording-messenger';
import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { migrate } from './db/migrate';

const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(db);

const app = buildApp(
  {
    config,
    db,
    clock: systemClock,
    // TODO: replace with the amoCRM and Telegram Bot API adapters when they land.
    crm: new RecordingCrm(),
    messenger: new RecordingMessenger(),
  },
  { logger: true },
);
app.log.warn('CRM and Messenger are in-memory fakes: nothing is sent to amoCRM or Telegram');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
