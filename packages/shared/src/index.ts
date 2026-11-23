/**
 * Types shared by the server and the frontends (Mini App, admin-panel).
 * Types, constants and tiny pure helpers only: no runtime dependencies.
 */

export * from './bot';
export * from './start';
export * from './kalkulyator';
export * from './kontent';
export * from './skoring';
import type { Daraja } from './skoring';
export * from './dojim';
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

// ---- Katalog (ADR 0003: Loyiha → Blok → Xonadon; Planirovka = a type of Xonadon in a Blok) ----

export const SHAHARLAR = ['toshkent', 'navoiy'] as const;
export type Shahar = (typeof SHAHARLAR)[number];

/** Derived from its Xonadonlar' counts, never stored: bo'sh > 0 → sotuvda; else bron > 0 → band; else sotilgan. */
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

/** One Xonadon as the Mini App and the AI-menejer see it (shaxmatka cell / Xonadon kartochkasi). */
export interface XonadonDto {
  id: number;
  loyihaId: number;
  blokId: number;
  blokNomi: string;
  planirovkaId: number;
  qavat: number;
  raqam: number;
  xonalar: number;
  /** m² */
  maydon: number;
  /** UZS: the Xonadon's own narx, else its Planirovka's qo'lda narx; null → «Narx so'rov bo'yicha». */
  narx: number | null;
  holat: XonadonHolati;
}

/** GET …/katalog/bloklar/:id/xonadonlar — all Xonadonlar of a Blok, by qavat then raqam. */
export interface BlokXonadonlarResponse {
  blok: { id: number; nomi: string; loyihaId: number; loyihaNomi: string };
  xonadonlar: XonadonDto[];
}

export interface XonadonResponse {
  xonadon: XonadonDto;
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

/** Administrator: everything. Menejer: Xonadon holati and yozilishlar only. */
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

/** Holat of one Xonadon (ADR 0003). */
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
  /**
   * UZS, the Planirovka's qo'lda kiritilgan narx: the Boshlang'ich narx only
   * while none of its bo'sh Xonadonlar has a narx (ADR 0003).
   */
  qoldaNarx: number | null;
  tartib: number;
}

/** Counted from the Xonadonlar, never stored (ADR 0003). */
export interface XonadonSonlari {
  bosh: number;
  bron: number;
  sotilgan: number;
  /** bosh + bron + sotilgan = number of Xonadonlar. */
  jami: number;
}

