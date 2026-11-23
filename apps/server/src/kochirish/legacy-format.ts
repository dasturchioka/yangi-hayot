/**
 * ASSUMED formats of the old bot's data (leads.jsonl + users file) and of
 * the old Mini App's HTML catalog.
 *
 * The real files were not available when the importer was written (#3), so
 * everything below is inferred from TZ v3.0 (K2, K3, K7, 0.3, 0.4). Every
 * guess lives in this file: when the real files arrive, adjust the alias
 * lists and value maps here, re-run the importer with `--dry-run`, and check
 * the reconciliation report. The importers themselves should not need edits.
 *
 * Field lookup: the first alias present (not null/undefined/'') wins. Dotted
 * aliases read nested objects (`from.id`).
 */

/** Old bot: one user record (users file) or the user part of a lead line. */
export const MIJOZ_FIELDS = {
  telegramId: ['user_id', 'telegram_id', 'tg_id', 'chat_id', 'from.id', 'user.id'],
  firstName: ['first_name', 'user.first_name', 'from.first_name'],
  lastName: ['last_name', 'user.last_name', 'from.last_name'],
  /** Full name, used when there is no first_name. */
  fullName: ['full_name', 'user_name', 'name'],
  username: ['username', 'user.username', 'from.username'],
  lang: ['lang', 'language', 'language_code', 'locale'],
  phone: ['phone', 'phone_number', 'contact.phone_number', 'tel'],
  firstManba: ['first_source', 'first_src', 'source_first'],
  lastManba: ['last_source', 'last_src', 'source_last'],
  /** Manba of a single lead or event (also used as first/last when those are missing). */
  manba: ['source', 'src', 'utm_source', 'start_param'],
  shaharQiziqish: ['city', 'cities', 'city_interest', 'interest'],
  botBloklagan: ['blocked', 'is_blocked', 'bot_blocked', 'banned'],
  amocrmKontaktId: ['amo_contact_id', 'amocrm_contact_id', 'contact_id'],
  createdAt: ['created_at', 'ts', 'timestamp', 'date', 'time'],
} as const;

/** Old bot: one lead line in leads.jsonl. */
export const ARIZA_FIELDS = {
  /** Stable id of the lead; without one, the line's content hash is used. */
  id: ['id', 'lead_key', 'uuid'],
  tur: ['type', 'kind', 'lead_type', 'form'],
  loyiha: ['project', 'project_name', 'loyiha', 'complex'],
  ism: ['name', 'full_name', 'first_name'],
  telefon: ['phone', 'phone_number', 'tel'],
  manba: ['source', 'src', 'utm_source', 'start_param'],
  amocrmBitimId: ['amo_lead_id', 'amocrm_lead_id', 'lead_id', 'deal_id'],
  amocrmKontaktId: ['amo_contact_id', 'amocrm_contact_id', 'contact_id'],
  createdAt: ['created_at', 'ts', 'timestamp', 'date', 'time'],
} as const;

/**
 * Old lead types → Ariza turi (amoCRM tag names from TZ 8). Unknown types
 * are kept as `legacy_<type>` so nothing is lost and they stand out.
 */
export const ARIZA_TURI: Record<string, string> = {
  form: 'bot_form',
  lead: 'bot_form',
  application: 'bot_form',
  quiz: 'bot_quiz',
  booking: 'bot_booking',
  visit: 'bot_booking',
  calc: 'bot_calc',
  calculator: 'bot_calc',
  ai: 'bot_ai',
  manager: 'bot_manager',
  callback: 'bot_manager',
};
/** Lead line without a type. */
export const DEFAULT_ARIZA_TURI = 'bot_form';

/** Old city values → Shahar. */
export const SHAHAR: Record<string, 'toshkent' | 'navoiy'> = {
  tashkent: 'toshkent',
  toshkent: 'toshkent',
  ташкент: 'toshkent',
  tsh: 'toshkent',
  navoi: 'navoiy',
  navoiy: 'navoiy',
  навои: 'navoiy',
};

/** Numbers below this are read as Unix seconds, at or above as milliseconds. */
export const UNIX_MS_THRESHOLD = 1e12;

/* ------------------------------------------------------------------ */
/* Old Mini App catalog (one HTML file, data hard-coded in a <script>). */

/** Name of the JS variable holding the array of projects. */
export const KATALOG_VARIABLE = 'PROJECTS';

export const LOYIHA_FIELDS = {
  slug: ['slug', 'id', 'key'],
  nomi: ['name', 'title', 'nomi'],
  shahar: ['city', 'shahar'],
  holat: ['status', 'state'],
  manzil: ['address', 'manzil'],
  xonadonlar: ['apartments', 'flats', 'units', 'xonadonlar'],
} as const;

export const XONADON_FIELDS = {
  blok: ['block', 'blok', 'korpus', 'building'],
  xonalar: ['rooms', 'xonalar', 'roomCount'],
  maydon: ['area', 'm2', 'square', 'maydon'],
  nomi: ['name', 'title', 'label'],
  chizma: ['plan', 'layout', 'image', 'img'],
  video: ['video', 'video_url', 'videoUrl'],
  /** Price of the whole Xonadon, UZS. */
  narx: ['price', 'narx', 'cost'],
  /** «m² uchun … dan» (TZ 0.4): multiplied by the area. */
  narxM2: ['pricePerM2', 'price_m2', 'price_per_m2', 'm2Price'],
  holat: ['status', 'state'],
} as const;

/** Old project status → Loyiha holati. Unknown → 'sotuvda' and a warning. */
export const LOYIHA_HOLATI: Record<string, 'sotuvda' | 'topshirilgan'> = {
  sale: 'sotuvda',
  selling: 'sotuvda',
  sotuvda: 'sotuvda',
  active: 'sotuvda',
  done: 'topshirilgan',
  completed: 'topshirilgan',
  finished: 'topshirilgan',
  topshirilgan: 'topshirilgan',
};

/** Old apartment status → Xonadon holati. Missing → 'bosh'; unknown → rejected. */
export const XONADON_HOLATI: Record<string, 'bosh' | 'bron' | 'sotilgan'> = {
  free: 'bosh',
  available: 'bosh',
  bosh: 'bosh',
  "bo'sh": 'bosh',
  reserved: 'bron',
  booked: 'bron',
  bron: 'bron',
  sold: 'sotilgan',
  sotilgan: 'sotilgan',
};

/** Blok name for an apartment that names none. */
export const DEFAULT_BLOK = 'A';

/** Reads the first present alias. */
export function pick(obj: unknown, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    let v: unknown = obj;
    for (const part of alias.split('.')) {
      v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
    }
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
