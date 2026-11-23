import type {
  AdminBlokDto,
  AdminLoyihaDto,
  AdminLoyihaInput,
  AdminLoyihaListItem,
  AdminPlanirovkaDto,
  AdminPlanirovkaInput,
  LokalDto,
} from '@yh/shared';
import type pg from 'pg';
import { planirovkaHolati } from '../katalog/katalog';
import { farq, yozJurnal, type Muallif } from './jurnal';

/**
 * Write side of the Katalog for the admin-panel. Every change runs in one
 * transaction together with its jurnal row. Callers (routes, import) must call
 * `katalog.invalidate()` afterwards so the Mini App and the AI API see it.
 *
 * Counts (ADR 0003): a Planirovka's bo'sh / bron / sotilgan / jami and its
 * Boshlang'ich narx are read from `planirovka_view` (counted from its
 * Xonadonlar). Xonadon writes are in xonadon-admin.ts.
 */

export class KatalogAdminError extends Error {
  constructor(
    readonly code: 'not_found' | 'slug_taken' | 'blok_taken' | 'xonadon_taken' | 'planirovka_boshqa_blokda',
    readonly status: 400 | 404 | 409,
  ) {
    super(code);
  }
}

const notFound = () => new KatalogAdminError('not_found', 404);

// ---- rows ↔ DTOs ----

interface LoyihaRow {
  id: number;
  slug: string;
  nomi: string;
  shahar: AdminLoyihaInput['shahar'];
  holat: AdminLoyihaInput['holat'];
  manzil: LokalDto;
  qisqa_tavsif: LokalDto | null;
  tavsif: LokalDto | null;
  fotolar: string[];
  video_url: string | null;
  qavatlar_soni: number | null;
  lat: number | null;
  lng: number | null;
  infratuzilma: AdminLoyihaInput['infratuzilma'];
  tartib: number;
  korsatuv_manzili: LokalDto | null;
  crm_responsible_id: string | null;
}

interface BlokRow {
  id: number;
  loyiha_id: number;
  nomi: string;
  tartib: number;
}

interface PlanirovkaRow {
  id: number;
  blok_id: number;
  xonalar: number;
  maydon: string;
  nomi: LokalDto | null;
  chizma_url: string | null;
  video_url: string | null;
  qolda_narx: string | null;
  /** Derived columns of planirovka_view. */
  boshlangich_narx: string | null;
  bosh: number;
  bron: number;
  sotilgan: number;
  tartib: number;
}

function loyihaInput(r: LoyihaRow): AdminLoyihaInput {
  return {
    slug: r.slug,
    nomi: r.nomi,
    shahar: r.shahar,
    holat: r.holat,
    manzil: r.manzil,
    qisqaTavsif: r.qisqa_tavsif,
    tavsif: r.tavsif,
    fotolar: r.fotolar,
    video: r.video_url,
    qavatlarSoni: r.qavatlar_soni,
    xarita: r.lat === null || r.lng === null ? null : { lat: r.lat, lng: r.lng },
    infratuzilma: r.infratuzilma.map((i) => ({ kategoriya: i.kategoriya, nomi: i.nomi, masofa: i.masofa ?? null })),
    tartib: r.tartib,
    korsatuvManzili: r.korsatuv_manzili,
    crmMasulId: r.crm_responsible_id,
  };
}

function planirovkaDto(r: PlanirovkaRow, oxirgiOzgarish: AdminPlanirovkaDto['oxirgiOzgarish'] = null): AdminPlanirovkaDto {
  return {
    id: r.id,
    blokId: r.blok_id,
    xonalar: r.xonalar,
    maydon: Number(r.maydon),
    nomi: r.nomi,
    chizma: r.chizma_url,
    video: r.video_url,
    qoldaNarx: r.qolda_narx === null ? null : Number(r.qolda_narx),
    boshlangichNarx: r.boshlangich_narx === null ? null : Number(r.boshlangich_narx),
    tartib: r.tartib,
    bosh: r.bosh,
    bron: r.bron,
    sotilgan: r.sotilgan,
    jami: r.bosh + r.bron + r.sotilgan,
    holat: planirovkaHolati(r),
    oxirgiOzgarish,
  };
}