export interface AdminPlanirovkaDto extends AdminPlanirovkaInput, XonadonSonlari {
  id: number;
  blokId: number;
  holat: PlanirovkaHolati;
  /** Derived (ADR 0003): cheapest bo'sh Xonadon narx, else qoldaNarx; null → «Narx so'rov bo'yicha». */
  boshlangichNarx: number | null;
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

/** Fields of a Xonadon the admin edits. Menejer: holat only. */
export interface AdminXonadonInput {
  planirovkaId: number;
  qavat: number;
  raqam: number;
  /** UZS; null → the Planirovka's qo'lda narx is shown. */
  narx: number | null;
  holat: XonadonHolati;
}

export interface AdminXonadonDto extends AdminXonadonInput {
  id: number;
  blokId: number;
  /** Latest jurnal row of this Xonadon: who and when; null if none. */
  oxirgiOzgarish: { nomi: string; at: string } | null;
}

/** GET /admin/api/katalog/bloklar/:id/xonadonlar */
export interface AdminBlokXonadonlarResponse {
  blok: { id: number; nomi: string; loyihaId: number; loyihaNomi: string };
  /** The Blok's Planirovkalar (with counts), for the Planirovka select and legend. */
  planirovkalar: AdminPlanirovkaDto[];
  /** By qavat, then raqam. */
  xonadonlar: AdminXonadonDto[];
}

export type JurnalObyekt = 'loyiha' | 'blok' | 'planirovka' | 'xonadon';

/** One jurnal row: kim, qachon, nima edi (oldin; null = created), nima bo'ldi (keyin). */
export interface JurnalDto {
  id: number;
  /** ISO instant. */
  at: string;
  admin: { id: number | null; nomi: string };
  obyekt: JurnalObyekt;
  obyektId: number;
  /** yaratildi | tahrirlandi | ochirildi (Xonadon); kochirildi = old Planirovka count moves (before ADR 0003). */
  amal: 'yaratildi' | 'tahrirlandi' | 'ochirildi' | 'kochirildi';
  /** Label of the object at that time, e.g. "Jozibali Maskan · A blok · 2 xona, 54 m²". */
  tavsif: string;
  /** Changed fields before (null = created). */
  oldin: Record<string, unknown> | null;
  /** Changed fields after. */
  keyin: Record<string, unknown>;
}

// ---- Xonadonlar import from Excel / CSV (#6, #24: one row = one Xonadon) ----

/** One problem in the file. qator: spreadsheet row number (1 = header); null = the whole file. */
export interface ImportXato {
  qator: number | null;
  /** Column label from the shablon (e.g. "maydon"), when the problem is in one cell. */
  ustun?: string;
  xabar: string;
}

/** What the import will do with one row (one Xonadon) of the file. */
export interface ImportQator {
  qator: number;
  blok: string;
  qavat: number;
  raqam: number;
  xonalar: number;
  maydon: number;
  /** Planirovka nomi (uz); null = without a name. */
  nomi: string | null;
  /** The Xonadon's own price, UZS; null → the Planirovka's qo'lda narx. */
  narx: number | null;
  holat: XonadonHolati;
  amal: 'yangi' | 'yangilanadi' | 'ozgarishsiz';
  /** For 'yangilanadi': changed fields of the Xonadon ('planirovka', 'narx', 'holat'). */
  ozgarishlar?: ('planirovka' | 'narx' | 'holat')[];
  /** The row's Planirovka (Blok + xonalar + maydon + nomi) does not exist yet and will be created. */
  yangiPlanirovka?: true;
  /** For 'yangilanadi': the Xonadon's values now (only the changed ones). */
  oldin?: { narx?: number | null; holat?: XonadonHolati; planirovka?: string };
}

/** A Xonadon of the Loyiha that is not in the file (the import leaves it as it is). */
export interface ImportFayldaYoq {
  blok: string;
  qavat: number;
  raqam: number;
  holat: XonadonHolati;
}

export interface ImportReja {
  /** Xonadonlar: created / changed / the same. */
  yangi: number;
  yangilanadi: number;
  ozgarishsiz: number;
  /** Bloklar the import will create. */
  yangiBloklar: string[];
  /** Planirovkalar the import will create (by Blok + xonalar + maydon + nomi). */
  yangiPlanirovkalar: number;
  /** Existing Planirovkalar whose chizma / video the file changes. */
  yangilanadiganPlanirovkalar: number;
  /** Xonadonlar of the Loyiha that are not in the file; never deleted. */
  fayldaYoq: number;
  /** The first of them (at most IMPORT_FAYLDA_YOQ_MAX), Blok / qavat / raqam order. */
  fayldaYoqlar: ImportFayldaYoq[];
  qatorlar: ImportQator[];
}

export const IMPORT_FAYLDA_YOQ_MAX = 200;

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
  yangiPlanirovkalar: number;
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
  /** Typical monthly payment (namunaviyOylik: muddatli to'lov, else first bank annuitet), UZS; null without a price. */
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
  /** The dojim whose button opened this Mini App launch (#17); the booking then counts as «dojimdan». */
  dojimId?: number;
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
  /** The Mijoz's current Daraja (#18); null = not scored yet. */
  daraja: Daraja | null;
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

// ---- Filtrlar va «Xonadon tanlash» kvizi (#10) ----

/** «4+» in the xonalar filter and the kviz: 4 means four rooms or more. */
export const XONALAR_VARIANTLARI = [1, 2, 3, 4] as const;

/**
 * GET /api/katalog/planirovkalar?shahar=&loyiha=&blok=&xonalar=2,3&narxDan=&narxGacha=&maydonDan=&maydonGacha=&faqatBosh=1
 * No qavat (ADR 0001). Bounds are inclusive; narx in UZS; any narx bound leaves out «Narx so'rov bo'yicha».
 * «Faqat bo'sh» hides Band and Sotilgan; without it Sotilgan ones are listed (greyed in the UI).
 */
export interface PlanirovkaFiltr {
  shahar?: Shahar;
  loyihaId?: number;
  blokId?: number;
  xonalar?: number[];
  narxDan?: number;
  narxGacha?: number;
  maydonDan?: number;
  maydonGacha?: number;
  faqatBosh?: boolean;
}

/** Cheapest first, «Narx so'rov bo'yicha» last. */
export interface PlanirovkalarResponse {
  planirovkalar: PlanirovkaDto[];
}

/** One kviz budget answer, UZS; null = open end («… dan» / «… gacha»). */
export interface ByudjetOraligi {
  dan: number | null;
  gacha: number | null;
}

/** GET /api/katalog/filtr?shahar= — what the filter sheet and the kviz offer. */
export interface FiltrVariantlariResponse {
  loyihalar: { id: number; nomi: string; shahar: Shahar; bloklar: { id: number; nomi: string }[] }[];
  /** Boshlang'ich narx bounds over priced Planirovkalar; null when none has a price. */
  narx: { min: number; max: number } | null;
  maydon: { min: number; max: number } | null;
  /** Kviz budget answers: the Administrator's own, else 4 equal ranges from narx.min to narx.max. */
  byudjet: ByudjetOraligi[];
}

/** GET/PUT /admin/api/kviz/byudjet (Administrator). qolda = null → automatic ranges. */
export interface KvizByudjetSozlamasi {
  qolda: ByudjetOraligi[] | null;
  /** Read only: the automatic ranges over both cities, for comparison. */
  avtomatik: ByudjetOraligi[];
}

/** «Tur» (S13): to live in, or to rent out (investment). */
export const KVIZ_TURLARI = ['yashash', 'ijara'] as const;
export type KvizTuri = (typeof KVIZ_TURLARI)[number];
/** «Xarid muddati» (S13). */
export const KVIZ_MUDDATLARI = ['shu_oy', '1_3_oy', '3_6_oy', 'bilmayman'] as const;
export type KvizMuddati = (typeof KVIZ_MUDDATLARI)[number];
/** «To'lov usuli» (S13, UF-4). */
export const KVIZ_TOLOV_USULLARI = ['toliq', 'muddatli', 'ipoteka'] as const;
export type KvizTolovUsuli = (typeof KVIZ_TOLOV_USULLARI)[number];

/**
 * Answers of the «Xonadon tanlash» kviz. Stored with its Ariza (payload.kviz);
 * lead scoring (UF-4, #18) reads byudjet, muddat and tolov from here.
 */
export interface KvizJavoblari {
  shahar: Shahar;
  tur: KvizTuri;
  /** Non-empty; 4 = «4+». */
  xonalar: number[];
  /** null when the katalog offered no budget ranges. */
  byudjet: ByudjetOraligi | null;
  muddat: KvizMuddati;
  tolov: KvizTolovUsuli;
}

/** POST /api/kviz: the answers plus the contact left on the last step. */
export interface KvizRequest extends KvizJavoblari {
  name: string;
  phone: string;
}

/** 201 (200 on a repeat). `filtr` = the answers as a filter, for the matching Planirovkalar list. */
export interface KvizResponse {
  id: number;
  filtr: PlanirovkaFiltr;
}

// ---- «Do'stingni taklif qil» (#19, UF-6) ----

/** GET /api/taklif: the Mijoz's personal link and how many Mijozlar came by it. */
export interface TaklifResponse {
  /** `https://t.me/<bot>?start=taklif_<kod>`: opens the bot for the friend. */
  url: string;
  /** Mijozlar who first came to the bot by this link. */
  soni: number;
}

/** A Mijoz as the admin-panel shows them in the taklif lists. */
export interface TaklifMijozDto {
  telegramId: string;
  name: string;
  username: string | null;
  phone: string | null;
}

/** GET /admin/api/takliflar row: a Mijoz who invited at least one other. */
export interface TaklifchiDto extends TaklifMijozDto {
  soni: number;
  /** When the latest invited Mijoz came (ISO). */
  oxirgiAt: string;
}

export interface TaklifchilarResponse {
  taklifchilar: TaklifchiDto[];
}

/** An amoCRM Bitim of an invited Mijoz, as known from their Arizalar. */
export interface TaklifBitimDto {
  id: string;
  /** Link into amoCRM when AMO_BASE_URL is set. */
  url: string | null;
  arizalarSoni: number;
  oxirgiArizaAt: string;
}

export interface TaklifQilinganDto extends TaklifMijozDto {
  /** When they first came to the bot (ISO). */
  kelganAt: string;
  arizalarSoni: number;
  /** Arizalar not yet in amoCRM (queued for retry). */
  kutilayotganArizalar: number;
  bitimlar: TaklifBitimDto[];
}

/** GET /admin/api/takliflar/:telegramId */
export interface TaklifQilinganlarResponse {
  taklifchi: TaklifMijozDto;
  taklifQilinganlar: TaklifQilinganDto[];
}

// ── voronka (#20, UF-7) ──────────────────────────────────────────────────

/**
 * Funnel steps, in order. `korildi` = the Mijoz opened a Planirovka or a
 * Xonadon card (ADR 0003: Xonadon views join the same step).
 */
export const VORONKA_QADAMLARI = ['bot_kirdi', 'korildi', 'ariza', 'yozilish', 'keldi'] as const;
export type VoronkaQadami = (typeof VORONKA_QADAMLARI)[number];

export interface VoronkaQadamDto {
  kalit: VoronkaQadami;
  nomi: string;
  /** Distinct Mijozlar; null = the step has no Loyiha (bot entry under a Loyiha filter). */
  mijozlar: number | null;
}

export interface VoronkaManbaDto {
  manba: string;
  /** Per step, in VORONKA_QADAMLARI order. */
  mijozlar: (number | null)[];
}

export interface VoronkaLoyihaDto {
  id: number;
  nomi: string;
  mijozlar: (number | null)[];
}

export interface KorilganPlanirovkaDto {
  planirovkaId: number;
  loyiha: string;
  blok: string;
  xonalar: number;
  maydon: number;
  nomi: string | null;
  /** Openings. */
  korishlar: number;
  /** Distinct Mijozlar who opened it. */
  mijozlar: number;
}

/** GET /admin/api/voronka?dan=&gacha=&manba=&loyihaId= (Administrator). */
export interface VoronkaResponse {
  /** Tashkent days, inclusive. */
  dan: string;
  gacha: string;
  manba: string | null;
  loyihaId: number | null;
  qadamlar: VoronkaQadamDto[];
  manbalar: VoronkaManbaDto[];
  loyihalar: VoronkaLoyihaDto[];
  engKopKorilgan: KorilganPlanirovkaDto[];
  tanlov: { manbalar: string[]; loyihalar: { id: number; nomi: string }[] };
}
