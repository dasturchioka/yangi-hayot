import { createHash } from 'node:crypto';
import type { Lang } from '@yh/shared';
import type pg from 'pg';
import { DIRECT_MANBA, manbaFromStartParam } from '../mijoz/manba';
import {
  ARIZA_FIELDS,
  ARIZA_TURI,
  DEFAULT_ARIZA_TURI,
  MIJOZ_FIELDS,
  SHAHAR,
  UNIX_MS_THRESHOLD,
  pick,
} from './legacy-format';

/** The old bot's files, as text. */
export interface LegacyBotSource {
  /** leads.jsonl: one JSON object per line; blank lines are ignored. */
  leadsJsonl: string;
  /** Optional users file: a JSON array of user objects. */
  usersJson?: string;
}

export interface Rejected {
  /** 'users.json#3' or 'leads.jsonl:12' (1-based). */
  where: string;
  reason: string;
}

export interface BotImportReport {
  /** Counted from the files. */
  source: {
    mijozlar: number;
    /** Distinct Arizalar (lines with the same id or identical content count once). */
    arizalar: number;
    /** Lines that repeat an Ariza already seen in the file. */
    duplicateLines: number;
    rejected: Rejected[];
  };
  /** Of those, how many are in the database after the import. */
  db: { mijozlar: number; arizalar: number };
  /** New in this run (0 and 0 on a re-run). */
  added: { mijozlar: number; arizalar: number };
  /** Not errors, but worth a look (unknown Loyiha names, unknown Ariza types…). */
  warnings: string[];
  /** Counts match and nothing was rejected. */
  ok: boolean;
  dryRun: boolean;
}

interface MijozDraft {
  telegramId: string;
  name: string;
  username: string | null;
  lang: Lang | null;
  telefon: string | null;
  firstManba: string | null;
  lastManba: string | null;
  bloklagan: boolean;
  amocrmKontaktId: string | null;
  shaharlar: Set<string>;
  createdAt: Date | null;
  /** Manbalar of this Mijoz's leads, in time order (fallback for first/last). */
  leadManbalar: { at: number; manba: string }[];
  raw: unknown;
}

interface ArizaDraft {
  key: string;
  telegramId: string | null;
  tur: string;
  loyiha: string | null;
  ism: string | null;
  telefon: string | null;
  manba: string | null;
  bitimId: string | null;
  kontaktId: string | null;
  createdAt: Date | null;
  raw: unknown;
}

/**
 * Moves the old bot's Mijozlar and Arizalar into the database, in one
 * transaction, and reconciles the counts.
 *
 * Re-running is safe: Mijozlar are keyed by Telegram ID, Arizalar by their
 * old id (or the hash of the line). A Mijoz the new bot already knows keeps
 * the name, the last Manba and a language picked in the new bot; their first
 * Manba becomes the old bot's (it is older).
 */
