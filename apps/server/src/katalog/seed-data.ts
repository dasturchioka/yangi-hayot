import type { BlokInput, InfratuzilmaInput, LoyihaInput, PlanirovkaInput } from './seed';

/*
 * Starting Katalog until the admin-panel (#5) and Excel import (#6) take over.
 *
 * Real (from assets/): names, cities, Jozibali Maskan Bloklar, floors and
 * Xonadonlar per Blok (readme: A 96, B 60, V 84, G 96, D 60 = 396), addresses,
 * coordinates and infrastructure from the location analyses, photos.
 *
 * DEMO, to be replaced by the client's Planirovkalar Excel (M6) before launch:
 * how each Blok's Xonadonlar split into Planirovkalar, m², prices and the
 * bo'sh / bron / sotilgan counts. Sayhun Bloklar are unknown (empty readme),
 * so it has no Planirovkalar and shows «Narx so'rov bo'yicha».
 * Which Navoiy Loyihalar are on sale is not known yet (S11 / M5): the default
 * says five; the first five alphabetically are marked Sotuvda here.
 */

const m = (uz: string, ru: string) => ({ uz, ru });

const infra = (kategoriya: string, ru: string, uz: string, masofaKm: string, daq: string): InfratuzilmaInput => ({
  kategoriya,
  nomi: m(uz, ru),
  masofa: m(`${masofaKm} km · ${daq} daq`, `${masofaKm} км · ${daq} мин`),
});

/** Splits one Blok of Jozibali Maskan (12 floors × `perFloor`) into DEMO Planirovkalar. */
function jozibaliBlok(nomi: string, perFloor: 5 | 7 | 8, sold: number): BlokInput {
  const floors = 12;
  // Per floor: 5 → 1+2+1+1, 7 → 2+2+1+2, 8 → 2+3+1+2 Xonadonlar of each Planirovka.
  const split: Record<number, [number, number, number, number]> = { 5: [1, 2, 1, 1], 7: [2, 2, 1, 2], 8: [2, 3, 1, 2] };
  const [x1, x2, x2b, x3] = split[perFloor]!;
  const pl = (
    xonalar: number,
    maydon: number,
    perF: number,
    narx: number | null,
    nomi?: { uz: string; ru: string },
  ): PlanirovkaInput => {
    const jami = perF * floors;
    const sotilgan = Math.min(jami, Math.round(jami * sold));
    const bron = Math.min(jami - sotilgan, 2);
    return { xonalar, maydon, nomi: nomi ?? null, boshlangichNarx: narx, bosh: jami - sotilgan - bron, bron, sotilgan };
  };
  return {
    nomi,
    planirovkalar: [
      pl(1, 38.4, x1, 395_000_000),
      pl(2, 54.2, x2, 548_000_000),
      pl(2, 61.7, x2b, 612_000_000, m('Burchak', 'Угловая')),
      pl(3, 82.5, x3, null),
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
    "Mirzo Ulug'bek tumanidagi 12 qavatli 5 blokli turar-joy majmuasi. Xonadonlar ta'mir va kadastr bilan topshiriladi.",
    'Жилой комплекс из 5 блоков по 12 этажей в Мирзо-Улугбекском районе. Квартиры сдаются с ремонтом и кадастром.',
  ),
  fotolar: [1, 2, 3, 4, 5, 6].map((i) => `/media/loyiha/jozibali-maskan/${i}.webp`),
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
    jozibaliBlok('A', 8, 0.55),
    jozibaliBlok('B', 5, 0.7),
    jozibaliBlok('V', 7, 0.4),
    jozibaliBlok('G', 8, 0.85),
    jozibaliBlok('D', 5, 1),
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
  fotolar: [1, 2, 3].map((i) => `/media/loyiha/sayhun/${i}.webp`),
  xarita: { lat: 41.286113, lng: 69.309917 },
  infratuzilma: [
    infra('talim', 'OXUS University', 'OXUS University', '0,4', '5–8'),
    infra('talim', 'Школа №30', '30-maktab', '0,83', '12–15'),
    infra('bogcha', 'Детский сад №421 «Малыш»', '421-bog‘cha «Malish»', '1,31', '19–23'),
    infra('transport', 'Метро «Дустлик»', "Do'stlik metrosi", '1,33', '18–22'),
    infra('dokon', 'Korzinka', 'Korzinka', '0,46', '6–8'),
    infra('masjid', 'Мечеть Ислом Ота', 'Islom Ota masjidi', '1,01', '13–16'),
  ],
};

const navoiy = (
  slug: string,
  nomi: string,
  holat: LoyihaInput['holat'],
  fotolar: string[],
  tartib: number,
): LoyihaInput => ({
  slug,
  nomi,
  shahar: 'navoiy',
  holat,
  tartib,
  manzil: m('Navoiy shahri', 'г. Навои'),
  fotolar: fotolar.map((f) => `/media/loyiha/navoiy/${f}.webp`),
});

export const SEED_LOYIHALAR: LoyihaInput[] = [
  jozibaliMaskan,
  sayhun,
  navoiy('assalom-shifokorlar', 'Assalom Shifokorlar', 'sotuvda', ['assalom-shifokorlar'], 1),
  navoiy('bahor', 'Bahor', 'sotuvda', ['bahor-1', 'bahor-2'], 2),
  navoiy('business-city', 'Business City', 'sotuvda', ['business-city'], 3),
  navoiy('gulzor', 'Gulzor', 'sotuvda', ['gulzor'], 4),
  navoiy('ishonch', 'Ishonch', 'sotuvda', ['ishonch'], 5),
  navoiy('kamalak', 'Kamalak', 'topshirilgan', ['kamalak'], 6),
  navoiy('nur', 'Nur', 'topshirilgan', ['nur'], 7),
  navoiy('qizilqum', 'Qizilqum', 'topshirilgan', ['qizilqum'], 8),
  navoiy('tarobiy', 'Tarobiy', 'topshirilgan', ['tarobiy'], 9),
];
