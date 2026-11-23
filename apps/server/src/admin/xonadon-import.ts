import {
  IMPORT_FAYLDA_YOQ_MAX,
  type ImportFayldaYoq,
  type ImportNatija,
  type ImportQator,
  type ImportReja,
  type ImportTekshirResponse,
  type ImportXato,
  type LokalDto,
  type XonadonHolati,
} from '@yh/shared';
import type pg from 'pg';
import { parseVideo } from '../katalog/katalog';
import { JadvalError, readJadval } from './jadval';
import { type Muallif } from './jurnal';
import { createBlokIn, createPlanirovkaIn, KatalogAdminError, setPlanirovkaIn, tx } from './katalog-admin';
import { createXonadonIn, updateXonadonIn } from './xonadon-admin';
import { writeXlsx } from './xlsx';

/**
 * Xonadonlar of a Loyiha from an Excel / CSV file made by the shablon (#6,
 * #24, ADR 0003): one row = one Xonadon.
 *
 * - A Xonadon is found by its place: Blok nomi (case-insensitive) + qavat +
 *   raqam. Found → its Planirovka, narx and holat are set from the row; not
 *   found → created. The same place twice in the file is a row error.
 * - A row's Planirovka is found in its Blok by xonalar + maydon + Planirovka
 *   nomi (case-insensitive; empty = without a name). Not found → created
 *   (once, with the chizma / video of its rows); found → the chizma / video
 *   given in the file replace the Planirovka's (an empty cell keeps it). Rows
 *   of one Planirovka must not disagree on chizma / video.
 * - Unknown Blok → created.
 * - Xonadonlar of the Loyiha that are not in the file are left as they are
 *   (never deleted: they are listed in the reja as «faylda yo'q»).
 *
 * `tekshir` reports every problem with its row number and what would be done;
 * `importQil` checks again and, only when there is no problem, writes all rows
 * in one transaction through the admin-panel's own write functions, so every
 * Xonadon gets its jurnal row and a Xonadon that loses the last bo'sh place of
 * a sevimli Planirovka tells the dojim.
 */

type Ustun = 'blok' | 'qavat' | 'raqam' | 'xonalar' | 'maydon' | 'nomi' | 'narx' | 'holat' | 'chizma' | 'video';

/** Shablon columns, in order, with the labels the manager sees. */
export const USTUNLAR: { key: Ustun; label: string; width: number }[] = [
  { key: 'blok', label: 'Blok', width: 8 },
  { key: 'qavat', label: 'qavat', width: 7 },
  { key: 'raqam', label: 'raqam', width: 8 },
  { key: 'xonalar', label: 'xonalar', width: 9 },
  { key: 'maydon', label: 'maydon', width: 9 },
  { key: 'nomi', label: 'Planirovka', width: 18 },
  { key: 'narx', label: 'narx', width: 16 },
  { key: 'holat', label: 'holat', width: 10 },
  { key: 'chizma', label: 'chizma', width: 40 },
  { key: 'video', label: 'video', width: 40 },
];
const label = (k: Ustun) => USTUNLAR.find((u) => u.key === k)!.label;

/** Header spellings accepted besides the shablon's own (older names, Russian). */
const ALIASES: Record<Ustun, string[]> = {
  blok: ['blok', 'блок', 'korpus', 'корпус'],
  qavat: ['qavat', 'qavati', 'etaj', 'этаж'],
  raqam: ['raqam', 'raqami', 'xonadonraqami', 'номер', 'номерквартиры'],
  xonalar: ['xonalar', 'xona', 'xonalarsoni', 'комнаты', 'комнат'],
  maydon: ['maydon', 'm2', 'm²', 'площадь'],
  nomi: ['planirovka', 'planirovkanomi', 'nomi', 'nom', 'планировка', 'название'],
  narx: ['narx', 'narxi', 'boshlangichnarx', 'цена'],
  holat: ['holat', 'holati', 'status', 'статус'],
  chizma: ['chizma', 'rasm', 'изображение'],
  video: ['video', 'видео'],
};
const MAJBURIY: Ustun[] = ['blok', 'qavat', 'raqam', 'xonalar', 'maydon'];
export const MAX_QATORLAR = 5000;

