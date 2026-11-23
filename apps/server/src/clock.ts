/**
 * Time source. Everything that depends on "now" (initData freshness, reports,
 * reminders, slots, retries) takes a Clock instead of calling `new Date()`,
 * so tests can move time forward.
 */
export interface Clock {
  now(): Date;
}

/** Business time zone: every schedule and "today" is in Tashkent time (UTC+5, no DST). */
export const TIMEZONE = 'Asia/Tashkent';

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test clock: stands still until told to move. */
export class FakeClock implements Clock {
  #now: Date;

  constructor(start: Date) {
    this.#now = new Date(start);
  }

  now(): Date {
    return new Date(this.#now);
  }

  set(to: Date): void {
    this.#now = new Date(to);
  }

  advance(by: { days?: number; hours?: number; minutes?: number; seconds?: number }): void {
    const ms =
      (by.days ?? 0) * 86_400_000 +
      (by.hours ?? 0) * 3_600_000 +
      (by.minutes ?? 0) * 60_000 +
      (by.seconds ?? 0) * 1_000;
    this.#now = new Date(this.#now.getTime() + ms);
  }
}

export interface LocalDateTime {
  /** `YYYY-MM-DD` in Tashkent. */
  date: string;
  /** `HH:mm` in Tashkent, 24h. */
  time: string;
  /** 1 = Monday … 7 = Sunday. */
  isoWeekday: number;
}

/** Wall-clock date and time of an instant in Tashkent. */
export function toTashkent(instant: Date): LocalDateTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    isoWeekday: weekdays.indexOf(parts.weekday!) + 1,
  };
}
