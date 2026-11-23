import type {
  ByudjetOraligi,
  KvizJavoblari,
  KvizMuddati,
  KvizTolovUsuli,
  KvizTuri,
  PlanirovkaFiltr,
  Shahar,
} from '@yh/shared';
import type pg from 'pg';

/**
 * «Xonadon tanlash» kvizi (#10): the step-by-step form of the filters. Its
 * answers become a bot_quiz Ariza (route kviz.ts) whose payload is
 * `{ kviz: KvizJavoblari }`; Mijoz skoringi (Daraja, UF-4, #18) reads them back with
 * `oxirgiKvizJavoblari`.
 */

const SHAHAR: Record<Shahar, string> = { toshkent: 'Toshkent', navoiy: 'Navoiy' };
const TUR: Record<KvizTuri, string> = { yashash: 'Yashash uchun', ijara: 'Ijaraga berish (investitsiya)' };
const MUDDAT: Record<KvizMuddati, string> = {
  shu_oy: 'Shu oy',
  '1_3_oy': '1–3 oy',
  '3_6_oy': '3–6 oy',
  bilmayman: 'Hali bilmayman',
};
const TOLOV: Record<KvizTolovUsuli, string> = { toliq: "To'liq", muddatli: 'Muddatli', ipoteka: 'Ipoteka' };

const mln = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1e6).replace('.', ',');

/** «400–500 mln so'm», «700 mln so'mdan», «500 mln so'mgacha». */
export function byudjetMatni(b: ByudjetOraligi | null): string {
  if (!b || (b.dan === null && b.gacha === null)) return 'aniqlanmagan';
  if (b.dan === null) return `${mln(b.gacha!)} mln so'mgacha`;
  if (b.gacha === null) return `${mln(b.dan)} mln so'mdan`;
  return `${mln(b.dan)}–${mln(b.gacha)} mln so'm`;
}

/** Note lines for managers (TZ 8-bo'lim: «shahar, tur, xonalar, byudjet, muddat» + to'lov usuli, S13). */
export function kvizIzohi(j: KvizJavoblari): string[] {
  return [
    `Shahar: ${SHAHAR[j.shahar]}`,
    `Tur: ${TUR[j.tur]}`,
    `Xonalar: ${j.xonalar.map((x) => (x >= 4 ? '4+' : String(x))).join(', ')}`,
    `Byudjet: ${byudjetMatni(j.byudjet)}`,
    `Xarid muddati: ${MUDDAT[j.muddat]}`,
    `To'lov usuli: ${TOLOV[j.tolov]}`,
  ];
}

/** The answers as a filter: matching bo'sh Planirovkalar (tur, muddat, to'lov do not filter). */
export function kvizFiltri(j: KvizJavoblari): PlanirovkaFiltr {
  return {
    shahar: j.shahar,
    xonalar: j.xonalar,
    ...(j.byudjet?.dan != null ? { narxDan: j.byudjet.dan } : {}),
    ...(j.byudjet?.gacha != null ? { narxGacha: j.byudjet.gacha } : {}),
    faqatBosh: true,
  };
}

/** Latest kviz answers of a Mijoz, or null if they never finished the kviz. For Mijoz skoringi (Daraja, #18). */
export async function oxirgiKvizJavoblari(db: pg.Pool, telegramId: string): Promise<KvizJavoblari | null> {
  const { rows } = await db.query<{ kviz: KvizJavoblari }>(
    `SELECT payload->'kviz' AS kviz FROM ariza
      WHERE mijoz_id = $1 AND tur = 'quiz' AND payload ? 'kviz'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [telegramId],
  );
  return rows[0]?.kviz ?? null;
}
