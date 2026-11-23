import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export interface ListboxOption<T> {
  value: T;
  label: ReactNode;
  /** Text for type-ahead and the closed button; defaults to label when it is a string. */
  text?: string;
}

/**
 * Accessible custom select (button + popup listbox), instead of native
 * <select>: Up/Down/Home/End move, Enter/Space pick, Escape closes, letters
 * jump. The popup is `position: fixed` so table cells and scrolling cards
 * never clip it. Replace with the shared Select from the design pass when it lands.
 */
export function Listbox<T extends string | number>({
  value,
  options,
  onChange,
  label,
  renderValue,
  className = '',
  disabled = false,
  busy = false,
}: {
  value: T;
  options: ListboxOption<T>[];
  onChange: (v: T) => void;
  /** Accessible name (visually hidden when the button shows the value only). */
  label: string;
  renderValue?: (o: ListboxOption<T> | undefined) => ReactNode;
  className?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  /** Opened from the keyboard: no entrance animation (it would only slow a repeated action). */
  const [instant, setInstant] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; up: boolean } | null>(null);
  const selected = options.find((o) => o.value === value);

  function show(byKey = false) {
    if (disabled || busy) return;
    setInstant(byKey);
    setPos(null);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const up = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, minWidth: r.width, up });
  }, [open]);

  const shown = open && pos !== null;
  useEffect(() => {
    if (shown) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [shown, active]);
  useEffect(() => {
    if (shown) list.current?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'scroll' && list.current?.contains(e.target as Node)) return;
      if (e.type === 'pointerdown' && (list.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function pick(i: number) {
    const o = options[i];
    setOpen(false);
    button.current?.focus();
    if (o && o.value !== value) onChange(o.value);
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(last, a + 1)),
      ArrowUp: () => setActive((a) => Math.max(0, a - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => {
        setOpen(false);
        button.current?.focus();
      },
      Tab: () => setOpen(false),
    };
    const fn = keys[e.key];
    if (fn) {
      if (e.key !== 'Tab') e.preventDefault();
      fn();
      return;
    }
    if (e.key.length === 1) {
      const i = options.findIndex((o) => textOf(o).toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`lb-button ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${selected ? textOf(selected) : ''}`}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show(true);
          }
        }}
      >
        <span className="lb-value">{renderValue ? renderValue(selected) : selected?.label}</span>
        <Icon name="chevronDown" size={16} className="lb-chevron" />
      </button>
      {open && pos && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          className={['lb-list', pos.up ? 'up' : '', instant ? 'instant' : ''].join(' ').trim()}
          style={{ left: pos.left, top: pos.top, minWidth: pos.minWidth }}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'lb-option active' : 'lb-option'}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function textOf<T>(o: ListboxOption<T>): string {
  return o.text ?? (typeof o.label === 'string' ? o.label : String(o.value));
}
