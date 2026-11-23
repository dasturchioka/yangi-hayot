import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/**
 * «Yashil barg» DatePicker — replaces native <input type="date"> (import '@yh/ui/date' + '@yh/ui/select.css').
 * Value is 'YYYY-MM-DD'. A button shows «23.11.2026»; the popover is a month
 * grid (dialog + grid): arrows move by day/week, PageUp/PageDown by month,
 * Home/End to the week's ends, Enter picks, Esc closes. Days outside min/max are disabled.
 */

const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const KUNLAR = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  return new Date(r.getFullYear(), r.getMonth(), Math.min(d.getDate(), last));
};
const show = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
};

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  min?: string;
  max?: string;
  className?: string;
}

export function DatePicker({ value, onChange, 'aria-label': ariaLabel, min, max, className }: DatePickerProps) {
  const uid = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(() => parse(value));
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allowed = (d: Date) => (!min || iso(d) >= min) && (!max || iso(d) <= max);

  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${iso(focus)}"]`)?.focus();
  }, [open, focus]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (d: Date) => {
    if (!allowed(d)) return;
    onChange(iso(d));
    close();
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -((focus.getDay() + 6) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() + 6) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]!());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focus);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  // Monday-first grid of the focused month
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).filter((wk) =>
    wk.some((d) => d.getMonth() === focus.getMonth()),
  );
  const prevOk = !min || iso(new Date(focus.getFullYear(), focus.getMonth(), 0)) >= min;
  const nextOk = !max || iso(new Date(focus.getFullYear(), focus.getMonth() + 1, 1)) <= max;
  const today = iso(new Date());

  return (
    <div ref={wrapRef} className={['yh-select', 'yh-date', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="yh-select-trigger yh-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${show(value)}`}
        onClick={() => {
          setFocus(parse(value));
          setOpen((o) => !o);
        }}
      >
        <CalendarDays size={18} strokeWidth={1.8} aria-hidden className="yh-date-icon" />
        <span className="yh-select-value">{show(value)}</span>
      </button>
      {open && (
        <div className="yh-select-popover yh-select-down yh-date-popover" role="dialog" aria-modal="false" aria-label={ariaLabel}>
          <div className="yh-date-head">
            <button type="button" className="yh-date-nav" aria-label="Oldingi oy" disabled={!prevOk} onClick={() => setFocus(addMonths(focus, -1))}>
              <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
            </button>
            <span className="yh-date-title" id={`${uid}-title`} aria-live="polite">
              {OYLAR[focus.getMonth()]} {focus.getFullYear()}
            </span>
            <button type="button" className="yh-date-nav" aria-label="Keyingi oy" disabled={!nextOk} onClick={() => setFocus(addMonths(focus, 1))}>
              <ChevronRight size={18} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <div ref={gridRef} role="grid" aria-labelledby={`${uid}-title`} className="yh-date-grid" onKeyDown={onGridKey}>
            <div role="row" className="yh-date-row">
              {KUNLAR.map((k) => (
                <span key={k} role="columnheader" className="yh-date-wd">
                  {k}
                </span>
              ))}
            </div>
            {weeks.map((wk) => (
              <div key={iso(wk[0]!)} role="row" className="yh-date-row">
                {wk.map((d) => {
                  const key = iso(d);
                  const inMonth = d.getMonth() === focus.getMonth();
                  return (
                    <span key={key} role="gridcell" aria-selected={key === value}>
                      <button
                        type="button"
                        data-day={key}
                        tabIndex={key === iso(focus) ? 0 : -1}
                        disabled={!allowed(d)}
                        className={[
                          'yh-date-day',
                          inMonth ? '' : 'out',
                          key === value ? 'selected' : '',
                          key === today ? 'today' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => pick(d)}
                      >
                        {d.getDate()}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
