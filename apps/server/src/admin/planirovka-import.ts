import type { ImportNatija, ImportQator, ImportReja, ImportTekshirResponse, ImportXato, LokalDto } from '@yh/shared';
import type pg from 'pg';
import { parseVideo } from '../katalog/katalog';
import { JadvalError, readJadval } from './jadval';
import { type Muallif } from './jurnal';
import { createBlokIn, createPlanirovkaIn, KatalogAdminError, setPlanirovkaIn, tx } from './katalog-admin';
import { writeXlsx } from './xlsx';

/**
 * Planirovkalar of a Loyiha from an Excel / CSV file made by the shablon (#6).
 *
 * The file is the truth for the rows it has: a row whose Blok, xonalar, maydon
 * and nomi match an existing Planirovka updates its price, counts, chizma and
 * video; other rows create Planirovkalar (and missing Bloklar). Planirovkalar
 * not in the file are left as they are (never deleted: Arizalar and Sevimlilar
 * point at them).
 *
 * `tekshir` reports every problem with its row number and what would be done;
 * `importQil` checks again and, only when there is no problem, writes all rows
 * in one transaction through the same functions as the admin forms, so each
 * change gets its jurnal row.
 */

type Ustun = 'blok' | 'xonalar' | 'maydon' | 'nomi' | 'narx' | 'bosh' | 'bron' | 'sotilgan' | 'chizma' | 'video';

/** Shablon columns, in order, with the labels the manager sees (TZ «Excel/CSV import»). */
export const USTUNLAR: { key: Ustun; label: string; width: number }[] = [
  { key: 'blok', label: 'Blok', width: 8 },
  { key: 'xonalar', label: 'xonalar', width: 9 },
  { key: 'maydon', label: 'maydon', width: 9 },
  { key: 'nomi', label: 'nomi', width: 18 },
  { key: 'narx', label: "Boshlang'ich narx", width: 18 },
  { key: 'bosh', label: "bo'sh", width: 7 },
  { key: 'bron', label: 'bron', width: 7 },
  { key: 'sotilgan', label: 'sotilgan', width: 9 },
  { key: 'chizma', label: 'chizma', width: 40 },
  { key: 'video', label: 'video', width: 40 },
];
const label = (k: Ustun) => USTUNLAR.find((u) => u.key === k)!.label;

/** Header spellings accepted besides the shablon's own (older TZ names, Russian). */
const ALIASES: Record<Ustun, string[]> = {
  blok: ['blok', 'блок', 'korpus', 'корпус'],
  xonalar: ['xonalar', 'xona', 'xonalarsoni', 'комнаты', 'комнат'],
  maydon: ['maydon', 'm2', 'm²', 'площадь'],
  nomi: ['nomi', 'nom', 'название'],
  narx: ['boshlangichnarx', 'narx', 'narxdan', 'цена', 'ценаот'],
  bosh: ['bosh', 'свободно', 'свободные'],
  bron: ['bron', 'бронь'],
  sotilgan: ['sotilgan', 'продано'],
  chizma: ['chizma', 'rasm', 'изображение'],
  video: ['video', 'видео'],
};
const MAJBURIY: Ustun[] = ['blok', 'xonalar', 'maydon', 'bosh'];
export const MAX_QATORLAR = 2000;

const normHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[ʻʼ'`‘’]/g, '')
    .replace(/[^\p{L}\p{N}²]/gu, '');
const normKey = (s: string) => s.trim().toLowerCase();

interface FaylQatori {
  qator: number;
  blok: string;
  xonalar: number;
  maydon: number;
  nomi: string | null;
  boshlangichNarx: number | null;
  bosh: number;
  bron: number;
  sotilgan: number;
  chizma: string | null;
  video: string | null;
}

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
    const h = normHeader(cell);
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
  if (data.length === 0) return { qatorlar: [], xatolar: [{ qator: null, xabar: "Faylda Planirovka qatorlari yo'q" }] };
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
    const butun = (k: Ustun, min: number, max: number, bosh: number | null) => {
      const v = cell(k).replace(/\s/g, '');
      if (v === '') return bosh ?? xato(k, "to'ldirilmagan");
      const n = Number(v.replace(',', '.'));
      if (!Number.isInteger(n) || n < min || n > max) return xato(k, `${min}–${max} oralig'idagi butun son bo'lishi kerak`);
      return n;
    };

    const blok = cell('blok');
    if (!blok) xato('blok', "to'ldirilmagan");
    else if (blok.length > 20) xato('blok', '20 belgidan uzun');
    const xonalar = butun('xonalar', 1, 20, null);
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
    let boshlangichNarx: number | null | undefined = null;
    if (narxText !== '') {
      const n = Number(/^\d{1,3}(,\d{3})+$/.test(narxText) ? narxText.replace(/,/g, '') : narxText.replace(',', '.'));
      if (!Number.isInteger(n) || n <= 0 || n > 1e13)
        boshlangichNarx = xato('narx', "so'mda butun son bo'lishi kerak (masalan 455500000) yoki bo'sh");
      else boshlangichNarx = n;
    }
    const bosh = butun('bosh', 0, 100_000, 0);
    const bron = butun('bron', 0, 100_000, 0);
    const sotilgan = butun('sotilgan', 0, 100_000, 0);
    const chizma = cell('chizma') || null;
    if (chizma && (chizma.length > 500 || !/^(https:\/\/|\/)\S+$/.test(chizma)))
      xato('chizma', "https:// bilan boshlanadigan havola bo'lishi kerak");
    const video = cell('video') || null;
    if (video && (video.length > 500 || !parseVideo(video)))
      xato('video', "https://t.me/… yoki YouTube havolasi bo'lishi kerak");

    if (
      blok &&
      blok.length <= 20 &&
      xonalar !== undefined &&
      maydon !== undefined &&
      boshlangichNarx !== undefined &&
      bosh !== undefined &&
      bron !== undefined &&
      sotilgan !== undefined
    )
      qatorlar.push({ qator, blok, xonalar, maydon, nomi, boshlangichNarx, bosh, bron, sotilgan, chizma, video });
  }

  // The same Planirovka twice would make the result depend on row order.
  const seen = new Map<string, number>();
  for (const q of qatorlar) {
    const key = [normKey(q.blok), q.xonalar, q.maydon, normKey(q.nomi ?? '')].join('|');
    const first = seen.get(key);
    if (first) xatolar.push({ qator: q.qator, xabar: `${first}-qatordagi Planirovka bilan bir xil (Blok, xonalar, maydon, nomi)` });
    else seen.set(key, q.qator);
  }
  xatolar.sort((a, b) => (a.qator ?? 0) - (b.qator ?? 0));
  return { qatorlar, xatolar };
}

// ---- matching against the Loyiha ----

