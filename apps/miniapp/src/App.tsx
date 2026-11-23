import type { MijozDto } from '@yh/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { I18nProvider, useT } from './i18n';
import { ArizaScreen } from './ariza/ArizaScreen';
import { LoyihaScreen, LoyihalarScreen, PlanirovkalarScreen, PlanirovkaScreen } from './katalog/screens';
import { navigate, useRoute, type Route } from './router';
import { getInitData, getStartApp, guessLang, setBackButton } from './telegram';

// Opened from the bot's «Ariza qoldirish» button (startapp=ariza): start on the form.
if (getStartApp() === 'ariza' && !window.location.hash) navigate({ name: 'ariza' });

export function App() {
  const inTelegram = Boolean(getInitData());
  const [mijoz, setMijoz] = useState<MijozDto | null>(null);

  // The Mijoz's stored language wins; until /me answers we guess from Telegram
  // and already load the catalog in parallel.
  useEffect(() => {
    if (!inTelegram) return;
    api.me().then(({ mijoz }) => setMijoz(mijoz), () => {});
  }, [inTelegram]);

  return (
    <I18nProvider lang={mijoz?.lang ?? guessLang()}>
      <main className="screen">{inTelegram ? <Screens /> : <OutsideTelegram />}</main>
    </I18nProvider>
  );
}

function OutsideTelegram() {
  const t = useT();
  return <p className="muted">{t('state.openInTelegram')}</p>;
}

function Screens() {
  const route = useRoute();
  useEffect(
    () =>
      setBackButton(
        route.name === 'loyihalar'
          ? null
          : () => (window.history.length > 1 ? window.history.back() : navigate({ name: 'loyihalar' })),
      ),
    [route],
  );
  return <Screen route={route} />;
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'loyihalar':
      return <LoyihalarScreen />;
    case 'loyiha':
      return <LoyihaScreen key={route.id} id={route.id} />;
    case 'planirovkalar':
      return <PlanirovkalarScreen key={route.loyihaId} loyihaId={route.loyihaId} />;
    case 'planirovka':
      return <PlanirovkaScreen key={route.id} id={route.id} />;
    case 'ariza':
      return <ArizaScreen key={`${route.loyihaId}:${route.planirovkaId}`} {...route} />;
  }
}
