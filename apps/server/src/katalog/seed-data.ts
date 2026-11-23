import type { BlokInput, InfratuzilmaInput, LoyihaInput, PlanirovkaInput } from './seed';

/*
 * ================================ DEMO SEED ================================
 * Starting Katalog for the client demo, until the admin-panel (#5) and the
 * Excel import (#6) take over with the client's real data (M5, M6).
 *
 * Real (from assets/): names, cities, Jozibali Maskan Bloklar, floors and
 * Xonadonlar per Blok (readme: A 96, B 60, V 84, G 96, D 60 = 396), addresses,
 * coordinates and infrastructure from the location analyses, photos.
 *
 * DEMO — invented to make the demo look like a working catalog, replace
 * before launch:
 *   - every Planirovka: m², prices, bo'sh / bron / sotilgan counts and the
 *     chizma drawings (/media/chizma/*.svg are illustrative, not real plans);
 *   - Sayhun Bloklar (its readme is empty) and their Planirovkalar;
 *   - Navoiy: which Loyihalar are on sale (S11 / M5 — the first five
 *     alphabetically here), their floors, Bloklar and Planirovkalar.
 * ===========================================================================
 */

const m = (uz: string, ru: string) => ({ uz, ru });

const infra = (kategoriya: string, ru: string, uz: string, masofaKm: string, daq: string): InfratuzilmaInput => ({
  kategoriya,
  nomi: m(uz, ru),
  masofa: m(`${masofaKm} km · ${daq} daq`, `${masofaKm} км · ${daq} мин`),
});

/** DEMO chizma drawings, one per kind of Planirovka. */
const CHIZMA = {
  x1: '/media/chizma/1-xona.svg',
  x2: '/media/chizma/2-xona.svg',
  x2b: '/media/chizma/2-xona-burchak.svg',
  x3: '/media/chizma/3-xona.svg',
} as const;

const BURCHAK = m('Burchak', 'Угловая');

/** Rounds a price to whole million so'm. */
const mln = (n: number) => Math.round(n / 1_000_000) * 1_000_000;

/**
 * DEMO Planirovka with `jami` Xonadonlar: `sold` share sotilgan, up to `bron` in bron, the rest bo'sh.
 * `narxM2` is the price of one m² in so'm.
 */
function pl(
  xonalar: number,
  maydon: number,
  jami: number,
  narxM2: number | null,
  sold: number,
  extra: Partial<PlanirovkaInput> = {},
  bron = 2,
): PlanirovkaInput {
  const sotilgan = Math.min(jami, Math.round(jami * sold));
  const b = Math.min(jami - sotilgan, bron);
  return {
    xonalar,
    maydon,
    boshlangichNarx: narxM2 === null ? null : mln(maydon * narxM2),
    bosh: jami - sotilgan - b,
    bron: b,
    sotilgan,
    chizma: xonalar === 1 ? CHIZMA.x1 : xonalar === 2 ? CHIZMA.x2 : CHIZMA.x3,
    ...extra,
  };
}

/** Splits one Blok of Jozibali Maskan (12 floors × `perFloor`) into DEMO Planirovkalar. */
function jozibaliBlok(nomi: string, perFloor: 5 | 7 | 8, sold: number, narxM2: number): BlokInput {
  const floors = 12;
  // Per floor: 5 → 1+2+1+1, 7 → 2+2+1+2, 8 → 2+3+1+2 Xonadonlar of each Planirovka.
  const split: Record<number, [number, number, number, number]> = { 5: [1, 2, 1, 1], 7: [2, 2, 1, 2], 8: [2, 3, 1, 2] };
  const [x1, x2, x2b, x3] = split[perFloor]!;
  return {
    nomi,
    planirovkalar: [
      pl(1, 38.4, x1 * floors, narxM2 * 1.02, sold),
      pl(2, 54.2, x2 * floors, narxM2, sold),
      pl(2, 61.7, x2b * floors, narxM2 * 0.98, sold, { nomi: BURCHAK, chizma: CHIZMA.x2b }),
      pl(3, 82.5, x3 * floors, narxM2 * 0.96, sold),
    ],
  };
}

