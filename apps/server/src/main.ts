import pg from 'pg';
import { RecordingCrm } from './adapters/crm/recording-crm';
import { RecordingMessenger } from './adapters/messenger/recording-messenger';
import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { migrate } from './db/migrate';
import { seedSettings } from './settings/settings';
import { createBackups, pgDumper, startBackupSchedule } from './zaxira/zaxira';

const config = loadConfig(process.env);
const db = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(db);
await seedSettings(db, config.seed, systemClock.now());

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
    await app.close();
    await db.end();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
