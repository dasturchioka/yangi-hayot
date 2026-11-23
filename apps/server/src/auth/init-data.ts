import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** How long a Mini App session (initData) stays valid after Telegram signed it. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

const TelegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: Date; startParam?: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verifies Mini App initData as described in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * and checks that it is not older than `maxAgeSeconds` at `now`.
 */
export function verifyInitData(
  raw: string,
  opts: { botToken: string; now: Date; maxAgeSeconds?: number },
): InitDataResult {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'malformed' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(opts.botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return { ok: false, reason: 'bad_signature' };

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSec) || authDateSec <= 0) return { ok: false, reason: 'malformed' };
  const ageSec = opts.now.getTime() / 1000 - authDateSec;
  if (ageSec > (opts.maxAgeSeconds ?? INIT_DATA_MAX_AGE_SECONDS)) return { ok: false, reason: 'expired' };

  let user: TelegramUser;
  try {
    user = TelegramUserSchema.parse(JSON.parse(params.get('user') ?? ''));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  return {
    ok: true,
    user,
    authDate: new Date(authDateSec * 1000),
    startParam: params.get('start_param') ?? undefined,
  };
}
