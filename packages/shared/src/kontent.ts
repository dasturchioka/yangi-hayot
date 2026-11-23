import type { Lang, Shahar } from './index';

/**
 * Content an Administrator edits in the admin-panel without code
 * («Qanday sotib olish», FAQ, «Biz haqimizda», kontaktlar), in both languages.
 */
export type Matn = Record<Lang, string>;

/** Limits from TZ 5-b. (FAQ «15 tagacha») plus sane caps for the rest. */
export const KONTENT_LIMITLARI = {
  bosqichlar: 10,
  hujjatlar: 20,
  faq: 15,
  raqamlar: 6,
} as const;

// ---------------------------------------------------------------- raw (admin)

export interface SotibOlishKontent {
  sarlavha: Matn;
  /** Stages in order: tanlash va bron → shartnoma → to'lov → notarius → kalitlar → kadastr. */
  bosqichlar: { nomi: Matn; matn: Matn }[];
  /** Xaridor hujjatlari. */
  hujjatlar: Matn[];
  /** Separate list for ipoteka. */
  ipotekaHujjatlari: Matn[];
  /** Up to 15 questions, shown as an accordion. */
  faq: { savol: Matn; javob: Matn }[];
}

export interface BizHaqimizdaKontent {
  sarlavha: Matn;
  matn: Matn;
  /** https URL or /media/... path; null = no cover photo. */
  foto: string | null;
  /** Company numbers (TZ K5 / M12): «12» + «loyiha». */
  raqamlar: { qiymat: string; nomi: Matn }[];
}

export interface KontaktlarKontent {
  /** Short number or full phone, e.g. «1349». «Qo'ng'iroq qilish» dials it. */
  telefon: string;
  manzil: Matn;
  ishVaqti: Matn;
  /** Telegram username without @, or null. */
  telegram: string | null;
  xarita: { lat: number; lng: number } | null;
}

export interface Kontent {
  sotibOlish: SotibOlishKontent;
  bizHaqimizda: BizHaqimizdaKontent;
  kontaktlar: KontaktlarKontent;
}

export const KONTENT_BOLIMLARI = ['sotibOlish', 'bizHaqimizda', 'kontaktlar'] as const;
export type KontentBolimi = (typeof KONTENT_BOLIMLARI)[number];

/** GET/PUT /admin/api/kontent — Administrator only. */
export type AdminKontentResponse = Kontent;

// ---------------------------------------------------------------- Mini App (one language)

/** Topshirilgan Loyiha in the «Biz haqimizda» portfolio (never in the katalog). */
export interface PortfolioLoyihaDto {
  id: number;
  nomi: string;
  shahar: Shahar;
  manzil: string;
  qisqaTavsif: string | null;
  foto: string | null;
}

export interface KontentResponse {
  sotibOlish: {
    sarlavha: string;
    bosqichlar: { nomi: string; matn: string }[];
    hujjatlar: string[];
    ipotekaHujjatlari: string[];
    faq: { savol: string; javob: string }[];
  };
  bizHaqimizda: {
    sarlavha: string;
    matn: string;
    foto: string | null;
    raqamlar: { qiymat: string; nomi: string }[];
    portfolio: PortfolioLoyihaDto[];
  };
  kontaktlar: {
    telefon: string;
    manzil: string;
    ishVaqti: string;
    telegram: string | null;
    xarita: { lat: number; lng: number } | null;
  };
}
