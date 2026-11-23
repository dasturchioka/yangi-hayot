import type { Lang } from '@yh/shared';

/** Bot texts and button labels, RU and UZ. The welcome text itself is a setting (/welcome). */
export const TEXTS = {
  ru: {
    chooseLang: 'Выберите язык / Tilni tanlang',
    langSaved: 'Язык: русский ✅',
    restarted: 'Начнём сначала 👇',
    defaultWelcome:
      'Здравствуйте! Это Yangi Hayot — строим жилые комплексы в Ташкенте и Навои.\n' +
      'Смотрите планировки и цены в меню или просто напишите вопрос — менеджер ответит.',
    fallback: 'Спасибо! Передали ваше сообщение менеджеру. А пока можно открыть меню или оставить заявку 👇',
    btnMenu: '📱 Открыть меню',
    btnBooking: '📅 Записаться на просмотр',
    btnAriza: '📝 Оставить заявку',
    btnRestart: '🔄 Перезапустить',
    welcomeAskRu: 'Пришлите новый текст приветствия на РУССКОМ. Можно фото или видео с подписью.\n/restart — отменить.',
    welcomeAskUz: 'Теперь текст приветствия на УЗБЕКСКОМ. Можно фото или видео с подписью.\n/restart — отменить.',
    welcomeNeedText: 'Нужен текст (или фото/видео с подписью). /restart — отменить.',
    welcomeSaved: 'Приветствие сохранено ✅ Так его увидит новый клиент:',
  },
  uz: {
    chooseLang: 'Tilni tanlang / Выберите язык',
    langSaved: "Til: o'zbekcha ✅",
    restarted: 'Boshidan boshlaymiz 👇',
    defaultWelcome:
      'Assalomu alaykum! Bu Yangi Hayot — Toshkent va Navoiyda turar-joy majmualarini quramiz.\n' +
      "Planirovka va narxlarni menyuda ko'ring yoki savolingizni yozing — menejer javob beradi.",
    fallback: "Rahmat! Xabaringizni menejerga yubordik. Hozircha menyuni ochishingiz yoki ariza qoldirishingiz mumkin 👇",
    btnMenu: '📱 Menyuni ochish',
    btnBooking: "📅 Ko'rishga yozilish",
    btnAriza: '📝 Ariza qoldirish',
    btnRestart: '🔄 Qayta ishga tushirish',
    welcomeAskRu: "Yangi salomlashish matnini RUS tilida yuboring. Izohli foto yoki video ham bo'ladi.\n/restart — bekor qilish.",
    welcomeAskUz: "Endi salomlashish matnini O'ZBEK tilida yuboring. Izohli foto yoki video ham bo'ladi.\n/restart — bekor qilish.",
    welcomeNeedText: "Matn kerak (yoki izohli foto/video). /restart — bekor qilish.",
    welcomeSaved: "Salomlashish saqlandi ✅ Yangi Mijoz uni shunday ko'radi:",
  },
} satisfies Record<Lang, Record<string, string>>;

export type Texts = (typeof TEXTS)['ru'];

export function texts(lang: Lang): Texts {
  return TEXTS[lang];
}
