import type { Lang } from '@yh/shared';

const OY: Record<Lang, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};

const HAFTA: Record<Lang, string[]> = {
  uz: ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'],
  ru: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
};

const HAFTA_QISQA: Record<Lang, string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

function parts(sana: string): { day: number; month: number } {
  const [, m, d] = sana.split('-').map(Number);
  return { day: d!, month: m! };
}

/** Day of the month, «20». */
export function kunRaqami(sana: string): number {
  return parts(sana).day;
}

/** «20-noyabr» / «20 ноября». */
export function sanaQisqa(lang: Lang, sana: string): string {
  const { day, month } = parts(sana);
  return lang === 'uz' ? `${day}-${OY.uz[month - 1]}` : `${day} ${OY.ru[month - 1]}`;
}

/** «20-noyabr, juma» / «20 ноября, пятница». */
export function sanaToliq(lang: Lang, sana: string, haftaKuni: number): string {
  return `${sanaQisqa(lang, sana)}, ${HAFTA[lang][haftaKuni - 1]}`;
}

/** «juma» / «пятница». */
export function haftaNomi(lang: Lang, haftaKuni: number): string {
  return HAFTA[lang][haftaKuni - 1]!;
}

/** «Ju» / «Пт». */
export function haftaQisqa(lang: Lang, haftaKuni: number): string {
  return HAFTA_QISQA[lang][haftaKuni - 1]!;
}

/** Yandex map: the pin when coordinates are known, else a search for the address. */
export function xaritaUrl(manzil: string, xarita: { lat: number; lng: number } | null): string {
  return xarita
    ? `https://yandex.uz/maps/?pt=${xarita.lng},${xarita.lat}&z=16&l=map`
    : `https://yandex.uz/maps/?text=${encodeURIComponent(manzil)}`;
}
