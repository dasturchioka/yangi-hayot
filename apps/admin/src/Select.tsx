import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from './icons';
import './select.css';

/**
 * Select-only combobox (WAI-ARIA APG «select-only combobox»): a button that
 * opens a listbox. Focus stays on the button; arrows move, Enter / Space pick,
 * Esc closes, letters jump. Replaces the native <select> in the admin-panel.
 *
 * Interim (#20): the design pass builds the shared Select; this one keeps the
 * same minimal props (`label`, `value`, `options`, `onChange`) so swapping is
 * an import change.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Accessible name (shown to screen readers; the button shows the value). */
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[selected];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function show(i = selected) {
    setActive(i);
    setOpen(true);
  }

  function pick(i: number) {
    const o = options[i];
    setOpen(false);
    if (o && o.value !== value) onChange(o.value);
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = options.length - 1;
    const move = (i: number) => (open ? setActive(Math.min(last, Math.max(0, i))) : show(Math.min(last, Math.max(0, i))));
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        return open ? move(active + 1) : show();
      case 'ArrowUp':
        e.preventDefault();
        return open ? move(active - 1) : show();
      case 'Home':
        e.preventDefault();
        return move(0);
      case 'End':
        e.preventDefault();
        return move(last);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return open ? pick(active) : show();
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case 'Tab':
        return setOpen(false);
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLocaleLowerCase();
          const from = open ? active : selected;
          const order = [...options.keys()].map((n) => (from + 1 + n) % options.length);
          const hit = order.find((i) => options[i]!.label.toLocaleLowerCase().startsWith(k));
          if (hit !== undefined) move(hit);
        }
    }
  }

  return (
    <div ref={root} className={className ? `sel ${className}` : 'sel'}>
      <button
        type="button"
        role="combobox"
        className="sel-button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="sel-value">{current?.label ?? ''}</span>
        <ChevronDown size={18} className="sel-chevron" />
      </button>
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="sel-list" hidden={!open} tabIndex={-1}>
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-${i}`}
            data-i={i}
            role="option"
            aria-selected={i === selected}
            className={i === active ? 'sel-option is-active' : 'sel-option'}
            onPointerMove={() => setActive(i)}
            onClick={() => pick(i)}
          >
            <span>{o.label}</span>
            {i === selected && <Check size={16} className="sel-check" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
