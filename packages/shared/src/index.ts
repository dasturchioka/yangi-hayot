/**
 * Types shared by the server and the frontends (Mini App, admin-panel).
 * Types, constants and tiny pure helpers only: no runtime dependencies.
 */

export * from './bot';
export * from './start';
export * from './kontent';
import type { StartDto } from './start';

export const LANGS = ['ru', 'uz'] as const;
export type Lang = (typeof LANGS)[number];

/** Mijoz as the Mini App sees it (GET /api/me). */
export interface MijozDto {
  /** Telegram user id as a string (may exceed 2^53). */
  telegramId: string;
  name: string;
  lang: Lang;
}

/** Where the Mijoz came from: `src_<nomi>` tag name or «Telegram (to'g'ridan-to'g'ri)». */
export interface ManbaDto {
  /** First visit; never changes. */
  first: string;
  /** Latest tagged visit. */
  last: string;
}

export interface MeResponse {
  mijoz: MijozDto;
  manba: ManbaDto;
  /** Screen named by this launch's signed start parameter (e.g. a shared Planirovka), or null. */
  start: StartDto | null;
}

export interface ApiError {
  error: string;
}

// ---- Katalog (ADR 0001: Loyiha → Blok → Planirovka, no Xonadon records) ----

export const SHAHARLAR = ['toshkent', 'navoiy'] as const;
export type Shahar = (typeof SHAHARLAR)[number];

/** Derived from the counts, never stored: bo'sh > 0 → sotuvda; else bron > 0 → band; else sotilgan. */
export type PlanirovkaHolati = 'sotuvda' | 'band' | 'sotilgan';

/** Where a video opens: a Telegram channel post or YouTube. Other links are not shown. */
export interface VideoDto {
  kind: 'telegram' | 'youtube';
  url: string;
}

export interface InfratuzilmaDto {
  /** e.g. talim, bogcha, transport, dokon, dam_olish, masjid, tibbiyot */
  kategoriya: string;
  nomi: string;
  /** Free text, e.g. "0,8 km · 10 daq". */
  masofa: string | null;
}

/** Loyiha in the list (Sotuvda only). */
export interface LoyihaCardDto {
  id: number;
  slug: string;
  nomi: string;
  shahar: Shahar;
  manzil: string;
  qisqaTavsif: string | null;
  /** First photo, or null. */
  foto: string | null;
  fotolarSoni: number;
  video: VideoDto | null;
  bloklarSoni: number;
  qavatlarSoni: number | null;
  /** Sum of bo'sh over all its Planirovkalar. */
  boshXonadonlar: number;
  /** Cheapest Boshlang'ich narx among Planirovkalar on sale (UZS); null → «Narx so'rov bo'yicha». */
  boshlangichNarx: number | null;
}

export interface PlanirovkaDto {
  id: number;
  loyihaId: number;
  loyihaNomi: string;
  blokId: number;
  blokNomi: string;
  xonalar: number;
  /** m² */
  maydon: number;
  nomi: string | null;
  chizma: string | null;
  video: VideoDto | null;
  /** UZS; null → «Narx so'rov bo'yicha». */
  boshlangichNarx: number | null;
  bosh: number;
  holat: PlanirovkaHolati;
}

export interface XonalarGuruhiDto {
  xonalar: number;
  planirovkalar: PlanirovkaDto[];
}

export interface BlokDto {
  id: number;
  nomi: string;
  boshXonadonlar: number;
  /** Planirovkalar grouped by xonalar soni, ascending. */
  guruhlar: XonalarGuruhiDto[];
}

export interface LoyihaDto extends LoyihaCardDto {
  tavsif: string | null;
  fotolar: string[];
  /** bo'sh + bron + sotilgan over all Planirovkalar. */
  jamiXonadonlar: number;
  xarita: { lat: number; lng: number } | null;
  infratuzilma: InfratuzilmaDto[];
  bloklar: BlokDto[];
}

export interface LoyihalarResponse {
  loyihalar: LoyihaCardDto[];
}

export interface LoyihaResponse {
  loyiha: LoyihaDto;
}

export interface PlanirovkaResponse {
  planirovka: PlanirovkaDto;
}

// ---- Ariza (TZ 8-bo'lim) ----

/** form = «Ariza qoldirish», quiz = «Xonadon tanlash», visit = ko'rishga yozilish, calc = kalkulyator, ai = AI-menejer, human = «Menejer kerak». */
export const ARIZA_TURLARI = ['form', 'quiz', 'visit', 'calc', 'ai', 'human'] as const;
export type ArizaTuri = (typeof ARIZA_TURLARI)[number];

/** POST /api/arizalar — the «Ariza qoldirish» form. */
export interface ArizaFormRequest {
  name: string;
  /** Any common Uzbek format; stored as +998XXXXXXXXX. */
  phone: string;
  loyihaId?: number;
  planirovkaId?: number;
}

export interface ArizaCreatedResponse {
  id: number;
}

export interface ArizaDto {
  id: number;
  tur: ArizaTuri;
  /** ISO instant. */
  createdAt: string;
  loyihaId: number | null;
  planirovkaId: number | null;
  /** As it was when the Ariza was made; null without a Loyiha. */
  loyihaNomi: string | null;
}

