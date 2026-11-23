import type pg from 'pg';
import type { AmoTokens, AmoTokenStore } from './amocrm';

/**
 * amoCRM OAuth tokens in the database (table `crm_oauth`, one row). amoCRM
 * rotates the refresh token on every refresh, so it cannot live only in .env:
 * env gives the first pair (`seed`), then the database keeps the current one.
 */
export function pgAmoTokenStore(db: pg.Pool, clock: { now(): Date }): AmoTokenStore & { seed(t: AmoTokens): Promise<void> } {
  return {
    async load() {
      const { rows } = await db.query<{ access_token: string; refresh_token: string; expires_at: Date }>(
        'SELECT access_token, refresh_token, expires_at FROM crm_oauth WHERE id = 1',
      );
      const r = rows[0];
      return r ? { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at } : null;
    },
    async save(t) {
      await db.query(
        `INSERT INTO crm_oauth (id, access_token, refresh_token, expires_at, updated_at) VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                                        expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`,
        [t.accessToken, t.refreshToken, t.expiresAt, clock.now()],
      );
    },
    /** Writes the env tokens only if none are stored yet. */
    async seed(t) {
      await db.query(
        `INSERT INTO crm_oauth (id, access_token, refresh_token, expires_at, updated_at) VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [t.accessToken, t.refreshToken, t.expiresAt, clock.now()],
      );
    },
  };
}
