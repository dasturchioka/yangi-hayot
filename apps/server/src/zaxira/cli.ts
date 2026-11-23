import { systemClock } from '../clock';
import { createBackups, pgDumper } from './zaxira';

/**
 * `pnpm --filter @yh/server zaxira -- now | list | restore <file> <target DATABASE_URL>`
 *
 * Restore goes into an EMPTY database (create it first), then point
 * DATABASE_URL at it and restart the server. Needs DATABASE_URL and BACKUP_DIR.
 */
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--');
const databaseUrl = process.env.DATABASE_URL;
const dir = process.env.BACKUP_DIR;
if (!databaseUrl || !dir) throw new Error('DATABASE_URL and BACKUP_DIR must be set');

const backups = createBackups({
  dir,
  dumper: pgDumper({ databaseUrl, binDir: process.env.PG_BIN_DIR || undefined }),
  clock: systemClock,
});

switch (cmd) {
  case 'now':
    console.log(await backups.backupNow());
    break;
  case 'list':
    for (const b of await backups.list()) console.log(`${b.date}  ${b.file}`);
    break;
  case 'restore': {
    const [file, target] = args;
    if (!file || !target) throw new Error('usage: restore <file> <target DATABASE_URL>');
    await backups.restore(file, target);
    console.log(`restored ${file}`);
    break;
  }
  default:
    throw new Error('usage: now | list | restore <file> <target DATABASE_URL>');
}
