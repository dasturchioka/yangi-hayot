import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';

/**
 * Ids of the Mijoz's sevimli Planirovkalar, shared by every screen. The server
 * is the source of truth (sevimlilar follow the Mijoz across devices); taps
 * update the set at once and roll back if the server refuses.
 */
let ids: ReadonlySet<number> = new Set();
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: ReadonlySet<number>) {
  ids = next;
  for (const l of listeners) l();
}

function load(): Promise<void> {
  loaded ??= api.sevimlilar('uz').then(
    ({ planirovkalar }) => set(new Set(planirovkalar.map((p) => p.id))),
    () => {
      loaded = undefined; // try again next time a screen asks
    },
  );
  return loaded;
}

export function useSevimliIds(): ReadonlySet<number> {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ids,
  );
}

export async function toggleSevimli(id: number): Promise<void> {
  const before = ids;
  const next = new Set(ids);
  const adding = !next.has(id);
  if (adding) next.add(id);
  else next.delete(id);
  set(next);
  try {
    await (adding ? api.addSevimli(id) : api.removeSevimli(id));
  } catch (err) {
    set(before);
    throw err;
  }
}
