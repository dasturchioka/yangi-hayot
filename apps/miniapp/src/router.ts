import type { PlanirovkaFiltr } from '@yh/shared';
import { useEffect, useState } from 'react';
import { filtrQuery, parseFiltr } from './tanlash/filtr';

/** Screens of the Mini App, addressed by the URL hash so Back works and links can point at them. */
export type Route =
  /** Home tab: search, quick buttons, Loyihalar of a city, menu tiles. */
  | { name: 'bosh' }
  /** «Loyihalar» tab: big Loyiha cards by city. */
  | { name: 'loyihalar' }
  | { name: 'loyiha'; id: number }
  /** Planirovkalar of a Loyiha, one Blok at a time (`blokId` absent = the first). */
  | { name: 'planirovkalar'; loyihaId: number; blokId?: number }
  /**
   * Shaxmatka of a Blok (#23, UF-1): `filtr.blokId` names the Blok (absent = the first), the rest of the
   * filter highlights matching cells; `planirovkaId` highlights one Planirovka's Xonadonlar; `sheet` = filter sheet open.
   */
  | { name: 'shaxmatka'; loyihaId: number; filtr: PlanirovkaFiltr; planirovkaId?: number; sheet?: boolean }
  | { name: 'planirovka'; id: number }
  /** Xonadon kartochkasi (#23). */
  | { name: 'xonadon'; id: number }
  | { name: 'sevimlilar' }
  | { name: 'taqqoslash'; ids: number[] }
  /** To'lov kalkulyatori; from a Planirovka its Boshlang'ich narx is put in, from a Xonadon its own narx. */
  | { name: 'kalkulyator'; planirovkaId?: number; xonadonId?: number }
  | { name: 'sotibOlish' }
  | { name: 'bizHaqimizda' }
  /** «Do'stingni taklif qil» (#19). */
  | { name: 'taklif' }
  /** «Ariza qoldirish» form, optionally about a Loyiha or a Planirovka. */
  | { name: 'ariza'; loyihaId?: number; planirovkaId?: number }
  /** «Ko'rishga yozilish» (#11): Loyiha → kun → vaqt → ism, telefon. Without a Loyiha the Mijoz picks one. */
  | { name: 'yozilish'; loyihaId?: number; planirovkaId?: number }
  /** One own booking: confirmation («yangi» right after booking), «Xarita», «Ko'chirish», «Bekor qilish». */
  | { name: 'yozilishKorish'; id: number; yangi?: 'yozildi' | 'kochirildi' }
  /** Pick a new day and time for an own booking. */
  | { name: 'yozilishKochirish'; id: number }
  /** «Mening arizalarim va yozilishlarim». */
  | { name: 'mening' }
  /** Filtered Planirovkalar (#10); `sheet` = filter sheet open (so Back closes it); `kviz` = just finished the kviz. */
  | { name: 'tanlash'; filtr: PlanirovkaFiltr; sheet?: boolean; kviz?: boolean }
  /** «Xonadon tanlash» kvizi, step 1…N (each step its own history entry: Back = previous question). */
  | { name: 'kviz'; qadam: number };

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/');
  if (parts[0] === 'ariza') {
    const q = new URLSearchParams(query);
    const loyihaId = Number(q.get('loyiha')) || undefined;
    const planirovkaId = Number(q.get('planirovka')) || undefined;
    return { name: 'ariza', ...(loyihaId ? { loyihaId } : {}), ...(planirovkaId ? { planirovkaId } : {}) };
  }
  if (parts[0] === 'tanlash') {
    const q = new URLSearchParams(query);
    return {
      name: 'tanlash',
      filtr: parseFiltr(q),
      ...(q.get('sheet') === '1' ? { sheet: true } : {}),
      ...(q.get('kviz') === '1' ? { kviz: true } : {}),
    };
  }
  if (parts[0] === 'kviz') return { name: 'kviz', qadam: Math.max(1, Number(parts[1]) || 1) };
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
  if (parts[0] === 'loyihalar') return { name: 'loyihalar' };
  if (parts[0] === 'loyiha' && id > 0) {
    const q = new URLSearchParams(query);
    if (parts[2] === 'planirovkalar') {
      const blokId = Number(q.get('blok')) || undefined;
      return { name: 'planirovkalar', loyihaId: id, ...(blokId ? { blokId } : {}) };
    }
    if (parts[2] === 'shaxmatka') {
      const planirovkaId = Number(q.get('planirovka')) || undefined;
      return {
        name: 'shaxmatka',
        loyihaId: id,
        filtr: parseFiltr(q),
        ...(planirovkaId ? { planirovkaId } : {}),
        ...(q.get('sheet') === '1' ? { sheet: true } : {}),
      };
    }
    return { name: 'loyiha', id };
  }
  if (parts[0] === 'planirovka' && id > 0) return { name: 'planirovka', id };
  if (parts[0] === 'xonadon' && id > 0) return { name: 'xonadon', id };
  if (parts[0] === 'sevimlilar') return { name: 'sevimlilar' };
  if (parts[0] === 'kalkulyator') {
    const q = new URLSearchParams(query);
    const planirovkaId = Number(q.get('planirovka')) || undefined;
    const xonadonId = Number(q.get('xonadon')) || undefined;
    return { name: 'kalkulyator', ...(planirovkaId ? { planirovkaId } : {}), ...(xonadonId ? { xonadonId } : {}) };
  }
  if (parts[0] === 'qanday-sotib-olish') return { name: 'sotibOlish' };
  if (parts[0] === 'biz-haqimizda' || parts[0] === 'kontaktlar') return { name: 'bizHaqimizda' };
  if (parts[0] === 'taklif') return { name: 'taklif' };
  if (parts[0] === 'taqqoslash') {
    const ids = (parts[1] ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length > 0) return { name: 'taqqoslash', ids };
  }
  return { name: 'bosh' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'bosh':
      return '#/';
    case 'loyihalar':
      return '#/loyihalar';
    case 'loyiha':
      return `#/loyiha/${route.id}`;
    case 'planirovkalar':
      return `#/loyiha/${route.loyihaId}/planirovkalar${route.blokId ? `?blok=${route.blokId}` : ''}`;
    case 'shaxmatka': {
      const q = new URLSearchParams(filtrQuery(route.filtr));
      if (route.planirovkaId) q.set('planirovka', String(route.planirovkaId));
      if (route.sheet) q.set('sheet', '1');
      const qs = q.toString();
      return `#/loyiha/${route.loyihaId}/shaxmatka${qs ? `?${qs}` : ''}`;
    }
    case 'planirovka':
      return `#/planirovka/${route.id}`;
    case 'xonadon':
      return `#/xonadon/${route.id}`;
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
    case 'kalkulyator': {
      const q = new URLSearchParams();
      if (route.planirovkaId) q.set('planirovka', String(route.planirovkaId));
      if (route.xonadonId) q.set('xonadon', String(route.xonadonId));
      const qs = q.toString();
      return qs ? `#/kalkulyator?${qs}` : '#/kalkulyator';
    }
    case 'sevimlilar':
      return '#/sevimlilar';
    case 'taqqoslash':
      return `#/taqqoslash/${route.ids.join(',')}`;
    case 'tanlash': {
      const q = new URLSearchParams(filtrQuery(route.filtr));
      if (route.sheet) q.set('sheet', '1');
      if (route.kviz) q.set('kviz', '1');
      const qs = q.toString();
      return qs ? `#/tanlash?${qs}` : '#/tanlash';
    }
    case 'kviz':
      return `#/kviz/${route.qadam}`;
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

/** Replaces the current history entry (no new Back step): a finished form must not come back on Back. */
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
