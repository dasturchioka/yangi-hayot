/** Russian dictionary. Source of truth for keys: every other language must have the same keys. */
export const ru = {
  'app.title': 'Yangi Hayot',
  'greeting.hello': 'Здравствуйте, {name}!',
  'greeting.lang': 'Язык: русский',
  'state.loading': 'Загрузка…',
  'state.error': 'Не удалось загрузить данные. Попробуйте ещё раз.',
  'state.retry': 'Повторить',
  'state.openInTelegram': 'Откройте приложение через Telegram-бот Yangi Hayot.',
} as const;

export type MessageKey = keyof typeof ru;
export type Dictionary = Record<MessageKey, string>;
