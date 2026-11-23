import type {
  BlokDto,
  InfratuzilmaDto,
  Lang,
  FiltrVariantlariResponse,
  LoyihaCardDto,
  LoyihaDto,
  PlanirovkaDto,
  PlanirovkaFiltr,
  PlanirovkaHolati,
  Shahar,
  VideoDto,
} from '@yh/shared';
import type pg from 'pg';
import type { Clock } from '../clock';
import type { InfratuzilmaInput, Lokal } from './seed';

/**
 * Read side of the Katalog, shared by the Mini App and the AI-menejer API so
 * both always show the same prices and holatlar.
 *
 * Only Sotuvdagi Loyihalar are visible. The whole visible catalog is small
 * (tens of Loyihalar, hundreds of Planirovkalar), so it is read in one go and
 * kept in memory for at most `ttlMs` (default 30 s): a change in the database
 * reaches the Mijoz within a minute without any invalidation. Writers in this
 * process (admin-panel, import) call `invalidate()` to show changes at once.
 */
export interface Katalog {
  loyihalar(q: { shahar?: Shahar; lang: Lang }): Promise<LoyihaCardDto[]>;
  /** null when there is no such Sotuvdagi Loyiha. */
  loyiha(id: number, lang: Lang): Promise<LoyihaDto | null>;
  /** null when there is no such Planirovka in a Sotuvdagi Loyiha. Sotilgan ones are returned. */
  planirovka(id: number, lang: Lang): Promise<PlanirovkaDto | null>;
  /** Planirovkalar matching the filter (#10), cheapest first, «Narx so'rov bo'yicha» last. */
  planirovkalar(filtr: PlanirovkaFiltr, lang: Lang): Promise<PlanirovkaDto[]>;
  /** Loyihalar/Bloklar and narx/maydon bounds of a city (or both) for the filter sheet. Budget ranges: see kviz/byudjet. */
  filtrVariantlari(shahar?: Shahar): Promise<Omit<FiltrVariantlariResponse, 'byudjet'>>;
  invalidate(): void;
}

export const KATALOG_TTL_MS = 30_000;

/** Planirovka holati from its counts (ADR 0001). */
export function planirovkaHolati(c: { bosh: number; bron: number }): PlanirovkaHolati {
  if (c.bosh > 0) return 'sotuvda';
  if (c.bron > 0) return 'band';
  return 'sotilgan';
}

/** Telegram channel and YouTube links open in the Mini App; anything else is not shown. */
export function parseVideo(url: string | null): VideoDto | null {
  if (!url) return null;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === 't.me' || host === 'telegram.me') return { kind: 'telegram', url };
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) return { kind: 'youtube', url };
  return null;
}

interface LoyihaRow {
  id: number;
  slug: string;
  nomi: string;
  shahar: Shahar;
  manzil: Lokal;
  qisqa_tavsif: Lokal | null;
  tavsif: Lokal | null;
  fotolar: string[];
  video_url: string | null;
  qavatlar_soni: number | null;
  lat: number | null;
  lng: number | null;
  infratuzilma: InfratuzilmaInput[];
}

interface BlokRow {
  id: number;
  loyiha_id: number;
  nomi: string;
}

interface PlanirovkaRow {
  id: number;
  blok_id: number;
  xonalar: number;
  maydon: string;
  nomi: Lokal | null;
  chizma_url: string | null;
  video_url: string | null;
  boshlangich_narx: string | null;
  bosh: number;
  bron: number;
  sotilgan: number;
}

interface Snapshot {
  loadedAt: number;
  loyihalar: LoyihaRow[];
  bloklarOf: Map<number, BlokRow[]>;
  planirovkalarOf: Map<number, PlanirovkaRow[]>;
  blokById: Map<number, BlokRow>;
  loyihaById: Map<number, LoyihaRow>;
  planirovkaById: Map<number, PlanirovkaRow>;
}

