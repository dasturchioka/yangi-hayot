import { z } from 'zod';

const idList = z
  .string()
  .optional()
  .transform((s) =>
    s === undefined || s.trim() === ''
      ? undefined
      : s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^-?\d+$/)).optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  /** Shared secret apps/bot sends on /internal/bot/*. */
  BOT_API_SECRET: z.string().min(32),
  /** Initial admins (comma-separated Telegram IDs); written to settings only if not set yet. */
  ADMIN_TELEGRAM_IDS: idList,
  /** Initial managers group chat id; written to settings only if not set yet. */
  MANAGERS_GROUP_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^-?\d+$/).optional()),
  /** Mini App URL (web_app buttons in messages the server sends). Unset = messages are not sent to Telegram (dev). */
  MINIAPP_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  /** Temporary admin-panel token until #5 (login, roles); unset = admin API closed. */
  ADMIN_API_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  AI_API_KEY: z.string().min(16).optional(),
  /** Directory for the daily database backup (TZ 0.3). Unset: no scheduled backups. */
  BACKUP_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** Tashkent time of the daily backup. */
  BACKUP_AT: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('03:00'),
  /** Directory with pg_dump/pg_restore matching the server's major version; unset: from PATH. */
  PG_BIN_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
});

export interface Config {
  databaseUrl: string;
  botToken: string;
  botApiSecret: string;
  miniAppUrl?: string;
  adminApiToken?: string;
  seed: { admins?: string[]; managersGroupId?: string };
  port: number;
  host: string;
  /** Key for the AI-menejer's katalog API (/ai/*). Optional: unset disables it. */
  aiApiKey?: string;
  backup: { dir?: string; at: string; pgBinDir?: string };
}

/** Reads and validates process env. Fails fast on missing secrets. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = EnvSchema.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    botToken: e.BOT_TOKEN,
    botApiSecret: e.BOT_API_SECRET,
    miniAppUrl: e.MINIAPP_URL,
    adminApiToken: e.ADMIN_API_TOKEN,
    seed: { admins: e.ADMIN_TELEGRAM_IDS, managersGroupId: e.MANAGERS_GROUP_ID },
    port: e.PORT,
    host: e.HOST,
    aiApiKey: e.AI_API_KEY,
    backup: { dir: e.BACKUP_DIR, at: e.BACKUP_AT, pgBinDir: e.PG_BIN_DIR },
  };
}
