import type { ReactNode } from 'react';
import { useLang, useT, type MessageKey } from '../i18n';
import {
  BookIcon,
  BuildingIcon,
  CalculatorIcon,
  CalendarIcon,
  ChevronRightIcon,
  GiftIcon,
  HeartIcon,
  HomeIcon,
  InfoIcon,
  ListIcon,
  PhoneIcon,
  UserIcon,
} from '../icons';
import { api } from '../api';
import { LoyihaRowCard, ShaharSegment, useLoyihalar, useShahar } from '../katalog/screens';
import { Loaded } from '../katalog/parts';
import { telHref } from '../kontent/screens';
import { KvizKirish } from '../kviz/KvizScreen';
import { href, type Route } from '../router';
import { TanlashQidiruv } from '../tanlash/TanlashScreen';
import { useLoad } from '../useLoad';
import './nav.css';

// ---------------------------------------------------------------- bottom tab bar

/** Root screens: they carry the tab bar and no Telegram back button. */
export const TAB_ROUTES = ['bosh', 'loyihalar', 'sevimlilar', 'mening'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

export const isTabRoute = (r: Route): r is Extract<Route, { name: TabRoute }> =>
  (TAB_ROUTES as readonly string[]).includes(r.name);

const TABS: { route: TabRoute; label: MessageKey; icon: (active: boolean) => ReactNode }[] = [
  { route: 'bosh', label: 'tab.bosh', icon: () => <HomeIcon /> },
  { route: 'loyihalar', label: 'tab.loyihalar', icon: () => <BuildingIcon /> },
  { route: 'sevimlilar', label: 'tab.sevimlilar', icon: (a) => <HeartIcon filled={a} /> },
  { route: 'mening', label: 'tab.profil', icon: () => <UserIcon /> },
];

/** Kit «Pastki menyu» (64px + safe area). Tapping the open tab again scrolls it to the top. */
export function TabBar({ current }: { current: TabRoute }) {
  const t = useT();
  return (
    <nav className="tabbar" aria-label="Menu">
      {TABS.map(({ route, label, icon }) => {
        const active = route === current;
        return (
          <a
            key={route}
            className={active ? 'tab active' : 'tab'}
            href={href({ name: route })}
            aria-current={active ? 'page' : undefined}
            onClick={(e) => {
              if (active) {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            {icon(active)}
            <span>{t(label)}</span>
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- Bosh (home)

export function BoshScreen() {
  const t = useT();
  const lang = useLang();
  const load = useLoyihalar();
  const kontent = useLoad(`kontent:${lang}`, () => api.kontent(lang));
  const [shahar, setShahar] = useShahar();
  const telefon = kontent.kind === 'ready' ? kontent.data.kontaktlar.telefon : null;

  return (
    <>
      <header className="bosh-head">
        <img className="bosh-logo" src="/logo.png" alt="" width={36} height={36} />
        <span className="bosh-brand">
          <span className="title">{t('app.title')}</span>
          <span className="caption muted">{t('bosh.tagline')}</span>
        </span>
      </header>

      <TanlashQidiruv />

      <Loaded load={load}>
        {({ loyihalar }) => {
          const hero = loyihalar.find((l) => l.foto && l.shahar === 'toshkent') ?? loyihalar.find((l) => l.foto);
          const shown = loyihalar.filter((l) => l.shahar === shahar);
          return (
            <>
              <a className="bosh-hero" href={href({ name: 'loyihalar' })}>
                {hero?.foto && <img src={hero.foto} alt="" fetchPriority="high" />}
                <span className="bosh-hero-text">
                  <span className="bosh-hero-chip">{t('bosh.heroChip')}</span>
                  <span className="h2 balance">{t('bosh.hero')}</span>
                </span>
              </a>

              <div className="quick">
                <a className="quick-button" href={href({ name: 'yozilish' })}>
                  <CalendarIcon />
                  <span>{t('bosh.yozilish')}</span>
                </a>
                <a className="quick-button" href={href({ name: 'kalkulyator' })}>
                  <CalculatorIcon />
                  <span>{t('bosh.kalkulyator')}</span>
                </a>
                <a className="quick-button" href={telefon ? telHref(telefon) : `${href({ name: 'bizHaqimizda' })}#aloqa`}>
                  <PhoneIcon />
                  <span>{t('bosh.qongiroq')}</span>
                </a>
              </div>

              <KvizKirish />

              <section className="bosh-section">
                <div className="row-between">
                  <h2 className="h2">{t('katalog.title')}</h2>
                  <ShaharSegment shahar={shahar} onChange={setShahar} loyihalar={loyihalar} compact />
                </div>
                <div className="loyiha-rows" key={shahar}>
                  {shown.length === 0 && <p className="muted">{t('katalog.empty')}</p>}
                  {shown.slice(0, 4).map((l) => (
                    <LoyihaRowCard key={l.id} l={l} />
                  ))}
                </div>
                {shown.length > 4 && (
                  <a className="see-all" href={href({ name: 'loyihalar' })}>
                    {t('bosh.hammasi')} · {shown.length}
                    <ChevronRightIcon size={18} />
                  </a>
                )}
              </section>
            </>
          );
        }}
      </Loaded>

      <section className="bosh-section">
        <h2 className="h2">{t('bosh.foydali')}</h2>
        <div className="tiles">
          <Tile route={{ name: 'sotibOlish' }} icon={<BookIcon />} title="kontent.sotibOlish" hint="kontent.sotibOlishHint" />
          <Tile route={{ name: 'bizHaqimizda' }} icon={<InfoIcon />} title="kontent.bizHaqimizda" hint="kontent.bizHaqimizdaHint" />
          <Tile route={{ name: 'taklif' }} icon={<GiftIcon />} title="taklif.open" hint="taklif.openHint" />
          <Tile route={{ name: 'mening' }} icon={<ListIcon />} title="mening.title" hint="mening.hint" />
        </div>
      </section>
    </>
  );
}

function Tile({ route, icon, title, hint }: { route: Route; icon: ReactNode; title: MessageKey; hint: MessageKey }) {
  const t = useT();
  return (
    <a className="tile" href={href(route)}>
      <span className="tile-icon">{icon}</span>
      <span className="title">{t(title)}</span>
      <span className="caption muted">{t(hint)}</span>
    </a>
  );
}

// ---------------------------------------------------------------- Profil: menu rows under «Mening»

/** Kit p.18: rows under the Mijoz's own bookings and Arizalar. */
export function ProfilMenu() {
  const t = useT();
  const rows: { route: Route; icon: ReactNode; title: MessageKey }[] = [
    { route: { name: 'taklif' }, icon: <GiftIcon />, title: 'taklif.open' },
    { route: { name: 'sotibOlish' }, icon: <BookIcon />, title: 'kontent.sotibOlish' },
    { route: { name: 'kalkulyator' }, icon: <CalculatorIcon />, title: 'kalk.open' },
    { route: { name: 'bizHaqimizda' }, icon: <InfoIcon />, title: 'kontent.bizHaqimizda' },
  ];
  return (
    <nav className="menu-list">
      {rows.map((r) => (
        <a key={r.title} className="menu-row" href={href(r.route)}>
          <span className="menu-row-icon">{r.icon}</span>
          <span className="title">{t(r.title)}</span>
          <ChevronRightIcon />
        </a>
      ))}
    </nav>
  );
}