/** GET /api/arizalar — the Mijoz's own Arizalar (newest first) and the contact to prefill forms with. */
export interface ArizalarResponse {
  kontakt: { name: string; phone: string | null };
  arizalar: ArizaDto[];
}

// ---- Admin-panel (#5) ----

/** Administrator: everything. Menejer: Xonadon holatlari (counts) and yozilishlar only. */
export const ADMIN_ROLLAR = ['administrator', 'menejer'] as const;
export type AdminRol = (typeof ADMIN_ROLLAR)[number];

export interface AdminDto {
  id: number;
  login: string;
  nomi: string;
  rol: AdminRol;
  faol: boolean;
}

export interface AdminMeResponse {
  admin: AdminDto;
}

/** Text in both languages, as the admin edits it. */
export interface LokalDto {
  ru: string;
  uz: string;
}

export const LOYIHA_HOLATLARI = ['sotuvda', 'topshirilgan'] as const;
export type LoyihaHolati = (typeof LOYIHA_HOLATLARI)[number];

/** Where a Xonadon is: the three counts of a Planirovka. */
export const XONADON_HOLATLARI = ['bosh', 'bron', 'sotilgan'] as const;
export type XonadonHolati = (typeof XONADON_HOLATLARI)[number];

export interface AdminInfratuzilmaDto {
  kategoriya: string;
  nomi: LokalDto;
  masofa: LokalDto | null;
}

/** Loyiha fields the Administrator edits (POST creates, PATCH takes any subset). */
export interface AdminLoyihaInput {
  slug: string;
  nomi: string;
  shahar: Shahar;
  holat: LoyihaHolati;
  manzil: LokalDto;
  qisqaTavsif: LokalDto | null;
  tavsif: LokalDto | null;
  fotolar: string[];
  video: string | null;
  qavatlarSoni: number | null;
  xarita: { lat: number; lng: number } | null;
  infratuzilma: AdminInfratuzilmaDto[];
  tartib: number;
  /** Where showings happen (yozilish confirmation, CRM note); null = the Loyiha's address. */
  korsatuvManzili: LokalDto | null;
  /** amoCRM user id of the Loyiha mas'ul: new Bitimlar and tasks go to them; null = CRM default. */
  crmMasulId: string | null;
}

export interface AdminPlanirovkaInput {
  xonalar: number;
  maydon: number;
  nomi: LokalDto | null;
  chizma: string | null;
  video: string | null;
  /** UZS; null → «Narx so'rov bo'yicha». */
  boshlangichNarx: number | null;
  tartib: number;
}

export interface XonadonSonlari {
  bosh: number;
  bron: number;
  sotilgan: number;
  /** bosh + bron + sotilgan; changed only by the Administrator. */
  jami: number;
}

export interface AdminPlanirovkaDto extends AdminPlanirovkaInput, XonadonSonlari {
  id: number;
  blokId: number;
  holat: PlanirovkaHolati;
  /** Latest jurnal row of this Planirovka («Oxirgi o'zgarish»): who and when; null if none. */
  oxirgiOzgarish: { nomi: string; at: string } | null;
}

export interface AdminBlokDto {
  id: number;
  loyihaId: number;
  nomi: string;
  tartib: number;
  planirovkalar: AdminPlanirovkaDto[];
}

export interface AdminLoyihaListItem extends XonadonSonlari {
  id: number;
  slug: string;
  nomi: string;
  shahar: Shahar;
  holat: LoyihaHolati;
  bloklarSoni: number;
  planirovkalarSoni: number;
}

export interface AdminLoyihaDto extends AdminLoyihaInput {
  id: number;
  bloklar: AdminBlokDto[];
}

export type JurnalObyekt = 'loyiha' | 'blok' | 'planirovka';

/** One jurnal row: kim, qachon, nima edi (oldin; null = created), nima bo'ldi (keyin). */
export interface JurnalDto {
  id: number;
  /** ISO instant. */
  at: string;
  admin: { id: number | null; nomi: string };
  obyekt: JurnalObyekt;
  obyektId: number;
  /** yaratildi | tahrirlandi | kochirildi */
  amal: 'yaratildi' | 'tahrirlandi' | 'kochirildi';
  /** Label of the object at that time, e.g. "Jozibali Maskan · A blok · 2 xona, 54 m²". */
  tavsif: string;
  /** Changed fields before (null = created). */
  oldin: Record<string, unknown> | null;
  /** Changed fields after. */
  keyin: Record<string, unknown>;
}

// ---- Sevimlilar, taqqoslash, «Ulashish» (#16) ----

/** GET /api/sevimlilar: newest first; only Planirovkalar still in the katalog. */
export interface SevimlilarResponse {
  planirovkalar: PlanirovkaDto[];
}

/** At most this many Planirovkalar side by side in taqqoslash. */
export const TAQQOSLASH_MAX = 3;

