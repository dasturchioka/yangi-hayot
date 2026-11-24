import { useEffect, type RefObject } from 'react';

/** Time on one slide before the next one comes in. */
const INTERVAL_MS = 4500;
/** After the Mijoz touches the strip, it waits this long before moving on its own again. */
const IDLE_AFTER_TOUCH_MS = 8000;

/**
 * Advances a horizontal scroll-snap strip one item at a time and wraps to the
 * start. It never fights the Mijoz: it holds while a finger is down and for a
 * while after, while the strip is off screen, while the app is hidden, and not
 * at all under prefers-reduced-motion.
 */
export function useAutoSlide(ref: RefObject<HTMLElement | null>, count: number): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let lastTouch = 0;
    let touching = false;
    let visible = false;
    const onDown = () => {
      touching = true;
      lastTouch = Date.now();
    };
    const onUp = () => {
      touching = false;
      lastTouch = Date.now();
    };
    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('wheel', onUp, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('touchend', onUp, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.6);
    }, { threshold: [0, 0.6, 1] });
    io.observe(el);

    const timer = window.setInterval(() => {
      if (!visible || touching || document.hidden || Date.now() - lastTouch < IDLE_AFTER_TOUCH_MS) return;
      const items = [...el.children] as HTMLElement[];
      if (items.length < 2) return;
      // Item k sits where the first one sits when scrollLeft = its distance from the first.
      const start = items[0]!.offsetLeft;
      const offsets = items.map((item) => item.offsetLeft - start);
      const now = el.scrollLeft;
      const current = offsets.reduce((best, x, i) => (Math.abs(x - now) < Math.abs(offsets[best]! - now) ? i : best), 0);
      const max = el.scrollWidth - el.clientWidth;
      const atEnd = now >= max - 2 || current >= items.length - 1;
      const left = atEnd ? 0 : Math.min(offsets[current + 1]!, max);
      el.scrollTo({ left, behavior: 'smooth' });
    }, INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('wheel', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [ref, count]);
}
