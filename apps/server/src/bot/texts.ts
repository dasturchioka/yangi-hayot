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
    menuOpen: 'Планировки, цены и запись на просмотр — в меню 👇',
    arizaOpen: 'Заполните короткую заявку — менеджер перезвонит 👇',
    btnDojimPlanirovka: '🏠 Открыть планировку',
    btnDojimXonadon: '🏠 Открыть квартиру',
    btnDojimYangiVaqt: '📅 Выбрать новое время',
    btnDojimHisoblash: '🧮 Рассчитать платёж',
    btnDojimStop: '🔕 Не присылать',
    dojimStopped: 'Хорошо, больше не будем присылать такие напоминания. Меню всегда под рукой 👇',
    welcomeAskRu: 'Пришлите новый текст приветствия на РУССКОМ. Можно фото или видео с подписью.\n/restart — отменить.',
    welcomeAskUz: 'Теперь текст приветствия на УЗБЕКСКОМ. Можно фото или видео с подписью.\n/restart — отменить.',
    welcomeNeedText: 'Нужен текст (или фото/видео с подписью). /restart — отменить.',
    welcomeSaved: 'Приветствие сохранено ✅ Так его увидит новый клиент:',
    bcAskContent: 'Пришлите сообщение для рассылки: текст или фото/видео с подписью.\n/restart — отменить.',
    bcNeedText: 'Нужен текст (или фото/видео с подписью). /restart — отменить.',
    bcTooLong: 'Слишком длинно: Telegram разрешает до {max} символов. Пришлите короче.',
    bcAskButton:
      'Добавить кнопку? Пришлите «Текст | https://ссылка» или «Текст | app» — откроет Mini App ' +
      '(экран: app:booking, app:ariza). Или нажмите «Без кнопки».',
    bcBadButton: 'Не понял кнопку. Формат: «Текст | https://ссылка» или «Текст | app:booking».',
    btnNoButton: 'Без кнопки',
    bcAskAudience: 'Кому отправить? В скобках — число получателей.',
    audAll: 'Все',
    audRu: 'RU',
    audUz: 'UZ',
    audToshkent: 'Интерес к Ташкенту',
    audNavoiy: 'Интерес к Навои',
    bcEmptyAudience: 'В этой аудитории никого нет — выберите другую.',
    bcPreview: '👆 Так сообщение увидят получатели.',
    bcConfirm: 'Отправить {n} получателям?',
    btnSend: '✅ Отправить',
    btnCancel: '❌ Отмена',
    bcQueued: 'Рассылка #{id} запущена. Пришлю отчёт, когда закончится.',
    bcCancelled: 'Рассылка отменена.',
    bcNotDraft: 'Эта рассылка уже запущена или отменена.',
    bcReport: 'Рассылка #{id} завершена.\nДоставлено: {delivered}\nЗаблокировали бота: {blocked}\nОшибки: {error}',
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
    menuOpen: "Planirovkalar, narxlar va ko'rishga yozilish — menyuda 👇",
    arizaOpen: "Qisqa arizani to'ldiring — menejer qo'ng'iroq qiladi 👇",
    btnDojimPlanirovka: '🏠 Planirovkani ochish',
    btnDojimXonadon: '🏠 Xonadonni ochish',
    btnDojimYangiVaqt: '📅 Yangi vaqt tanlash',
    btnDojimHisoblash: "🧮 To'lovni hisoblash",
    btnDojimStop: '🔕 Yubormang',
    dojimStopped: "Yaxshi, bunday eslatmalarni boshqa yubormaymiz. Menyu doim shu yerda 👇",
    welcomeAskRu: "Yangi salomlashish matnini RUS tilida yuboring. Izohli foto yoki video ham bo'ladi.\n/restart — bekor qilish.",
    welcomeAskUz: "Endi salomlashish matnini O'ZBEK tilida yuboring. Izohli foto yoki video ham bo'ladi.\n/restart — bekor qilish.",
    welcomeNeedText: "Matn kerak (yoki izohli foto/video). /restart — bekor qilish.",
    welcomeSaved: "Salomlashish saqlandi ✅ Yangi Mijoz uni shunday ko'radi:",
    bcAskContent: "Rassilka xabarini yuboring: matn yoki izohli foto/video.\n/restart — bekor qilish.",
    bcNeedText: "Matn kerak (yoki izohli foto/video). /restart — bekor qilish.",
    bcTooLong: "Juda uzun: Telegram {max} belgigacha ruxsat beradi. Qisqaroq yuboring.",
    bcAskButton:
      "Tugma qo'shilsinmi? «Matn | https://havola» yoki «Matn | app» (Mini App'ni ochadi; ekran: app:booking, " +
      "app:ariza) ko'rinishida yuboring. Yoki «Tugmasiz»ni bosing.",
    bcBadButton: "Tugmani tushunmadim. Format: «Matn | https://havola» yoki «Matn | app:booking».",
    btnNoButton: 'Tugmasiz',
    bcAskAudience: 'Kimga yuborilsin? Qavsda — qabul qiluvchilar soni.',
    audAll: 'Hammasi',
    audRu: 'RU',
    audUz: 'UZ',
    audToshkent: 'Toshkentga qiziqish',
    audNavoiy: 'Navoiyga qiziqish',
    bcEmptyAudience: "Bu auditoriyada hech kim yo'q — boshqasini tanlang.",
    bcPreview: "👆 Qabul qiluvchilar xabarni shunday ko'radi.",
    bcConfirm: '{n} ta qabul qiluvchiga yuborilsinmi?',
    btnSend: '✅ Yuborish',
    btnCancel: '❌ Bekor qilish',
    bcQueued: 'Rassilka #{id} boshlandi. Tugagach, hisobot yuboraman.',
    bcCancelled: 'Rassilka bekor qilindi.',
    bcNotDraft: 'Bu rassilka allaqachon boshlangan yoki bekor qilingan.',
    bcReport: 'Rassilka #{id} yakunlandi.\nYetkazildi: {delivered}\nBotni bloklagan: {blocked}\nXato: {error}',
  },
} satisfies Record<Lang, Record<string, string>>;

/** Fills `{name}` placeholders. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export type Texts = (typeof TEXTS)['ru'];

export function texts(lang: Lang): Texts {
  return TEXTS[lang];
}
