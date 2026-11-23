import type { MijozDto } from '@yh/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { I18nProvider, useT } from './i18n';
import { getInitData, guessLang } from './telegram';

type State =
  | { kind: 'outside-telegram' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; mijoz: MijozDto };

export function App() {
  const [state, setState] = useState<State>(() => (getInitData() ? { kind: 'loading' } : { kind: 'outside-telegram' }));

  const load = useCallback(() => {
    if (!getInitData()) return;
    setState({ kind: 'loading' });
    api.me().then(
      ({ mijoz }) => setState({ kind: 'ready', mijoz }),
      () => setState({ kind: 'error' }),
    );
  }, []);

  useEffect(load, [load]);

  const lang = state.kind === 'ready' ? state.mijoz.lang : guessLang();
  return (
    <I18nProvider lang={lang}>
      <main className="screen">
        <Content state={state} onRetry={load} />
      </main>
    </I18nProvider>
  );
}

function Content({ state, onRetry }: { state: State; onRetry: () => void }) {
  const t = useT();
  switch (state.kind) {
    case 'outside-telegram':
      return <p className="muted">{t('state.openInTelegram')}</p>;
    case 'loading':
      return <p className="muted">{t('state.loading')}</p>;
    case 'error':
      return (
        <>
          <p className="error">{t('state.error')}</p>
          <button className="button-primary" onClick={onRetry}>
            {t('state.retry')}
          </button>
        </>
      );
    case 'ready':
      return (
        <>
          <p className="label">{t('app.title')}</p>
          <h1 className="h1">{t('greeting.hello', { name: state.mijoz.name })}</h1>
          <p className="muted">{t('greeting.lang')}</p>
        </>
      );
  }
}
