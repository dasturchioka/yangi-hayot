import { useEffect, useState } from 'react';

/** Screens of the Mini App, addressed by the URL hash so Back works and links can point at them. */
export type Route =
  | { name: 'loyihalar' }
  | { name: 'loyiha'; id: number }
  | { name: 'planirovkalar'; loyihaId: number }
  | { name: 'planirovka'; id: number };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const id = Number(parts[1]);
  if (parts[0] === 'loyiha' && id > 0) {
    return parts[2] === 'planirovkalar' ? { name: 'planirovkalar', loyihaId: id } : { name: 'loyiha', id };
  }
  if (parts[0] === 'planirovka' && id > 0) return { name: 'planirovka', id };
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
