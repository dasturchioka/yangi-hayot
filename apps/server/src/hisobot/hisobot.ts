import type { ArizaTuri } from '@yh/shared';
import type pg from 'pg';
import { addDays, tashkentInstant, toTashkent } from '../clock';
import { ARIZA_TURI } from '../ariza/turlar';
import type { VoronkaQadamDto } from '@yh/shared';
import { dojimYozilishlari, hodisaSonlari } from '../hodisa/hodisa';
import { voronkaQadamlari } from '../hodisa/voronka';
import { getSetting } from '../settings/settings';

/**
 * Daily report for the head of sales (TZ 4-b., stories 74, 76, 77). Read only
 * from the bot database — amoCRM is never asked, so the report works while
 * the CRM is down. Uzbek: managers read it.
 */
export interface KunlikHisobot {
  /** Tashkent `YYYY-MM-DD`. */
  sana: string;
  yangiMijozlar: { jami: number; manbalar: Qator[] };
  arizalar: {
    jami: number;
    /** Of today's Arizalar, not (yet) in amoCRM. */
    yetibBormagan: number;
    turlar: Qator[];
    loyihalar: Qator[];
    manbalar: Qator[];
  };
  /** Active yozilishlar of the next day. */
  ertangiYozilishlar: { sana: string; vaqt: string; loyiha: string; ism: string; telefon: string | null }[];
  /** Every Ariza of the last 7 days that has not reached amoCRM (pending or failed). */
  yetibBormaganlar: { id: number; tur: string; ism: string; telefon: string | null; sana: string; holat: 'pending' | 'failed' }[];
}

export interface Qator {
  nomi: string;
  soni: number;
}

/** [from, to) instants of Tashkent days `dan` … `gacha` inclusive. */
export function kunlar(dan: string, gacha: string = dan): [Date, Date] {
  return [tashkentInstant(dan, '00:00'), tashkentInstant(addDays(gacha, 1), '00:00')];
}

const LOYIHASIZ = 'Loyihasiz';

export async function kunlikHisobot(db: pg.Pool, sana: string): Promise<KunlikHisobot> {
  const [dan, gacha] = kunlar(sana);
  // Administrators talk to the bot too (/report, /broadcast); they are not Mijozlar to report.
  const admins = await getSetting(db, 'admins');
  const yangi = await db.query<{ nomi: string; soni: number }>(
    `SELECT first_source AS nomi, count(*)::int AS soni FROM mijoz
      WHERE created_at >= $1 AND created_at < $2 AND NOT (telegram_id::text = ANY($3))
      GROUP BY 1 ORDER BY 2 DESC, 1`,
    [dan, gacha, admins],
  );

  // Old-bot Arizalar (legacy_ariza_id) were copied in, not created today.
  const arizaWhere = `a.created_at >= $1 AND a.created_at < $2 AND a.legacy_ariza_id IS NULL`;
  const jami = (
    await db.query<{ jami: number; yetib_bormagan: number }>(
      `SELECT count(*)::int AS jami, count(*) FILTER (WHERE a.crm_status <> 'sent')::int AS yetib_bormagan
         FROM ariza a WHERE ${arizaWhere}`,
      [dan, gacha],
    )
  ).rows[0]!;
  const turlar = await db.query<{ tur: ArizaTuri; soni: number }>(
    `SELECT a.tur, count(*)::int AS soni FROM ariza a WHERE ${arizaWhere} GROUP BY 1 ORDER BY 2 DESC, 1`,
    [dan, gacha],
  );
  const loyihalar = await db.query<Qator>(
    `SELECT coalesce(l.nomi, a.kontekst->'loyiha'->>'nomi', '${LOYIHASIZ}') AS nomi, count(*)::int AS soni
       FROM ariza a LEFT JOIN loyiha l ON l.id = a.loyiha_id
      WHERE ${arizaWhere} GROUP BY 1 ORDER BY 2 DESC, 1`,
    [dan, gacha],
  );
  const manbalar = await db.query<Qator>(
    `SELECT a.manba AS nomi, count(*)::int AS soni FROM ariza a WHERE ${arizaWhere} GROUP BY 1 ORDER BY 2 DESC, 1`,
    [dan, gacha],
  );

  const ertaga = addDays(sana, 1);
  const [eDan, eGacha] = kunlar(ertaga);
  const yozilishlar = await db.query<{ vaqt: Date; loyiha: string; ism: string; telefon: string | null }>(
    `SELECT y.vaqt, l.nomi AS loyiha, a.name AS ism, a.phone AS telefon
       FROM yozilish y JOIN ariza a ON a.id = y.ariza_id JOIN loyiha l ON l.id = y.loyiha_id
      WHERE y.holat = 'faol' AND y.vaqt >= $1 AND y.vaqt < $2 ORDER BY y.vaqt, y.id`,
    [eDan, eGacha],
  );

  const yetibBormaganlar = await db.query<{
    id: number;
    tur: ArizaTuri;
    ism: string;
    telefon: string | null;
    created_at: Date;
    holat: 'pending' | 'failed';
  }>(
    `SELECT a.id, a.tur, a.name AS ism, a.phone AS telefon, a.created_at, a.crm_status AS holat
       FROM ariza a
      WHERE a.crm_status <> 'sent' AND a.legacy_ariza_id IS NULL AND a.created_at >= $1 AND a.created_at < $2
      ORDER BY a.id`,
    [kunlar(addDays(sana, -6))[0], gacha],
  );

  return {
    sana,
    yangiMijozlar: { jami: sum(yangi.rows), manbalar: yangi.rows },
    arizalar: {
      jami: jami.jami,
      yetibBormagan: jami.yetib_bormagan,
      turlar: turlar.rows.map((r) => ({ nomi: ARIZA_TURI[r.tur].nomi, soni: r.soni })),
      loyihalar: loyihalar.rows,
      manbalar: manbalar.rows,
    },
    ertangiYozilishlar: yozilishlar.rows.map((r) => ({
      sana: ertaga,
      vaqt: toTashkent(r.vaqt).time,
      loyiha: r.loyiha,
      ism: r.ism,
      telefon: r.telefon,
    })),
    yetibBormaganlar: yetibBormaganlar.rows.map((r) => ({
      id: r.id,
      tur: ARIZA_TURI[r.tur].nomi,
      ism: r.ism,
      telefon: r.telefon,
      sana: toTashkent(r.created_at).date,
      holat: r.holat,
    })),
  };
}

