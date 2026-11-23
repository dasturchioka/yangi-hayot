import {
  VORONKA_QADAMLARI,
  type KorilganPlanirovkaDto,
  type VoronkaQadamDto,
  type VoronkaQadami,
  type VoronkaResponse,
} from '@yh/shared';
import type pg from 'pg';
import { addDays, tashkentInstant } from '../clock';
import type { HodisaTuri } from './hodisa';

/**
 * Funnel (UF-7, #20): distinct Mijozlar per step over a period of Tashkent
 * days, optionally for one Manba and / or one Loyiha. Read from `hodisa`
 * only — never amoCRM.
 *
 * A step may gather several event types: «ko'rdi» is a Planirovka opening
 * today and will also take Xonadon openings (ADR 0003, #25 adds the type
 * here). `loyihasiz` steps carry no Loyiha, so under a Loyiha filter they
 * have no figure (null) rather than a misleading 0.
 */
export const QADAMLAR: { kalit: VoronkaQadami; nomi: string; turlar: HodisaTuri[]; loyihasiz?: true }[] = [
  { kalit: 'bot_kirdi', nomi: 'Botga kirdi', turlar: ['bot_kirdi'], loyihasiz: true },
  { kalit: 'korildi', nomi: "Planirovka / Xonadon ko'rdi", turlar: ['planirovka_korildi'] },
  { kalit: 'ariza', nomi: 'Ariza qoldirdi', turlar: ['ariza'] },
  { kalit: 'yozilish', nomi: "Ko'rishga yozildi", turlar: ['yozilish'] },
  { kalit: 'keldi', nomi: 'Keldi', turlar: ['keldi'] },
];
if (QADAMLAR.map((q) => q.kalit).join() !== VORONKA_QADAMLARI.join()) throw new Error('QADAMLAR out of order');

/** Event types whose rows are «the Mijoz opened a Planirovka» (most viewed list). */
const PLANIROVKA_KORISH: HodisaTuri[] = ['planirovka_korildi'];

const ENG_KOP_MAX = 10;

export interface VoronkaFiltr {
  /** Tashkent `YYYY-MM-DD`, inclusive. */
  dan: string;
  gacha: string;
  manba?: string | null;
  loyihaId?: number | null;
}

interface Where {
  sql: string;
  params: unknown[];
}

function where(f: VoronkaFiltr): Where {
  const from = tashkentInstant(f.dan, '00:00');
  const to = tashkentInstant(addDays(f.gacha, 1), '00:00');
  const params: unknown[] = [from, to];
  let sql = 'h.at >= $1 AND h.at < $2';
  if (f.manba != null) {
    params.push(f.manba);
    sql += ` AND h.manba = $${params.length}`;
  }
  if (f.loyihaId != null) {
    params.push(f.loyihaId);
    sql += ` AND h.loyiha_id = $${params.length}`;
  }
  return { sql, params };
}

/** `count(DISTINCT mijoz_id)` per step, as columns q0…q4. */
function qadamUstunlari(params: unknown[]): string {
  return QADAMLAR.map((q) => {
    params.push(q.turlar);
    return `count(DISTINCT h.mijoz_id) FILTER (WHERE h.tur = ANY($${params.length}::text[]))::int AS q${QADAMLAR.indexOf(q)}`;
  }).join(', ');
}

function qatorSonlari(row: Record<string, unknown>, loyihaBilan: boolean): (number | null)[] {
  return QADAMLAR.map((q, i) => (loyihaBilan && q.loyihasiz ? null : (row[`q${i}`] as number)));
}

const tartib = (a: { nomi: string; mijozlar: (number | null)[] }, b: typeof a) =>
  (b.mijozlar.find((n) => n != null) ?? 0) - (a.mijozlar.find((n) => n != null) ?? 0) || a.nomi.localeCompare(b.nomi);

/** The funnel's steps alone (the weekly summary uses it). */
export async function voronkaQadamlari(db: pg.Pool, f: VoronkaFiltr): Promise<VoronkaQadamDto[]> {
  const w = where(f);
  const row = (await db.query(`SELECT ${qadamUstunlari(w.params)} FROM hodisa h WHERE ${w.sql}`, w.params)).rows[0]!;
  const sonlar = qatorSonlari(row, f.loyihaId != null);
  return QADAMLAR.map((q, i) => ({ kalit: q.kalit, nomi: q.nomi, mijozlar: sonlar[i]! }));
}

