import type { AdminBlokXonadonlarResponse, AdminXonadonDto, AdminXonadonInput, XonadonHolati } from '@yh/shared';
import type pg from 'pg';
import { sevimliBandBoldi, sevimliXonadonBandBoldi } from '../dojim/dojim';
import { farq, yozJurnal, type Muallif } from './jurnal';
import { blokOf, KatalogAdminError, planirovkalarOfBlok, tx } from './katalog-admin';

/**
 * Xonadonlar in the admin-panel (ADR 0003). A Xonadon is the source of truth:
 * its Planirovka's counts, jami and Boshlang'ich narx are derived from it.
 * Every write runs in one transaction with one jurnal row per Xonadon; the
 * route calls `katalog.invalidate()` afterwards.
 *
 * Roles are checked by the route: Menejer may change holat only.
 */

interface XonadonRow {
  id: number;
  blok_id: number;
  planirovka_id: number;
  qavat: number;
  raqam: number;
  narx: string | null;
  holat: XonadonHolati;
}

const notFound = () => new KatalogAdminError('not_found', 404);

function xonadonDto(r: XonadonRow, oxirgiOzgarish: AdminXonadonDto['oxirgiOzgarish'] = null): AdminXonadonDto {
  return {
    id: r.id,
    blokId: r.blok_id,
    planirovkaId: r.planirovka_id,
    qavat: r.qavat,
    raqam: r.raqam,
    narx: r.narx === null ? null : Number(r.narx),
    holat: r.holat,
    oxirgiOzgarish,
  };
}

/** What the jurnal keeps of a Xonadon. */
const fields = (x: AdminXonadonInput) => ({
  planirovkaId: x.planirovkaId,
  qavat: x.qavat,
  raqam: x.raqam,
  narx: x.narx,
  holat: x.holat,
});

async function tavsif(c: pg.PoolClient, blokId: number, x: AdminXonadonInput) {
  const where = await blokOf(c, blokId);
  const p = (
    await c.query<{ xonalar: number; maydon: string }>('SELECT xonalar, maydon FROM planirovka WHERE id = $1', [
      x.planirovkaId,
    ])
  ).rows[0];
  const turi = p ? ` · ${p.xonalar} xona, ${Number(p.maydon)} m²` : '';
  return {
    loyihaId: where.loyihaId,
    tavsif: `${where.loyihaNomi} · ${where.blokNomi} blok · ${x.qavat}-qavat, ${x.raqam}-xonadon${turi}`,
  };
}

const boshOf = async (c: pg.PoolClient, planirovkaId: number) =>
  (await c.query<{ bosh: number }>('SELECT bosh FROM planirovka_view WHERE id = $1', [planirovkaId])).rows[0]?.bosh ?? 0;

/**
 * Runs a Xonadon write and, when it leaves a Planirovka with no bo'sh
 * Xonadon (it had some before), tells the dojim (#17: «sevimli Planirovkada
 * bo'sh qolmadi»). The Xonadon-level trigger (#25) is in `updateXonadonIn`.
 */
async function boshKuzat<T>(c: pg.PoolClient, at: Date, planirovkaIds: number[], write: () => Promise<T>): Promise<T> {
  const ids = [...new Set(planirovkaIds)];
  const oldin = await Promise.all(ids.map((id) => boshOf(c, id)));
  const out = await write();
  for (const [i, id] of ids.entries()) {
    if (oldin[i]! > 0 && (await boshOf(c, id)) === 0) await sevimliBandBoldi(c, id, at);
  }
  return out;
}

async function checkPlanirovka(c: pg.PoolClient, blokId: number, planirovkaId: number) {
  const { rowCount } = await c.query('SELECT 1 FROM planirovka WHERE id = $1 AND blok_id = $2', [planirovkaId, blokId]);
  if (!rowCount) throw new KatalogAdminError('planirovka_boshqa_blokda', 400);
}

// ---- reads ----

export async function listBlokXonadonlari(db: pg.Pool, blokId: number): Promise<AdminBlokXonadonlarResponse | null> {
  const blok = (
    await db.query<{ id: number; nomi: string; loyiha_id: number; loyiha_nomi: string }>(
      `SELECT b.id, b.nomi, b.loyiha_id, l.nomi AS loyiha_nomi FROM blok b JOIN loyiha l ON l.id = b.loyiha_id
        WHERE b.id = $1`,
      [blokId],
    )
  ).rows[0];
  if (!blok) return null;
  const rows = (
    await db.query<XonadonRow>('SELECT * FROM xonadon WHERE blok_id = $1 ORDER BY qavat, raqam, id', [blokId])
  ).rows;
  const oxirgi = new Map(
    (
      await db.query<{ obyekt_id: number; admin_nomi: string; at: Date }>(
        `SELECT DISTINCT ON (obyekt_id) obyekt_id, admin_nomi, at FROM jurnal
          WHERE obyekt = 'xonadon' AND obyekt_id = ANY($1::int[]) ORDER BY obyekt_id, id DESC`,
        [rows.map((r) => r.id)],
      )
    ).rows.map((r) => [r.obyekt_id, { nomi: r.admin_nomi, at: r.at.toISOString() }]),
  );
  return {
    blok: { id: blok.id, nomi: blok.nomi, loyihaId: blok.loyiha_id, loyihaNomi: blok.loyiha_nomi },
    planirovkalar: await planirovkalarOfBlok(db, blokId),
    xonadonlar: rows.map((r) => xonadonDto(r, oxirgi.get(r.id) ?? null)),
  };
}

