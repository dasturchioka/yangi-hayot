/** Working time for CRM task deadlines (Tashkent wall clock). */
export interface WorkingHours {
  /** `HH:mm`, inclusive. */
  start: string;
  /** `HH:mm`, exclusive. */
  end: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
}

/** Tashkent is UTC+5 all year (no DST), so plain offset arithmetic is exact. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

function msOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h! * 60 + m!) * 60_000;
}

/**
 * `now` plus `minutes` of working time: the clock only runs inside working
 * hours. With 9:00–19:00, a task created at 18:55 with 15 minutes is due at
 * 9:10 the next working day; one created at night is due at 9:15.
 */
export function addWorkingMinutes(now: Date, minutes: number, hours: WorkingHours): Date {
  const start = msOf(hours.start);
  const end = msOf(hours.end);
  if (hours.days.length === 0 || end <= start) return new Date(now.getTime() + minutes * 60_000);

  let local = now.getTime() + TASHKENT_OFFSET_MS; // UTC fields of `local` = Tashkent wall clock
  let remaining = minutes * 60_000;
  for (;;) {
    const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
    const isoWeekday = ((new Date(dayStart).getUTCDay() + 6) % 7) + 1;
    const inDay = local - dayStart;
    if (!hours.days.includes(isoWeekday) || inDay >= end) {
      local = dayStart + DAY_MS + start;
      continue;
    }
    if (inDay < start) local = dayStart + start;
    const available = dayStart + end - local;
    if (remaining <= available) return new Date(local + remaining - TASHKENT_OFFSET_MS);
    remaining -= available;
    local = dayStart + DAY_MS + start;
  }
}