export async function importLegacyBot(
  db: pg.Pool,
  src: LegacyBotSource,
  now: Date,
  opts: { dryRun?: boolean } = {},
): Promise<BotImportReport> {
  const rejected: Rejected[] = [];
  const warnings: string[] = [];
  const mijozlar = new Map<string, MijozDraft>();
  const arizalar = new Map<string, ArizaDraft>();
  let duplicateLines = 0;

  // Users file
  if (src.usersJson !== undefined && src.usersJson.trim() !== '') {
    const users: unknown = JSON.parse(src.usersJson);
    if (!Array.isArray(users)) throw new Error('users file: expected a JSON array');
    users.forEach((u, i) => {
      const id = telegramId(pick(u, MIJOZ_FIELDS.telegramId));
      if (!id) return void rejected.push({ where: `users#${i + 1}`, reason: 'no valid Telegram ID' });
      mergeMijoz(mijozlar, id, u, null);
    });
  }

  // leads.jsonl
  src.leadsJsonl.split(/\r?\n/).forEach((line, i) => {
    const where = `leads.jsonl:${i + 1}`;
    if (line.trim() === '') return;
    let lead: unknown;
    try {
      lead = JSON.parse(line);
    } catch {
      return void rejected.push({ where, reason: 'not valid JSON' });
    }
    if (lead === null || typeof lead !== 'object' || Array.isArray(lead)) {
      return void rejected.push({ where, reason: 'not a JSON object' });
    }
    const rawId = pick(lead, MIJOZ_FIELDS.telegramId);
    const id = telegramId(rawId);
    if (rawId !== undefined && !id) return void rejected.push({ where, reason: 'invalid Telegram ID' });
    if (!id) warnings.push(`${where}: Ariza without a Telegram ID (kept, not linked to a Mijoz)`);

    const oldId = pick(lead, ARIZA_FIELDS.id);
    const key =
      oldId !== undefined
        ? `id:${String(oldId)}`
        : `sha256:${createHash('sha256').update(line.trim()).digest('hex')}`;
    if (arizalar.has(key)) {
      duplicateLines++;
      return;
    }
    const rawTur = str(pick(lead, ARIZA_FIELDS.tur))?.toLowerCase();
    const tur = rawTur === undefined ? DEFAULT_ARIZA_TURI : (ARIZA_TURI[rawTur] ?? `legacy_${rawTur}`);
    if (rawTur !== undefined && !ARIZA_TURI[rawTur]) warnings.push(`${where}: unknown Ariza type "${rawTur}"`);
    const createdAt = timestamp(pick(lead, ARIZA_FIELDS.createdAt));
    const manba = manbaOf(pick(lead, ARIZA_FIELDS.manba));
    arizalar.set(key, {
      key,
      telegramId: id,
      tur,
      loyiha: str(pick(lead, ARIZA_FIELDS.loyiha)) ?? null,
      ism: str(pick(lead, ARIZA_FIELDS.ism)) ?? null,
      telefon: phone(pick(lead, ARIZA_FIELDS.telefon)),
      manba,
      bitimId: bigintId(pick(lead, ARIZA_FIELDS.amocrmBitimId)),
      kontaktId: bigintId(pick(lead, ARIZA_FIELDS.amocrmKontaktId)),
      createdAt,
      raw: lead,
    });
    if (id) mergeMijoz(mijozlar, id, lead, { at: createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER - i, manba });
  });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: loyihalar } = await client.query<{ id: number; slug: string; nomi: string }>(
      'SELECT id, slug, nomi FROM loyiha',
    );
    const loyihaId = (name: string | null): number | null => {
      if (!name) return null;
      const n = name.trim().toLowerCase();
      return loyihalar.find((l) => l.nomi.toLowerCase() === n || l.slug === n)?.id ?? null;
    };

    let addedMijozlar = 0;
    for (const m of mijozlar.values()) {
      const ordered = [...m.leadManbalar].sort((a, b) => a.at - b.at);
      const first = m.firstManba ?? ordered[0]?.manba ?? DIRECT_MANBA;
      const last = m.lastManba ?? ordered.at(-1)?.manba ?? first;
      const { rows } = await client.query<{ inserted: boolean }>(
        `INSERT INTO mijoz (telegram_id, name, username, lang, lang_chosen, first_source, last_source, created_at, updated_at)
         VALUES ($1, $2, $3, coalesce($4::text, 'ru'), $4::text IS NOT NULL, $5, $6, coalesce($7::timestamptz, $8::timestamptz), $8)
         ON CONFLICT (telegram_id) DO UPDATE SET
           username     = coalesce(mijoz.username, EXCLUDED.username),
           lang         = CASE WHEN mijoz.lang_chosen OR $4::text IS NULL THEN mijoz.lang ELSE $4::text END,
           lang_chosen  = mijoz.lang_chosen OR $4::text IS NOT NULL,
           first_source = EXCLUDED.first_source,
           created_at   = least(mijoz.created_at, EXCLUDED.created_at)
         RETURNING (xmax = 0) AS inserted`,
        [m.telegramId, m.name, m.username, m.lang, first, last, m.createdAt, now],
      );
      if (rows[0]!.inserted) addedMijozlar++;
      await client.query(
        `INSERT INTO legacy_mijoz (telegram_id, telefon, bot_bloklagan, amocrm_kontakt_id, shahar_qiziqish, created_at, raw, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (telegram_id) DO UPDATE SET
           telefon = EXCLUDED.telefon, bot_bloklagan = EXCLUDED.bot_bloklagan,
           amocrm_kontakt_id = EXCLUDED.amocrm_kontakt_id, shahar_qiziqish = EXCLUDED.shahar_qiziqish,
           created_at = EXCLUDED.created_at, raw = EXCLUDED.raw`,
        [
          m.telegramId,
          m.telefon,
          m.bloklagan,
          m.amocrmKontaktId,
          [...m.shaharlar].sort(),
          m.createdAt,
          JSON.stringify(m.raw ?? {}),
          now,
        ],
      );
    }

    let addedArizalar = 0;
    for (const a of arizalar.values()) {
      const lid = loyihaId(a.loyiha);
      if (a.loyiha && lid === null) warnings.push(`Ariza ${a.key}: Loyiha "${a.loyiha}" not in the Katalog`);
      const res = await client.query(
        `INSERT INTO legacy_ariza (legacy_key, telegram_id, tur, loyiha_nomi, loyiha_id, ism, telefon, manba,
                                   amocrm_bitim_id, amocrm_kontakt_id, created_at, raw, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (legacy_key) DO NOTHING`,
        [
          a.key,
          a.telegramId,
          a.tur,
          a.loyiha,
          lid,
          a.ism,
          a.telefon,
          a.manba,
          a.bitimId,
          a.kontaktId,
          a.createdAt,
          JSON.stringify(a.raw),
          now,
        ],
      );
      addedArizalar += res.rowCount ?? 0;
    }

    const counts = await client.query<{ mijozlar: string; arizalar: string }>(
      `SELECT (SELECT count(*) FROM mijoz WHERE telegram_id = ANY($1::bigint[])) AS mijozlar,
              (SELECT count(*) FROM legacy_ariza WHERE legacy_key = ANY($2::text[])) AS arizalar`,
      [[...mijozlar.keys()], [...arizalar.keys()]],
    );
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');

    const dbCounts = { mijozlar: Number(counts.rows[0]!.mijozlar), arizalar: Number(counts.rows[0]!.arizalar) };
    return {
      source: { mijozlar: mijozlar.size, arizalar: arizalar.size, duplicateLines, rejected },
      db: dbCounts,
      added: { mijozlar: addedMijozlar, arizalar: addedArizalar },
      warnings,
      ok: rejected.length === 0 && dbCounts.mijozlar === mijozlar.size && dbCounts.arizalar === arizalar.size,
      dryRun: opts.dryRun ?? false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Adds what this record says about a Mijoz; earlier records win, later ones fill gaps. */
function mergeMijoz(
  all: Map<string, MijozDraft>,
  id: string,
  rec: unknown,
  lead: { at: number; manba: string | null } | null,
): void {
  let m = all.get(id);
  if (!m) {
    m = {
      telegramId: id,
      name: '',
      username: null,
      lang: null,
      telefon: null,
      firstManba: null,
      lastManba: null,
      bloklagan: false,
      amocrmKontaktId: null,
      shaharlar: new Set(),
      createdAt: null,
      leadManbalar: [],
      raw: rec,
    };
    all.set(id, m);
  }
  if (!m.name) {
    const parts = [str(pick(rec, MIJOZ_FIELDS.firstName)), str(pick(rec, MIJOZ_FIELDS.lastName))].filter(Boolean);
    m.name = parts.length ? parts.join(' ') : (str(pick(rec, MIJOZ_FIELDS.fullName)) ?? '');
  }
  m.username ??= str(pick(rec, MIJOZ_FIELDS.username))?.replace(/^@/, '') ?? null;
  m.lang ??= lang(pick(rec, MIJOZ_FIELDS.lang));
  m.amocrmKontaktId ??= bigintId(pick(rec, MIJOZ_FIELDS.amocrmKontaktId));
  m.createdAt ??= timestamp(pick(rec, MIJOZ_FIELDS.createdAt));
  if (lead) {
    // A later lead carries the newer phone.
    m.telefon = phone(pick(rec, MIJOZ_FIELDS.phone)) ?? m.telefon;
    if (lead.manba) m.leadManbalar.push({ at: lead.at, manba: lead.manba });
  } else {
    m.telefon ??= phone(pick(rec, MIJOZ_FIELDS.phone));
    m.firstManba ??= manbaOf(pick(rec, MIJOZ_FIELDS.firstManba)) ?? manbaOf(pick(rec, MIJOZ_FIELDS.manba));
    m.lastManba ??= manbaOf(pick(rec, MIJOZ_FIELDS.lastManba));
  }
  if (truthy(pick(rec, MIJOZ_FIELDS.botBloklagan))) m.bloklagan = true;
  const city = pick(rec, MIJOZ_FIELDS.shaharQiziqish);
  for (const c of Array.isArray(city) ? city : city === undefined ? [] : [city]) {
    const s = SHAHAR[String(c).trim().toLowerCase()];
    if (s) m.shaharlar.add(s);
  }
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function telegramId(v: unknown): string | null {
  const s = str(v);
  return s !== undefined && /^-?\d{1,19}$/.test(s) ? s : null;
}

function bigintId(v: unknown): string | null {
  const s = str(v);
  return s !== undefined && /^\d{1,18}$/.test(s) ? s : null;
}

function lang(v: unknown): Lang | null {
  const s = str(v)?.toLowerCase();
  if (s?.startsWith('uz')) return 'uz';
  if (s?.startsWith('ru')) return 'ru';
  return null;
}

/** Old Manba: `src_x` tags become `x`, other text is kept as is. */
function manbaOf(v: unknown): string | null {
  const s = str(v);
  if (s === undefined) return null;
  return manbaFromStartParam(s) ?? s;
}

/** +998XXXXXXXXX when the digits allow it, otherwise the original text. */
export function phone(v: unknown): string | null {
  const s = str(v);
  if (s === undefined) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return s;
}

function timestamp(v: unknown): Date | null {
  if (v === undefined) return null;
  const d =
    typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))
      ? new Date(Number(v) < UNIX_MS_THRESHOLD ? Number(v) * 1000 : Number(v))
      : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === 'string' && ['true', '1', 'yes', 'ha'].includes(v.toLowerCase()));
}
