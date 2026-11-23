import { z } from 'zod';
import { createBot } from './bot';
import { httpServerClient } from './server-client';

const env = z
  .object({
    BOT_TOKEN: z.string().min(1),
    SERVER_URL: z.string().url(),
    BOT_API_SECRET: z.string().min(32),
    MINIAPP_URL: z.string().url(),
  })
  .parse(process.env);

const bot = createBot({
  token: env.BOT_TOKEN,
  miniAppUrl: env.MINIAPP_URL,
  server: httpServerClient({ serverUrl: env.SERVER_URL, secret: env.BOT_API_SECRET }),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void bot.stop());
}

// Long polling. Updates are handled one by one; switch to a webhook or
// @grammyjs/runner if the load requires it.
await bot.start({
  allowed_updates: ['message', 'callback_query'],
  onStart: (me) => console.log(`bot @${me.username} started`),
});
