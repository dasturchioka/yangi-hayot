import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  AI_API_KEY: z.string().min(16).optional(),
});

export interface Config {
  databaseUrl: string;
  botToken: string;
  port: number;
  host: string;
  /** Key for the AI-menejer's katalog API (/ai/*). Optional: unset disables it. */
  aiApiKey?: string;
}

/** Reads and validates process env. Fails fast on missing secrets. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = EnvSchema.parse(env);
  return { databaseUrl: e.DATABASE_URL, botToken: e.BOT_TOKEN, port: e.PORT, host: e.HOST, aiApiKey: e.AI_API_KEY };
}