function loyihaParams(i: AdminLoyihaInput) {
  return [
    i.slug,
    i.nomi,
    i.shahar,
    i.holat,
    JSON.stringify(i.manzil),
    i.qisqaTavsif ? JSON.stringify(i.qisqaTavsif) : null,
    i.tavsif ? JSON.stringify(i.tavsif) : null,
    i.fotolar,
    i.video,
    i.qavatlarSoni,
    i.xarita?.lat ?? null,
    i.xarita?.lng ?? null,
    JSON.stringify(i.infratuzilma),
    i.tartib,
    i.korsatuvManzili ? JSON.stringify(i.korsatuvManzili) : null,
    i.crmMasulId,
  ];
}

/** What the jurnal stores of a Planirovka: its own fields (counts are its Xonadonlar', jurnaled there). */
const planirovkaFields = (p: AdminPlanirovkaDto) => ({
  xonalar: p.xonalar,
  maydon: p.maydon,
  nomi: p.nomi,
  chizma: p.chizma,
  video: p.video,
  qoldaNarx: p.qoldaNarx,
  tartib: p.tartib,
});

const planirovkaTavsif = (loyiha: string, blok: string, p: AdminPlanirovkaInput) =>
  `${loyiha} · ${blok} blok · ${p.xonalar} xona, ${p.maydon} m²${p.nomi ? ` · ${p.nomi.uz}` : ''}`;

// ---- transactions ----

export async function tx<T>(db: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK');
    if ((err as { code?: string }).code === '23505') {
      const constraint = (err as { constraint?: string }).constraint ?? '';
      throw new KatalogAdminError(
        constraint.startsWith('blok') ? 'blok_taken' : constraint === 'xonadon_joyi' ? 'xonadon_taken' : 'slug_taken',
        409,
      );
    }
    throw err;
  } finally {
    c.release();
  }
}

// ---- reads ----

