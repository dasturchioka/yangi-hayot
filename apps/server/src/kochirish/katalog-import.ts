import vm from 'node:vm';
import type pg from 'pg';
import type { XonadonHolati } from '@yh/shared';
import { appendXonadonlar, insertXonadonlar } from '../xonadon/joylash';
import type { Lokal } from '../katalog/seed';
import {
  DEFAULT_BLOK,
  KATALOG_VARIABLE,
  LOYIHA_FIELDS,
  LOYIHA_HOLATI,
  SHAHAR,
  XONADON_FIELDS,
  XONADON_HOLATI,
  pick,
} from './legacy-format';

/**
 * Pulls the projects array out of the old Mini App's HTML, where it is a JS
 * literal (`const PROJECTS = [ … ];`). The literal is evaluated in an empty
 * V8 context (no globals, 1 s limit): the file is Yangi Hayot's own, but the
 * literal is not JSON (unquoted keys, single quotes, trailing commas).
 */
export function extractLegacyKatalog(html: string, variable = KATALOG_VARIABLE): unknown[] {
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${variable}\\s*=\\s*`).exec(html);
  if (!decl) throw new Error(`old katalog: "${variable} = [...]" not found in the HTML`);
  const start = decl.index + decl[0].length;
  if (html[start] !== '[') throw new Error(`old katalog: ${variable} is not an array literal`);
  const literal = html.slice(start, matchingBracket(html, start) + 1);
  const value: unknown = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
  return JSON.parse(JSON.stringify(value)) as unknown[];
}

/** Index of the `]` closing the `[` at `open`, skipping strings and comments. */
function matchingBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
    } else if (c === '/' && s[i + 1] === '/') {
      i = s.indexOf('\n', i);
      if (i < 0) break;
    } else if (c === '/' && s[i + 1] === '*') {
      i = s.indexOf('*/', i) + 1;
      if (i <= 0) break;
    } else if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('old katalog: unbalanced array literal');
}

export interface KatalogImportReport {
  source: {
    loyihalar: number;
    /** Distinct Planirovkalar the Xonadonlar are grouped into (same Blok, xonalar, maydon, name, drawing). */
    planirovkalar: number;
    xonadonlar: number;
    rejected: { where: string; reason: string }[];
  };
  db: { loyihalar: number; planirovkalar: number; xonadonlar: number };
  added: { loyihalar: number; planirovkalar: number };
  warnings: string[];
  ok: boolean;
  dryRun: boolean;
}

interface Group {
  key: string;
  blok: string;
  xonalar: number;
  maydon: number;
  nomi: Lokal | null;
  chizma: string | null;
  video: string | null;
  xonadonlar: OldXonadon[];
}

interface OldXonadon {
  holat: XonadonHolati;
  narx: number | null;
  /** Both known → this exact place; else numbered at the end of the Blok. */
  joy: { qavat: number; raqam: number } | null;
  where: string;
}

interface LoyihaDraft {
  where: string;
  slug: string;
  nomi: string;
  shahar: 'toshkent' | 'navoiy';
  holat: 'sotuvda' | 'topshirilgan';
  manzil: Lokal;
  groups: Map<string, Group>;
}

/**
 * Moves the old catalog in (ADR 0003): each Loyiha (found by slug or name,
 * else created) and each old Xonadon as a Xonadon (its holat and price) of a
 * Planirovka in its Blok. Xonadonlar with identical Blok, xonalar, maydon,
 * name and drawing share one Planirovka, whose qo'lda narx is their lowest
 * price. A Xonadon with a floor and a number keeps them; the others are
 * numbered in order at the end of the Blok. The same place twice is rejected.
 *
 * Re-running is safe: each Planirovka is remembered in `legacy_planirovka`
 * by that key and never written again (admin edits are kept).
 */
export async function importLegacyKatalog(
  db: pg.Pool,
  data: unknown[],
  now: Date,
  opts: { dryRun?: boolean } = {},
): Promise<KatalogImportReport> {
  const rejected: KatalogImportReport['source']['rejected'] = [];
  const warnings: string[] = [];
  const drafts: LoyihaDraft[] = [];
  let xonadonlar = 0;

  data.forEach((p, i) => {
    const where = `${KATALOG_VARIABLE}[${i}]`;
    const nomi = text(pick(p, LOYIHA_FIELDS.nomi));
    if (!nomi) return void rejected.push({ where, reason: 'no name' });
    const shahar = SHAHAR[String(pick(p, LOYIHA_FIELDS.shahar) ?? '').trim().toLowerCase()];
    if (!shahar) return void rejected.push({ where, reason: `unknown city "${String(pick(p, LOYIHA_FIELDS.shahar))}"` });
    const rawHolat = String(pick(p, LOYIHA_FIELDS.holat) ?? '').toLowerCase();
    const holat = LOYIHA_HOLATI[rawHolat];
    if (!holat) warnings.push(`${where} ${nomi}: unknown status "${rawHolat}", taken as Sotuvda`);
    const draft: LoyihaDraft = {
      where,
      slug: slugify(text(pick(p, LOYIHA_FIELDS.slug)) ?? nomi),
      nomi,
      shahar,
      holat: holat ?? 'sotuvda',
      manzil: lokal(pick(p, LOYIHA_FIELDS.manzil)) ?? { ru: '', uz: '' },
      groups: new Map(),
    };
    const list = pick(p, LOYIHA_FIELDS.xonadonlar) ?? [];
    if (!Array.isArray(list)) return void rejected.push({ where, reason: 'apartments is not an array' });
    const joylar = new Map<string, number>();
    list.forEach((x, j) => {
      const xw = `${where} ${nomi} apartments[${j}]`;
      const xonalar = Number(pick(x, XONADON_FIELDS.xonalar));
      const maydon = Number(pick(x, XONADON_FIELDS.maydon));
      if (!Number.isInteger(xonalar) || xonalar <= 0) return void rejected.push({ where: xw, reason: 'no room count' });
      if (!(maydon > 0)) return void rejected.push({ where: xw, reason: 'no area' });
      const rawHolat = pick(x, XONADON_FIELDS.holat);
      const xHolat = rawHolat === undefined ? 'bosh' : XONADON_HOLATI[String(rawHolat).trim().toLowerCase()];
      if (!xHolat) return void rejected.push({ where: xw, reason: `unknown status "${String(rawHolat)}"` });
      const narx = price(x, maydon);
      const qavat = Number(pick(x, XONADON_FIELDS.qavat));
      const raqam = Number(pick(x, XONADON_FIELDS.raqam));
      const blokNomi = text(pick(x, XONADON_FIELDS.blok)) ?? DEFAULT_BLOK;
      let joy: OldXonadon['joy'] = null;
      if (Number.isInteger(qavat) && Number.isInteger(raqam) && raqam > 0 && qavat >= -5 && qavat <= 200) {
        joy = { qavat, raqam };
        const key = `${blokNomi.toLowerCase()}|${qavat}|${raqam}`;
        const first = joylar.get(key);
        if (first !== undefined)
          return void rejected.push({ where: xw, reason: `same block, floor and number as apartments[${first}]` });
        joylar.set(key, j);
      } else if (pick(x, XONADON_FIELDS.qavat) !== undefined || pick(x, XONADON_FIELDS.raqam) !== undefined) {
        warnings.push(`${xw}: floor / number unusable, numbered at the end of Blok ${blokNomi}`);
      }
      const g: Group = {
        key: '',
        blok: blokNomi,
        xonalar,
        maydon: Math.round(maydon * 100) / 100,
        nomi: lokal(pick(x, XONADON_FIELDS.nomi)),
        chizma: text(pick(x, XONADON_FIELDS.chizma)) ?? null,
        video: text(pick(x, XONADON_FIELDS.video)) ?? null,
        xonadonlar: [],
      };
      g.key = [draft.slug, g.blok, g.xonalar, g.maydon, g.nomi?.uz ?? '', g.chizma ?? ''].join('|');
      const existing = draft.groups.get(g.key) ?? g;
      existing.xonadonlar.push({ holat: xHolat, narx, joy, where: xw });
      draft.groups.set(g.key, existing);
      xonadonlar++;
    });
    drafts.push(draft);
  });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const added = { loyihalar: 0, planirovkalar: 0 };
    const loyihaIds: number[] = [];
    const keys: string[] = [];

    for (const d of drafts) {
      const found = await client.query<{ id: number }>(
        'SELECT id FROM loyiha WHERE slug = $1 OR lower(nomi) = lower($2) ORDER BY (slug = $1) DESC LIMIT 1',
        [d.slug, d.nomi],
      );
      let loyihaId = found.rows[0]?.id;
      if (loyihaId === undefined) {
        const created = await client.query<{ id: number }>(
          `INSERT INTO loyiha (slug, nomi, shahar, holat, manzil, tartib, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, (SELECT count(*) FROM loyiha), $6, $6) RETURNING id`,
          [d.slug, d.nomi, d.shahar, d.holat, JSON.stringify(d.manzil), now],
        );
        loyihaId = created.rows[0]!.id;
        added.loyihalar++;
      }
      loyihaIds.push(loyihaId);

      // Placed Xonadonlar first, so the numbered-at-the-end ones come after every known number.
      const oxiriga: { blokId: number; planirovkaId: number; x: OldXonadon }[] = [];
      for (const g of d.groups.values()) {
        keys.push(g.key);
        const seen = await client.query('SELECT 1 FROM legacy_planirovka WHERE legacy_key = $1', [g.key]);
        if (seen.rowCount) continue;
        const narxlar = g.xonadonlar.flatMap((x) => (x.narx === null ? [] : [x.narx]));
        const blok = await client.query<{ id: number }>(
          `INSERT INTO blok (loyiha_id, nomi, tartib)
           VALUES ($1, $2, (SELECT count(*) FROM blok WHERE loyiha_id = $1))
           ON CONFLICT (loyiha_id, nomi) DO UPDATE SET nomi = EXCLUDED.nomi RETURNING id`,
          [loyihaId, g.blok],
        );
        const pl = await client.query<{ id: number }>(
          `INSERT INTO planirovka (blok_id, xonalar, maydon, nomi, chizma_url, video_url, qolda_narx,
                                   tartib, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7,
                   (SELECT count(*) FROM planirovka WHERE blok_id = $1), $8, $8) RETURNING id`,
          [
            blok.rows[0]!.id,
            g.xonalar,
            g.maydon,
            g.nomi ? JSON.stringify(g.nomi) : null,
            g.chizma,
            g.video,
            narxlar.length ? Math.min(...narxlar) : null,
            now,
          ],
        );
        const blokId = blok.rows[0]!.id;
        const planirovkaId = pl.rows[0]!.id;
        for (const x of g.xonadonlar) {
          if (!x.joy) {
            oxiriga.push({ blokId, planirovkaId, x });
            continue;
          }
          const taken = await client.query('SELECT 1 FROM xonadon WHERE blok_id = $1 AND qavat = $2 AND raqam = $3', [
            blokId,
            x.joy.qavat,
            x.joy.raqam,
          ]);
          if (taken.rowCount) {
            rejected.push({ where: x.where, reason: 'its block, floor and number are taken in the database' });
            continue;
          }
          await insertXonadonlar(client, [{ blokId, planirovkaId, ...x.joy, holat: x.holat, narx: x.narx }], now);
        }
        await client.query('INSERT INTO legacy_planirovka (legacy_key, planirovka_id, imported_at) VALUES ($1, $2, $3)', [
          g.key,
          pl.rows[0]!.id,
          now,
        ]);
        added.planirovkalar++;
      }
      for (const blokId of new Set(oxiriga.map((o) => o.blokId))) {
        const list = oxiriga.filter((o) => o.blokId === blokId);
        await appendXonadonlar(client, blokId, list.map((o) => ({ planirovkaId: o.planirovkaId, holat: o.x.holat, narx: o.x.narx })), now);
      }
    }

    const counts = await client.query<{ loyihalar: string; planirovkalar: string; xonadonlar: string }>(
      `SELECT (SELECT count(DISTINCT id) FROM loyiha WHERE id = ANY($1::int[])) AS loyihalar,
              count(p.id) AS planirovkalar,
              coalesce(sum(p.jami), 0) AS xonadonlar
         FROM legacy_planirovka lp JOIN planirovka_view p ON p.id = lp.planirovka_id
        WHERE lp.legacy_key = ANY($2::text[])`,
      [loyihaIds, keys],
    );
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');

    const c = counts.rows[0]!;
    const dbCounts = { loyihalar: Number(c.loyihalar), planirovkalar: Number(c.planirovkalar), xonadonlar: Number(c.xonadonlar) };
    const source = { loyihalar: drafts.length, planirovkalar: keys.length, xonadonlar, rejected };
    return {
      source,
      db: dbCounts,
      added,
      warnings,
      ok:
        rejected.length === 0 &&
        dbCounts.loyihalar === source.loyihalar &&
        dbCounts.planirovkalar === source.planirovkalar &&
        dbCounts.xonadonlar === source.xonadonlar,
      dryRun: opts.dryRun ?? false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null || typeof v === 'object') return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** `{ru, uz}` object or a plain string used for both languages. */
function lokal(v: unknown): Lokal | null {
  if (typeof v === 'string' && v.trim()) return { ru: v.trim(), uz: v.trim() };
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const ru = text(o.ru) ?? text(o.uz);
    const uz = text(o.uz) ?? text(o.ru);
    if (ru && uz) return { ru, uz };
  }
  return null;
}

function price(x: unknown, maydon: number): number | null {
  const whole = Number(pick(x, XONADON_FIELDS.narx));
  if (whole > 0) return Math.round(whole);
  const perM2 = Number(pick(x, XONADON_FIELDS.narxM2));
  if (perM2 > 0) return Math.round(perM2 * maydon);
  return null;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[ʻʼ'`‘’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'loyiha'
  );
}
