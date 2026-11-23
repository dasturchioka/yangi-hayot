/** "455 500 000" — whole so'm with spaces. */
export function soum(n: number | null): string {
  return n === null ? "So'rov bo'yicha" : new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ');
}

/** "19.11 14:20" in Tashkent time. */
export function qachon(iso: string): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

export const XONADON_HOLATI_LABEL = { bosh: "Bo'sh", bron: 'Bron', sotilgan: 'Sotilgan' } as const;
export const PLANIROVKA_HOLATI_LABEL = { sotuvda: 'Sotuvda', band: 'Band', sotilgan: 'Sotilgan' } as const;
export const ROL_LABEL = { administrator: 'Administrator', menejer: 'Menejer' } as const;

/** Today in Tashkent, `YYYY-MM-DD` (the server counts days the same way). */
export function bugunSana(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
}

/** `YYYY-MM-DD` ± n days. */
export function sanaQosh(sana: string, n: number): string {
  const [y, m, d] = sana.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** «23.11.2026». */
export function sanaNuqta(sana: string): string {
  return `${sana.slice(8, 10)}.${sana.slice(5, 7)}.${sana.slice(0, 4)}`;
}

/** Parses a number typed with spaces ("455 500 000"); '' → null; garbage → NaN. */
export function parseNumber(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.');
  return t === '' ? null : Number(t);
}
