import type { AdminDto, JurnalDto, JurnalObyekt } from '@yh/shared';
import type pg from 'pg';

/** Who changes the catalog and when. Every admin write takes one. */
export interface Muallif {
  admin: Pick<AdminDto, 'id' | 'nomi'>;
  at: Date;
}

export interface JurnalYozuvi {
  obyekt: JurnalObyekt;
  obyektId: number;
  /** Loyiha the object belongs to (for the per-Loyiha jurnal). */
  loyihaId: number;
  amal: JurnalDto['amal'];
  tavsif: string;
  oldin: Record<string, unknown> | null;
  keyin: Record<string, unknown>;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

/** Appends one row. Call inside the same transaction as the change. */
export async function yozJurnal(db: Queryable, by: Muallif, e: JurnalYozuvi): Promise<void> {
  await db.query(
    `INSERT INTO jurnal (at, admin_id, admin_nomi, obyekt, obyekt_id, loyiha_id, amal, tavsif, oldin, keyin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      by.at,
      by.admin.id,
      by.admin.nomi,
      e.obyekt,
      e.obyektId,
      e.loyihaId,
      e.amal,
      e.tavsif,
      e.oldin === null ? null : JSON.stringify(e.oldin),
      JSON.stringify(e.keyin),
    ],
  );
}

/**
 * Only the fields whose value differs, as {oldin, keyin}; null when nothing changed.
 * Values are compared as JSON, so nested objects (texts in two languages) work.
 */
export function farq<T extends object>(
  before: T,
  after: T,
): { oldin: Record<string, unknown>; keyin: Record<string, unknown> } | null {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const oldin: Record<string, unknown> = {};
  const keyin: Record<string, unknown> = {};
  for (const k of Object.keys(a)) {
    if (canonical(b[k]) !== canonical(a[k])) {
      oldin[k] = b[k] ?? null;
      keyin[k] = a[k] ?? null;
    }
  }
  return Object.keys(keyin).length ? { oldin, keyin } : null;
}

/** JSON with object keys sorted (jsonb does not keep key order). */
function canonical(v: unknown): string {
  return JSON.stringify(v ?? null, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1)))
      : x,
  );
}

interface JurnalRow {
  id: string;
  at: Date;
  admin_id: number | null;
  admin_nomi: string;
  obyekt: JurnalObyekt;
  obyekt_id: number;
  amal: JurnalDto['amal'];
  tavsif: string;
  oldin: Record<string, unknown> | null;
  keyin: Record<string, unknown>;
}

export interface JurnalFilter {
  loyihaId?: number;
  obyekt?: JurnalObyekt;
  obyektId?: number;
  /** Page back: rows older than this id. */
  beforeId?: number;
  limit?: number;
}

/** Newest first. */
export async function listJurnal(db: pg.Pool, f: JurnalFilter = {}): Promise<JurnalDto[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace('?', `$${args.length}`));
  };
  if (f.loyihaId !== undefined) add('loyiha_id = ?', f.loyihaId);
  if (f.obyekt !== undefined) add('obyekt = ?', f.obyekt);
  if (f.obyektId !== undefined) add('obyekt_id = ?', f.obyektId);
  if (f.beforeId !== undefined) add('id < ?', f.beforeId);
  args.push(Math.min(f.limit ?? 100, 500));
  const { rows } = await db.query<JurnalRow>(
    `SELECT * FROM jurnal ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY id DESC LIMIT $${args.length}`,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: r.at.toISOString(),
    admin: { id: r.admin_id, nomi: r.admin_nomi },
    obyekt: r.obyekt,
    obyektId: r.obyekt_id,
    amal: r.amal,
    tavsif: r.tavsif,
    oldin: r.oldin,
    keyin: r.keyin,
  }));
}
