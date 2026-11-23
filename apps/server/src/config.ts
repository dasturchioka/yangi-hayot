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
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  AI_API_KEY: z.string().min(16).optional(),
});

export interface Config {
  databaseUrl: string;
  botToken: string;
  botApiSecret: string;
  seed: { admins?: string[]; managersGroupId?: string };
  port: number;
  host: string;
  /** Key for the AI-menejer's katalog API (/ai/*). Optional: unset disables it. */
  aiApiKey?: string;
}

/** Reads and validates process env. Fails fast on missing secrets. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = EnvSchema.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    botToken: e.BOT_TOKEN,
    botApiSecret: e.BOT_API_SECRET,
    seed: { admins: e.ADMIN_TELEGRAM_IDS, managersGroupId: e.MANAGERS_GROUP_ID },
    port: e.PORT,
    host: e.HOST,
    aiApiKey: e.AI_API_KEY,
  };
}
