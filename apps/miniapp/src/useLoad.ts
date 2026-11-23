import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

export type Load<T> =
  | { kind: 'loading' }
  | { kind: 'error'; notFound: boolean; retry: () => void }
  | { kind: 'ready'; data: T };

/** Runs `fetcher` whenever `key` changes; ignores answers to an outdated key. */
export function useLoad<T>(key: string, fetcher: () => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string; load: Load<T> }>({ key, load: { kind: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let live = true;
    setState({ key, load: { kind: 'loading' } });
    fetcher().then(
      (data) => live && setState({ key, load: { kind: 'ready', data } }),
      (err: unknown) =>
        live &&
        setState({ key, load: { kind: 'error', notFound: err instanceof ApiError && err.status === 404, retry } }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the request
  }, [key, attempt]);

  return state.key === key ? state.load : { kind: 'loading' };
}