export async function voronka(db: pg.Pool, f: VoronkaFiltr): Promise<VoronkaResponse> {
  const loyihaBilan = f.loyihaId != null;

  // By Manba: within the Loyiha filter (if any), every Manba.
  const m = where({ ...f, manba: null });
  const manbaRows = (
    await db.query(`SELECT h.manba, ${qadamUstunlari(m.params)} FROM hodisa h WHERE ${m.sql} GROUP BY h.manba`, m.params)
  ).rows;
  const manbalar = manbaRows
    .map((r) => ({ nomi: r.manba as string, mijozlar: qatorSonlari(r, loyihaBilan) }))
    .filter((r) => r.mijozlar.some((n) => n))
    .sort(tartib)
    .map((r) => ({ manba: r.nomi, mijozlar: r.mijozlar }));

  // By Loyiha: within the Manba filter (if any), every Loyiha.
  const l = where({ ...f, loyihaId: null });
  const loyihaRows = (
    await db.query(
      `SELECT l.id, l.nomi, ${qadamUstunlari(l.params)}
         FROM hodisa h JOIN loyiha l ON l.id = h.loyiha_id
        WHERE ${l.sql} GROUP BY l.id, l.nomi`,
      l.params,
    )
  ).rows;
  const loyihalar = loyihaRows
    .map((r) => ({ id: r.id as number, nomi: r.nomi as string, mijozlar: qatorSonlari(r, true) }))
    .sort(tartib);

  return {
    dan: f.dan,
    gacha: f.gacha,
    manba: f.manba ?? null,
    loyihaId: f.loyihaId ?? null,
    qadamlar: await voronkaQadamlari(db, f),
    manbalar,
    loyihalar,
    engKopKorilgan: await engKopKorilgan(db, f),
    tanlov: await tanlov(db),
  };
}

/** Most opened Planirovkalar of the period (under the same filters). */
async function engKopKorilgan(db: pg.Pool, f: VoronkaFiltr): Promise<KorilganPlanirovkaDto[]> {
  const w = where(f);
  w.params.push(PLANIROVKA_KORISH);
  const { rows } = await db.query<{
    id: number;
    loyiha: string;
    blok: string;
    xonalar: number;
    maydon: string;
    nomi: string | null;
    korishlar: number;
    mijozlar: number;
  }>(
    `SELECT p.id, l.nomi AS loyiha, b.nomi AS blok, p.xonalar, p.maydon, p.nomi->>'uz' AS nomi,
            count(*)::int AS korishlar, count(DISTINCT h.mijoz_id)::int AS mijozlar
       FROM hodisa h
       JOIN planirovka p ON p.id = h.planirovka_id
       JOIN blok b ON b.id = p.blok_id
       JOIN loyiha l ON l.id = b.loyiha_id
      WHERE ${w.sql} AND h.tur = ANY($${w.params.length}::text[])
      GROUP BY p.id, l.nomi, b.nomi
      ORDER BY korishlar DESC, mijozlar DESC, p.id
      LIMIT ${ENG_KOP_MAX}`,
    w.params,
  );
  return rows.map((r) => ({
    planirovkaId: r.id,
    loyiha: r.loyiha,
    blok: r.blok,
    xonalar: r.xonalar,
    maydon: Number(r.maydon),
    nomi: r.nomi,
    korishlar: r.korishlar,
    mijozlar: r.mijozlar,
  }));
}

/** Filter choices: every Manba ever credited, every Loyiha. */
async function tanlov(db: pg.Pool): Promise<VoronkaResponse['tanlov']> {
  const manbalar = (await db.query<{ manba: string }>('SELECT DISTINCT manba FROM hodisa')).rows.map((r) => r.manba);
  const loyihalar = (await db.query<{ id: number; nomi: string }>('SELECT id, nomi FROM loyiha')).rows;
  const by = (a: string, b: string) => a.localeCompare(b);
  return { manbalar: manbalar.sort(by), loyihalar: loyihalar.sort((a, b) => by(a.nomi, b.nomi)) };
}
