import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AdminDto, AdminRol } from '@yh/shared';
import type pg from 'pg';

/**
 * Admin-panel accounts (login + password + rol) and their sessions.
 * Passwords: scrypt with a random salt. Sessions: random 32-byte token given
 * to the browser in an HttpOnly cookie; only its SHA-256 is stored.
 */

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_TTL_MS = 7 * 86_400_000;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

/** A valid hash of a random password: makes "unknown login" cost the same time as "wrong password". */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

interface AdminRow {
  id: number;
  login: string;
  nomi: string;
  rol: AdminRol;
  faol: boolean;
  password_hash: string;
}

const toDto = (r: AdminRow): AdminDto => ({ id: r.id, login: r.login, nomi: r.nomi, rol: r.rol, faol: r.faol });

export class LoginTakenError extends Error {}

export async function createAdminUser(
  db: pg.Pool,
  input: { login: string; password: string; rol: AdminRol; nomi: string },
  now: Date,
): Promise<AdminDto> {
  try {
    const { rows } = await db.query<AdminRow>(
      `INSERT INTO admin_user (login, nomi, rol, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
      [input.login.toLowerCase(), input.nomi, input.rol, await hashPassword(input.password), now],
    );
    return toDto(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new LoginTakenError(input.login);
    throw err;
  }
}

export async function listAdminUsers(db: pg.Pool): Promise<AdminDto[]> {
  const { rows } = await db.query<AdminRow>('SELECT * FROM admin_user ORDER BY faol DESC, rol, login');
  return rows.map(toDto);
}

/** Changes rol / nomi / faol / password. Deactivating or changing the password ends the user's sessions. */
export async function updateAdminUser(
  db: pg.Pool,
  id: number,
  patch: { nomi?: string; rol?: AdminRol; faol?: boolean; password?: string },
  now: Date,
): Promise<AdminDto | null> {
  const hash = patch.password === undefined ? null : await hashPassword(patch.password);
  const { rows } = await db.query<AdminRow>(
    `UPDATE admin_user SET
       nomi = COALESCE($2, nomi), rol = COALESCE($3, rol), faol = COALESCE($4, faol),
       password_hash = COALESCE($5, password_hash), updated_at = $6
     WHERE id = $1 RETURNING *`,
    [id, patch.nomi ?? null, patch.rol ?? null, patch.faol ?? null, hash, now],
  );
  if (!rows[0]) return null;
  if (patch.faol === false || hash) await db.query('DELETE FROM admin_session WHERE admin_id = $1', [id]);
  return toDto(rows[0]);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Checks login + password of an active user and opens a session. null on any mismatch. */
export async function login(
  db: pg.Pool,
  loginName: string,
  password: string,
  now: Date,
): Promise<{ token: string; admin: AdminDto; expiresAt: Date } | null> {
  const { rows } = await db.query<AdminRow>('SELECT * FROM admin_user WHERE login = $1', [loginName.toLowerCase()]);
  const row = rows[0];
  const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !ok || !row.faol) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.query('INSERT INTO admin_session (token_hash, admin_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
    tokenHash(token),
    row.id,
    now,
    expiresAt,
  ]);
  return { token, admin: toDto(row), expiresAt };
}

/** The active user behind a live session token, or null. */
export async function adminBySession(db: pg.Pool, token: string, now: Date): Promise<AdminDto | null> {
  const { rows } = await db.query<AdminRow>(
    `SELECT u.* FROM admin_session s JOIN admin_user u ON u.id = s.admin_id
     WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.faol`,
    [tokenHash(token), now],
  );
  return rows[0] ? toDto(rows[0]) : null;
}

export async function logout(db: pg.Pool, token: string): Promise<void> {
  await db.query('DELETE FROM admin_session WHERE token_hash = $1', [tokenHash(token)]);
}

/**
 * In-memory brute-force guard: after `max` failed logins for one login name
 * within `windowMs`, that login is refused until the window passes.
 */
export class LoginThrottle {
  #fails = new Map<string, number[]>();
  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  #recent(key: string, now: Date): number[] {
    const since = now.getTime() - this.windowMs;
    const list = (this.#fails.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.#fails.set(key, list);
    else this.#fails.delete(key);
    return list;
  }

  locked(login: string, now: Date): boolean {
    return this.#recent(login.toLowerCase(), now).length >= this.max;
  }

  fail(login: string, now: Date): void {
    const key = login.toLowerCase();
    this.#fails.set(key, [...this.#recent(key, now), now.getTime()]);
  }

  reset(login: string): void {
    this.#fails.delete(login.toLowerCase());
  }
}
