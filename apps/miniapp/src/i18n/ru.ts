/** Russian dictionary. Source of truth for keys: every other language must have the same keys. */
export const ru = {
  'app.title': 'Yangi Hayot',
  'greeting.hello': 'Здравствуйте, {name}!',
  'greeting.lang': 'Язык: русский',
  'state.loading': 'Загрузка…',
  'state.error': 'Не удалось загрузить данные. Попробуйте ещё раз.',
  'state.retry': 'Повторить',
  'state.openInTelegram': 'Откройте приложение через Telegram-бот Yangi Hayot.',
  'state.notFound': 'Не найдено. Возможно, предложение уже снято с продажи.',

  'shahar.toshkent': 'Ташкент',
  'shahar.navoiy': 'Навои',
  'katalog.title': 'Проекты',
  'katalog.empty': 'В этом городе сейчас нет проектов в продаже.',

  'narx.from': 'от {narx} сум',
  'narx.mln': '{n} млн',
  'narx.onRequest': 'Цена по запросу',
  'bosh.count': 'свободно: {n}',
  'bosh.short': 'своб.',

  'loyiha.bloklar': '{n} блок.',
  'loyiha.qavat': '{n} эт.',
  'loyiha.fotolar': '{n} фото',
  'loyiha.xarita': 'На карте',
  'loyiha.stat.blok': 'блоков',
  'loyiha.stat.qavat': 'этажей',
  'loyiha.stat.xonadon': 'квартир',
  'loyiha.stat.bosh': 'свободно',
  'loyiha.tab.infratuzilma': 'Инфраструктура',
  'loyiha.tab.haqida': 'О проекте',
  'loyiha.xonadonlar': 'Квартиры · {n}',
  'loyiha.noPlanirovkalar': 'Планировки скоро появятся. Оставьте заявку — менеджер расскажет о ценах.',

  'infra.all': 'Все',
  'infra.talim': 'Образование',
  'infra.bogcha': 'Детсады',
  'infra.transport': 'Транспорт',
  'infra.dokon': 'Магазины',
  'infra.dam_olish': 'Отдых',
  'infra.masjid': 'Мечети',
  'infra.tibbiyot': 'Медицина',

  'blok.nomi': 'Блок {nomi}',
  'planirovka.xonalar': '{n}-комн.',
  'planirovka.title': '{n}-комнатная · {maydon} м²',
  'planirovka.short': '{n}-комн. · {maydon} м²',
  'planirovka.guruh': '{n}-комнатные',
  'planirovka.chizmaHint': 'Нажмите, чтобы увеличить',
  'planirovka.close': 'Закрыть',

  'holat.sotuvda': 'Свободно',
  'holat.band': 'Пока забронировано',
  'holat.sotilgan': 'Продано',
  'holat.bandHint': 'Сейчас все квартиры этой планировки забронированы. Оставьте заявку — сообщим, если бронь снимут.',

  'video.watch': 'Смотреть видео',
  'ariza.leave': 'Оставить заявку',
  'ariza.soon': 'Форма заявки скоро появится. Пока позвоните нам: 1349.',
} as const;

export type MessageKey = keyof typeof ru;
export type Dictionary = Record<MessageKey, string>;
