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
import { MeningScreen, YozilishKochirishScreen, YozilishKorishScreen, YozilishScreen } from './yozilish/screens';
import { KvizScreen } from './kviz/KvizScreen';
import { TanlashScreen } from './tanlash/TanlashScreen';
import { openStartScreen } from './start';
import { TaklifScreen } from './taklif/TaklifScreen';
import { getInitData, guessLang, setBackButton } from './telegram';
import { BoshScreen, isTabRoute, ProfilMenu, TabBar } from './nav/nav';

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
      {inTelegram ? <Screens /> : <OutsideTelegram />}
    </I18nProvider>
  );
}

function OutsideTelegram() {
  const t = useT();
  return (
    <main className="screen outside">
      <img src="/logo.png" alt="" width={72} height={72} />
      <h1 className="h2">{t('app.title')}</h1>
      <p className="muted">{t('state.openInTelegram')}</p>
    </main>
  );
}

function Screens() {
  const route = useRoute();
  const tab = isTabRoute(route) ? route.name : null;
  // Root tabs have no back step; every inner screen gets Telegram's native back button.
  useEffect(
    () =>
      setBackButton(tab ? null : () => (window.history.length > 1 ? window.history.back() : navigate({ name: 'bosh' }))),
    [route, tab],
  );
  return (
    <>
      <main className={tab ? 'screen screen-tab' : 'screen'}>
        <Screen route={route} />
      </main>
      {tab && <TabBar current={tab} />}
    </>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'bosh':
      return <BoshScreen />;
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
    case 'tanlash':
      return <TanlashScreen route={route} />;
    case 'kviz':
      return <KvizScreen qadam={route.qadam} />;
    case 'sotibOlish':
      return <SotibOlishScreen />;
    case 'bizHaqimizda':
      return <BizHaqimizdaScreen />;
    case 'yozilish':
      return <YozilishScreen key={`${route.loyihaId}:${route.planirovkaId}`} {...route} />;
    case 'yozilishKorish':
      return <YozilishKorishScreen key={`${route.id}:${route.yangi}`} {...route} />;
    case 'yozilishKochirish':
      return <YozilishKochirishScreen key={route.id} id={route.id} />;
    case 'mening':
      return (
        <>
          <MeningScreen />
          <ProfilMenu />
        </>
      );
    case 'taklif':
      return <TaklifScreen />;
  }
}