const jozibaliMaskan: LoyihaInput = {
  slug: 'jozibali-maskan',
  nomi: 'Jozibali Maskan',
  shahar: 'toshkent',
  holat: 'sotuvda',
  tartib: 1,
  manzil: m("Mirzo Ulug'bek tumani", 'Мирзо-Улугбекский район'),
  qisqaTavsif: m("Ta'mir va kadastr bilan", 'С ремонтом и кадастром'),
  tavsif: m(
    "Mirzo Ulug'bek tumanidagi 12 qavatli 5 blokli turar-joy majmuasi. Xonadonlar ta'mir va kadastr bilan topshiriladi. Yopiq hovli, bolalar maydonchalari va dam olish uchun ayvonlar bor.",
    'Жилой комплекс из 5 блоков по 12 этажей в Мирзо-Улугбекском районе. Квартиры сдаются с ремонтом и кадастром. Закрытый двор, детские площадки и беседки для отдыха.',
  ),
  fotolar: [1, 7, 2, 3, 8, 4, 5, 10, 11, 9, 12, 6, 13].map((i) => `/media/loyiha/jozibali-maskan/${i}.webp`),
  qavatlarSoni: 12,
  xarita: { lat: 41.333912, lng: 69.310504 },
  infratuzilma: [
    infra('bogcha', 'Детский сад Baby Dream', "Baby Dream bog'cha", '0,8', '10'),
    infra('talim', 'Международный цифровой университет (IDU)', 'IDU universiteti', '0,7', '9'),
    infra('talim', 'Школа №225', '225-maktab', '1,7', '22'),
    infra('transport', 'Метро «Пушкин»', 'Pushkin metrosi', '1,8', '23'),
    infra('dokon', 'Супермаркет Blackberry', 'Blackberry supermarketi', '0,6', '8'),
    infra('dam_olish', 'Ташкентский зоопарк', 'Toshkent hayvonot bog‘i', '1,6', '20'),
  ],
  bloklar: [
    jozibaliBlok('A', 8, 0.55, 10_100_000),
    jozibaliBlok('B', 5, 0.7, 10_300_000),
    jozibaliBlok('V', 7, 0.4, 9_900_000),
    jozibaliBlok('G', 8, 0.85, 10_200_000),
    jozibaliBlok('D', 5, 1, 10_000_000),
  ],
};

const sayhun: LoyihaInput = {
  slug: 'sayhun',
  nomi: 'Sayhun',
  shahar: 'toshkent',
  holat: 'sotuvda',
  tartib: 2,
  manzil: m("Yashnobod tumani, Farg'ona yo'li", 'Яшнабадский район, Фергана йули'),
  qisqaTavsif: m("Ta'mir bilan topshiriladi", 'Сдаётся с ремонтом'),
  tavsif: m(
    "Yashnobod tumanida, Farg'ona yo'li yaqinidagi turar-joy majmuasi. Universitet, maktab va Do'stlik metrosi yaqin. Xonadonlar ta'mir bilan topshiriladi.",
    'Жилой комплекс в Яшнабадском районе, рядом с Ферганской дорогой. Рядом университет, школа и метро «Дустлик». Квартиры сдаются с ремонтом.',
  ),
  fotolar: [1, 2, 3].map((i) => `/media/loyiha/sayhun/${i}.webp`),
  qavatlarSoni: 9, // DEMO
  xarita: { lat: 41.286113, lng: 69.309917 },
  infratuzilma: [
    infra('talim', 'OXUS University', 'OXUS University', '0,4', '5–8'),
    infra('talim', 'Школа №30', '30-maktab', '0,83', '12–15'),
    infra('bogcha', 'Детский сад №421 «Малыш»', '421-bog‘cha «Malish»', '1,31', '19–23'),
    infra('transport', 'Метро «Дустлик»', "Do'stlik metrosi", '1,33', '18–22'),
    infra('dokon', 'Korzinka', 'Korzinka', '0,46', '6–8'),
    infra('masjid', 'Мечеть Ислом Ота', 'Islom Ota masjidi', '1,01', '13–16'),
  ],
  // DEMO Bloklar and Planirovkalar (real ones unknown yet).
  bloklar: [
    {
      nomi: 'A',
      planirovkalar: [
        pl(1, 41.2, 18, 9_200_000, 0.6),
        pl(2, 58.6, 27, 9_000_000, 0.45),
        pl(3, 78.9, 18, 8_800_000, 0.5),
      ],
    },
    {
      nomi: 'B',
      planirovkalar: [
        pl(2, 56.3, 27, 9_100_000, 0.3),
        pl(2, 64.8, 9, 8_900_000, 0.2, { nomi: BURCHAK, chizma: CHIZMA.x2b }),
        pl(3, 84.1, 18, 8_700_000, 0.35),
      ],
    },
  ],
};

interface NavoiyDemo {
  qavatlar: number;
  qisqa: { uz: string; ru: string };
  bloklar: BlokInput[];
}

