import { useEffect, useState } from 'react';

/** Screens of the Mini App, addressed by the URL hash so Back works and links can point at them. */
export type Route =
  | { name: 'loyihalar' }
  | { name: 'loyiha'; id: number }
  | { name: 'planirovkalar'; loyihaId: number }
  | { name: 'planirovka'; id: number }
  | { name: 'sevimlilar' }
  | { name: 'taqqoslash'; ids: number[] }
  | { name: 'sotibOlish' }
  | { name: 'bizHaqimizda' }
  /** «Ariza qoldirish» form, optionally about a Loyiha or a Planirovka. */
  | { name: 'ariza'; loyihaId?: number; planirovkaId?: number }
  /** «Ko'rishga yozilish» (#11): Loyiha → kun → vaqt → ism, telefon. Without a Loyiha the Mijoz picks one. */
  | { name: 'yozilish'; loyihaId?: number; planirovkaId?: number }
  /** One own booking: confirmation («yangi» right after booking), «Xarita», «Ko'chirish», «Bekor qilish». */
  | { name: 'yozilishKorish'; id: number; yangi?: 'yozildi' | 'kochirildi' }
  /** Pick a new day and time for an own booking. */
  | { name: 'yozilishKochirish'; id: number }
  /** «Mening arizalarim va yozilishlarim». */
  | { name: 'mening' };

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/');
  if (parts[0] === 'ariza') {
    const q = new URLSearchParams(query);
    const loyihaId = Number(q.get('loyiha')) || undefined;
    const planirovkaId = Number(q.get('planirovka')) || undefined;
    return { name: 'ariza', ...(loyihaId ? { loyihaId } : {}), ...(planirovkaId ? { planirovkaId } : {}) };
  }
  const id = Number(parts[1]);
  if (parts[0] === 'yozilish') {
    if (id > 0 && parts[2] === 'kochirish') return { name: 'yozilishKochirish', id };
    const q = new URLSearchParams(query);
    if (id > 0) {
      const yangi = q.get('yangi');
      return { name: 'yozilishKorish', id, ...(yangi === 'yozildi' || yangi === 'kochirildi' ? { yangi } : {}) };
    }
    const loyihaId = Number(q.get('loyiha')) || undefined;
    const planirovkaId = Number(q.get('planirovka')) || undefined;
    return { name: 'yozilish', ...(loyihaId ? { loyihaId } : {}), ...(planirovkaId ? { planirovkaId } : {}) };
  }
  if (parts[0] === 'mening') return { name: 'mening' };
  if (parts[0] === 'loyiha' && id > 0) {
    return parts[2] === 'planirovkalar' ? { name: 'planirovkalar', loyihaId: id } : { name: 'loyiha', id };
  }
  if (parts[0] === 'planirovka' && id > 0) return { name: 'planirovka', id };
  if (parts[0] === 'sevimlilar') return { name: 'sevimlilar' };
  if (parts[0] === 'qanday-sotib-olish') return { name: 'sotibOlish' };
  if (parts[0] === 'biz-haqimizda' || parts[0] === 'kontaktlar') return { name: 'bizHaqimizda' };
  if (parts[0] === 'taqqoslash') {
    const ids = (parts[1] ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length > 0) return { name: 'taqqoslash', ids };
  }
  return { name: 'loyihalar' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'loyihalar':
      return '#/';
    case 'loyiha':
      return `#/loyiha/${route.id}`;
    case 'planirovkalar':
      return `#/loyiha/${route.loyihaId}/planirovkalar`;
    case 'planirovka':
      return `#/planirovka/${route.id}`;
    case 'ariza': {
      const q = new URLSearchParams();
      if (route.loyihaId) q.set('loyiha', String(route.loyihaId));
      if (route.planirovkaId) q.set('planirovka', String(route.planirovkaId));
      const qs = q.toString();
      return qs ? `#/ariza?${qs}` : '#/ariza';
    }
    case 'yozilish': {
      const q = new URLSearchParams();
      if (route.loyihaId) q.set('loyiha', String(route.loyihaId));
      if (route.planirovkaId) q.set('planirovka', String(route.planirovkaId));
      const qs = q.toString();
      return qs ? `#/yozilish?${qs}` : '#/yozilish';
    }
    case 'yozilishKorish':
      return `#/yozilish/${route.id}${route.yangi ? `?yangi=${route.yangi}` : ''}`;
    case 'yozilishKochirish':
      return `#/yozilish/${route.id}/kochirish`;
    case 'mening':
      return '#/mening';
    case 'sevimlilar':
      return '#/sevimlilar';
    case 'taqqoslash':
      return `#/taqqoslash/${route.ids.join(',')}`;
    case 'sotibOlish':
      return '#/qanday-sotib-olish';
    case 'bizHaqimizda':
      return '#/biz-haqimizda';
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

/** Like navigate, but the current screen leaves the history (a finished form must not come back on Back). */
export function replaceRoute(route: Route): void {
  window.location.replace(href(route));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