function sum(rows: Qator[]): number {
  return rows.reduce((n, r) => n + r.soni, 0);
}

// ── text ────────────────────────────────────────────────────────────────

const HAFTA = ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'];
/** Lines per list, so the message stays well under Telegram's 4096 characters. */
const ROYXAT_MAX = 10;
const YOZILISH_MAX = 25;

export function sanaMatni(sana: string): string {
  const [y, m, d] = sana.split('-');
  const weekday = (new Date(`${sana}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${d}.${m}.${y} (${HAFTA[weekday]})`;
}

export function kunlikMatn(h: KunlikHisobot): string {
  const a = h.arizalar;
  const lines = [`📊 Kunlik hisobot — ${sanaMatni(h.sana)}`, ''];

  lines.push(`👤 Yangi Mijozlar: ${h.yangiMijozlar.jami}`, ...qatorlar(h.yangiMijozlar.manbalar), '');

  lines.push(`📝 Arizalar: ${a.jami}`);
  if (a.jami > 0) {
    lines.push(`amoCRM'da: ${a.jami - a.yetibBormagan} · amoCRM'ga yetib bormagan: ${a.yetibBormagan}`);
    lines.push('Turlar bo\'yicha:', ...qatorlar(a.turlar));
    lines.push('Loyihalar bo\'yicha:', ...qatorlar(a.loyihalar));
    lines.push('Manbalar bo\'yicha:', ...qatorlar(a.manbalar));
  } else {
    lines.push(`amoCRM'ga yetib bormagan: 0`);
  }
  lines.push('');

  const y = h.ertangiYozilishlar;
  lines.push(`📅 Ertangi yozilishlar (${sanaMatni(addDays(h.sana, 1))}): ${y.length}`);
  for (const r of y.slice(0, YOZILISH_MAX)) {
    lines.push(`• ${r.vaqt} — ${r.loyiha} — ${r.ism}${r.telefon ? `, ${r.telefon}` : ''}`);
  }
  if (y.length > YOZILISH_MAX) lines.push(`… va yana ${y.length - YOZILISH_MAX} ta`);

  const u = h.yetibBormaganlar;
  if (u.length > 0) {
    lines.push('', `⚠️ amoCRM'ga yetib bormagan Arizalar (7 kun): ${u.length}`);
    for (const r of u.slice(0, YOZILISH_MAX)) {
      const holat = r.holat === 'failed' ? 'yuborilmadi' : 'qayta urinilmoqda';
      lines.push(`• #${r.id} ${r.tur} — ${r.ism}${r.telefon ? `, ${r.telefon}` : ''} (${sanaQisqa(r.sana)}, ${holat})`);
    }
    if (u.length > YOZILISH_MAX) lines.push(`… va yana ${u.length - YOZILISH_MAX} ta`);
  }
  return lines.join('\n');
}

// ── weekly ──────────────────────────────────────────────────────────────

/** Figures of one week (Mon–Sun, Tashkent). */
export interface HaftaRaqamlari {
  dan: string;
  gacha: string;
  yangiMijozlar: number;
  arizalar: number;
  yozilishlar: number;
  keldi: number;
  /** Yozilishlar that came from a dojim message (#17 marks them). */
  dojimYozilishlari: number;
  /** Distinct Mijozlar per funnel step (#20). */
  voronka: VoronkaQadamDto[];
}

export interface HaftalikHisobot {
  hafta: HaftaRaqamlari;
  oldingi: HaftaRaqamlari;
}

/**
 * Story 75: on Monday, the week that just ended (Mon–Sun before `dushanba`)
 * compared with the week before it.
 */
export async function haftalikHisobot(db: pg.Pool, dushanba: string): Promise<HaftalikHisobot> {
  return {
    hafta: await haftaRaqamlari(db, addDays(dushanba, -7)),
    oldingi: await haftaRaqamlari(db, addDays(dushanba, -14)),
  };
}

async function haftaRaqamlari(db: pg.Pool, dan: string): Promise<HaftaRaqamlari> {
  const gacha = addDays(dan, 6);
  const [from, to] = kunlar(dan, gacha);
  const admins = await getSetting(db, 'admins');
  const yangi = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM mijoz WHERE created_at >= $1 AND created_at < $2 AND NOT (telegram_id::text = ANY($3))`,
    [from, to, admins],
  );
  const h = await hodisaSonlari(db, from, to);
  return {
    dan,
    gacha,
    yangiMijozlar: yangi.rows[0]!.n,
    arizalar: h.ariza.jami,
    yozilishlar: h.yozilish.jami,
    keldi: h.keldi.jami,
    dojimYozilishlari: await dojimYozilishlari(db, from, to),
    voronka: await voronkaQadamlari(db, { dan, gacha }),
  };
}

export function haftalikMatn({ hafta: a, oldingi: b }: HaftalikHisobot): string {
  const taqqos = (x: number, y: number) => `${x} (${y}, ${x > y ? '+' : x < y ? '−' : '±'}${Math.abs(x - y)})`;
  return [
    `📈 Haftalik xulosa — ${sanaRaqam(a.dan)} – ${sanaRaqam(a.gacha)}`,
    `(qavsda — oldingi hafta, ${sanaRaqam(b.dan)} – ${sanaRaqam(b.gacha)})`,
    '',
    `👤 Yangi Mijozlar: ${taqqos(a.yangiMijozlar, b.yangiMijozlar)}`,
    `📝 Arizalar: ${taqqos(a.arizalar, b.arizalar)}`,
    `📅 Yozilishlar: ${taqqos(a.yozilishlar, b.yozilishlar)}`,
    `✅ Keldi: ${taqqos(a.keldi, b.keldi)}`,
    `🔔 Dojimdan kelgan yozilishlar: ${taqqos(a.dojimYozilishlari, b.dojimYozilishlari)}`,
    '',
    'Voronka (Mijozlar):',
    ...a.voronka.map((q, i) => `• ${q.nomi}: ${taqqos(q.mijozlar ?? 0, b.voronka[i]!.mijozlar ?? 0)}`),
  ].join('\n');
}

function sanaRaqam(sana: string): string {
  const [y, m, d] = sana.split('-');
  return `${d}.${m}.${y}`;
}

function qatorlar(rows: Qator[]): string[] {
  const out = rows.slice(0, ROYXAT_MAX).map((r) => `• ${r.nomi}: ${r.soni}`);
  if (rows.length > ROYXAT_MAX) out.push(`• boshqalar: ${sum(rows.slice(ROYXAT_MAX))}`);
  return out;
}

function sanaQisqa(sana: string): string {
  const [, m, d] = sana.split('-');
  return `${d}.${m}`;
}
