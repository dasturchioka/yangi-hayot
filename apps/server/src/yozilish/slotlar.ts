import type { YozilishKunDto, YozilishSozlamalari } from '@yh/shared';
import { addDays, tashkentInstant, toTashkent } from '../clock';

/**
 * The booking calendar (TZ 2-b.): the nearest `kunlarSoni` days from today
 * in Tashkent; closed weekdays and holidays have no slots; today's slots that
 * have already started are hidden. No limit per slot.
 */
export function slotlar(now: Date, s: YozilishSozlamalari): YozilishKunDto[] {
  const today = toTashkent(now).date;
  const vaqtlar = [...s.vaqtlar].sort();
  const kunlar: YozilishKunDto[] = [];
  for (let i = 0; i < s.kunlarSoni; i++) {
    const sana = addDays(today, i);
    const haftaKuni = toTashkent(tashkentInstant(sana, '12:00')).isoWeekday;
    const ochiq = s.haftaKunlari.includes(haftaKuni) && !s.bayramlar.includes(sana);
    kunlar.push({
      sana,
      haftaKuni,
      vaqtlar: ochiq ? vaqtlar.filter((v) => tashkentInstant(sana, v).getTime() > now.getTime()) : [],
    });
  }
  return kunlar;
}

/** Is this slot bookable right now? */
export function slotBormi(now: Date, s: YozilishSozlamalari, sana: string, vaqt: string): boolean {
  return slotlar(now, s).some((k) => k.sana === sana && k.vaqtlar.includes(vaqt));
}
