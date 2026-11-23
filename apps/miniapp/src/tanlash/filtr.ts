import { SHAHARLAR, type ByudjetOraligi, type PlanirovkaFiltr } from '@yh/shared';
import type { Translate } from '../i18n';

/**
 * Filter (#10) ⇄ query string, the same names the server reads on
 * GET /api/katalog/planirovkalar. Also the screen's URL, so Back and links keep it.
 */
export function filtrQuery(f: PlanirovkaFiltr): string {
  const q = new URLSearchParams();
  if (f.shahar) q.set('shahar', f.shahar);
  if (f.loyihaId) q.set('loyiha', String(f.loyihaId));
  if (f.blokId) q.set('blok', String(f.blokId));
  if (f.xonalar?.length) q.set('xonalar', [...f.xonalar].sort((a, b) => a - b).join(','));
  if (f.narxDan !== undefined) q.set('narxDan', String(f.narxDan));
  if (f.narxGacha !== undefined) q.set('narxGacha', String(f.narxGacha));
  if (f.maydonDan !== undefined) q.set('maydonDan', String(f.maydonDan));
  if (f.maydonGacha !== undefined) q.set('maydonGacha', String(f.maydonGacha));
  if (f.faqatBosh) q.set('faqatBosh', '1');
  return q.toString();
}

export function parseFiltr(q: URLSearchParams): PlanirovkaFiltr {
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const f: PlanirovkaFiltr = {};
  const shahar = SHAHARLAR.find((s) => s === q.get('shahar'));
  if (shahar) f.shahar = shahar;
  const loyihaId = num('loyiha');
  if (loyihaId) f.loyihaId = loyihaId;
  const blokId = num('blok');
  if (blokId) f.blokId = blokId;
  const xonalar = (q.get('xonalar') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  if (xonalar.length) f.xonalar = [...new Set(xonalar)];
  for (const k of ['narxDan', 'narxGacha', 'maydonDan', 'maydonGacha'] as const) {
    const v = num(k);
    if (v !== undefined) f[k] = v;
  }
  if (q.get('faqatBosh') === '1') f.faqatBosh = true;
  return f;
}

/** How many filter fields are set (badge on the filter button). */
export function filtrSoni(f: PlanirovkaFiltr): number {
  return [
    f.shahar,
    f.loyihaId,
    f.blokId,
    f.xonalar?.length,
    f.narxDan !== undefined || f.narxGacha !== undefined,
    f.maydonDan !== undefined || f.maydonGacha !== undefined,
    f.faqatBosh,
  ].filter(Boolean).length;
}

const mlnNum = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1_000_000).replace('.', ',');

/** «400–500 mln so'm», «700 mln so'mdan», «500 mln so'mgacha». */
export function formatOraliq(t: Translate, r: ByudjetOraligi): string {
  if (r.dan !== null && r.gacha !== null) return t('oraliq.mln', { dan: mlnNum(r.dan), gacha: mlnNum(r.gacha) });
  if (r.dan !== null) return t('oraliq.mlnDan', { n: mlnNum(r.dan) });
  if (r.gacha !== null) return t('oraliq.mlnGacha', { n: mlnNum(r.gacha) });
  return '';
}

/** «1, 2 xona», «2–3 xona», «4+ xona». */
export function formatXonalar(t: Translate, xonalar: number[]): string {
  const s = [...xonalar].sort((a, b) => a - b);
  const label = (x: number) => (x >= 4 ? '4+' : String(x));
  const consecutive = s.length > 1 && s.every((x, i) => i === 0 || x === s[i - 1]! + 1);
  const text = consecutive ? `${label(s[0]!)}–${label(s[s.length - 1]!)}` : s.map(label).join(', ');
  return t('filtr.xona', { n: text.replace(/^(\d)–4\+$/, '$1+') /* 2,3,4+ = «2+» */ });
}