interface Mavjud {
  bloklar: { id: number; nomi: string }[];
  planirovkalar: {
    id: number;
    blokId: number;
    xonalar: number;
    maydon: number;
    nomi: LokalDto | null;
    boshlangichNarx: number | null;
    bosh: number;
    bron: number;
    sotilgan: number;
    chizma: string | null;
    video: string | null;
  }[];
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

async function mavjud(db: Queryable, loyihaId: number, lock: boolean): Promise<Mavjud | null> {
  const l = await db.query(`SELECT id FROM loyiha WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [loyihaId]);
  if (!l.rowCount) return null;
  const bloklar = (await db.query<{ id: number; nomi: string }>('SELECT id, nomi FROM blok WHERE loyiha_id = $1', [loyihaId]))
    .rows;
  const { rows } = await db.query<{
    id: number;
    blok_id: number;
    xonalar: number;
    maydon: string;
    nomi: LokalDto | null;
    boshlangich_narx: string | null;
    bosh: number;
    bron: number;
    sotilgan: number;
    chizma_url: string | null;
    video_url: string | null;
  }>(
    `SELECT p.* FROM planirovka p JOIN blok b ON b.id = p.blok_id WHERE b.loyiha_id = $1
      ORDER BY b.tartib, b.nomi, p.xonalar, p.maydon, p.tartib, p.id`,
    [loyihaId],
  );
  return {
    bloklar,
    planirovkalar: rows.map((r) => ({
      id: r.id,
      blokId: r.blok_id,
      xonalar: r.xonalar,
      maydon: Number(r.maydon),
      nomi: r.nomi,
      boshlangichNarx: r.boshlangich_narx === null ? null : Number(r.boshlangich_narx),
      bosh: r.bosh,
      bron: r.bron,
      sotilgan: r.sotilgan,
      chizma: r.chizma_url,
      video: r.video_url,
    })),
  };
}

interface Qadam {
  q: FaylQatori;
  /** Existing Planirovka to update; undefined → create. */
  planirovkaId?: number;
  ozgarishlar: string[];
}

function rejala(m: Mavjud, qatorlar: FaylQatori[]): { qadamlar: Qadam[]; xatolar: ImportXato[]; reja: ImportReja } {
  const xatolar: ImportXato[] = [];
  const qadamlar: Qadam[] = [];
  const used = new Set<number>();
  const yangiBloklar: string[] = [];
  for (const q of qatorlar) {
    const blok = m.bloklar.find((b) => normKey(b.nomi) === normKey(q.blok));
    if (!blok && !yangiBloklar.some((b) => normKey(b) === normKey(q.blok))) yangiBloklar.push(q.blok);
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
    if (!p) {
      qadamlar.push({ q, ozgarishlar: [] });
      continue;
    }
    used.add(p.id);
    const ozgarishlar = (['boshlangichNarx', 'bosh', 'bron', 'sotilgan', 'chizma', 'video'] as const).filter(
      (k) => p[k] !== q[k],
    ) as string[];
    if (q.nomi && p.nomi?.uz !== q.nomi) ozgarishlar.unshift('nomi'); // only letter case differs
    qadamlar.push({ q, planirovkaId: p.id, ozgarishlar });
  }
  const qatorlarDto: ImportQator[] = qadamlar.map(({ q, planirovkaId, ozgarishlar }) => ({
    qator: q.qator,
    blok: q.blok,
    xonalar: q.xonalar,
    maydon: q.maydon,
    nomi: q.nomi,
    boshlangichNarx: q.boshlangichNarx,
    bosh: q.bosh,
    bron: q.bron,
    sotilgan: q.sotilgan,
    amal: planirovkaId === undefined ? 'yangi' : ozgarishlar.length ? 'yangilanadi' : 'ozgarishsiz',
    ...(planirovkaId !== undefined && ozgarishlar.length ? { ozgarishlar } : {}),
  }));
  return {
    qadamlar,
    xatolar,
    reja: {
      yangi: qatorlarDto.filter((q) => q.amal === 'yangi').length,
      yangilanadi: qatorlarDto.filter((q) => q.amal === 'yangilanadi').length,
      ozgarishsiz: qatorlarDto.filter((q) => q.amal === 'ozgarishsiz').length,
      yangiBloklar,
      fayldaYoq: m.planirovkalar.filter((p) => !used.has(p.id)).length,
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
 * nothing is written.
 */
export async function importQil(db: pg.Pool, by: Muallif, loyihaId: number, file: Buffer): Promise<ImportNatija> {
  return tx(db, async (c) => {
    const { qadamlar, xatolar, reja } = await check(c, loyihaId, file, true);
    if (xatolar.length) throw new ImportXatolari(xatolar);
    const bloklar = new Map<string, number>(
      (await c.query<{ id: number; nomi: string }>('SELECT id, nomi FROM blok WHERE loyiha_id = $1', [loyihaId])).rows.map(
        (b) => [normKey(b.nomi), b.id],
      ),
    );
    for (const nomi of reja.yangiBloklar) bloklar.set(normKey(nomi), (await createBlokIn(c, by, loyihaId, { nomi })).id);
    for (const { q, planirovkaId, ozgarishlar } of qadamlar) {
      const fields = {
        boshlangichNarx: q.boshlangichNarx,
        bosh: q.bosh,
        bron: q.bron,
        sotilgan: q.sotilgan,
        chizma: q.chizma,
        video: q.video,
      };
      if (planirovkaId === undefined) {
        const nomi = q.nomi ? { uz: q.nomi, ru: q.nomi } : null;
        await createPlanirovkaIn(c, by, bloklar.get(normKey(q.blok))!, { xonalar: q.xonalar, maydon: q.maydon, nomi, ...fields });
      } else if (ozgarishlar.length) {
        const nomi = ozgarishlar.includes('nomi') && q.nomi ? { nomi: { uz: q.nomi, ru: q.nomi } } : {};
        await setPlanirovkaIn(c, by, planirovkaId, { ...fields, ...nomi });
      }
    }
    return { yaratildi: reja.yangi, yangilandi: reja.yangilanadi, ozgarishsiz: reja.ozgarishsiz, yangiBloklar: reja.yangiBloklar };
  });
}

/**
 * The shablon as .xlsx, filled with the Loyiha's current Planirovkalar so the
 * manager edits counts and prices in place and uploads it back.
 */
export async function shablon(db: pg.Pool, loyihaId: number): Promise<{ fayl: Buffer; nomi: string } | null> {
  const l = (await db.query<{ slug: string }>('SELECT slug FROM loyiha WHERE id = $1', [loyihaId])).rows[0];
  const m = l && (await mavjud(db, loyihaId, false));
  if (!l || !m) return null;
  const blokNomi = new Map(m.bloklar.map((b) => [b.id, b.nomi]));
  const rows = m.planirovkalar.map((p) => [
    blokNomi.get(p.blokId)!,
    p.xonalar,
    p.maydon,
    p.nomi?.uz ?? null,
    p.boshlangichNarx,
    p.bosh,
    p.bron,
    p.sotilgan,
    p.chizma,
    p.video,
  ]);
  return {
    fayl: writeXlsx(
      'Planirovkalar',
      [USTUNLAR.map((u) => u.label), ...rows],
      USTUNLAR.map((u) => u.width),
    ),
    nomi: `${l.slug}-planirovkalar.xlsx`,
  };
}
