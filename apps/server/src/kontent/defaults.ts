import type { BizHaqimizdaKontent, KontaktlarKontent, SotibOlishKontent } from '@yh/shared';

/**
 * Draft texts (TZ 5-b.: «Ijrochi shablon va tuzilma qoralamasini beradi»).
 * Shown until an Administrator saves the section in the admin-panel; Yangi
 * Hayot supplies and approves the real RU/UZ texts. Numbers in brackets are
 * placeholders the client must fill (M12).
 */
export const DEFAULT_SOTIB_OLISH: SotibOlishKontent = {
  sarlavha: { uz: 'Tanlovdan kalitgacha — 6 qadam', ru: 'От выбора до ключей — 6 шагов' },
  bosqichlar: [
    {
      nomi: { uz: 'Tanlash va bron', ru: 'Выбор и бронь' },
      matn: {
        uz: "Mini App'da yoki menejer yordamida xonadon tanlang, ko'rishga keling va uni band qiling.",
        ru: 'Выберите квартиру в Mini App или с менеджером, приезжайте на просмотр и забронируйте её.',
      },
    },
    {
      nomi: { uz: 'Shartnoma', ru: 'Договор' },
      matn: {
        uz: "Sotuv ofisida oldi-sotdi shartnomasini imzolaysiz. Hujjatlar ro'yxati quyida.",
        ru: 'В офисе продаж подписываете договор купли-продажи. Список документов — ниже.',
      },
    },
    {
      nomi: { uz: "To'lov", ru: 'Оплата' },
      matn: {
        uz: "To'liq to'lov, muddatli to'lov yoki bank ipotekasi — o'zingizga qulayini tanlang.",
        ru: 'Полная оплата, рассрочка или ипотека банка — выберите удобный вариант.',
      },
    },
    {
      nomi: { uz: 'Notarius', ru: 'Нотариус' },
      matn: {
        uz: 'Shartnoma notarial tasdiqlanadi. Notariusga birga boramiz.',
        ru: 'Договор заверяется нотариально. К нотариусу идём вместе.',
      },
    },
    {
      nomi: { uz: 'Kalitlar', ru: 'Ключи' },
      matn: {
        uz: "Uy topshirilganda dalolatnomani imzolab, kalitlarni olasiz.",
        ru: 'После сдачи дома подписываете акт приёма-передачи и получаете ключи.',
      },
    },
    {
      nomi: { uz: 'Kadastr', ru: 'Кадастр' },
      matn: {
        uz: "Mulk huquqini kadastrda ro'yxatdan o'tkazishda yordam beramiz.",
        ru: 'Помогаем зарегистрировать право собственности в кадастре.',
      },
    },
  ],
  hujjatlar: [
    { uz: 'Pasport yoki ID-karta', ru: 'Паспорт или ID-карта' },
    { uz: 'JShShIR (PINFL)', ru: 'ПИНФЛ' },
    { uz: "Turmush o'rtog'ining roziligi (oilali bo'lsa)", ru: 'Согласие супруга(-и) (если в браке)' },
  ],
  ipotekaHujjatlari: [
    { uz: 'Pasport yoki ID-karta', ru: 'Паспорт или ID-карта' },
    { uz: "Ish joyidan ma'lumotnoma", ru: 'Справка с места работы' },
    { uz: "So'nggi 12 oylik daromad haqida ma'lumotnoma", ru: 'Справка о доходах за последние 12 месяцев' },
    { uz: "Nikoh guvohnomasi (oilali bo'lsa)", ru: 'Свидетельство о браке (если в браке)' },
  ],
  faq: [
    {
      savol: { uz: "Muddatli to'lov bormi?", ru: 'Есть ли рассрочка?' },
      javob: {
        uz: "Shartlarni menejer aytib beradi. «To'lovni hisoblash» tugmasi bilan oylik to'lovni hisoblang.",
        ru: 'Условия расскажет менеджер. Ежемесячный платёж можно посчитать кнопкой «Рассчитать платёж».',
      },
    },
    {
      savol: { uz: 'Narx qaysi valyutada?', ru: 'В какой валюте цены?' },
      javob: { uz: "Barcha narxlar so'mda.", ru: 'Все цены — в сумах.' },
    },
    {
      savol: { uz: "Uyni qachon ko'rish mumkin?", ru: 'Когда можно посмотреть квартиру?' },
      javob: {
        uz: "«Ko'rishga yozilish» tugmasi orqali qulay kun va vaqtni tanlang — menejer kutib oladi.",
        ru: 'Выберите удобный день и время кнопкой «Записаться на просмотр» — менеджер встретит вас.',
      },
    },
  ],
};

export const DEFAULT_BIZ_HAQIMIZDA: BizHaqimizdaKontent = {
  sarlavha: { uz: 'Toshkent va Navoiyda tayyor uylar quramiz', ru: 'Строим готовые дома в Ташкенте и Навои' },
  matn: {
    uz: "Yangi Hayot — Toshkent va Navoiyda turar-joy majmualarini quruvchi kompaniya. Uylarni ta'mir va kadastr bilan topshiramiz.",
    ru: 'Yangi Hayot — компания, строящая жилые комплексы в Ташкенте и Навои. Сдаём дома с ремонтом и кадастром.',
  },
  foto: '/media/loyiha/jozibali-maskan/1.webp',
  raqamlar: [
    { qiymat: '[XX]', nomi: { uz: 'yil tajriba', ru: 'лет опыта' } },
    { qiymat: '[XX]', nomi: { uz: 'loyiha', ru: 'проектов' } },
    { qiymat: '[XXXX]', nomi: { uz: "oila ko'chib kirdi", ru: 'семей заселились' } },
  ],
};

export const DEFAULT_KONTAKTLAR: KontaktlarKontent = {
  telefon: '1349',
  manzil: { uz: '[Sotuv ofisi manzili]', ru: '[Адрес офиса продаж]' },
  ishVaqti: { uz: 'Har kuni 9:00–19:00', ru: 'Ежедневно 9:00–19:00' },
  telegram: null,
  xarita: null,
};