/** Holat cell spellings (normalised like headers); empty → bo'sh. */
const HOLATLAR: Record<string, XonadonHolati> = {
  bosh: 'bosh',
  free: 'bosh',
  свободно: 'bosh',
  свободна: 'bosh',
  свободен: 'bosh',
  bron: 'bron',
  бронь: 'bron',
  забронировано: 'bron',
  reserved: 'bron',
  sotilgan: 'sotilgan',
  продано: 'sotilgan',
  продана: 'sotilgan',
  sold: 'sotilgan',
};
/** How the shablon writes a holat. */
const HOLAT_YOZUV: Record<XonadonHolati, string> = { bosh: "bo'sh", bron: 'bron', sotilgan: 'sotilgan' };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[ʻʼ'`‘’]/g, '')
    .replace(/[^\p{L}\p{N}²]/gu, '');
const normKey = (s: string) => s.trim().toLowerCase();

interface FaylQatori {
  qator: number;
  blok: string;
  qavat: number;
  raqam: number;
  xonalar: number;
  maydon: number;
  nomi: string | null;
  narx: number | null;
  holat: XonadonHolati;
  chizma: string | null;
  video: string | null;
}

/** A Planirovka within a Loyiha: Blok + xonalar + maydon + nomi. */
const turKey = (blok: string, xonalar: number, maydon: number, nomi: string | null) =>
  [normKey(blok), xonalar, maydon, normKey(nomi ?? '')].join('|');
const joyKey = (blok: string, qavat: number, raqam: number) => [normKey(blok), qavat, raqam].join('|');

// ---- reading the file ----

function readQatorlar(file: Buffer): { qatorlar: FaylQatori[]; xatolar: ImportXato[] } {
  let rows: string[][];
  try {
    rows = readJadval(file);
  } catch (err) {
    if (err instanceof JadvalError)
      return { qatorlar: [], xatolar: [{ qator: null, xabar: "Faylni o'qib bo'lmadi: shablondagi .xlsx yoki .csv yuklang" }] };
    throw err;
  }
  const headerIdx = rows.findIndex((r) => r.some((c) => c !== ''));
  if (headerIdx < 0) return { qatorlar: [], xatolar: [{ qator: null, xabar: "Fayl bo'sh" }] };

  const cols = new Map<Ustun, number>();
  rows[headerIdx]!.forEach((cell, i) => {
    const h = norm(cell);
    const key = (Object.keys(ALIASES) as Ustun[]).find((k) => ALIASES[k].includes(h));
    if (key && !cols.has(key)) cols.set(key, i);
  });
  const missing = MAJBURIY.filter((k) => !cols.has(k));
  if (missing.length)
    return {
      qatorlar: [],
      xatolar: missing.map((k) => ({ qator: headerIdx + 1, ustun: label(k), xabar: `«${label(k)}» ustuni yo'q` })),
    };

  const data = rows
    .map((r, i) => ({ r, qator: i + 1 }))
    .slice(headerIdx + 1)
    .filter(({ r }) => r.some((c) => c !== ''));
  if (data.length === 0) return { qatorlar: [], xatolar: [{ qator: null, xabar: "Faylda Xonadon qatorlari yo'q" }] };
  if (data.length > MAX_QATORLAR)
    return { qatorlar: [], xatolar: [{ qator: null, xabar: `Faylda ${MAX_QATORLAR} tadan ko'p qator bor` }] };

  const xatolar: ImportXato[] = [];
  const qatorlar: FaylQatori[] = [];
  for (const { r, qator } of data) {
    const cell = (k: Ustun) => (cols.has(k) ? (r[cols.get(k)!] ?? '') : '');
    const xato = (k: Ustun, xabar: string) => {
      xatolar.push({ qator, ustun: label(k), xabar });
      return undefined;
    };
    const butun = (k: Ustun, min: number, max: number) => {
      const v = cell(k).replace(/\s/g, '');
      if (v === '') return xato(k, "to'ldirilmagan");
      const n = Number(v.replace(',', '.'));
      if (!Number.isInteger(n) || n < min || n > max) return xato(k, `${min}–${max} oralig'idagi butun son bo'lishi kerak`);
      return n;
    };

    const blok = cell('blok');
    if (!blok) xato('blok', "to'ldirilmagan");
    else if (blok.length > 20) xato('blok', '20 belgidan uzun');
    const qavat = butun('qavat', -5, 200);
    const raqam = butun('raqam', 1, 100_000);
    const xonalar = butun('xonalar', 1, 20);
    const maydonText = cell('maydon').replace(/\s/g, '').replace(',', '.');
    let maydon: number | undefined;
    if (maydonText === '') xato('maydon', "to'ldirilmagan");
    else {
      const n = Number(maydonText);
      if (!Number.isFinite(n) || n <= 0 || n > 10_000) xato('maydon', "musbat son bo'lishi kerak (m², masalan 54,5)");
      else maydon = Math.round(n * 100) / 100;
    }
    const nomi = cell('nomi') || null;
    if (nomi && nomi.length > 100) xato('nomi', '100 belgidan uzun');
    const narxText = cell('narx').replace(/\s/g, '');
    let narx: number | null | undefined = null;
    if (narxText !== '') {
      const n = Number(/^\d{1,3}(,\d{3})+$/.test(narxText) ? narxText.replace(/,/g, '') : narxText.replace(',', '.'));
      if (!Number.isInteger(n) || n <= 0 || n > 1e13)
        narx = xato('narx', "so'mda butun son bo'lishi kerak (masalan 455500000) yoki bo'sh");
      else narx = n;
    }
    const holatText = cell('holat');
    const holat: XonadonHolati | undefined =
      holatText === '' ? 'bosh' : (HOLATLAR[norm(holatText)] ?? xato('holat', "bo'sh, bron yoki sotilgan bo'lishi kerak"));
    const chizma = cell('chizma') || null;
    if (chizma && (chizma.length > 500 || !/^(https:\/\/|\/)\S+$/.test(chizma)))
      xato('chizma', "https:// bilan boshlanadigan havola bo'lishi kerak");
    const video = cell('video') || null;
    if (video && (video.length > 500 || !parseVideo(video)))
      xato('video', "https://t.me/… yoki YouTube havolasi bo'lishi kerak");

    if (
      blok &&
      blok.length <= 20 &&
      qavat !== undefined &&
      raqam !== undefined &&
      xonalar !== undefined &&
      maydon !== undefined &&
      narx !== undefined &&
      holat !== undefined
    )
      qatorlar.push({ qator, blok, qavat, raqam, xonalar, maydon, nomi, narx, holat, chizma, video });
  }

  // One place twice would make the result depend on row order; so would a Planirovka with two drawings.
  const joylar = new Map<string, number>();
  const turlar = new Map<string, { qator: number; chizma: string | null; video: string | null }>();
  for (const q of qatorlar) {
    const joy = joyKey(q.blok, q.qavat, q.raqam);
    const first = joylar.get(joy);
    if (first) xatolar.push({ qator: q.qator, xabar: `${first}-qatordagi Xonadon bilan bir joyda (Blok, qavat, raqam)` });
    else joylar.set(joy, q.qator);

    const tur = turKey(q.blok, q.xonalar, q.maydon, q.nomi);
    const t = turlar.get(tur);
    if (!t) turlar.set(tur, { qator: q.qator, chizma: q.chizma, video: q.video });
    else
      for (const k of ['chizma', 'video'] as const) {
        if (q[k] === null) continue;
        if (t[k] === null) t[k] = q[k];
        else if (t[k] !== q[k])
          xatolar.push({ qator: q.qator, ustun: label(k), xabar: `shu Planirovkaning ${t.qator}-qatoridagi ${k} boshqa` });
      }
  }
  xatolar.sort((a, b) => (a.qator ?? 0) - (b.qator ?? 0));
  return { qatorlar, xatolar };
}

// ---- matching against the Loyiha ----

interface MavjudPlanirovka {
  id: number;
  blokId: number;
  xonalar: number;
  maydon: number;
  nomi: LokalDto | null;
  chizma: string | null;
  video: string | null;
}

interface MavjudXonadon {
  id: number;
  blokId: number;
  planirovkaId: number;
  qavat: number;
  raqam: number;
  narx: number | null;
  holat: XonadonHolati;
}

interface Mavjud {
  slug: string;
  bloklar: { id: number; nomi: string }[];
  planirovkalar: MavjudPlanirovka[];
  xonadonlar: MavjudXonadon[];
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

async function mavjud(db: Queryable, loyihaId: number, lock: boolean): Promise<Mavjud | null> {
  const l = await db.query<{ slug: string }>(`SELECT slug FROM loyiha WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [
    loyihaId,
  ]);
  if (!l.rowCount) return null;
  const bloklar = (
    await db.query<{ id: number; nomi: string }>('SELECT id, nomi FROM blok WHERE loyiha_id = $1 ORDER BY tartib, nomi, id', [
      loyihaId,
    ])
  ).rows;
  const planirovkalar = (
    await db.query<{
      id: number;
      blok_id: number;
      xonalar: number;
      maydon: string;
      nomi: LokalDto | null;
      chizma_url: string | null;
      video_url: string | null;
    }>(
      `SELECT p.id, p.blok_id, p.xonalar, p.maydon, p.nomi, p.chizma_url, p.video_url
         FROM planirovka p JOIN blok b ON b.id = p.blok_id WHERE b.loyiha_id = $1
        ORDER BY p.xonalar, p.maydon, p.tartib, p.id`,
      [loyihaId],
    )
  ).rows.map((r) => ({
    id: r.id,
    blokId: r.blok_id,
    xonalar: r.xonalar,
    maydon: Number(r.maydon),
    nomi: r.nomi,
    chizma: r.chizma_url,
    video: r.video_url,
  }));
  const blokTartib = new Map(bloklar.map((b, i) => [b.id, i]));
  const xonadonlar = (
    await db.query<{
      id: number;
      blok_id: number;
      planirovka_id: number;
      qavat: number;
      raqam: number;
      narx: string | null;
      holat: XonadonHolati;
    }>(
      `SELECT x.id, x.blok_id, x.planirovka_id, x.qavat, x.raqam, x.narx, x.holat
         FROM xonadon x JOIN blok b ON b.id = x.blok_id WHERE b.loyiha_id = $1 ORDER BY x.qavat, x.raqam, x.id`,
      [loyihaId],
    )
  ).rows
    .map((r) => ({
      id: r.id,
      blokId: r.blok_id,
      planirovkaId: r.planirovka_id,
      qavat: r.qavat,
      raqam: r.raqam,
      narx: r.narx === null ? null : Number(r.narx),
      holat: r.holat,
    }))
    .sort((a, b) => blokTartib.get(a.blokId)! - blokTartib.get(b.blokId)!);
  return { slug: l.rows[0]!.slug, bloklar, planirovkalar, xonadonlar };
}

const planirovkaNomi = (p: { xonalar: number; maydon: number; nomi: string | null }) =>
  `${p.xonalar} xona, ${p.maydon} m²${p.nomi ? ` · ${p.nomi}` : ''}`;

interface Qadam {
  q: FaylQatori;
  /** Planirovka key (turKey) of the row. */
  tur: string;
  /** Existing Xonadon at the row's place; undefined → create. */
  xonadon?: MavjudXonadon;
  ozgarishlar: NonNullable<ImportQator['ozgarishlar']>;
}

interface TurReja {
  blok: string;
  xonalar: number;
  maydon: number;
  nomi: string | null;
  chizma: string | null;
  video: string | null;
  /** Existing Planirovka; undefined → create. */
  planirovkaId?: number;
  /** The file changes its chizma / video. */
  yangilanadi: boolean;
}

interface Rejala {
  qadamlar: Qadam[];
  turlar: Map<string, TurReja>;
  xatolar: ImportXato[];
  reja: ImportReja;
}

function rejala(m: Mavjud, qatorlar: FaylQatori[]): Rejala {
  const xatolar: ImportXato[] = [];
  const qadamlar: Qadam[] = [];
  const turlar = new Map<string, TurReja>();
  const used = new Set<number>();
  const yangiBloklar: string[] = [];
  const blokOf = (nomi: string) => m.bloklar.find((b) => normKey(b.nomi) === normKey(nomi));

  for (const q of qatorlar) {
    const blok = blokOf(q.blok);
    if (!blok && !yangiBloklar.some((b) => normKey(b) === normKey(q.blok))) yangiBloklar.push(q.blok);
    const tur = turKey(q.blok, q.xonalar, q.maydon, q.nomi);
    let t = turlar.get(tur);
    if (!t) {
      const matches = blok
        ? m.planirovkalar.filter(
            (p) =>
              p.blokId === blok.id &&
              p.xonalar === q.xonalar &&
              p.maydon === q.maydon &&
              normKey(p.nomi?.uz ?? '') === normKey(q.nomi ?? ''),
          )
        : [];
      if (matches.length > 1) {
        xatolar.push({
          qator: q.qator,
          xabar: `${q.blok} blokda bunday Planirovka ${matches.length} ta: admin-panelda nomini farqlang`,
        });
        continue;
      }
      const p = matches[0];
      t = {
        blok: q.blok,
        xonalar: q.xonalar,
        maydon: q.maydon,
        nomi: p ? (p.nomi?.uz ?? null) : q.nomi,
        chizma: p?.chizma ?? null,
        video: p?.video ?? null,
        planirovkaId: p?.id,
        yangilanadi: false,
      };
      turlar.set(tur, t);
    }
    for (const k of ['chizma', 'video'] as const) {
      if (q[k] !== null && q[k] !== t[k]) {
        t[k] = q[k];
        if (t.planirovkaId !== undefined) t.yangilanadi = true;
      }
    }

    const x = blok && m.xonadonlar.find((x) => x.blokId === blok.id && x.qavat === q.qavat && x.raqam === q.raqam);
    if (!x) {
      qadamlar.push({ q, tur, ozgarishlar: [] });
      continue;
    }
    used.add(x.id);
    const ozgarishlar: Qadam['ozgarishlar'] = [];
    if (t.planirovkaId !== x.planirovkaId) ozgarishlar.push('planirovka');
    if (q.narx !== x.narx) ozgarishlar.push('narx');
    if (q.holat !== x.holat) ozgarishlar.push('holat');
    qadamlar.push({ q, tur, xonadon: x, ozgarishlar });
  }

  const qatorlarDto: ImportQator[] = qadamlar.map(({ q, tur, xonadon, ozgarishlar }) => {
    const t = turlar.get(tur)!;
    const oldin: NonNullable<ImportQator['oldin']> = {};
    if (xonadon && ozgarishlar.includes('planirovka')) {
      const p = m.planirovkalar.find((p) => p.id === xonadon.planirovkaId)!;
      oldin.planirovka = planirovkaNomi({ ...p, nomi: p.nomi?.uz ?? null });
    }
    if (xonadon && ozgarishlar.includes('narx')) oldin.narx = xonadon.narx;
    if (xonadon && ozgarishlar.includes('holat')) oldin.holat = xonadon.holat;
    return {
      qator: q.qator,
      blok: q.blok,
      qavat: q.qavat,
      raqam: q.raqam,
      xonalar: q.xonalar,
      maydon: q.maydon,
      nomi: q.nomi,
      narx: q.narx,
      holat: q.holat,
      amal: !xonadon ? 'yangi' : ozgarishlar.length ? 'yangilanadi' : 'ozgarishsiz',
      ...(xonadon && ozgarishlar.length ? { ozgarishlar, oldin } : {}),
      ...(t.planirovkaId === undefined ? { yangiPlanirovka: true as const } : {}),
    };
  });
  const blokNomi = new Map(m.bloklar.map((b) => [b.id, b.nomi]));
  const fayldaYoq = m.xonadonlar.filter((x) => !used.has(x.id));
  return {
    qadamlar,
    turlar,
    xatolar,
    reja: {
      yangi: qatorlarDto.filter((q) => q.amal === 'yangi').length,
      yangilanadi: qatorlarDto.filter((q) => q.amal === 'yangilanadi').length,
      ozgarishsiz: qatorlarDto.filter((q) => q.amal === 'ozgarishsiz').length,
      yangiBloklar,
      yangiPlanirovkalar: [...turlar.values()].filter((t) => t.planirovkaId === undefined).length,
      yangilanadiganPlanirovkalar: [...turlar.values()].filter((t) => t.yangilanadi).length,
      fayldaYoq: fayldaYoq.length,
      fayldaYoqlar: fayldaYoq.slice(0, IMPORT_FAYLDA_YOQ_MAX).map(
        (x): ImportFayldaYoq => ({ blok: blokNomi.get(x.blokId)!, qavat: x.qavat, raqam: x.raqam, holat: x.holat }),
      ),
      qatorlar: qatorlarDto,
    },
  };
}

async function check(db: Queryable, loyihaId: number, file: Buffer, lock: boolean) {
  const m = await mavjud(db, loyihaId, lock);
  if (!m) throw new KatalogAdminError('not_found', 404);
  const fayl = readQatorlar(file);
  const r = rejala(m, fayl.qatorlar);
  const xatolar = [...fayl.xatolar, ...r.xatolar].sort((a, b) => (a.qator ?? 0) - (b.qator ?? 0));
  return { ...r, xatolar };
}

// ---- public API ----

export class ImportXatolari extends Error {
  constructor(readonly xatolar: ImportXato[]) {
    super('import_xatolar');
  }
}

/** Checks the file against the Loyiha; writes nothing. */
export async function tekshir(db: pg.Pool, loyihaId: number, file: Buffer): Promise<ImportTekshirResponse | null> {
  if (!(await db.query('SELECT 1 FROM loyiha WHERE id = $1', [loyihaId])).rowCount) return null;
  const { xatolar, reja } = await check(db, loyihaId, file, false);
  return { xatolar, reja: xatolar.length ? null : reja };
}

/**
 * Checks again (the katalog may have changed since `tekshir`) and imports in
 * one transaction. Throws ImportXatolari when the file has any problem: then
 * nothing is written. The caller calls `katalog.invalidate()`.
 */
export async function importQil(db: pg.Pool, by: Muallif, loyihaId: number, file: Buffer): Promise<ImportNatija> {
  return tx(db, async (c) => {
    const { qadamlar, turlar, xatolar, reja } = await check(c, loyihaId, file, true);
    if (xatolar.length) throw new ImportXatolari(xatolar);
    const bloklar = new Map<string, number>(
      (await c.query<{ id: number; nomi: string }>('SELECT id, nomi FROM blok WHERE loyiha_id = $1', [loyihaId])).rows.map(
        (b) => [normKey(b.nomi), b.id],
      ),
    );
    for (const nomi of reja.yangiBloklar) bloklar.set(normKey(nomi), (await createBlokIn(c, by, loyihaId, { nomi })).id);

    // Each Planirovka is created / updated once, when its first row comes.
    const tayyor = new Set<string>();
    const planirovkaOf = async (key: string): Promise<number> => {
      const t = turlar.get(key)!;
      if (!tayyor.has(key)) {
        tayyor.add(key);
        if (t.planirovkaId === undefined) {
          const nomi = t.nomi ? { uz: t.nomi, ru: t.nomi } : null;
          t.planirovkaId = (
            await createPlanirovkaIn(c, by, bloklar.get(normKey(t.blok))!, {
              xonalar: t.xonalar,
              maydon: t.maydon,
              nomi,
              chizma: t.chizma,
              video: t.video,
            })
          ).id;
        } else if (t.yangilanadi) await setPlanirovkaIn(c, by, t.planirovkaId, { chizma: t.chizma, video: t.video });
      }
      return t.planirovkaId!;
    };

    for (const { q, tur, xonadon } of qadamlar) {
      const planirovkaId = await planirovkaOf(tur);
      if (!xonadon) {
        await createXonadonIn(c, by, bloklar.get(normKey(q.blok))!, {
          planirovkaId,
          qavat: q.qavat,
          raqam: q.raqam,
          narx: q.narx,
          holat: q.holat,
        });
      } else await updateXonadonIn(c, by, xonadon.id, { planirovkaId, narx: q.narx, holat: q.holat });
    }
    return {
      yaratildi: reja.yangi,
      yangilandi: reja.yangilanadi,
      ozgarishsiz: reja.ozgarishsiz,
      yangiBloklar: reja.yangiBloklar,
      yangiPlanirovkalar: reja.yangiPlanirovkalar,
    };
  });
}

/**
 * The shablon as .xlsx, filled with the Loyiha's current Xonadonlar (Blok,
 * qavat, raqam order) so the manager edits holat and narx in place, adds rows
 * and uploads it back.
 */
export async function shablon(db: pg.Pool, loyihaId: number): Promise<{ fayl: Buffer; nomi: string } | null> {
  const m = await mavjud(db, loyihaId, false);
  if (!m) return null;
  const blokNomi = new Map(m.bloklar.map((b) => [b.id, b.nomi]));
  const planirovka = new Map(m.planirovkalar.map((p) => [p.id, p]));
  const rows = m.xonadonlar.map((x) => {
    const p = planirovka.get(x.planirovkaId)!;
    return [
      blokNomi.get(x.blokId)!,
      x.qavat,
      x.raqam,
      p.xonalar,
      p.maydon,
      p.nomi?.uz ?? null,
      x.narx,
      HOLAT_YOZUV[x.holat],
      p.chizma,
      p.video,
    ];
  });
  return {
    fayl: writeXlsx(
      'Xonadonlar',
      [USTUNLAR.map((u) => u.label), ...rows],
      USTUNLAR.map((u) => u.width),
    ),
    nomi: `${m.slug}-xonadonlar.xlsx`,
  };
}