export async function listLoyihalar(db: pg.Pool): Promise<AdminLoyihaListItem[]> {
  const { rows } = await db.query<{
    id: number;
    slug: string;
    nomi: string;
    shahar: AdminLoyihaListItem['shahar'];
    holat: AdminLoyihaListItem['holat'];
    bloklar_soni: number;
    planirovkalar_soni: number;
    bosh: number;
    bron: number;
    sotilgan: number;
  }>(
    `SELECT l.id, l.slug, l.nomi, l.shahar, l.holat,
            (SELECT count(*)::int FROM blok b WHERE b.loyiha_id = l.id) AS bloklar_soni,
            count(p.id)::int AS planirovkalar_soni,
            COALESCE(sum(p.bosh), 0)::int AS bosh,
            COALESCE(sum(p.bron), 0)::int AS bron,
            COALESCE(sum(p.sotilgan), 0)::int AS sotilgan
       FROM loyiha l
       LEFT JOIN blok b ON b.loyiha_id = l.id
       LEFT JOIN planirovka_view p ON p.blok_id = b.id
      GROUP BY l.id
      ORDER BY l.holat DESC, l.shahar DESC, l.tartib, l.nomi, l.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    nomi: r.nomi,
    shahar: r.shahar,
    holat: r.holat,
    bloklarSoni: r.bloklar_soni,
    planirovkalarSoni: r.planirovkalar_soni,
    bosh: r.bosh,
    bron: r.bron,
    sotilgan: r.sotilgan,
    jami: r.bosh + r.bron + r.sotilgan,
  }));
}

export async function getLoyiha(db: pg.Pool, id: number): Promise<AdminLoyihaDto | null> {
  const l = (await db.query<LoyihaRow>('SELECT * FROM loyiha WHERE id = $1', [id])).rows[0];
  if (!l) return null;
  const bloklar = (await db.query<BlokRow>('SELECT * FROM blok WHERE loyiha_id = $1 ORDER BY tartib, nomi, id', [id]))
    .rows;
  const planirovkaRows = (
    await db.query<PlanirovkaRow>(
      `SELECT p.* FROM planirovka_view p JOIN blok b ON b.id = p.blok_id
        WHERE b.loyiha_id = $1 ORDER BY p.xonalar, p.maydon, p.tartib, p.id`,
      [id],
    )
  ).rows;
  const oxirgi = new Map(
    (
      await db.query<{ obyekt_id: number; admin_nomi: string; at: Date }>(
        `SELECT DISTINCT ON (obyekt_id) obyekt_id, admin_nomi, at FROM jurnal
          WHERE loyiha_id = $1 AND obyekt = 'planirovka' ORDER BY obyekt_id, id DESC`,
        [id],
      )
    ).rows.map((r) => [r.obyekt_id, { nomi: r.admin_nomi, at: r.at.toISOString() }]),
  );
  const planirovkalar = planirovkaRows.map((r) => planirovkaDto(r, oxirgi.get(r.id) ?? null));
  return {
    id: l.id,
    ...loyihaInput(l),
    bloklar: bloklar.map(
      (b): AdminBlokDto => ({
        id: b.id,
        loyihaId: b.loyiha_id,
        nomi: b.nomi,
        tartib: b.tartib,
        planirovkalar: planirovkalar.filter((p) => p.blokId === b.id),
      }),
    ),
  };
}

// ---- Loyiha ----

export async function createLoyiha(db: pg.Pool, by: Muallif, input: AdminLoyihaInput): Promise<AdminLoyihaDto> {
  const id = await tx(db, async (c) => {
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO loyiha (slug, nomi, shahar, holat, manzil, qisqa_tavsif, tavsif, fotolar, video_url,
                           qavatlar_soni, lat, lng, infratuzilma, tartib, korsatuv_manzili, crm_responsible_id,
                           created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17) RETURNING id`,
      [...loyihaParams(input), by.at],
    );
    const id = rows[0]!.id;
    await yozJurnal(c, by, {
      obyekt: 'loyiha',
      obyektId: id,
      loyihaId: id,
      amal: 'yaratildi',
      tavsif: input.nomi,
      oldin: null,
      keyin: { nomi: input.nomi, shahar: input.shahar, holat: input.holat },
    });
    return id;
  });
  return (await getLoyiha(db, id))!;
}

