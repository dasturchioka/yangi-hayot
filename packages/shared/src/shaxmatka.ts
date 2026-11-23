import type { PlanirovkaFiltr, Shahar, XonadonHolati } from './index';

/**
 * Shaxmatka (#23, UF-1, ADR 0003): one Blok as a «qavat × xonadon» grid.
 *
 * The payload is compact on purpose (a 200-Xonadon Blok must open within
 * 2 s on 4G): the Planirovka facts every cell needs (xonalar, m²) come once
 * per Planirovka, each cell carries only its own fields.
 */
export interface ShaxmatkaPlanirovkaDto {
  id: number;
  xonalar: number;
  /** m² */
  maydon: number;
}

export interface ShaxmatkaKatakDto {
  id: number;
  qavat: number;
  raqam: number;
  planirovkaId: number;
  /** UZS: own narx, else the Planirovka's qo'lda narx; null → «Narx so'rov bo'yicha». */
  narx: number | null;
  holat: XonadonHolati;
}

/** GET /api/katalog/bloklar/:id/shaxmatka */
export interface ShaxmatkaResponse {
  blok: { id: number; nomi: string; loyihaId: number; loyihaNomi: string; shahar: Shahar };
  planirovkalar: ShaxmatkaPlanirovkaDto[];
  /** By qavat, then raqam. Sotilgan ones are included (shown, not clickable). */
  xonadonlar: ShaxmatkaKatakDto[];
}

/** What the filter looks at in one Xonadon. */
export interface XonadonFiltrMaydonlari {
  shahar: Shahar;
  loyihaId: number;
  blokId: number;
  xonalar: number;
  maydon: number;
  narx: number | null;
  qavat: number;
  holat: XonadonHolati;
}

/**
 * Does this Xonadon match the filter (#10 fields + qavat)? The one rule for
 * the server (`/xonadonlar`, qavat in `/planirovkalar`) and the shaxmatka's
 * highlighting in the Mini App. Bounds inclusive; xonalar 4 = «4+»; a narx
 * bound leaves out «Narx so'rov bo'yicha»; «Faqat bo'sh» = holat bo'sh.
 */
export function xonadonMos(x: XonadonFiltrMaydonlari, f: PlanirovkaFiltr): boolean {
  if (f.shahar && x.shahar !== f.shahar) return false;
  if (f.loyihaId && x.loyihaId !== f.loyihaId) return false;
  if (f.blokId && x.blokId !== f.blokId) return false;
  if (f.xonalar?.length && !f.xonalar.some((n) => (n >= 4 ? x.xonalar >= 4 : x.xonalar === n))) return false;
  if (f.narxDan !== undefined || f.narxGacha !== undefined) {
    if (x.narx === null) return false;
    if (f.narxDan !== undefined && x.narx < f.narxDan) return false;
    if (f.narxGacha !== undefined && x.narx > f.narxGacha) return false;
  }
  if (f.maydonDan !== undefined && x.maydon < f.maydonDan) return false;
  if (f.maydonGacha !== undefined && x.maydon > f.maydonGacha) return false;
  if (f.qavatDan !== undefined && x.qavat < f.qavatDan) return false;
  if (f.qavatGacha !== undefined && x.qavat > f.qavatGacha) return false;
  if (f.faqatBosh && x.holat !== 'bosh') return false;
  return true;
}

/** Is any Xonadon-level field (one a Blok's cells differ in) set? Then the shaxmatka highlights. */
export function xonadonFiltriBor(f: PlanirovkaFiltr): boolean {
  const bounds = [f.narxDan, f.narxGacha, f.maydonDan, f.maydonGacha, f.qavatDan, f.qavatGacha];
  return Boolean(f.xonalar?.length) || Boolean(f.faqatBosh) || bounds.some((v) => v !== undefined);
}

/**
 * Mini App `startapp=xn<id>` opens that Xonadon kartochkasi (#23). The
 * tracked «Ulashish» of a Xonadon is #25's.
 */
export function xonadonStartParam(id: number): string {
  return `xn${id}`;
}

export function parseXonadonParam(param: string | null | undefined): number | null {
  const m = param ? /^xn([1-9][0-9]{0,9})$/.exec(param) : null;
  const id = m ? Number(m[1]) : null;
  return id !== null && id <= 2_147_483_647 ? id : null;
}
