/**
 * Lead skoringi (UF-4, #18): the Mijoz's Daraja from kviz and kalkulyator
 * answers (xarid muddati, to'lov usuli, byudjet) and behaviour (kalkulyator,
 * ko'rishga yozilish, qayta kirishlar). Pure; the server gathers the signals,
 * the admin-panel previews the same function while the rules are edited.
 */

import type { KvizMuddati, KvizTolovUsuli } from './index';

export const DARAJALAR = ['issiq', 'iliq', 'sovuq'] as const;
export type Daraja = (typeof DARAJALAR)[number];

/** Ball qoidalari (settings key `skoring`), edited by the Administrator. */
export interface SkoringQoidalari {
  /** Kviz «Xarid muddati» answer. */
  muddat: Record<KvizMuddati, number>;
  /** Kviz «To'lov usuli», or the kalkulyator sxema when there is no kviz answer. */
  tolov: Record<KvizTolovUsuli, number>;
  /** A budget was given (kviz range, or a price in the kalkulyator). */
  byudjet: number;
  /** Looked at a kalkulyator result / sent it to a manager (bot_calc). */
  kalkulyator: { hisobladi: number; yubordi: number };
  /** At least one ko'rishga yozilish. */
  yozilish: number;
  /** Each day the Mijoz came back after the first, counted up to `max` days. */
  qaytish: { har: number; max: number };
  /** Ball from which the Mijoz is iliq / issiq (inclusive). Below iliq: sovuq. */
  chegara: { iliq: number; issiq: number };
  /** Deadline of the «Qo'ng'iroq qilish» task for an issiq Mijoz, working minutes (TZ: 5). */
  issiqVazifaDaqiqa: number;
}

/** GET / PUT /admin/api/skoring (Administrator). PUT takes SkoringQoidalari. */
export interface SkoringResponse {
  qoidalar: SkoringQoidalari;
}

/** What is known about a Mijoz. null = no answer to that question. */
export interface SkoringSignallari {
  muddat: KvizMuddati | null;
  tolov: KvizTolovUsuli | null;
  /** true: gave a budget; false: «Hali aniq emas»; null: never asked. */
  byudjet: boolean | null;
  hisobladi: boolean;
  yubordi: boolean;
  yozilishlar: number;
  qaytishlar: number;
}

export interface SkoringNatija {
  ball: number;
  daraja: Daraja;
  /** Parts that gave ball (≠ 0), for managers: «Xarid muddati: shu oy» +30. */
  qismlar: { nomi: string; ball: number }[];
}

/**
 * PLACEHOLDER until M14 (ball jadvali agreed with the sotuv bo'limi rahbari).
 * Max 100: muddat 30 + to'lov 25 + byudjet 10 + kalkulyator 25 + yozilish 30 + qaytish 15 (capped by issiq = 60 anyway).
 */
export const DEFAULT_SKORING: SkoringQoidalari = {
  muddat: { shu_oy: 30, '1_3_oy': 20, '3_6_oy': 10, bilmayman: 0 },
  tolov: { toliq: 25, ipoteka: 15, muddatli: 15 },
  byudjet: 10,
  kalkulyator: { hisobladi: 10, yubordi: 15 },
  yozilish: 30,
  qaytish: { har: 5, max: 3 },
  chegara: { iliq: 30, issiq: 60 },
  issiqVazifaDaqiqa: 5,
};

export const MUDDAT_NOMI: Record<KvizMuddati, string> = {
  shu_oy: 'shu oy',
  '1_3_oy': '1–3 oy',
  '3_6_oy': '3–6 oy',
  bilmayman: 'hali bilmaydi',
};

export const TOLOV_NOMI: Record<KvizTolovUsuli, string> = {
  toliq: "to'liq",
  muddatli: 'muddatli',
  ipoteka: 'ipoteka',
};

export function darajaHisobla(q: SkoringQoidalari, s: SkoringSignallari): SkoringNatija {
  const qismlar: SkoringNatija['qismlar'] = [];
  const add = (nomi: string, ball: number) => {
    if (ball !== 0) qismlar.push({ nomi, ball });
  };
  if (s.muddat) add(`Xarid muddati: ${MUDDAT_NOMI[s.muddat]}`, q.muddat[s.muddat]);
  if (s.tolov) add(`To'lov usuli: ${TOLOV_NOMI[s.tolov]}`, q.tolov[s.tolov]);
  if (s.byudjet) add("Byudjet ko'rsatilgan", q.byudjet);
  if (s.hisobladi) add('Kalkulyatorda hisobladi', q.kalkulyator.hisobladi);
  if (s.yubordi) add('Hisobni menejerga yubordi', q.kalkulyator.yubordi);
  if (s.yozilishlar > 0) add("Ko'rishga yozildi", q.yozilish);
  if (s.qaytishlar > 0) add(`Qayta kirishlar: ${s.qaytishlar}`, q.qaytish.har * Math.min(s.qaytishlar, q.qaytish.max));

  const ball = Math.max(0, qismlar.reduce((sum, p) => sum + p.ball, 0));
  const daraja: Daraja = ball >= q.chegara.issiq ? 'issiq' : ball >= q.chegara.iliq ? 'iliq' : 'sovuq';
  return { ball, daraja, qismlar };
}

const yoq: SkoringSignallari = {
  muddat: null,
  tolov: null,
  byudjet: null,
  hisobladi: false,
  yubordi: false,
  yozilishlar: 0,
  qaytishlar: 0,
};

/**
 * Qabul (UF-4): five test anketalar. The admin-panel shows their Daraja under
 * the rules being edited; the test pins it for the default rules.
 */
export const SKORING_NAMUNALARI: { nomi: string; signallar: SkoringSignallari }[] = [
  {
    nomi: "Shu oy, to'liq to'lov, byudjet bor",
    signallar: { ...yoq, muddat: 'shu_oy', tolov: 'toliq', byudjet: true },
  },
  {
    nomi: '1–3 oyda, ipoteka, byudjet bor, kalkulyatorda hisobladi',
    signallar: { ...yoq, muddat: '1_3_oy', tolov: 'ipoteka', byudjet: true, hisobladi: true },
  },
  {
    nomi: 'Hali bilmaydi, muddatli, byudjet aniq emas',
    signallar: { ...yoq, muddat: 'bilmayman', tolov: 'muddatli', byudjet: false },
  },
  {
    nomi: 'Kvizsiz: hisobni yubordi va ko‘rishga yozildi',
    signallar: { ...yoq, tolov: 'muddatli', byudjet: true, hisobladi: true, yubordi: true, yozilishlar: 1 },
  },
  {
    nomi: '4 kun qaytib kirdi, boshqa harakat yo‘q',
    signallar: { ...yoq, qaytishlar: 4 },
  },
];
