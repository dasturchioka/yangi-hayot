import { createHmac } from 'node:crypto';

/** Bot token the test app is configured with. initData signed with it is valid. */
export const TEST_BOT_TOKEN = '1234567890:TEST-bot-token-for-yangi-hayot';

export interface TelegramTestUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface SignOptions {
  /** Signing time; becomes `auth_date`. Defaults to now. */
  authDate?: Date;
  /** Token to sign with. Pass a different one to produce a forged initData. */
  botToken?: string;
  /** Mini App start parameter (`startapp=`), e.g. `src_banner`. */
  startParam?: string;
}

/**
 * Builds a Mini App `initData` query string signed the way Telegram signs it
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Written independently from the server's verifier on purpose.
 */
export function signInitData(user: TelegramTestUser, opts: SignOptions = {}): string {
  const authDate = Math.floor((opts.authDate ?? new Date()).getTime() / 1000);
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAH-test-query',
    user: JSON.stringify(user),
    ...(opts.startParam !== undefined ? { start_param: opts.startParam } : {}),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(opts.botToken ?? TEST_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** Header value the Mini App sends: `Authorization: tma <initData>`. */
export function tmaAuth(initData: string): { authorization: string } {
  return { authorization: `tma ${initData}` };
}