const navoiy = (
  slug: string,
  nomi: string,
  holat: LoyihaInput['holat'],
  fotolar: string[],
  tartib: number,
  demo?: NavoiyDemo,
): LoyihaInput => ({
  slug,
  nomi,
  shahar: 'navoiy',
  holat,
  tartib,
  manzil: m('Navoiy shahri', 'г. Навои'),
  fotolar: fotolar.map((f) => `/media/loyiha/navoiy/${f}.webp`),
  ...(demo ? { qavatlarSoni: demo.qavatlar, qisqaTavsif: demo.qisqa, bloklar: demo.bloklar } : {}),
});

/** Drops the DEMO Bloklar of Loyihalar whose real Planirovkalar come from the old bot (import:legacy). */
const withoutDemoBloklar = (l: LoyihaInput): LoyihaInput =>
  l.slug === 'jozibali-maskan' ? l : { ...l, bloklar: [], qavatlarSoni: l.slug === 'sayhun' ? null : l.qavatlarSoni };

const TAYYOR = m("Ta'mir bilan topshiriladi", 'Сдаётся с ремонтом');

/** DEMO Navoiy Planirovkalar: one or two Bloklar, Navoiy prices per m². */
const navoiyBlok = (nomi: string, narxM2: number, sold: number): BlokInput => ({
  nomi,
  planirovkalar: [
    pl(1, 36.5, 9, narxM2 * 1.03, sold, {}, 1),
    pl(2, 52.4, 18, narxM2, sold, {}, 1),
    pl(3, 71.8, 9, narxM2 * 0.97, sold, {}, 1),
  ],
});

/**
 * `pnpm --filter @yh/server seed:demo` — the full DEMO catalog for showing the
 * product: Planirovkalar for Sayhun and the Navoiy Loyihalar on sale too.
 * Never run it on a database that will get `import:legacy` or the client's Excel.
 */
export const DEMO_LOYIHALAR: LoyihaInput[] = [
  jozibaliMaskan,
  sayhun,
  navoiy('assalom-shifokorlar', 'Assalom Shifokorlar', 'sotuvda', ['assalom-shifokorlar'], 1, {
    qavatlar: 9,
    qisqa: TAYYOR,
    bloklar: [navoiyBlok('A', 6_400_000, 0.5), navoiyBlok('B', 6_300_000, 0.3)],
  }),
  navoiy('bahor', 'Bahor', 'sotuvda', ['bahor-1', 'bahor-2'], 2, {
    qavatlar: 9,
    qisqa: TAYYOR,
    bloklar: [navoiyBlok('A', 6_100_000, 0.6)],
  }),
  navoiy('business-city', 'Business City', 'sotuvda', ['business-city'], 3, {
    qavatlar: 12,
    qisqa: m("Shahar markazida, ta'mir bilan", 'В центре города, с ремонтом'),
    bloklar: [navoiyBlok('A', 7_200_000, 0.4)],
  }),
  navoiy('gulzor', 'Gulzor', 'sotuvda', ['gulzor'], 4, {
    qavatlar: 7,
    qisqa: TAYYOR,
    bloklar: [navoiyBlok('A', 5_900_000, 0.7)],
  }),
  navoiy('ishonch', 'Ishonch', 'sotuvda', ['ishonch'], 5, {
    qavatlar: 9,
    qisqa: TAYYOR,
    bloklar: [navoiyBlok('A', 6_000_000, 0.8)],
  }),
  navoiy('kamalak', 'Kamalak', 'topshirilgan', ['kamalak'], 6),
  navoiy('nur', 'Nur', 'topshirilgan', ['nur'], 7),
  navoiy('qizilqum', 'Qizilqum', 'topshirilgan', ['qizilqum'], 8),
  navoiy('tarobiy', 'Tarobiy', 'topshirilgan', ['tarobiy'], 9),
];

/**
 * `pnpm --filter @yh/server seed` — starting Katalog: the same Loyihalar, but
 * only Jozibali Maskan has (DEMO) Planirovkalar; the others get theirs from
 * `import:legacy` or the Excel import.
 */
export const SEED_LOYIHALAR: LoyihaInput[] = DEMO_LOYIHALAR.map(withoutDemoBloklar);

/** DEMO «Biz haqimizda» figures, all countable from the seeded catalog: Loyihalar, Topshirilganlar, cities. */
export const DEMO_RAQAMLAR = [
  { qiymat: String(DEMO_LOYIHALAR.length), nomi: { uz: 'loyiha', ru: 'проектов' } },
  {
    qiymat: String(DEMO_LOYIHALAR.filter((l) => l.holat === 'topshirilgan').length),
    nomi: { uz: 'topshirilgan', ru: 'сдано' },
  },
  { qiymat: '2', nomi: { uz: 'shahar', ru: 'города' } },
];
