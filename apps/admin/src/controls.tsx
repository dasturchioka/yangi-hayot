import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './icons';

/**
 * Shared form controls in the «Yashil barg» look (styles: controls.css, loaded globally).
 * Each is a real <input>, drawn over, so keyboard, forms and screen readers behave natively.
 */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'>;

/** On/off setting: a switch with its label on the same line. */
export function Switch({ children, className, ...input }: InputProps & { children?: ReactNode }) {
  return (
    <label className={['switch', className].filter(Boolean).join(' ')}>
      <input type="checkbox" role="switch" {...input} />
      <span className="switch-track" aria-hidden="true" />
      {children !== undefined && <span className="switch-label">{children}</span>}
    </label>
  );
}

/** Checkbox; `indeterminate` for «some selected». Without children it is the bare box (table rows). */
export function Checkbox({
  children,
  indeterminate = false,
  className,
  ...input
}: InputProps & { children?: ReactNode; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const box = <input ref={ref} type="checkbox" className="checkbox-input" {...input} />;
  if (children === undefined) return <span className={['checkbox', className].filter(Boolean).join(' ')}>{box}</span>;
  return (
    <label className={['checkbox', className].filter(Boolean).join(' ')}>
      {box}
      <span className="checkbox-label">{children}</span>
    </label>
  );
}

/** One radio option as a card: title on the radio's line, optional hint under it. */
export function Choice({ children, hint, ...input }: InputProps & { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="choice">
      <input type="radio" className="choice-input" {...input} />
      <span className="choice-text">
        <span className="choice-title">{children}</span>
        {hint !== undefined && <span className="choice-hint">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- saving settings

export type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; text: string };

/**
 * «Saqlash» for a settings form — one rule everywhere: the bar ends the form, the button on the right,
 * the status on its left. The button is active only when something changed; then, while the form is
 * longer than the window, the bar also follows the screen (sticky), so unsaved edits are never out of reach.
 */
export function SaveBar({
  state,
  dirty = true,
  savedText = 'Saqlandi',
  label = 'Saqlash',
}: {
  state: SaveState;
  dirty?: boolean;
  savedText?: ReactNode;
  label?: ReactNode;
}) {
  const sentinel = useRef<HTMLSpanElement>(null);
  const [stuck, setStuck] = useState(false);

  // The bar is «stuck» when its natural place (the sentinel right under it) is below the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting && e!.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className={['save-bar', dirty && 'dirty', dirty && stuck && 'stuck'].filter(Boolean).join(' ')}>
        <span className="save-status" role="status">
          {state.kind === 'saved' && (
            <>
              <Icon name="check" size={16} />
              {savedText}
            </>
          )}
          {state.kind === 'error' && <span className="save-error">{state.text}</span>}
        </span>
        <button className="primary" type="submit" disabled={state.kind === 'saving' || !dirty}>
          {state.kind === 'saving' ? 'Saqlanmoqda…' : label}
        </button>
      </div>
      <span ref={sentinel} className="save-bar-sentinel" aria-hidden="true" />
    </>
  );
}

/**
 * Has the form changed since it was loaded or saved? The first non-null value is the baseline;
 * `rebase()` takes the next rendered value as the new baseline (call it with the state set from the
 * server's answer, so a normalised value does not read as a change).
 */
export function useDirty<T>(value: T): { dirty: boolean; rebase: () => void } {
  const cur = JSON.stringify(value ?? null);
  const [base, setBase] = useState<string | null>(value == null ? null : cur);
  if (base === null && value != null) setBase(cur);
  return { dirty: base !== null && base !== cur, rebase: () => setBase(null) };
}
