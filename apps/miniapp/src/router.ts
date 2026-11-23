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
  /** «Do'stingni taklif qil» (#19). */
  | { name: 'taklif' }
  /** «Ariza qoldirish» form, optionally about a Loyiha or a Planirovka. */
  | { name: 'ariza'; loyihaId?: number; planirovkaId?: number };

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
  if (parts[0] === 'loyiha' && id > 0) {
    return parts[2] === 'planirovkalar' ? { name: 'planirovkalar', loyihaId: id } : { name: 'loyiha', id };
  }
  if (parts[0] === 'planirovka' && id > 0) return { name: 'planirovka', id };
  if (parts[0] === 'sevimlilar') return { name: 'sevimlilar' };
  if (parts[0] === 'qanday-sotib-olish') return { name: 'sotibOlish' };
  if (parts[0] === 'biz-haqimizda' || parts[0] === 'kontaktlar') return { name: 'bizHaqimizda' };
  if (parts[0] === 'taklif') return { name: 'taklif' };
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
    case 'sevimlilar':
      return '#/sevimlilar';
    case 'taqqoslash':
      return `#/taqqoslash/${route.ids.join(',')}`;
    case 'sotibOlish':
      return '#/qanday-sotib-olish';
    case 'bizHaqimizda':
      return '#/biz-haqimizda';
    case 'taklif':
      return '#/taklif';
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
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
