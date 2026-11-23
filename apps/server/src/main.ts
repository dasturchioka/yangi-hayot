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
import { createBackups, pgDumper, startBackupSchedule } from './zaxira/zaxira';

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

let stopBackups = () => {};
if (config.backup.dir) {
  const backups = createBackups({
    dir: config.backup.dir,
    dumper: pgDumper({ databaseUrl: config.databaseUrl, binDir: config.backup.pgBinDir }),
    clock: systemClock,
    at: config.backup.at,
  });
  stopBackups = startBackupSchedule(backups, {
    onBackup: (file) => app.log.info({ file }, 'database backup written'),
    onError: (err) => app.log.error({ err }, 'database backup failed'),
  });
} else {
  app.log.warn('BACKUP_DIR is not set: no daily database backup');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    stopBackups();
    await rassilkaWorker.stop();
    await app.close();
    await db.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
