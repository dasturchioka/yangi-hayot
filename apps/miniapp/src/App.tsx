import type { MijozDto } from '@yh/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { I18nProvider, useT } from './i18n';
import { ArizaScreen } from './ariza/ArizaScreen';
import { KalkulyatorScreen } from './kalkulyator/KalkulyatorScreen';
import { LoyihaScreen, LoyihalarScreen, PlanirovkalarScreen, PlanirovkaScreen } from './katalog/screens';
import { BizHaqimizdaScreen, SotibOlishScreen } from './kontent/screens';
import { navigate, useRoute, type Route } from './router';
import { SevimlilarScreen, TaqqoslashScreen } from './sevimlilar/screens';
import { openStartScreen } from './start';
import { TaklifScreen } from './taklif/TaklifScreen';
import { getInitData, guessLang, setBackButton } from './telegram';

export function App() {
  const inTelegram = Boolean(getInitData());
  const [mijoz, setMijoz] = useState<MijozDto | null>(null);

  // The Mijoz's stored language wins; until /me answers we guess from Telegram
  // and already load the catalog in parallel.
  useEffect(() => {
    if (!inTelegram) return;
    openStartScreen(null); // instant: from the start parameter itself
    api.me().then(
      ({ mijoz, start }) => {
        setMijoz(mijoz);
        openStartScreen(start); // the server's reading wins if the first one missed
      },
      () => {},
    );
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
    case 'kalkulyator':
      return <KalkulyatorScreen key={route.planirovkaId ?? 0} planirovkaId={route.planirovkaId} />;
    case 'sevimlilar':
      return <SevimlilarScreen />;
    case 'taqqoslash':
      return <TaqqoslashScreen key={route.ids.join(',')} ids={route.ids} />;
    case 'sotibOlish':
      return <SotibOlishScreen />;
    case 'bizHaqimizda':
      return <BizHaqimizdaScreen />;
    case 'taklif':
      return <TaklifScreen />;
  }
}