/** One column of taqqoslash (no qavat: ADR 0001). */
export interface TaqqoslashDto {
  id: number;
  loyihaNomi: string;
  blokNomi: string;
  nomi: string | null;
  xonalar: number;
  maydon: number;
  /** UZS; null → «Narx so'rov bo'yicha». */
  boshlangichNarx: number | null;
  /** Boshlang'ich narx / maydon, whole so'm; null without a price. */
  kvMetrNarxi: number | null;
  /** Monthly muddatli to'lov, UZS. null until the kalkulyator settings (#12) exist. */
  oylikTolov: number | null;
  holat: PlanirovkaHolati;
}

/** GET /api/taqqoslash?ids=1,2,3: in the order asked; ids no longer in the katalog are left out. */
export interface TaqqoslashResponse {
  planirovkalar: TaqqoslashDto[];
}

/** POST /api/ulashish {planirovkaId}: a Mini App link to send into a Telegram chat. */
export interface UlashishRequest {
  planirovkaId: number;
}
export interface UlashishResponse {
  /** `<MINIAPP_LINK>?startapp=pl<id>_u<n>`; opens that Planirovka in the Mini App. */
  url: string;
}

// ---- Ko'rishga yozilish (#11, TZ 2-b.) ----

/** One day of the booking calendar (Tashkent). Closed days (holiday, day off, no time left today) have no vaqtlar. */
export interface YozilishKunDto {
  /** `YYYY-MM-DD`. */
  sana: string;
  /** 1 = Monday … 7 = Sunday. */
  haftaKuni: number;
  /** Free slot starts, `HH:mm`. Unlimited bookings per slot (TZ 2-b.). */
  vaqtlar: string[];
}

/** GET /api/yozilish/slotlar — the nearest days (14 by default). */
export interface YozilishSlotlarResponse {
  kunlar: YozilishKunDto[];
}

/** POST /api/yozilishlar. */
export interface YozilishRequest {
  loyihaId: number;
  planirovkaId?: number;
  sana: string;
  vaqt: string;
  name: string;
  /** Any common Uzbek format; stored as +998XXXXXXXXX. */
  phone: string;
}

/** POST /api/yozilishlar/:id/kochirish. */
export interface YozilishKochirishRequest {
  sana: string;
  vaqt: string;
}

/** faol = booked (maybe moved); bekor = cancelled by the Mijoz. */
export type YozilishHolati = 'faol' | 'bekor';
/** Set in the admin-panel after the visit time. */
export const DAVOMATLAR = ['keldi', 'kelmadi'] as const;
export type Davomat = (typeof DAVOMATLAR)[number];

export interface YozilishDto {
  id: number;
  loyihaId: number;
  loyihaNomi: string;
  planirovka: { id: number; xonalar: number; maydon: number; blokNomi: string } | null;
  /** Visit, Tashkent: `YYYY-MM-DD` and `HH:mm`; `at` = the same as an ISO instant. */
  sana: string;
  vaqt: string;
  haftaKuni: number;
  at: string;
  holat: YozilishHolati;
  davomat: Davomat | null;
  /** Ko'rsatuv manzili (in the asked language): the Loyiha's showing address, else its address. */
  manzil: string;
  xarita: { lat: number; lng: number } | null;
  /** Can still be moved / cancelled: faol, no davomat and the time has not passed. */
  ozgartirsaBoladi: boolean;
}

export interface YozilishResponse {
  yozilish: YozilishDto;
}

/** GET /api/yozilishlar — own bookings: upcoming first (soonest first), then past ones (newest first). */
export interface YozilishlarResponse {
  yozilishlar: YozilishDto[];
}

/** Admin «Ko'rish kunlari va vaqtlari» (UF-2). Defaults = TZ 2-b. */
export interface YozilishSozlamalari {
  /** Showing weekdays, 1 = Monday … 7 = Sunday. */
  haftaKunlari: number[];
  /** Slot starts, `HH:mm`, ascending. */
  vaqtlar: string[];
  /** Days without showings, `YYYY-MM-DD`. */
  bayramlar: string[];
  /** How many days ahead can be booked (today included). */
  kunlarSoni: number;
}

/** One row of «Ko'rishga yozilishlar» in the admin-panel. */
export interface AdminYozilishDto {
  id: number;
  arizaId: number;
  sana: string;
  vaqt: string;
  at: string;
  mijoz: { telegramId: string; name: string; phone: string | null; username: string | null };
  loyiha: { id: number; nomi: string };
  /** «A blok · 2 xona, 54 m²» or null. */
  planirovka: string | null;
  manba: string;
  holat: YozilishHolati;
  davomat: Davomat | null;
  /** How many times the Mijoz moved it. */
  kochirildi: number;
  /** Who set the davomat and when. */
  belgiladi: { nomi: string; at: string } | null;
}

/** GET /admin/api/yozilishlar?dan=&gacha= (Tashkent dates, inclusive). */
export interface AdminYozilishlarResponse {
  yozilishlar: AdminYozilishDto[];
}

/** PATCH /admin/api/yozilishlar/:id/davomat. null clears a mistaken mark. */
export interface AdminDavomatRequest {
  davomat: Davomat | null;
}