async function loadSnapshot(db: pg.Pool, now: number): Promise<Snapshot> {
  const loyihalar = (
    await db.query<LoyihaRow>(
      `SELECT id, slug, nomi, shahar, manzil, qisqa_tavsif, tavsif, fotolar, video_url, qavatlar_soni,
              lat, lng, infratuzilma
         FROM loyiha WHERE holat = 'sotuvda' ORDER BY tartib, nomi, id`,
    )
  ).rows;
  const bloklar = (
    await db.query<BlokRow>(
      `SELECT b.id, b.loyiha_id, b.nomi FROM blok b JOIN loyiha l ON l.id = b.loyiha_id
        WHERE l.holat = 'sotuvda' ORDER BY b.tartib, b.nomi, b.id`,
    )
  ).rows;
  const planirovkalar = (
    await db.query<PlanirovkaRow>(
      `SELECT p.id, p.blok_id, p.xonalar, p.maydon, p.nomi, p.chizma_url, p.video_url, p.boshlangich_narx,
              p.bosh, p.bron, p.sotilgan
         FROM planirovka p JOIN blok b ON b.id = p.blok_id JOIN loyiha l ON l.id = b.loyiha_id
        WHERE l.holat = 'sotuvda' ORDER BY p.xonalar, p.maydon, p.tartib, p.id`,
    )
  ).rows;

  const s: Snapshot = {
    loadedAt: now,
    loyihalar,
    bloklarOf: new Map(),
    planirovkalarOf: new Map(),
    blokById: new Map(bloklar.map((b) => [b.id, b])),
    loyihaById: new Map(loyihalar.map((l) => [l.id, l])),
    planirovkaById: new Map(planirovkalar.map((p) => [p.id, p])),
  };
  for (const b of bloklar) push(s.bloklarOf, b.loyiha_id, b);
  for (const p of planirovkalar) push(s.planirovkalarOf, p.blok_id, p);
  return s;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

export function createKatalog(deps: { db: pg.Pool; clock: Clock; ttlMs?: number }): Katalog {
  const ttlMs = deps.ttlMs ?? KATALOG_TTL_MS;
  let snapshot: Snapshot | undefined;
  let loading: Promise<Snapshot> | undefined;

  async function current(): Promise<Snapshot> {
    const now = deps.clock.now().getTime();
    if (snapshot && now - snapshot.loadedAt < ttlMs) return snapshot;
    loading ??= loadSnapshot(deps.db, now).finally(() => {
      loading = undefined;
    });
    snapshot = await loading;
    return snapshot;
  }

  function planirovkaDto(s: Snapshot, p: PlanirovkaRow, lang: Lang): PlanirovkaDto {
    const blok = s.blokById.get(p.blok_id)!;
    const loyiha = s.loyihaById.get(blok.loyiha_id)!;
    return {
      id: p.id,
      loyihaId: loyiha.id,
      loyihaNomi: loyiha.nomi,
      blokId: blok.id,
      blokNomi: blok.nomi,
      xonalar: p.xonalar,
      maydon: Number(p.maydon),
      nomi: p.nomi ? p.nomi[lang] : null,
      chizma: p.chizma_url,
      video: parseVideo(p.video_url),
      boshlangichNarx: p.boshlangich_narx === null ? null : Number(p.boshlangich_narx),
      bosh: p.bosh,
      holat: planirovkaHolati(p),
    };
  }

  function planirovkalarOfLoyiha(s: Snapshot, loyihaId: number): PlanirovkaRow[] {
    return (s.bloklarOf.get(loyihaId) ?? []).flatMap((b) => s.planirovkalarOf.get(b.id) ?? []);
  }

  function cardDto(s: Snapshot, l: LoyihaRow, lang: Lang): LoyihaCardDto {
    const ps = planirovkalarOfLoyiha(s, l.id);
    const narxlar = ps
      .filter((p) => planirovkaHolati(p) === 'sotuvda' && p.boshlangich_narx !== null)
      .map((p) => Number(p.boshlangich_narx));
    return {
      id: l.id,
      slug: l.slug,
      nomi: l.nomi,
      shahar: l.shahar,
      manzil: l.manzil[lang],
      qisqaTavsif: l.qisqa_tavsif ? l.qisqa_tavsif[lang] : null,
      foto: l.fotolar[0] ?? null,
      fotolarSoni: l.fotolar.length,
      video: parseVideo(l.video_url),
      bloklarSoni: (s.bloklarOf.get(l.id) ?? []).length,
      qavatlarSoni: l.qavatlar_soni,
      boshXonadonlar: ps.reduce((sum, p) => sum + p.bosh, 0),
      boshlangichNarx: narxlar.length ? Math.min(...narxlar) : null,
    };
  }

  return {
    async loyihalar({ shahar, lang }) {
      const s = await current();
      return s.loyihalar.filter((l) => !shahar || l.shahar === shahar).map((l) => cardDto(s, l, lang));
    },

    async loyiha(id, lang) {
      const s = await current();
      const l = s.loyihaById.get(id);
      if (!l) return null;
      const ps = planirovkalarOfLoyiha(s, l.id);
      const bloklar: BlokDto[] = (s.bloklarOf.get(l.id) ?? []).map((b) => {
        const bps = s.planirovkalarOf.get(b.id) ?? [];
        const guruhlar = new Map<number, PlanirovkaDto[]>();
        for (const p of bps) push(guruhlar, p.xonalar, planirovkaDto(s, p, lang));
        return {
          id: b.id,
          nomi: b.nomi,
          boshXonadonlar: bps.reduce((sum, p) => sum + p.bosh, 0),
          guruhlar: [...guruhlar.entries()]
            .sort(([a], [b2]) => a - b2)
            .map(([xonalar, planirovkalar]) => ({ xonalar, planirovkalar })),
        };
      });
      const infratuzilma: InfratuzilmaDto[] = l.infratuzilma.map((i) => ({
        kategoriya: i.kategoriya,
        nomi: i.nomi[lang],
        masofa: i.masofa ? i.masofa[lang] : null,
      }));
      return {
        ...cardDto(s, l, lang),
        tavsif: l.tavsif ? l.tavsif[lang] : null,
        fotolar: l.fotolar,
        jamiXonadonlar: ps.reduce((sum, p) => sum + p.bosh + p.bron + p.sotilgan, 0),
        xarita: l.lat !== null && l.lng !== null ? { lat: l.lat, lng: l.lng } : null,
        infratuzilma,
        bloklar,
      };
    },

    async planirovka(id, lang) {
      const s = await current();
      const p = s.planirovkaById.get(id);
      return p ? planirovkaDto(s, p, lang) : null;
    },

    async planirovkalar(f, lang) {
      const s = await current();
      const matches = (p: PlanirovkaRow) => {
        const blok = s.blokById.get(p.blok_id)!;
        const loyiha = s.loyihaById.get(blok.loyiha_id)!;
        if (f.shahar && loyiha.shahar !== f.shahar) return false;
        if (f.loyihaId && loyiha.id !== f.loyihaId) return false;
        if (f.blokId && blok.id !== f.blokId) return false;
        if (f.xonalar?.length && !f.xonalar.some((x) => (x >= 4 ? p.xonalar >= 4 : p.xonalar === x))) return false;
        if (f.narxDan !== undefined || f.narxGacha !== undefined) {
          if (p.boshlangich_narx === null) return false;
          const narx = Number(p.boshlangich_narx);
          if (f.narxDan !== undefined && narx < f.narxDan) return false;
          if (f.narxGacha !== undefined && narx > f.narxGacha) return false;
        }
        const maydon = Number(p.maydon);
        if (f.maydonDan !== undefined && maydon < f.maydonDan) return false;
        if (f.maydonGacha !== undefined && maydon > f.maydonGacha) return false;
        if (f.faqatBosh && planirovkaHolati(p) !== 'sotuvda') return false;
        return true;
      };
      const narx = (p: PlanirovkaRow) => (p.boshlangich_narx === null ? Infinity : Number(p.boshlangich_narx));
      return s.loyihalar
        .flatMap((l) => planirovkalarOfLoyiha(s, l.id))
        .filter(matches)
        .sort((a, b) => narx(a) - narx(b) || Number(a.maydon) - Number(b.maydon) || a.id - b.id)
        .map((p) => planirovkaDto(s, p, lang));
    },

    async filtrVariantlari(shahar) {
      const s = await current();
      const loyihalar = s.loyihalar.filter((l) => !shahar || l.shahar === shahar);
      const ps = loyihalar.flatMap((l) => planirovkalarOfLoyiha(s, l.id));
      const narxlar = ps.filter((p) => p.boshlangich_narx !== null).map((p) => Number(p.boshlangich_narx));
      const maydonlar = ps.map((p) => Number(p.maydon));
      const bounds = (xs: number[]) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null);
      return {
        loyihalar: loyihalar.map((l) => ({
          id: l.id,
          nomi: l.nomi,
          shahar: l.shahar,
          bloklar: (s.bloklarOf.get(l.id) ?? []).map((b) => ({ id: b.id, nomi: b.nomi })),
        })),
        narx: bounds(narxlar),
        maydon: bounds(maydonlar),
      };
    },

    invalidate() {
      snapshot = undefined;
    },
  };
}