export async function updateLoyiha(
  db: pg.Pool,
  by: Muallif,
  id: number,
  patch: Partial<AdminLoyihaInput>,
): Promise<AdminLoyihaDto> {
  await tx(db, async (c) => {
    const row = (await c.query<LoyihaRow>('SELECT * FROM loyiha WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw notFound();
    const before = loyihaInput(row);
    const after: AdminLoyihaInput = { ...before, ...patch };
    const d = farq(before, after);
    if (!d) return;
    await c.query(
      `UPDATE loyiha SET slug = $1, nomi = $2, shahar = $3, holat = $4, manzil = $5, qisqa_tavsif = $6, tavsif = $7,
              fotolar = $8, video_url = $9, qavatlar_soni = $10, lat = $11, lng = $12, infratuzilma = $13,
              tartib = $14, korsatuv_manzili = $15, crm_responsible_id = $16, updated_at = $17
        WHERE id = $18`,
      [...loyihaParams(after), by.at, id],
    );
    await yozJurnal(c, by, { obyekt: 'loyiha', obyektId: id, loyihaId: id, amal: 'tahrirlandi', tavsif: after.nomi, ...d });
  });
  return (await getLoyiha(db, id))!;
}

// ---- Blok ----

async function loyihaNomi(c: pg.PoolClient, loyihaId: number): Promise<string> {
  const r = (await c.query<{ nomi: string }>('SELECT nomi FROM loyiha WHERE id = $1', [loyihaId])).rows[0];
  if (!r) throw notFound();
  return r.nomi;
}

export async function createBlok(
  db: pg.Pool,
  by: Muallif,
  loyihaId: number,
  input: { nomi: string; tartib?: number },
): Promise<AdminBlokDto> {
  return tx(db, (c) => createBlokIn(c, by, loyihaId, input));
}

/** `createBlok` inside the caller's transaction (import). */
export async function createBlokIn(
  c: pg.PoolClient,
  by: Muallif,
  loyihaId: number,
  input: { nomi: string; tartib?: number },
): Promise<AdminBlokDto> {
  const lnomi = await loyihaNomi(c, loyihaId);
  const tartib =
    input.tartib ??
    (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM blok WHERE loyiha_id = $1', [loyihaId])).rows[0]!.n;
  const { rows } = await c.query<BlokRow>(
    'INSERT INTO blok (loyiha_id, nomi, tartib) VALUES ($1, $2, $3) RETURNING *',
    [loyihaId, input.nomi, tartib],
  );
  const b = rows[0]!;
  await yozJurnal(c, by, {
    obyekt: 'blok',
    obyektId: b.id,
    loyihaId,
    amal: 'yaratildi',
    tavsif: `${lnomi} · ${b.nomi} blok`,
    oldin: null,
    keyin: { nomi: b.nomi },
  });
  return { id: b.id, loyihaId, nomi: b.nomi, tartib: b.tartib, planirovkalar: [] };
}

export async function updateBlok(
  db: pg.Pool,
  by: Muallif,
  id: number,
  patch: { nomi?: string; tartib?: number },
): Promise<{ id: number; loyihaId: number; nomi: string; tartib: number }> {
  return tx(db, async (c) => {
    const b = (await c.query<BlokRow>('SELECT * FROM blok WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!b) throw notFound();
    const before = { nomi: b.nomi, tartib: b.tartib };
    const after = { ...before, ...patch };
    const d = farq(before, after);
    if (d) {
      await c.query('UPDATE blok SET nomi = $1, tartib = $2 WHERE id = $3', [after.nomi, after.tartib, id]);
      await yozJurnal(c, by, {
        obyekt: 'blok',
        obyektId: id,
        loyihaId: b.loyiha_id,
        amal: 'tahrirlandi',
        tavsif: `${await loyihaNomi(c, b.loyiha_id)} · ${after.nomi} blok`,
        ...d,
      });
    }
    return { id, loyihaId: b.loyiha_id, ...after };
  });
}

// ---- Planirovka ----

/** The Blok's Planirovkalar with counts (admin Xonadonlar screen). */
export async function planirovkalarOfBlok(db: pg.Pool, blokId: number): Promise<AdminPlanirovkaDto[]> {
  const { rows } = await db.query<PlanirovkaRow>(
    'SELECT * FROM planirovka_view WHERE blok_id = $1 ORDER BY xonalar, maydon, tartib, id',
    [blokId],
  );
  return rows.map((r) => planirovkaDto(r));
}

export async function blokOf(c: pg.PoolClient, blokId: number): Promise<{ loyihaId: number; loyihaNomi: string; blokNomi: string }> {
  const r = (
    await c.query<{ loyiha_id: number; loyiha_nomi: string; blok_nomi: string }>(
      `SELECT b.loyiha_id, l.nomi AS loyiha_nomi, b.nomi AS blok_nomi
         FROM blok b JOIN loyiha l ON l.id = b.loyiha_id WHERE b.id = $1`,
      [blokId],
    )
  ).rows[0];
  if (!r) throw notFound();
  return { loyihaId: r.loyiha_id, loyihaNomi: r.loyiha_nomi, blokNomi: r.blok_nomi };
}

export type PlanirovkaCreateInput = Partial<AdminPlanirovkaInput> & Pick<AdminPlanirovkaInput, 'xonalar' | 'maydon'>;

export async function createPlanirovka(
  db: pg.Pool,
  by: Muallif,
  blokId: number,
  input: PlanirovkaCreateInput,
): Promise<AdminPlanirovkaDto> {
  return tx(db, (c) => createPlanirovkaIn(c, by, blokId, input));
}

/** `createPlanirovka` inside the caller's transaction (import). */
export async function createPlanirovkaIn(
  c: pg.PoolClient,
  by: Muallif,
  blokId: number,
  input: PlanirovkaCreateInput,
): Promise<AdminPlanirovkaDto> {
  const where = await blokOf(c, blokId);
  const tartib =
    input.tartib ??
    (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM planirovka WHERE blok_id = $1', [blokId])).rows[0]!.n;
  const { rows } = await c.query<{ id: number }>(
    `INSERT INTO planirovka (blok_id, xonalar, maydon, nomi, chizma_url, video_url, qolda_narx,
                             tartib, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
    [
      blokId,
      input.xonalar,
      input.maydon,
      input.nomi ? JSON.stringify(input.nomi) : null,
      input.chizma ?? null,
      input.video ?? null,
      input.qoldaNarx ?? null,
      tartib,
      by.at,
    ],
  );
  const id = rows[0]!.id;
  const p = planirovkaDto(await viewRow(c, id), { nomi: by.admin.nomi, at: by.at.toISOString() });
  await yozJurnal(c, by, {
    obyekt: 'planirovka',
    obyektId: p.id,
    loyihaId: where.loyihaId,
    amal: 'yaratildi',
    tavsif: planirovkaTavsif(where.loyihaNomi, where.blokNomi, p),
    oldin: null,
    keyin: planirovkaFields(p),
  });
  return p;
}

/** Edits a Planirovka's own fields (Administrator). Counts come from its Xonadonlar. */
export async function updatePlanirovka(
  db: pg.Pool,
  by: Muallif,
  id: number,
  patch: Partial<AdminPlanirovkaInput>,
): Promise<AdminPlanirovkaDto> {
  return tx(db, (c) => changePlanirovkaIn(c, by, id, () => patch));
}

type PlanirovkaChange = Partial<AdminPlanirovkaInput>;

/** `updatePlanirovka` inside the caller's transaction (import). No-op when nothing differs. */
export async function setPlanirovkaIn(
  c: pg.PoolClient,
  by: Muallif,
  id: number,
  fields: PlanirovkaChange,
): Promise<AdminPlanirovkaDto> {
  return changePlanirovkaIn(c, by, id, () => fields);
}

async function viewRow(c: pg.PoolClient, id: number): Promise<PlanirovkaRow> {
  return (await c.query<PlanirovkaRow>('SELECT * FROM planirovka_view WHERE id = $1', [id])).rows[0]!;
}

async function changePlanirovkaIn(
  c: pg.PoolClient,
  by: Muallif,
  id: number,
  change: (p: AdminPlanirovkaDto) => PlanirovkaChange,
): Promise<AdminPlanirovkaDto> {
  if (!(await c.query('SELECT 1 FROM planirovka WHERE id = $1 FOR UPDATE', [id])).rowCount) throw notFound();
  const row = await viewRow(c, id);
  const before = planirovkaDto(row);
  const merged = { ...before, ...change(before) };
  await c.query(
    `UPDATE planirovka SET xonalar = $1, maydon = $2, nomi = $3, chizma_url = $4, video_url = $5,
            qolda_narx = $6, tartib = $7 WHERE id = $8`,
    [
      merged.xonalar,
      merged.maydon,
      merged.nomi ? JSON.stringify(merged.nomi) : null,
      merged.chizma,
      merged.video,
      merged.qoldaNarx,
      merged.tartib,
      id,
    ],
  );
  const after: AdminPlanirovkaDto = {
    ...planirovkaDto(await viewRow(c, id)),
    oxirgiOzgarish: { nomi: by.admin.nomi, at: by.at.toISOString() },
  };
  const d = farq(planirovkaFields(before), planirovkaFields(after));
  if (!d) return before;
  await c.query('UPDATE planirovka SET updated_at = $1 WHERE id = $2', [by.at, id]);
  const where = await blokOf(c, row.blok_id);
  await yozJurnal(c, by, {
    obyekt: 'planirovka',
    obyektId: id,
    loyihaId: where.loyihaId,
    amal: 'tahrirlandi',
    tavsif: planirovkaTavsif(where.loyihaNomi, where.blokNomi, after),
    ...d,
  });
  return after;
}
