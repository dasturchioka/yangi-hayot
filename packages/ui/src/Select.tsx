import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * «Yashil barg» Select — the one replacement for native <select> in the Mini App
 * and the admin-panel (import '@yh/ui/select' + '@yh/ui/select.css').
 *
 * WAI-ARIA «select-only combobox» pattern: a button with role="combobox" opens a
 * role="listbox"; ↑/↓, Home/End, PageUp/PageDown move, Enter/Space pick, Esc and
 * Tab close, typing jumps to the option that starts with the typed letters.
 * On phones (`sheet="auto"`, narrow or touch screens) the list opens as a bottom
 * sheet with large rows; on desktop as a popover under (or above) the trigger.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Plain text for typeahead and the trigger when `label` is not a string. */
  textValue?: string;
  /** Second line in the list, e.g. a count. */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Visible label above the trigger. Without it pass `aria-label`. */
  label?: ReactNode;
  'aria-label'?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 'auto' = bottom sheet on narrow/touch screens, popover elsewhere. */
  sheet?: 'auto' | 'always' | 'never';
  size?: 'md' | 'sm';
  /** Extra class on the wrapper (width, grid placement). */
  className?: string;
  id?: string;
  name?: string;
}

const SHEET_QUERY = '(max-width: 600px), (pointer: coarse)';

function textOf<T extends string | number>(o: SelectOption<T>): string {
  return o.textValue ?? (typeof o.label === 'string' || typeof o.label === 'number' ? String(o.label) : String(o.value));
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  'aria-label': ariaLabel,
  placeholder = 'Tanlang',
  disabled = false,
  sheet = 'auto',
  size = 'md',
  className,
  id,
  name,
}: SelectProps<T>) {
  const uid = useId();
  const baseId = id ?? `yh-select-${uid.replace(/:/g, '')}`;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const [asSheet, setAsSheet] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const enabledIndex = useCallback(
    (from: number, step: 1 | -1): number => {
      for (let i = from, n = 0; n < options.length; i += step, n++) {
        const k = (i + options.length) % options.length;
        if (!options[k]?.disabled) return k;
      }
      return -1;
    },
    [options],
  );

  const openList = useCallback(
    (at?: 'first' | 'last') => {
      if (disabled) return;
      const useSheet = sheet === 'always' || (sheet === 'auto' && window.matchMedia(SHEET_QUERY).matches);
      setAsSheet(useSheet);
      if (!useSheet && triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        const below = window.innerHeight - r.bottom;
        setPlacement(below < 280 && r.top > below ? 'up' : 'down');
      }
      setActive(
        at === 'first'
          ? enabledIndex(0, 1)
          : at === 'last'
            ? enabledIndex(options.length - 1, -1)
            : selectedIndex >= 0
              ? selectedIndex
              : enabledIndex(0, 1),
      );
      setOpen(true);
    },
    [disabled, sheet, enabledIndex, options.length, selectedIndex],
  );

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  // Focus the list when it opens; keep the active option in view.
  useLayoutEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Click outside closes the popover (the sheet has its own backdrop).
  useEffect(() => {
    if (!open || asSheet) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, asSheet, close]);

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
    const q = typed.current.text.toLowerCase();
    const start = open ? active + (q.length === 1 ? 1 : 0) : selectedIndex + 1;
    for (let n = 0; n < options.length; n++) {
      const i = (Math.max(start, 0) + n) % options.length;
      const o = options[i];
      if (o && !o.disabled && textOf(o).toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList(e.key === 'ArrowUp' ? 'last' : undefined);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeahead(e.key);
      if (i >= 0) onChange(options[i]!.value);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const move = (i: number) => {
      e.preventDefault();
      if (i >= 0) setActive(i);
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(enabledIndex(active + 1, 1));
      case 'ArrowUp':
        return move(enabledIndex(active - 1, -1));
      case 'Home':
        return move(enabledIndex(0, 1));
      case 'End':
        return move(enabledIndex(options.length - 1, -1));
      case 'PageDown':
        return move(enabledIndex(Math.min(active + 8, options.length - 1), -1));
      case 'PageUp':
        return move(enabledIndex(Math.max(active - 8, 0), 1));
      case 'Enter':
      case ' ':
        e.preventDefault();
        return pick(active);
      case 'Escape':
        e.preventDefault();
        return close();
      case 'Tab':
        return close(false);
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) move(typeahead(e.key));
    }
  };

  const list = (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-activedescendant={active >= 0 ? optionId(active) : undefined}
      className="yh-select-list"
      onKeyDown={onListKey}
    >
      {options.map((o, i) => (
        <li
          key={String(o.value)}
          id={optionId(i)}
          role="option"
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          className={i === active ? 'yh-select-option active' : 'yh-select-option'}
          onPointerMove={() => !o.disabled && i !== active && setActive(i)}
          onClick={() => pick(i)}
        >
          <span className="yh-select-option-text">
            <span>{o.label}</span>
            {o.hint !== undefined && <span className="yh-select-hint">{o.hint}</span>}
          </span>
          {o.value === value && <Check className="yh-select-check" size={18} strokeWidth={2.2} aria-hidden />}
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={wrapRef} className={['yh-select', `yh-select-${size}`, className].filter(Boolean).join(' ')}>
      {label && (
        <span id={labelId} className="yh-select-label">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={label ? `${labelId} ${baseId}` : undefined}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        className="yh-select-trigger"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? 'yh-select-value' : 'yh-select-value yh-select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="yh-select-chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      {name && <input type="hidden" name={name} value={value === null ? '' : String(value)} />}
      {open &&
        (asSheet ? (
          <div className="yh-select-sheet-root">
            <div className="yh-select-backdrop" onClick={() => close()} />
            <div className="yh-select-sheet" role="dialog" aria-modal="true" aria-labelledby={label ? labelId : undefined}>
              <span className="yh-select-grabber" aria-hidden />
              {(label || ariaLabel) && <p className="yh-select-sheet-title">{label ?? ariaLabel}</p>}
              {list}
            </div>
          </div>
        ) : (
          <div className={`yh-select-popover yh-select-${placement}`}>{list}</div>
        ))}
    </div>
  );
}