// ---- writes ----

export type XonadonCreateInput = Omit<AdminXonadonInput, 'narx' | 'holat'> &
  Partial<Pick<AdminXonadonInput, 'narx' | 'holat'>>;

export async function createXonadon(
  db: pg.Pool,
  by: Muallif,
  blokId: number,
  input: XonadonCreateInput,
): Promise<AdminXonadonDto> {
  return tx(db, (c) => createXonadonIn(c, by, blokId, input));
}

/** `createXonadon` inside the caller's transaction (import). */
export async function createXonadonIn(
  c: pg.PoolClient,
  by: Muallif,
  blokId: number,
  input: XonadonCreateInput,
): Promise<AdminXonadonDto> {
  await blokOf(c, blokId);
  await checkPlanirovka(c, blokId, input.planirovkaId);
  const x: AdminXonadonInput = { narx: null, holat: 'bosh', ...input };
  const { rows } = await c.query<XonadonRow>(
    `INSERT INTO xonadon (blok_id, planirovka_id, qavat, raqam, narx, holat, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
    [blokId, x.planirovkaId, x.qavat, x.raqam, x.narx, x.holat, by.at],
  );
  const dto = xonadonDto(rows[0]!, { nomi: by.admin.nomi, at: by.at.toISOString() });
  await yozJurnal(c, by, {
    obyekt: 'xonadon',
    obyektId: dto.id,
    amal: 'yaratildi',
    ...(await tavsif(c, blokId, x)),
    oldin: null,
    keyin: fields(dto),
  });
  return dto;
}

/** Changes any fields (Administrator) or holat only (Menejer; the route checks). No-op edits write nothing. */
export async function updateXonadon(
  db: pg.Pool,
  by: Muallif,
  id: number,
  patch: Partial<AdminXonadonInput>,
): Promise<AdminXonadonDto> {
  return tx(db, (c) => updateXonadonIn(c, by, id, patch));
}

/** Sets one holat on several Xonadonlar at once (both roles); one jurnal row per changed Xonadon. */
export async function setXonadonlarHolati(
  db: pg.Pool,
  by: Muallif,
  ids: number[],
  holat: XonadonHolati,
): Promise<AdminXonadonDto[]> {
  return tx(db, async (c) => {
    const out: AdminXonadonDto[] = [];
    for (const id of [...new Set(ids)]) out.push(await updateXonadonIn(c, by, id, { holat }));
    return out;
  });
}

/** `updateXonadon` inside the caller's transaction (import); fires the dojim hook like the form does. */
export async function updateXonadonIn(
  c: pg.PoolClient,
  by: Muallif,
  id: number,
  patch: Partial<AdminXonadonInput>,
): Promise<AdminXonadonDto> {
  const row = (await c.query<XonadonRow>('SELECT * FROM xonadon WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!row) throw notFound();
  const before = xonadonDto(row);
  const after: AdminXonadonDto = { ...before, ...patch };
  const d = farq(fields(before), fields(after));
  if (!d) return before;
  if (after.planirovkaId !== before.planirovkaId) await checkPlanirovka(c, row.blok_id, after.planirovkaId);
  await boshKuzat(c, by.at, [before.planirovkaId, after.planirovkaId], () =>
    c.query(
      `UPDATE xonadon SET planirovka_id = $1, qavat = $2, raqam = $3, narx = $4, holat = $5, updated_at = $6
        WHERE id = $7`,
      [after.planirovkaId, after.qavat, after.raqam, after.narx, after.holat, by.at, id],
    ),
  );
  // TZ UF-3: a sevimli Xonadon went bron (or sotilgan) → o'xshash bo'sh Xonadonlar (#25).
  if (before.holat === 'bosh' && after.holat !== 'bosh') await sevimliXonadonBandBoldi(c, id, by.at);
  await yozJurnal(c, by, {
    obyekt: 'xonadon',
    obyektId: id,
    amal: 'tahrirlandi',
    ...(await tavsif(c, row.blok_id, after)),
    ...d,
  });
  return { ...after, oxirgiOzgarish: { nomi: by.admin.nomi, at: by.at.toISOString() } };
}

/** Removes a Xonadon (Administrator): its Planirovka's jami goes down by one. */
export async function deleteXonadon(db: pg.Pool, by: Muallif, id: number): Promise<void> {
  await tx(db, async (c) => {
    const found = (await c.query<XonadonRow>('SELECT * FROM xonadon WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!found) throw notFound();
    const row = await boshKuzat(c, by.at, [found.planirovka_id], async () =>
      (await c.query<XonadonRow>('DELETE FROM xonadon WHERE id = $1 RETURNING *', [id])).rows[0]!,
    );
    const x = xonadonDto(row);
    await yozJurnal(c, by, {
      obyekt: 'xonadon',
      obyektId: id,
      amal: 'ochirildi',
      ...(await tavsif(c, row.blok_id, x)),
      oldin: fields(x),
      keyin: {},
    });
  });
}
