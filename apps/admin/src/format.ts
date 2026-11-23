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

/** Parses a number typed with spaces ("455 500 000"); '' → null; garbage → NaN. */
export function parseNumber(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.');
  return t === '' ? null : Number(t);
}
