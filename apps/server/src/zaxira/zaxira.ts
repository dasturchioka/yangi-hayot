import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { toTashkent, type Clock } from '../clock';

const run = promisify(execFile);

/** Writes a full database dump to a file and loads one into a database. */
export interface Dumper {
  dump(file: string): Promise<void>;
  /** Loads `file` into the (empty) database at `targetDatabaseUrl`. */
  restore(file: string, targetDatabaseUrl: string): Promise<void>;
}

/**
 * pg_dump / pg_restore (custom format). Their major version must be ≥ the
 * server's; `binDir` points at a specific install (e.g. /usr/lib/postgresql/17/bin).
 */
export function pgDumper(opts: { databaseUrl: string; binDir?: string }): Dumper {
  const bin = (name: string) => (opts.binDir ? join(opts.binDir, name) : name);
  return {
    async dump(file) {
      await run(bin('pg_dump'), ['--format=custom', '--no-owner', '--no-acl', `--file=${file}`, `--dbname=${opts.databaseUrl}`]);
    },
    async restore(file, target) {
      await run(bin('pg_restore'), ['--no-owner', '--no-acl', '--exit-on-error', `--dbname=${target}`, file]);
    },
  };
}

export interface BackupFile {
  file: string;
  /** Tashkent date `YYYY-MM-DD`. */
  date: string;
}

export interface Backups {
  /** Makes today's backup if it is past `at` and there is none yet, then prunes. Returns the new file or null. */
  runIfDue(): Promise<string | null>;
  /** Makes a backup now (and prunes). */
  backupNow(): Promise<string>;
  /** Backups in the directory, oldest first. */
  list(): Promise<BackupFile[]>;
  /** Deletes backups older than the retention window. Returns deleted files. */
  prune(): Promise<string[]>;
  restore(file: string, targetDatabaseUrl: string): Promise<void>;
}

const NAME = /^yangi-hayot-(\d{4}-\d{2}-\d{2})_(\d{4})\.dump$/;

/**
 * Daily database backup (TZ 0.3): one dump per Tashkent day, made at or
 * after `at`, kept `retentionDays` days (today included). The directory
 * itself is the state, so restarts neither skip nor repeat a day. A dump is
 * written to `.tmp` and renamed, so a failed dump never counts as a backup.
 */
export function createBackups(opts: {
  dir: string;
  dumper: Dumper;
  clock: Clock;
  /** Tashkent time `HH:mm`, default 03:00. */
  at?: string;
  retentionDays?: number;
}): Backups {
  const at = opts.at ?? '03:00';
  const retentionDays = opts.retentionDays ?? 14;

  const list = async (): Promise<BackupFile[]> => {
    await mkdir(opts.dir, { recursive: true });
    return (await readdir(opts.dir))
      .map((name) => ({ name, m: NAME.exec(name) }))
      .filter((x) => x.m)
      .map((x) => ({ file: join(opts.dir, x.name), date: x.m![1]!, sortKey: x.name }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ file, date }) => ({ file, date }));
  };

  const prune = async (): Promise<string[]> => {
    const oldestKept = addDays(toTashkent(opts.clock.now()).date, -(retentionDays - 1));
    const old = (await list()).filter((b) => b.date < oldestKept).map((b) => b.file);
    for (const file of old) await rm(file, { force: true });
    return old;
  };

  const backupNow = async (): Promise<string> => {
    await mkdir(opts.dir, { recursive: true });
    const { date, time } = toTashkent(opts.clock.now());
    const file = join(opts.dir, `yangi-hayot-${date}_${time.replace(':', '')}.dump`);
    const tmp = `${file}.tmp`;
    try {
      await opts.dumper.dump(tmp);
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    await prune();
    return file;
  };

  return {
    list,
    prune,
    backupNow,
    async runIfDue() {
      const { date, time } = toTashkent(opts.clock.now());
      if (time < at) return null;
      if ((await list()).some((b) => b.date === date)) return null;
      return backupNow();
    },
    restore: (file, target) => opts.dumper.restore(file, target),
  };
}

/**
 * Checks every `intervalMs` (default 1 min) whether today's backup is due.
 * Returns a stop function.
 */
export function startBackupSchedule(
  backups: Backups,
  opts: { intervalMs?: number; onBackup?: (file: string) => void; onError: (err: unknown) => void },
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const file = await backups.runIfDue();
      if (file) opts.onBackup?.(file);
    } catch (err) {
      opts.onError(err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, opts.intervalMs ?? 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
