import { taqqoslashKaliti, type TaqqoslashKalit } from '@yh/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';

/**
 * The Mijoz's sevimlilar, shared by every screen, as taqqoslash keys:
 * `x<id>` = Xonadon (#25), `p<id>` = Planirovka (#16). The server is the
 * source of truth (sevimlilar follow the Mijoz across devices); taps update
 * the set at once and roll back if the server refuses.
 */
let kalitlar: ReadonlySet<TaqqoslashKalit> = new Set();
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: ReadonlySet<TaqqoslashKalit>) {
  kalitlar = next;
  for (const l of listeners) l();
}

function load(): Promise<void> {
  loaded ??= api.sevimlilar('uz').then(
    ({ xonadonlar, planirovkalar }) =>
      set(
        new Set([
          ...xonadonlar.map((s) => taqqoslashKaliti('xonadon', s.xonadon.id)),
          ...planirovkalar.map((p) => taqqoslashKaliti('planirovka', p.id)),
        ]),
      ),
    () => {
      loaded = undefined; // try again next time a screen asks
    },
  );
  return loaded;
}

export function useSevimliKalitlar(): ReadonlySet<TaqqoslashKalit> {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => kalitlar,
  );
}

export async function toggleSevimli(kalit: TaqqoslashKalit): Promise<void> {
  const before = kalitlar;
  const next = new Set(kalitlar);
  const adding = !next.has(kalit);
  if (adding) next.add(kalit);
  else next.delete(kalit);
  set(next);
  const id = Number(kalit.slice(1));
  const xonadon = kalit.startsWith('x');
  try {
    if (xonadon) await (adding ? api.addSevimliXonadon(id) : api.removeSevimliXonadon(id));
    else await (adding ? api.addSevimli(id) : api.removeSevimli(id));
  } catch (err) {
    set(before);
    throw err;
  }
}
