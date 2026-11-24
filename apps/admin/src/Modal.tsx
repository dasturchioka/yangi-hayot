import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import './modal.css';

/**
 * Admin modal: a centred dialog on desktop, a bottom sheet at ≤640px.
 *
 * - Portal into <body>; role="dialog", aria-modal, labelled by the title (and the description, if any).
 * - Esc and a click on the backdrop close it; Tab stays inside; the page behind does not scroll.
 * - Opening focuses the first field ([data-autofocus] wins); closing returns focus to the trigger.
 * - Exit animates, then unmounts: data-state="open" → "closing" → gone (transitionend, timeout fallback).
 *   Content mounts with the modal and unmounts after it, so a form inside starts fresh every time.
 *
 * Children: with `footer`, they are wrapped in the scrolling body and the footer is pinned under it.
 * Without `footer`, children render as-is — use <ModalForm> (body + Saqlash/Bekor footer) there.
 */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  /** md = 560px (default), lg = 760px for long forms. */
  size?: 'md' | 'lg';
  children: ReactNode;
}

interface ModalCtx {
  close: () => void;
  /** A busy form blocks Esc / backdrop / Bekor until the request settles. */
  setBusy: (busy: boolean) => void;
}

const Ctx = createContext<ModalCtx | null>(null);

/** Close the surrounding modal from inside its content. */
export function useModal(): ModalCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useModal outside <Modal>');
  return c;
}

const EXIT_MS = 220; // fallback if transitionend never fires (reduced motion, display:none, …)
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, innermost last: only the top one reacts to Esc. Also counts the scroll lock. */
const stack: HTMLElement[] = [];
let savedOverflow = '';
let savedPadding = '';

function lockScroll() {
  if (stack.length > 0) return;
  const html = document.documentElement;
  const gap = window.innerWidth - html.clientWidth;
  savedOverflow = html.style.overflow;
  savedPadding = document.body.style.paddingRight;
  html.style.overflow = 'hidden';
  // keep the page from shifting when its scrollbar disappears
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
}

function unlockScroll() {
  if (stack.length > 0) return;
  document.documentElement.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPadding;
}

export function Modal({ open, onClose, title, description, footer, size = 'md', children }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Remember the trigger before the modal takes focus; open/close transitions.
  if (open && !mounted) {
    setMounted(true);
    setClosing(false);
  } else if (open && closing) {
    setClosing(false); // reopened mid-exit: the transition retargets back
  } else if (!open && mounted && !closing) {
    setClosing(true);
  }
  if (open && trigger.current === null && typeof document !== 'undefined') {
    trigger.current = document.activeElement as HTMLElement | null;
  }

  const close = useCallback(() => {
    if (!busy.current) onCloseRef.current();
  }, []);
  const setBusy = useCallback((b: boolean) => {
    busy.current = b;
  }, []);

  const finish = useCallback(() => {
    setMounted(false);
    setClosing(false);
  }, []);

  // Return focus to the trigger as soon as closing starts (the panel is going away).
  useEffect(() => {
    if (!closing) return;
    const t = trigger.current;
    trigger.current = null;
    if (t && t.isConnected) t.focus({ preventScroll: true });
    const timer = window.setTimeout(finish, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finish]);

  if (!mounted) return null;
  return createPortal(
    <Ctx.Provider value={{ close, setBusy }}>
      <Panel
        title={title}
        description={description}
        footer={footer}
        size={size}
        closing={closing}
        onClose={close}
        onExited={finish}
      >
        {children}
      </Panel>
    </Ctx.Provider>,
    document.body,
  );
}

function Panel({
  title,
  description,
  footer,
  size,
  closing,
  onClose,
  onExited,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size: 'md' | 'lg';
  closing: boolean;
  onClose: () => void;
  onExited: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Mount: scroll lock, stack, first-field focus.
  useLayoutEffect(() => {
    const el = root.current!;
    lockScroll();
    stack.push(el);
    const p = panel.current!;
    const first =
      p.querySelector<HTMLElement>('[data-autofocus]') ??
      p.querySelector<HTMLElement>('.modal-body input:not([type="hidden"]):not([disabled]), .modal-body textarea, .modal-body select, .modal-body button.yh-select-trigger') ??
      p;
    first.focus({ preventScroll: true });
    return () => {
      stack.splice(stack.indexOf(el), 1);
      unlockScroll();
    };
  }, []);

  // Esc: only the top modal, and not when an inner control (Select list) already handled it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || stack[stack.length - 1] !== root.current) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function trap(e: ReactKeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = [...panel.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.offsetParent !== null || x === document.activeElement,
    );
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={root}
      className="modal-root"
      data-state={closing ? 'closing' : 'open'}
      // Backdrop = the root itself: a click that starts and ends outside the panel closes.
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).dataset.down = e.target === e.currentTarget ? '1' : '';
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.dataset.down === '1') onClose();
      }}
    >
      <div
        ref={panel}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={trap}
        onTransitionEnd={(e) => {
          if (closing && e.target === e.currentTarget && (e.propertyName === 'opacity' || e.propertyName === 'transform')) onExited();
        }}
      >
        <header className="modal-head">
          <div className="modal-titles">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="modal-desc">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="icon-button modal-x" aria-label="Yopish" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </header>
        {footer !== undefined ? (
          <>
            <div className="modal-body">{children}</div>
            <footer className="modal-foot">{footer}</footer>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * Form inside a <Modal>: fields scroll in the body, «Bekor qilish» and the submit button sit in the
 * footer. `busy` disables submit («Saqlanmoqda…») and blocks closing; `error` shows above the footer.
 * The parent closes the modal (open=false) after a successful save.
 */
export function ModalForm({
  onSubmit,
  busy = false,
  error,
  submitLabel = 'Saqlash',
  cancelLabel = 'Bekor qilish',
  extraActions,
  children,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: string;
  submitLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Extra buttons between Bekor and the submit button (e.g. «+ keyingisi»). */
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const { close, setBusy } = useModal();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => setBusy(busy), [busy, setBusy]);
  // A new server error scrolls into view (the field list may be long).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  return (
    <form
      className="modal-form"
      aria-busy={busy || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit(e);
      }}
    >
      <div className="modal-body">
        {children}
        {error && (
          <p ref={errorRef} className="error modal-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-foot">
        <button type="button" onClick={close} disabled={busy}>
          {cancelLabel}
        </button>
        {extraActions}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saqlanmoqda…' : submitLabel}
        </button>
      </footer>
    </form>
  );
}
