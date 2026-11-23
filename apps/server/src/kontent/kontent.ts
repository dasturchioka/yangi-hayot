import type { Kontent, KontentBolimi, KontentResponse, Lang, Matn, PortfolioLoyihaDto, Shahar } from '@yh/shared';
import type pg from 'pg';
import { getSetting, setSetting } from '../settings/settings';

/** All three sections as the Administrator edits them (both languages). */
export async function readKontent(db: pg.Pool): Promise<Kontent> {
  const [sotibOlish, bizHaqimizda, kontaktlar] = await Promise.all([
    getSetting(db, 'sotibOlish'),
    getSetting(db, 'bizHaqimizda'),
    getSetting(db, 'kontaktlar'),
  ]);
  return { sotibOlish, bizHaqimizda, kontaktlar };
}

export async function saveKontentBolimi<K extends KontentBolimi>(
  db: pg.Pool,
  bolim: K,
  value: Kontent[K],
  now: Date,
): Promise<void> {
  await setSetting(db, bolim, value as Parameters<typeof setSetting<K>>[2], now);
}

/** Topshirilgan Loyihalar for the «Biz haqimizda» portfolio. The katalog never shows them. */
export async function portfolio(db: pg.Pool, lang: Lang): Promise<PortfolioLoyihaDto[]> {
  const { rows } = await db.query<{
    id: number;
    nomi: string;
    shahar: Shahar;
    manzil: Matn;
    qisqa_tavsif: Matn | null;
    fotolar: string[];
  }>(
    `SELECT id, nomi, shahar, manzil, qisqa_tavsif, fotolar FROM loyiha
     WHERE holat = 'topshirilgan' ORDER BY shahar, tartib, id`,
  );
  return rows.map((r) => ({
    id: r.id,
    nomi: r.nomi,
    shahar: r.shahar,
    manzil: r.manzil[lang],
    qisqaTavsif: r.qisqa_tavsif?.[lang] || null,
    foto: r.fotolar[0] ?? null,
  }));
}

/** What the Mini App shows, in one language. */
export async function kontentFor(db: pg.Pool, lang: Lang): Promise<KontentResponse> {
  const [k, loyihalar] = await Promise.all([readKontent(db), portfolio(db, lang)]);
  const s = k.sotibOlish;
  const b = k.bizHaqimizda;
  const c = k.kontaktlar;
  return {
    sotibOlish: {
      sarlavha: s.sarlavha[lang],
      bosqichlar: s.bosqichlar.map((x) => ({ nomi: x.nomi[lang], matn: x.matn[lang] })),
      hujjatlar: s.hujjatlar.map((x) => x[lang]),
      ipotekaHujjatlari: s.ipotekaHujjatlari.map((x) => x[lang]),
      faq: s.faq.map((x) => ({ savol: x.savol[lang], javob: x.javob[lang] })),
    },
    bizHaqimizda: {
      sarlavha: b.sarlavha[lang],
      matn: b.matn[lang],
      foto: b.foto,
      raqamlar: b.raqamlar.map((x) => ({ qiymat: x.qiymat, nomi: x.nomi[lang] })),
      portfolio: loyihalar,
    },
    kontaktlar: {
      telefon: c.telefon,
      manzil: c.manzil[lang],
      ishVaqti: c.ishVaqti[lang],
      telegram: c.telegram,
      xarita: c.xarita,
    },
  };
}
