/**
 * Types shared by the server and the frontends (Mini App, admin-panel).
 * Types, constants and tiny pure helpers only: no runtime dependencies.
 */

export * from './bot';
export * from './start';
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

// ---- Planirovkalar import from Excel / CSV (#6) ----

/** One problem in the file. qator: spreadsheet row number (1 = header); null = the whole file. */
export interface ImportXato {
  qator: number | null;
  /** Column label from the shablon (e.g. "maydon"), when the problem is in one cell. */
  ustun?: string;
  xabar: string;
}

/** What the import will do with one row of the file. */
export interface ImportQator {
  qator: number;
  blok: string;
  xonalar: number;
  maydon: number;
  nomi: string | null;
  boshlangichNarx: number | null;
  bosh: number;
  bron: number;
  sotilgan: number;
  amal: 'yangi' | 'yangilanadi' | 'ozgarishsiz';
  /** For 'yangilanadi': changed fields (boshlangichNarx, bosh, bron, sotilgan, nomi, chizma, video). */
  ozgarishlar?: string[];
}

export interface ImportReja {
  yangi: number;
  yangilanadi: number;
  ozgarishsiz: number;
  /** Bloklar the import will create. */
  yangiBloklar: string[];
  /** Planirovkalar of the Loyiha that are not in the file; the import leaves them as they are. */
  fayldaYoq: number;
  qatorlar: ImportQator[];
}

/** POST …/import/tekshir. Import is possible only when xatolar is empty. */
export interface ImportTekshirResponse {
  xatolar: ImportXato[];
  reja: ImportReja | null;
}

export interface ImportNatija {
  yaratildi: number;
  yangilandi: number;
  ozgarishsiz: number;
  yangiBloklar: string[];
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
