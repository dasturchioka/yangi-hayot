import type pg from 'pg';
import { z } from 'zod';
import type { Clock } from '../../clock';
import { AmoCrm } from './amocrm';
import { pgAmoTokenStore } from './amocrm-token-store';

const blank = (v: unknown) => (v === '' ? undefined : v);
const optId = z.preprocess(blank, z.coerce.number().int().positive().optional());
const optStr = z.preprocess(blank, z.string().min(1).optional());

const AmoEnv = z
  .object({
    /** https://<subdomain>.amocrm.ru — unset: amoCRM is off (in-memory fake, dev). */
    AMO_BASE_URL: z.preprocess(blank, z.url().optional()),
    /** Long-lived token (recommended). Or OAuth: the four AMO_OAUTH_* + first token pair. */
    AMO_LONG_LIVED_TOKEN: optStr,
    AMO_CLIENT_ID: optStr,
    AMO_CLIENT_SECRET: optStr,
    AMO_REDIRECT_URI: optStr,
    AMO_ACCESS_TOKEN: optStr,
    AMO_REFRESH_TOKEN: optStr,
    AMO_PIPELINE_ID: optId,
    AMO_STATUS_ID: optId,
    AMO_MANBA_FIELD_ID: optId,
    AMO_TELEGRAM_FIELD_ID: optId,
    AMO_DEFAULT_RESPONSIBLE_ID: optId,
    AMO_TASK_TYPE_CALL: optId,
    AMO_TASK_TYPE_CONTACT: optId,
    AMO_TASK_TYPE_MEETING: optId,
  })
  .refine((e) => !e.AMO_BASE_URL || (e.AMO_PIPELINE_ID && e.AMO_STATUS_ID), {
    message: 'AMO_PIPELINE_ID and AMO_STATUS_ID are required with AMO_BASE_URL',
  })
  .refine(
    (e) =>
      !e.AMO_BASE_URL ||
      e.AMO_LONG_LIVED_TOKEN ||
      (e.AMO_CLIENT_ID && e.AMO_CLIENT_SECRET && e.AMO_REDIRECT_URI && e.AMO_REFRESH_TOKEN),
    { message: 'amoCRM auth: set AMO_LONG_LIVED_TOKEN or AMO_CLIENT_ID/SECRET/REDIRECT_URI + AMO_REFRESH_TOKEN' },
  );

/**
 * The amoCRM adapter from env, or null when AMO_BASE_URL is unset. With OAuth
 * the env token pair seeds the database once; afterwards the database copy
 * (refreshed automatically) is used.
 */
export async function amoCrmFromEnv(env: NodeJS.ProcessEnv, db: pg.Pool, clock: Clock): Promise<AmoCrm | null> {
  const e = AmoEnv.parse(env);
  if (!e.AMO_BASE_URL) return null;
  let auth: ConstructorParameters<typeof AmoCrm>[0]['auth'];
  if (e.AMO_LONG_LIVED_TOKEN) {
    auth = { kind: 'token', token: e.AMO_LONG_LIVED_TOKEN };
  } else {
    const store = pgAmoTokenStore(db, clock);
    // expiresAt in the past: the first request refreshes and stores a fresh pair.
    await store.seed({ accessToken: e.AMO_ACCESS_TOKEN ?? '', refreshToken: e.AMO_REFRESH_TOKEN!, expiresAt: new Date(0) });
    auth = {
      kind: 'oauth',
      clientId: e.AMO_CLIENT_ID!,
      clientSecret: e.AMO_CLIENT_SECRET!,
      redirectUri: e.AMO_REDIRECT_URI!,
      store,
    };
  }
  return new AmoCrm({
    baseUrl: e.AMO_BASE_URL.replace(/\/$/, ''),
    auth,
    pipelineId: e.AMO_PIPELINE_ID!,
    firstStatusId: e.AMO_STATUS_ID!,
    manbaFieldId: e.AMO_MANBA_FIELD_ID,
    telegramFieldId: e.AMO_TELEGRAM_FIELD_ID,
    defaultResponsibleId: e.AMO_DEFAULT_RESPONSIBLE_ID,
    taskTypes: { call: e.AMO_TASK_TYPE_CALL, contact: e.AMO_TASK_TYPE_CONTACT, meeting: e.AMO_TASK_TYPE_MEETING },
    now: () => clock.now(),
  });
}
